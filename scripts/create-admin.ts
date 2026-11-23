// npm run admin:create -- --email <email> [--name <name>]
// Creates (or updates) the owner's admin login in DATABASE_URL: the team member with role admin
// and a team account with the email marked verified. Runs the migrations first.
//
// The password is typed twice with hidden input, or press Enter to get a strong generated one
// (printed once; it must be changed at the first sign-in). It is never written to a file or a log.
// If the account already exists it asks "Reset the password? (yes/no)".
//
// Non-interactive (tests, scripts): --generate (no password prompt) and --reset yes|no.
// Refuses without CONFIRM_DB=yes, and prints the target as user@host/db (never the password).
import os from "node:os";
import readline from "node:readline";
import { loadEnv } from "./_env";
import { describeDb } from "../src/lib/import/engine/env";

loadEnv();

const USAGE = `Create or update your Expert Hub admin login.

  CONFIRM_DB=yes npm run admin:create -- --email you@xocket.sh [--name "Your Name"]

Options: --generate (make a strong password instead of asking), --reset yes|no (answer for an existing account).
The database is DATABASE_URL in .env.local (the Neon project "expert-hub").`;

const NEON_STEPS = `The database isn't set up on this computer yet. Do this once:
  1. Open https://neon.tech with the FynoLabs admin account and open the project "expert-hub".
  2. Press Connect, keep the main branch, and copy the connection string. It starts with postgresql://
  3. In this folder, open the file .env.local in Notepad (or create it) and add one line:
       DATABASE_URL=the string you copied
  4. Save it and run this again.
Keep that string private: it contains a password.`;

type Args = { email?: string; name?: string; generate: boolean; reset?: "yes" | "no"; help: boolean; unknown: string[] };

function parseArgs(argv: string[]): Args {
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

// ---------- Prompts (visible and hidden), for Windows cmd, PowerShell and other terminals ----------

let piped: AsyncIterator<string> | null = null;
async function pipedLine(): Promise<string> {
  piped ??= readline.createInterface({ input: process.stdin, terminal: false })[Symbol.asyncIterator]();
  const r = await piped.next();
  return r.done ? "" : r.value;
}

async function ask(question: string): Promise<string> {
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
async function askHidden(question: string): Promise<string> {
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

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.unknown.length) {
    console.error(`Unknown option(s): ${args.unknown.join(" ")}\n\n${USAGE}`);
    return 1;
  }
  const { testDbDir } = await import("../src/db/env");
  const url = (process.env.DATABASE_URL ?? "").trim();
  const testDir = url ? null : testDbDir();
  if (!url && !testDir) {
    console.error(`\n${NEON_STEPS}\n`);
    return 1;
  }
  console.log(`\nAdmin account in: ${url ? describeDb(url) : `pglite:${testDir} (local test database)`}\n`);
  if (process.env.CONFIRM_DB !== "yes") {
    console.error("Refusing: set CONFIRM_DB=yes to confirm this is the database you mean.");
    return 1;
  }

  const { normalizeEmail } = await import("../src/lib/normalize");
  const { generatePassword, passwordMessage } = await import("../src/lib/auth/password");
  let email = normalizeEmail(args.email ?? "");
  if (!email) email = normalizeEmail(await ask("Your email: "));
  if (!email) {
    console.error("That isn't a valid email address. Nothing was changed.");
    return 1;
  }

  console.log("Making sure the tables are up to date...");
  let db: import("../src/db/client").DB;
  let close: () => Promise<void> = async () => {};
  if (url) {
    const { migrateNeon } = await import("../src/lib/server/migrate");
    await migrateNeon(url);
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("../src/db/schema");
    db = drizzle({ client: neon(url), schema }) as unknown as typeof db;
  } else {
    const { openLocalDbWithClient } = await import("../src/db/local/open");
    const local = await openLocalDbWithClient({ dataDir: testDir! });
    db = local.db;
    close = () => local.client.close();
  }
  try {
    const { adminAccountExists, upsertAdminAccount } = await import("../src/lib/server/admin-account");
    const exists = await adminAccountExists(db, email);
    let setPassword = true;
    if (exists) {
      let answer = args.reset ?? "";
      while (answer !== "yes" && answer !== "no") answer = (await ask(`${email} already has an account. Reset the password? (yes/no): `)).toLowerCase();
      setPassword = answer === "yes";
    }

    let password: string | null = null;
    let generated = false;
    if (setPassword) {
      if (args.generate) {
        password = generatePassword();
        generated = true;
      } else {
        for (let tries = 0; tries < 3 && !password; tries++) {
          const first = await askHidden("Choose a password (at least 10 characters; nothing shows as you type).\nPress Enter without typing to get a strong one made for you: ");
          if (!first) {
            password = generatePassword();
            generated = true;
            break;
          }
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
          password = first;
        }
        if (!password) {
          console.error("No password set. Nothing was changed.");
          return 1;
        }
      }
    }

    const res = await upsertAdminAccount(db, { email, name: args.name ?? null, password, generated, actor: process.env.HUB_ACTOR || `cli:${os.userInfo().username}` });
    console.log(`\n${res.created ? "Created" : "Updated"} the admin account for ${res.email} (role: admin, email verified).`);
    if (!setPassword) console.log("The password was not changed.");
    else if (generated && password) {
      const line = "-".repeat(Math.max(44, password.length + 4));
      console.log(`\n${line}\n  Your password (shown once, saved nowhere):\n\n  ${password}\n${line}`);
      console.log("Write it down or copy it now. You'll choose your own password when you first sign in.");
    } else console.log("Your password is set.");
    return 0;
  } finally {
    await close().catch(() => {});
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // Never print a connection string: only what kind of error it was.
    const msg = err instanceof Error ? err.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "(database address)") : "unexpected error";
    console.error(`\nStopped: ${msg}\nNothing secret was printed. Check the database address in .env.local and try again.`);
    process.exit(1);
  },
);
