// Jobs-site sync: copies people from the jobs site (jobs.fynolabs.si) into the hub.
//
// READ ONLY on the jobs site: this file only runs SELECT statements against public.xdl_jobs_*,
// either in the same database or in a separate one (JOBS_DATABASE_URL, see jobs-source.ts).
// Rules:
//  - match on expert_sources (jobs_site, user id), then email, then LinkedIn URL;
//  - new people are created; existing people only get EMPTY fields filled (team edits win);
//  - the newest jobs-site resume becomes the current CV unless someone uploaded one here (same
//    database: a pointer, streamed on download; separate database: a copy in hub.expert_files);
//  - last_synced_at is refreshed for everyone seen;
//  - people deleted on request are skipped.
import { sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { rowsOf } from "@/db/client";
import { experts } from "@/db/schema";
import { mapJobsUser, type JobsApplication, type JobsUser } from "@/lib/import/jobs";
import { planImport } from "@/lib/import/plan";
import { logActivity, type Actor } from "./activity";
import { copyJobsCv, linkJobsCv } from "./cv";
import { applyPlan, loadIndex } from "./import-apply";

export type JobsSyncResult =
  | { ok: false; message: string }
  | {
      ok: true;
      dryRun: boolean;
      users: number;
      created: number;
      updated: number;
      unchanged: number;
      skipped: number;
      duplicates: number;
      cvsLinked: number;
      notes: string[];
    };

export async function jobsTablesExist(db: DB): Promise<boolean> {
  const res = await db.execute(sql`select to_regclass('public.xdl_jobs_users') is not null as ok`);
  return Boolean(rowsOf<{ ok: boolean }>(res)[0]?.ok);
}

async function readJobsSite(db: DB) {
  const users = rowsOf<JobsUser>(
    await db.execute(sql`
      select id, email, name, country, city, state, linkedin_url, headline, domain, years_experience,
             highest_degree, field_of_study, university, hours_per_week, phone, skills, languages
      from public.xdl_jobs_users
      where coalesce(is_admin, false) = false
      order by id`),
  );
  const files = rowsOf<{ id: number; user_id: number; filename: string; mime: string; size: number; created_at: string | Date }>(
    await db.execute(sql`
      select distinct on (user_id) id, user_id, filename, mime, size, created_at
      from public.xdl_jobs_files
      where kind = 'resume'
      order by user_id, created_at desc, id desc`),
  );
  const apps = rowsOf<JobsApplication>(
    await db.execute(sql`
      select a.user_id, a.status, a.rate_expectation, a.created_at, j.title
      from public.xdl_jobs_applications a
      join public.xdl_jobs_jobs j on j.id = a.job_id`),
  );
  return { users, files, apps };
}

/**
 * `source`: where the jobs-site tables are (default: the same database as `db`). Only SELECTs
 * ever run against it.
 */
export async function syncJobsSite(db: DB, actor: Actor, opts: { dryRun?: boolean; source?: DB } = {}): Promise<JobsSyncResult> {
  const source = opts.source ?? db;
  const separate = source !== db;
  if (!(await jobsTablesExist(source))) {
    return {
      ok: false,
      message: separate
        ? "The jobs-site tables (public.xdl_jobs_users) aren't in the JOBS_DATABASE_URL database."
        : "The jobs-site tables (public.xdl_jobs_users) aren't in this database. If they're in another one (the old Engine), set JOBS_DATABASE_URL and run npm run import:jobs.",
    };
  }
  const { users, files, apps } = await readJobsSite(source);
  const appsByUser = new Map<number, JobsApplication[]>();
  for (const a of apps) appsByUser.set(Number(a.user_id), [...(appsByUser.get(Number(a.user_id)) ?? []), a]);
  const drafts = users.map((u) => mapJobsUser({ ...u, id: Number(u.id) }, appsByUser.get(Number(u.id)) ?? []));
  const plan = planImport(drafts, await loadIndex(db));
  const notes = plan.rows.filter((r) => r.action === "duplicate").map((r) => `Jobs user ${r.row}: ${r.reason}`);

  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      users: users.length,
      created: plan.counts.create,
      updated: plan.counts.update,
      unchanged: plan.counts.unchanged,
      skipped: plan.counts.skip,
      duplicates: plan.counts.duplicate,
      cvsLinked: 0,
      notes,
    };
  }

  const res = await applyPlan(db, plan, actor);

  let cvsLinked = 0;
  for (const f of files) {
    const expertId = res.expertByRow.get(Number(f.user_id));
    if (!expertId) continue;
    if (separate) {
      // Copy the bytes over: the app's own database must not depend on the old one.
      if (await copyJobsCv(db, source, expertId, { id: Number(f.id), filename: f.filename, mime: f.mime, createdAt: f.created_at ? new Date(f.created_at) : null })) cvsLinked++;
      continue;
    }
    const linked = await linkJobsCv(db, expertId, {
      id: Number(f.id),
      filename: f.filename,
      mime: f.mime,
      size: Number(f.size),
      createdAt: f.created_at ? new Date(f.created_at) : null,
    });
    // Point cv_ref at the newest jobs-site resume, unless a CV was uploaded here.
    const ref = `jobs:file:${f.id}`;
    const updated = await db
      .update(experts)
      .set({ cvRef: ref })
      .where(sql`${experts.id} = ${expertId} and (${experts.cvRef} is null or (${experts.cvRef} like 'jobs:file:%' and ${experts.cvRef} <> ${ref}))`)
      .returning({ id: experts.id });
    if (linked || updated.length) cvsLinked++;
  }

  await logActivity(db, {
    entityType: "import",
    entityId: "jobs_site",
    actor,
    action: "jobs_site_sync",
    detail: { users: users.length, created: res.created, updated: res.updated, unchanged: res.unchanged, skipped: res.skipped, duplicates: res.duplicates, cvsLinked, separateDatabase: separate },
  });

  return {
    ok: true,
    dryRun: false,
    users: users.length,
    created: res.created,
    updated: res.updated,
    unchanged: res.unchanged,
    skipped: res.skipped,
    duplicates: res.duplicates,
    cvsLinked,
    notes,
  };
}

/** Jobs-site applications for one expert, read live (for the profile page). */
export async function jobsApplicationsFor(db: DB, expertId: string) {
  if (!(await jobsTablesExist(db))) return [];
  const res = await db.execute(sql`
    select a.id, a.status, a.created_at, j.title
    from hub.expert_sources s
    join public.xdl_jobs_applications a on a.user_id::text = s.external_id
    join public.xdl_jobs_jobs j on j.id = a.job_id
    where s.expert_id = ${expertId} and s.source = 'jobs_site'
    order by a.created_at desc
    limit 50`);
  return rowsOf<{ id: number; status: string; created_at: string | Date; title: string }>(res);
}

