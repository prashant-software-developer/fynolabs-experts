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
import { planImport, type ExistingIndex, type ImportPlan } from "@/lib/import/plan";
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

/** Where the jobs-site tables are: public.xdl_jobs_* on the jobs site, or engine_copy.* (the copy in the hub's database). */
export type JobsLocation = { schema: string; prefix: string };
export const JOBS_SITE_TABLES: JobsLocation = { schema: "public", prefix: "xdl_jobs_" };

/** Runs one SELECT and returns its rows. Lets the same reads run on a DB handle or a read-only source connection. */
export type Reader = (text: string) => Promise<Record<string, unknown>[]>;
export const dbReader =
  (db: DB): Reader =>
  async (text) =>
    rowsOf<Record<string, unknown>>(await db.execute(sql.raw(text)));

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`Not a plain identifier: ${s}`);
  return `"${s}"`;
};
export const tableName = (loc: JobsLocation, table: string) => `${ident(loc.schema)}.${ident(`${loc.prefix}${table}`)}`;

export async function columnsOf(read: Reader, loc: JobsLocation, table: string): Promise<Set<string>> {
  const rows = await read(
    `select column_name::text as c from information_schema.columns where table_schema = '${loc.schema}' and table_name = '${loc.prefix}${table}'`,
  );
  return new Set(rows.map((r) => String(r.c)));
}

/** "a, b, null as c" for the wanted columns, so older copies of a table (missing columns) still read. */
function selectList(wanted: readonly string[], present: Set<string>, alias = ""): string {
  return wanted.map((c) => (present.has(c) ? `${alias}${ident(c)}` : `null as ${ident(c)}`)).join(", ");
}

const USER_COLUMNS = [
  "id", "email", "name", "country", "city", "state", "linkedin_url", "headline", "domain", "years_experience",
  "highest_degree", "field_of_study", "university", "hours_per_week", "phone", "skills", "languages",
  "crm_stage", "crm_tags", "crm_note",
] as const;

export type JobsSiteData = {
  users: JobsUser[];
  files: { id: number; user_id: number; filename: string; mime: string; size: number; created_at: string | Date }[];
  apps: JobsApplication[];
};

/** The people (staff accounts left out), their newest resume and their applications. SELECTs only. */
export async function readJobsSite(read: Reader, loc: JobsLocation = JOBS_SITE_TABLES): Promise<JobsSiteData> {
  const userCols = await columnsOf(read, loc, "users");
  const staff = userCols.has("is_admin") ? "coalesce(is_admin, false) = false" : "true";
  const users = (await read(`select ${selectList(USER_COLUMNS, userCols)} from ${tableName(loc, "users")} where ${staff} order by id`)) as unknown as JobsUser[];
  const files = (await read(`
      select distinct on (user_id) id, user_id, filename, mime, size, created_at
      from ${tableName(loc, "files")}
      where kind = 'resume'
      order by user_id, created_at desc, id desc`)) as unknown as JobsSiteData["files"];
  const apps = (await read(`
      select a.user_id, a.status, a.rate_expectation, a.created_at, j.title
      from ${tableName(loc, "applications")} a
      join ${tableName(loc, "jobs")} j on j.id = a.job_id`)) as unknown as JobsApplication[];
  return { users, files, apps };
}

export type PeoplePlan = { plan: ImportPlan; users: number };

/** Plans the people part of a jobs-site import (no writes): who is new, who gets empty fields filled, who is held. */
export async function planJobsPeople(db: DB, data: Pick<JobsSiteData, "users" | "apps">, index?: ExistingIndex): Promise<PeoplePlan> {
  const appsByUser = new Map<number, JobsApplication[]>();
  for (const a of data.apps) appsByUser.set(Number(a.user_id), [...(appsByUser.get(Number(a.user_id)) ?? []), a]);
  const drafts = data.users.map((u) => mapJobsUser({ ...u, id: Number(u.id) }, appsByUser.get(Number(u.id)) ?? []));
  const plan = planImport(drafts, index ?? (await loadIndex(db)));
  return { plan, users: data.users.length };
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
  const { users, files, apps } = await readJobsSite(dbReader(source));
  const { plan } = await planJobsPeople(db, { users, apps });
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

