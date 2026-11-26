// npm run jobs:board [-- --apply]
// The job board clean-up of 26 Nov 2026 (src/lib/jobs/board-2026-11.ts): keeps the live roles from
// the FynoLabs admin and makes them public, keeps the internal one, adds the roles partners need now
// (public, open) and closes every other open job. Closing keeps every application; nothing is deleted.
// Without --apply it only prints what it would do. Writing needs CONFIRM_DB=yes as well
// ("Update job board.bat" asks first and sets it).
import os from "node:os";
import { loadEnv } from "./_env";
import { databaseTarget, NEON_STEPS, openDatabase, runScript } from "./_account-cli";

loadEnv();

async function main(): Promise<number> {
  const apply = process.argv.includes("--apply");
  const { eq, inArray } = await import("drizzle-orm");
  const { jobs, partners } = await import("../src/db/schema");
  const { createJob, setJobState } = await import("../src/lib/server/jobs");
  const { KEEP_INTERNAL, KEEP_PUBLIC, NEW_JOBS } = await import("../src/lib/jobs/board-2026-11");

  const target = await databaseTarget();
  if (!target) {
    console.error(`\n${NEON_STEPS}\n`);
    return 1;
  }
  console.log(`\nJob board in: ${target.label}${apply ? "" : " (dry run: nothing changes)"}\n`);
  if (apply && process.env.CONFIRM_DB !== "yes") {
    console.error("Refusing: set CONFIRM_DB=yes to confirm this is the database you mean.");
    return 1;
  }
  const { db, close } = await openDatabase(target);
  try {
    const actor = { email: process.env.HUB_ACTOR || `cli:${os.userInfo().username}`, role: "admin" };
    const all = await db.select({ id: jobs.id, title: jobs.title, status: jobs.status, visibility: jobs.visibility }).from(jobs);
    const byTitle = new Map(all.map((j) => [j.title, j]));
    const keepPublic = new Set<string>(KEEP_PUBLIC);
    const keepInternal = new Set<string>(KEEP_INTERNAL);
    const newTitles = new Set(NEW_JOBS.map((j) => j.title));
    let problems = 0;
    // Never close the board around a missing role: if a job to keep isn't there, change nothing.
    const missing = [...KEEP_PUBLIC, ...KEEP_INTERNAL].filter((t) => !byTitle.has(t));
    if (apply && missing.length) {
      console.error(`Refusing: these jobs to keep aren't in the database, so nothing was changed:\n  ${missing.join("\n  ")}`);
      return 1;
    }

    console.log("Keep open, public on the board:");
    for (const t of KEEP_PUBLIC) {
      const j = byTitle.get(t);
      if (!j) {
        console.log(`  ! ${t}: not found`);
        problems++;
        continue;
      }
      console.log(`  - ${t} (now ${j.status}, ${j.visibility})`);
      if (apply) {
        const r = await setJobState(db, actor, j.id, { status: "open", visibility: "public" });
        if (!r.ok) {
          console.log(`    ! ${r.reason}`);
          problems++;
        }
      }
    }

    console.log("\nKeep open, internal (not on the site):");
    for (const t of KEEP_INTERNAL) console.log(`  - ${t}${byTitle.has(t) ? "" : ": not found"}`);

    console.log("\nAdd (open, public):");
    const partnerIds = new Map<string, string>();
    const names = [...new Set(NEW_JOBS.map((j) => j.partnerName).filter((n): n is string => Boolean(n)))];
    if (names.length) for (const p of await db.select({ id: partners.id, name: partners.name }).from(partners).where(inArray(partners.name, names))) partnerIds.set(p.name, p.id);
    for (const n of NEW_JOBS) {
      const existing = byTitle.get(n.title);
      console.log(`  - ${n.title}${existing ? " (already there: made open and public)" : ""}`);
      if (!apply) continue;
      let id = existing?.id;
      if (!id) {
        const { partnerName, ...data } = n;
        const r = await createJob(db, actor, { ...data, partnerId: partnerName ? (partnerIds.get(partnerName) ?? null) : null, requirementId: null, internalRateNote: null, featured: false, visibility: "public" });
        if (!r.ok) {
          console.log(`    ! ${r.reason}`);
          problems++;
          continue;
        }
        id = r.id;
      }
      const s = await setJobState(db, actor, id, { status: "open", visibility: "public" });
      if (!s.ok) {
        console.log(`    ! ${s.reason}`);
        problems++;
      }
    }

    const toClose = all.filter((j) => (j.status === "open" || j.status === "paused") && !keepPublic.has(j.title) && !keepInternal.has(j.title) && !newTitles.has(j.title));
    console.log(`\nClose (${toClose.length}; their applications stay):`);
    for (const j of toClose.sort((a, b) => a.title.localeCompare(b.title))) {
      console.log(`  - ${j.title}`);
      if (apply) {
        const r = await setJobState(db, actor, j.id, { status: "closed" });
        if (!r.ok) {
          console.log(`    ! ${r.reason}`);
          problems++;
        }
      }
    }

    const open = apply ? await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, "open")) : null;
    console.log(apply ? `\nDone. ${open?.length ?? 0} open jobs now${problems ? `; ${problems} problem(s) above` : ""}.` : "\nDry run: nothing was changed. Run with --apply (and CONFIRM_DB=yes) to make these changes.");
    return problems ? 1 : 0;
  } finally {
    await close().catch(() => {});
  }
}

runScript(main);
