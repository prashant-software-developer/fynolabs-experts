// npm run sync:fynolabs: copies everything from the FynoLabs admin (fynolabs.si/admin, Lovable /
// Supabase) into the Expert Hub database and folds it into the hub's tables. Safe to run again any
// time until the Lovable admin is retired: new and changed records come across, nothing is copied
// twice, nothing is deleted, and edits made in the hub are kept.
//
//   npm run sync:fynolabs -- --dry-run      counts only: copies nothing, maps nothing
//   CONFIRM_DB=yes npm run sync:fynolabs    the real run
//
// Settings (.env.local): FYNOLABS_SYNC_TOKEN (the same value as the HUB_SYNC_TOKEN secret in
// Lovable), FYNOLABS_SYNC_URL (default: the FynoLabs project's hub-sync function), DATABASE_URL.
// --log-file <path>: also append everything printed to that file. FynoLabs is only read (by the
// edge function); the token and the database address are never printed or saved.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "./_env";
import { describeDb } from "../src/lib/import/engine/env";
import { DEFAULT_SYNC_URL, parseSyncArgs, scrub } from "../src/lib/import/fynolabs/runner";
import { finish } from "./_exit";

loadEnv();

const USAGE = `Copy everything from the FynoLabs admin into the Expert Hub database.

  npm run sync:fynolabs -- --dry-run          counts only, nothing copied or changed
  CONFIRM_DB=yes npm run sync:fynolabs        copy and fold into the hub

Needs FYNOLABS_SYNC_TOKEN and DATABASE_URL in .env.local (docs/DEPLOY.md, "Copy the FynoLabs admin").`;

let secrets: string[] = [];

function stamp(d = new Date()): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function teeTo(file: string) {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  for (const k of ["log", "error"] as const) {
    const orig = console[k].bind(console);
    console[k] = (...a: unknown[]) => {
      const line = scrub(a.map((x) => (typeof x === "string" ? x : String(x))).join(" "), secrets);
      orig(line);
      try {
        appendFileSync(file, `${line}\n`);
      } catch {
        /* the log is a convenience */
      }
    };
  }
}

async function main(): Promise<number> {
  const args = parseSyncArgs(process.argv.slice(2));
  const token = (process.env.FYNOLABS_SYNC_TOKEN ?? "").trim();
  const dbUrl = (process.env.DATABASE_URL ?? "").trim();
  const url = (process.env.FYNOLABS_SYNC_URL ?? "").trim() || DEFAULT_SYNC_URL;
  secrets = [token, dbUrl].filter(Boolean);
  if (args.logFile) teeTo(args.logFile);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.unknown.length) {
    console.error(`Unknown option(s): ${args.unknown.join(" ")}\n\n${USAGE}`);
    return 1;
  }
  if (token.length < 16) {
    console.error("FYNOLABS_SYNC_TOKEN is missing in .env.local (or too short). Run `npm run token:new`, then add it in Lovable (docs/DEPLOY.md).");
    return 1;
  }
  if (!/^https:\/\//.test(url)) {
    console.error("FYNOLABS_SYNC_URL must be an https:// address.");
    return 1;
  }
  if (!dbUrl && !args.dryRun) {
    console.error("DATABASE_URL is empty: put the expert-hub connection string in .env.local (docs/DEPLOY.md).");
    return 1;
  }
  if (!args.dryRun && process.env.CONFIRM_DB !== "yes") {
    console.error("Refusing: set CONFIRM_DB=yes to confirm DATABASE_URL is the database you mean (the launcher asks you first).");
    return 1;
  }
  console.log(`\n${args.dryRun ? "DRY RUN: counts only, nothing is copied or changed." : "Copying the FynoLabs admin into Expert Hub."}`);
  console.log(`  FynoLabs side: ${new URL(url).host} (hub-sync)`);
  console.log(`  Hub database:  ${dbUrl ? describeDb(dbUrl) : "(DATABASE_URL is empty: FynoLabs counts only)"}\n`);
  const { runSync } = await import("../src/lib/import/fynolabs/runner");
  let target: Awaited<ReturnType<typeof import("../src/lib/import/engine/connect").openTarget>> | null = null;
  try {
    if (dbUrl) {
      const { openTarget } = await import("../src/lib/import/engine/connect");
      target = await openTarget(dbUrl);
      if (target.note) console.log(`  Connected to the hub database (${target.note}).`);
      const { looksLikeEngine } = await import("../src/lib/import/engine/copy");
      if (await looksLikeEngine(target.raw)) {
        console.error("Refusing: DATABASE_URL has the jobs site's own tables, so it is Engine, not expert-hub.");
        return 1;
      }
    }
    const res = await runSync({
      url,
      token,
      dryRun: args.dryRun,
      raw: target?.raw ?? null,
      migrate: target?.migrate,
      actorEmail: process.env.HUB_ACTOR || `cli:${os.userInfo().username}`,
      log: (line) => console.log(line),
    });
    console.log(`\n${res.report}\n`);
    const dir = process.env.COPY_LOG_DIR || "logs";
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `sync-fynolabs-${stamp()}${args.dryRun ? "-dry-run" : ""}.txt`);
    writeFileSync(file, `${res.report}\n`);
    console.log(`Report saved to ${file} (counts only).`);
    return res.ok ? 0 : 1;
  } catch (e) {
    const { describeError } = await import("../src/lib/server/db-connect");
    console.error(`\nThe sync stopped: ${scrub(describeError(e), secrets)}`);
    console.error("FynoLabs was not changed. Running it again is safe: it carries on where it stopped.");
    return 1;
  } finally {
    await target?.close().catch(() => {});
  }
}

for (const ev of ["uncaughtException", "unhandledRejection"] as const) {
  process.on(ev, (err) => {
    console.error(`\nThe sync stopped unexpectedly: ${scrub(err instanceof Error ? err.message : String(err), secrets)}`);
    process.exit(1);
  });
}

{
  main().then(
    (code) => finish(code),
    () => {
      console.error("The sync stopped with an unexpected error (details hidden: they could include a secret).");
      finish(1);
    },
  );
}
