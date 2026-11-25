// Shared by the login scripts (create-admin.ts, create-test-expert.ts): the options, prompts that
// work in Windows cmd, PowerShell and other terminals (hidden input for passwords), choosing a
// password, opening DATABASE_URL (or the local test database), and a closing error with no secrets.
import readline from "node:readline";
import type { DB } from "../src/db/client";
import { describeDb } from "../src/lib/import/engine/env";
import { finish } from "./_exit";

export const NEON_STEPS = `The database isn't set up on this computer yet. Do this once:
  1. Open https://neon.tech with the FynoLabs admin account and open the project "expert-hub".
  2. Press Connect, keep the main branch, and copy the connection string. It starts with postgresql://
  3. In this folder, open the file .env.local in Notepad (or create it) and add one line:
       DATABASE_URL=the string you copied
  4. Save it and run this again.
Keep that string private: it contains a password.`;

export type Args = { email?: string; name?: string; generate: boolean; reset?: "yes" | "no"; help: boolean; unknown: string[] };

export function parseArgs(argv: string[]): Args {
  const a: Args = { generate: false, help: false, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => argv[++i];
    if (k === "--email") a.email = val();
    else if (k.startsWith("--email=")) a.email = k.slice(8);
    else if (k === "--name") a.name = val();
    else if (k.startsWith("--name=")) a.name = k.slice(7);
    else if (k === "--generate") a.generate = true;
    else if (k === "--reset" || k.startsWith("--reset=")) {
      const v = (k.includes("=") ? k.split("=")[1] : val())?.toLowerCase();
      if (v === "yes" || v === "no") a.reset = v;
      else a.unknown.push(k);
    } else if (k === "--help" || k === "-h") a.help = true;
    else a.unknown.push(k);
  }
  return a;
}

// ---------- Prompts (visible and hidden) ----------

let piped: AsyncIterator<string> | null = null;
async function pipedLine(): Promise<string> {
  piped ??= readline.createInterface({ input: process.stdin, terminal: false })[Symbol.asyncIterator]();
  const r = await piped.next();
  return r.done ? "" : r.value;
}

export async function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdout.write(question);
    const line = await pipedLine();
    process.stdout.write("\n");
    return line.trim();
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim();
}

/** Reads a line without showing what is typed (nothing is echoed, not even stars). */
export async function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdout.write(question);
    const line = await pipedLine();
    process.stdout.write("\n");
    return line;
  }
  const stdin = process.stdin;
  // Echo off before the question appears, so not even the first key press shows.
  stdin.setRawMode(true);
  process.stdout.write(question);
  return new Promise<string>((resolve) => {
    let buf = "";
    const done = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
      resolve(buf);
    };
    const onData = (chunk: Buffer | string) => {
      const s = chunk.toString("utf8");
      if (s.startsWith("\u001b")) return; // arrow keys and other escape sequences
      for (const ch of s) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return done();
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\nStopped. Nothing was changed.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
        else if (ch >= " ") buf += ch;
      }
    };
    stdin.resume();
    stdin.on("data", onData);
  });
}

/** Typed twice (hidden), or generated (--generate, or Enter at the prompt). Null after three bad tries. */
export async function choosePassword(email: string, generate: boolean): Promise<{ password: string; generated: boolean } | null> {
  const { generatePassword, passwordMessage } = await import("../src/lib/auth/password");
  if (generate) return { password: generatePassword(), generated: true };
  for (let tries = 0; tries < 3; tries++) {
    const first = await askHidden("Choose a password (at least 10 characters; nothing shows as you type).\nPress Enter without typing to get a strong one made for you: ");
    if (!first) return { password: generatePassword(), generated: true };
    const problem = passwordMessage(first, email);
    if (problem) {
      console.log(`${problem} Try again.\n`);
      continue;
    }
    const again = await askHidden("Type it again: ");
    if (again !== first) {
      console.log("The two didn't match. Try again.\n");
      continue;
    }
    return { password: first, generated: false };
  }
  return null;
}

/** A generated password, printed once in this window (never written to a file or a log). */
export function printPasswordOnce(label: string, password: string): void {
  const line = "-".repeat(Math.max(44, password.length + 4));
  console.log(`\n${line}\n  ${label} (shown once, saved nowhere):\n\n  ${password}\n${line}`);
}

// ---------- The database ----------

export type Target = { url: string | null; testDir: string | null; label: string };

/** DATABASE_URL, else the local test database (tests only), else null (print NEON_STEPS). */
export async function databaseTarget(): Promise<Target | null> {
  const { testDbDir } = await import("../src/db/env");
  const url = (process.env.DATABASE_URL ?? "").trim();
  const testDir = url ? null : testDbDir();
  if (!url && !testDir) return null;
  return { url: url || null, testDir, label: url ? describeDb(url) : `pglite:${testDir} (local test database)` };
}

/** Brings the tables up to date, then opens a direct connection (with the backup address lookup). */
export async function openDatabase(t: Target): Promise<{ db: DB; close: () => Promise<void> }> {
  console.log("Making sure the tables are up to date...");
  if (t.url) {
    const { migrateNeon } = await import("../src/lib/server/migrate");
    const done = await migrateNeon(t.url);
    console.log(done === "up-to-date" ? "The tables are up to date." : "New tables added.");
    const { openTarget } = await import("../src/lib/import/engine/connect");
    const target = await openTarget(t.url);
    if (target.note) console.log(`Connected (${target.note}).`);
    return { db: target.db as unknown as DB, close: () => target.close() };
  }
  const { openLocalDbWithClient } = await import("../src/db/local/open");
  const local = await openLocalDbWithClient({ dataDir: t.testDir! });
  return { db: local.db, close: () => local.client.close() };
}

/** Runs a script's main(); any error is described without a connection string or a password. */
export function runScript(main: () => Promise<number>): void {
  main().then(
    (code) => finish(code),
    async (err) => {
      const { describeError, scrubSecrets } = await import("../src/lib/server/db-connect");
      const msg = scrubSecrets(describeError(err), [process.env.DATABASE_URL ?? ""]);
      console.error(`\nStopped: ${msg}\nNothing secret was printed. Check the database address in .env.local and try again.`);
      finish(1);
    },
  );
}
