// npm run copy:engine: copies every expert record from Engine (the old jobs site's database) into
// the Expert Hub database (DATABASE_URL, the Neon project "expert-hub"). Safe to run again any time:
// new and changed records come across, nothing is copied twice, nothing is deleted.
//
//   npm run copy:engine -- --dry-run      read Engine, compare, print what would happen, write nothing
//   CONFIRM_DB=yes npm run copy:engine    the real copy
//
// Engine's address: ENGINE_DATABASE_URL, or a key in another .env file:
//   --source-env "..\Jobs - FynoLabs\.env" --source-key JOBS_DATABASE_URL   (what the .bat launcher passes)
// --local-test: allows pglite:<folder> addresses and an empty DATABASE_URL (a local trial; never a real database).
// --log-file <path>: also append everything printed to that file (the launcher's logs\copy-engine-latest.log).
//
// Engine is only read (one READ ONLY snapshot, SELECT statements only). Connection strings are never
// printed or written anywhere: only user@host/db.
import { describeError } from "../src/lib/server/db-connect";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "./_env";
import { describeDb, directUrl, parseArgs, preflight, resolveSourceUrl } from "../src/lib/import/engine/env";
import { finish } from "./_exit";

loadEnv();

const USAGE = `Copy every expert record from Engine into the Expert Hub database.

  npm run copy:engine -- --dry-run [--source-env <file> --source-key <KEY>]
  CONFIRM_DB=yes npm run copy:engine -- [--source-env <file> --source-key <KEY>]

Engine's address comes from ENGINE_DATABASE_URL, else from KEY (default JOBS_DATABASE_URL) in the
--source-env file. The target is DATABASE_URL (.env.local). See docs/DEPLOY.md, step 3.`;

/** The connection strings of this run, so any message can be scrubbed of them. */
let secretUrls: string[] = [];

/** Removes any password that might appear in an error message. */
function scrub(text: string, urls: string[]): string {
  let out = text;
  for (const u of urls) {
    try {
      const p = decodeURIComponent(new URL(u).password);
      if (p) out = out.split(p).join("***");
      out = out.split(u).join(describeDb(u));
    } catch {
      /* not a URL */
    }
  }
  return out.replace(/(postgres(?:ql)?:\/\/[^:\s/@]+):[^@\s]+@/gi, "$1:***@");
}

/** A readable message from an Error, or from the WebSocket ErrorEvent the Neon driver rejects with. */
function errText(e: unknown, depth = 0): string {
  if (depth === 0) return describeError(e);
  if (e instanceof Error) {
    const cause = (e as { cause?: unknown }).cause;
    return `${e.name === "Error" ? "" : `${e.name}: `}${e.message}${cause && depth < 2 ? ` (${errText(cause, depth + 1)})` : ""}`;
  }
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; error?: unknown; type?: unknown };
    if (o.error && depth < 2) return errText(o.error, depth + 1);
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.type === "string") return `connection ${o.type}: the database could not be reached (internet connection, or the address)`;
  }
  return String(e);
}

function stamp(d = new Date()): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Everything printed also goes to the log file (Windows has no tee). Passwords are never printed. */
function teeTo(file: string) {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  for (const k of ["log", "error"] as const) {
    const orig = console[k].bind(console);
    console[k] = (...a: unknown[]) => {
      orig(...a);
      try {
        appendFileSync(file, `${a.map((x) => (typeof x === "string" ? x : String(x))).join(" ")}\n`);
      } catch {
        /* the log is a convenience */
      }
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.logFile) teeTo(args.logFile);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.unknown.length) {
    console.error(`Unknown option(s): ${args.unknown.join(" ")}\n\n${USAGE}`);
    return 1;
  }
  const src = resolveSourceUrl(process.env, args);
  if (!src.ok) {
    console.error(src.message);
    return 1;
  }
  let targetUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!targetUrl && args.localTest) targetUrl = `pglite:${path.join(".data", "copy-test-target")}`;
  const sourceUrl = directUrl(src.url);
  const urls = [src.url, sourceUrl, targetUrl].filter(Boolean);
  secretUrls = urls;
  try {
    console.log(`\n${args.dryRun ? "DRY RUN: reading only, nothing will be written." : "Copying experts from Engine."}`);
    console.log(`  Read from (read only): ${describeDb(sourceUrl)}   [${src.from}]`);
    console.log(`  Write to:              ${targetUrl ? describeDb(targetUrl) : "(DATABASE_URL is empty)"}\n`);
    const problems = preflight({ sourceUrl: src.url, targetUrl, confirm: process.env.CONFIRM_DB, dryRun: args.dryRun, localTest: args.localTest });
    if (problems.length) {
      for (const p of problems) console.error(`Refusing: ${p}`);
      return 1;
    }
    const { openSource, openTarget } = await import("../src/lib/import/engine/connect");
    const { copyFromEngine } = await import("../src/lib/import/engine/copy");
    const target = await openTarget(targetUrl);
    let source: Awaited<ReturnType<typeof openSource>> | null = null;
    try {
      source = await openSource(sourceUrl);
      const { viaLabel } = await import("../src/lib/server/db-connect");
      if (target.via) console.log(`  Connected to the new database (${viaLabel(target.via)}).`);
      if (source.via) console.log(`  Connected to Engine, read only (${viaLabel(source.via)}).\n`);
      const res = await copyFromEngine({
        source: source.raw,
        target,
        dryRun: args.dryRun,
        actor: { email: process.env.HUB_ACTOR || `cli:${os.userInfo().username}`, role: "admin" },
        migrate: target.migrate,
        describe: { source: describeDb(sourceUrl), target: describeDb(targetUrl) },
        log: (line) => console.log(line),
      });
      if (res.refused) {
        console.error(res.refused);
        return 1;
      }
      console.log(`\n${res.report}\n`);
      if (res.people?.heldIds.length) console.log(`Held for review (jobs-site user ids): ${res.people.heldIds.join(", ")}\n`);
      const dir = process.env.COPY_LOG_DIR || "logs";
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `copy-engine-${stamp()}${args.dryRun ? "-dry-run" : ""}.txt`);
      writeFileSync(file, `${res.report}\n`);
      console.log(`Report saved to ${file} (counts only).`);
      return res.ok ? 0 : 1;
    } finally {
      await source?.close().catch(() => {});
      await target.close().catch(() => {});
    }
  } catch (e) {
    console.error(`\nThe copy stopped: ${scrub(errText(e), urls)}`);
    console.error("Nothing in Engine was changed. Running it again is safe: it carries on where it stopped.");
    return 1;
  }
}

// Anything that escapes (a dropped connection, say) is reported without details that could hold a secret.
for (const ev of ["uncaughtException", "unhandledRejection"] as const) {
  process.on(ev, (err) => {
    console.error(`\nThe copy stopped unexpectedly: ${scrub(errText(err), secretUrls)}\nNothing in Engine was changed; running it again is safe.`);
    process.exit(1);
  });
}

main().then(
  (code) => finish(code),
  (err) => {
    console.error("The copy stopped with an unexpected error.", err instanceof Error ? err.name : "");
    finish(1);
  },
);
