// npm run import:jobs: the jobs-site sync from the command line (same as the button on /admin/import).
//   npm run import:jobs                 local demo database
//   npm run import:jobs -- --dry-run    show what would change, change nothing
// Against a real database: DATABASE_URL=... CONFIRM_DB=yes npm run import:jobs
// Old jobs-site tables in another database (the shared "Engine"): also set JOBS_DATABASE_URL.
// Reads public.xdl_jobs_* (never writes there) and writes hub.* in DATABASE_URL only.
import os from "node:os";
import { describeTarget, loadEnv, requireConfirm } from "./_env";

loadEnv();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (process.env.DATABASE_URL) {
    if (!dryRun) requireConfirm("The jobs-site import");
  } else {
    console.log("No DATABASE_URL: using the local demo database (.data/pglite). Stop `npm run dev` first.");
  }
  const { getDb } = await import("../src/db/client");
  const { syncJobsSite } = await import("../src/lib/server/jobs-sync");
  const { jobsSourceConfig, openJobsSource } = await import("../src/lib/server/jobs-source");
  const cfg = jobsSourceConfig();
  if (cfg.mode === "separate") console.log(`Reading the jobs site (read only) from: ${describeTarget(cfg.url)}`);
  const db = await getDb();
  const { source } = await openJobsSource(db);
  const actor = process.env.HUB_ACTOR || `cli:${os.userInfo().username}`;
  const res = await syncJobsSite(db, actor, { dryRun, source });
  if (!res.ok) {
    console.error(res.message);
    process.exit(1);
  }
  console.log(`${dryRun ? "[dry run] " : ""}${res.users} jobs-site users: ${res.created} new, ${res.updated} filled in, ${res.unchanged} unchanged, ${res.duplicates} to review, ${res.skipped} skipped${dryRun ? "" : `, ${res.cvsLinked} CVs linked`}.`);
  for (const n of res.notes.slice(0, 50)) console.log(`  ${n}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
