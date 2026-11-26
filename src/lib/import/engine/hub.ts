// Second half of the copy: the jobs-site records (from engine_copy, or straight from Engine in a dry
// run) mapped into the hub's own tables, so they are usable in the app.
//
// Same rules as every import: experts found by source id, lower-case email, then LinkedIn URL; only
// empty fields are filled; people deleted on request stay out; team edits are never overwritten.
// hub.legacy_map remembers what each source row became, so a re-run adds new rows, updates rows
// nobody has touched in the hub, and copies no file twice.
import { sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { rowsOf } from "@/db/client";
import { activity, applications, expertSources, jobFormFields, jobs, legacyMap } from "@/db/schema";
import type { ApplicationStatus } from "@/lib/constants";
import type { FileAnswer } from "@/lib/forms/job-fields";
import {
  applicationStatusFrom,
  legacyAnswers,
  legacyFormFields,
  mapJobsJob,
  slugFor,
  type JobsJob,
  type LegacyFormKey,
  type MappedJob,
} from "@/lib/import/jobs";
import { buildIndex } from "@/lib/import/plan";
import { cleanLongText, cleanText } from "@/lib/normalize";
import { actorEmail, actorRole, type Actor } from "@/lib/server/activity";
import { applyPlan } from "@/lib/server/import-apply";
import { columnsOf, planJobsPeople, readJobsSite, tableName, type JobsLocation, type Reader } from "@/lib/server/jobs-sync";
import type { ReadOnlySource, SqlRunner } from "./source";

export const COPY_BY = "jobs-site import";
export const MAX_BATCH_BYTES = 20 * 1024 * 1024;
export const MAX_BATCH_FILES = 25;

type LegacyRow = { hubId: string; written: Record<string, unknown> | null; present: boolean };
type HubTable = "experts" | "expert_files" | "jobs" | "applications";

/** Which hub tables exist (a dry run may meet a database that isn't migrated yet, or only partly). */
export type HubTables = (table: string) => boolean;

export async function hubTables(db: DB): Promise<HubTables> {
  const rows = rowsOf<{ t: string }>(await db.execute(sql`select table_name::text as t from information_schema.tables where table_schema = 'hub'`));
  const set = new Set(rows.map((r) => r.t));
  return (t) => set.has(t);
}

async function loadLegacy(db: DB, sourceTable: string, hubTable: HubTable, has: HubTables): Promise<Map<string, LegacyRow>> {
  if (!has("legacy_map") || !has(hubTable)) return new Map();
  const rows = rowsOf<{ source_id: string; hub_id: string; written: Record<string, unknown> | null; present: boolean }>(
    await db.execute(
      sql.raw(`select m.source_id, m.hub_id::text as hub_id, m.written, (h.id is not null) as present
               from hub.legacy_map m left join hub.${hubTable} h on h.id = m.hub_id
               where m.source_table = '${sourceTable}'`),
    ),
  );
  return new Map(rows.map((r) => [String(r.source_id), { hubId: r.hub_id, written: r.written, present: Boolean(r.present) }]));
}

type LegacyWrite = { sourceTable: string; sourceId: string; hubTable: HubTable; hubId: string; written?: Record<string, unknown> | null };

async function saveLegacy(db: DB, rows: LegacyWrite[]) {
  const now = new Date();
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(legacyMap)
      .values(rows.slice(i, i + 500).map((r) => ({ ...r, written: r.written ?? null, createdAt: now, updatedAt: now })))
      .onConflictDoUpdate({
        target: [legacyMap.sourceTable, legacyMap.sourceId],
        set: { hubId: sql`excluded.hub_id`, hubTable: sql`excluded.hub_table`, written: sql`coalesce(excluded.written, ${legacyMap.written})`, updatedAt: now },
      });
  }
}

// ---------- People ----------

export type PeopleCounts = {
  engineUsers: number;
  staff: number;
  create: number;
  update: number;
  unchanged: number;
  /** Not imported: same LinkedIn URL as someone else with a different email (for the team to look at). */
  held: number;
  heldIds: number[];
  /** Not imported: no name, or deleted on request. */
  skipped: number;
  /** Same email as another jobs-site account (different capitals): merged into that expert. */
  mergedByEmail: number;
  /** Jobs-site accounts linked to a hub expert. */
  mapped: number;
  experts: number;
  details: { inserted: number; updated: number };
  payouts: { inserted: number; updated: number };
};

export async function mapPeople(db: DB, actor: Actor, read: Reader, loc: JobsLocation, opts: { dryRun: boolean; has: HubTables }) {
  const data = await readJobsSite(read, loc);
  const cols = await columnsOf(read, loc, "users");
  const [tot] = await read(
    `select count(*)::int as n, ${cols.has("is_admin") ? "count(*) filter (where coalesce(is_admin, false))::int" : "0"} as staff from ${tableName(loc, "users")}`,
  );
  const indexReady = ["experts", "expert_sources", "erasures"].every(opts.has);
  const { plan } = await planJobsPeople(db, data, indexReady ? undefined : buildIndex([], [], []));
  const expertByUser = new Map<number, string>();
  if (opts.dryRun) {
    for (const r of plan.rows) {
      if (r.action === "create") expertByUser.set(r.row, `new:${r.row}`);
      else if ((r.action === "update" || r.action === "unchanged") && r.expertId) expertByUser.set(r.row, r.expertId);
    }
  } else {
    const res = await applyPlan(db, plan, actor);
    for (const [row, id] of res.expertByRow) expertByUser.set(row, id);
  }
  // Two jobs-site accounts with the same email (in different capitals) are one person.
  const byEmail = new Map<string, string>();
  for (const r of plan.rows) if (r.email && expertByUser.has(r.row)) byEmail.set(r.email, expertByUser.get(r.row)!);
  const merged: { row: number; expertId: string }[] = [];
  const heldIds: number[] = [];
  for (const r of plan.rows) {
    if (r.action !== "duplicate" || expertByUser.has(r.row)) continue;
    const to = r.email ? byEmail.get(r.email) : undefined;
    if (to) {
      expertByUser.set(r.row, to);
      merged.push({ row: r.row, expertId: to });
    } else heldIds.push(r.row);
  }
  if (!opts.dryRun) {
    if (merged.length) {
      await db
        .insert(expertSources)
        .values(merged.map((m) => ({ expertId: m.expertId, source: "jobs_site", externalId: String(m.row), lastSyncedAt: new Date() })))
        .onConflictDoNothing();
    }
    await saveLegacy(
      db,
      [...expertByUser.entries()].map(([row, id]) => ({ sourceTable: "users", sourceId: String(row), hubTable: "experts" as const, hubId: id })),
    );
  }
  const counts: PeopleCounts = {
    engineUsers: Number(tot?.n ?? 0),
    staff: Number(tot?.staff ?? 0),
    create: plan.counts.create,
    update: plan.counts.update,
    unchanged: plan.counts.unchanged,
    held: heldIds.length,
    heldIds,
    skipped: plan.counts.skip,
    mergedByEmail: merged.length,
    mapped: expertByUser.size,
    experts: new Set(expertByUser.values()).size,
    details: { inserted: 0, updated: 0 },
    payouts: { inserted: 0, updated: 0 },
  };
  return { counts, expertByUser, users: data.users };
}

/** Experience, education, address, work authorisation, referral, last sign-in; and the money-only payout and tax fields. */
export async function mapPeopleDetails(db: DB, read: Reader, loc: JobsLocation): Promise<Pick<PeopleCounts, "details" | "payouts">> {
  const cols = await columnsOf(read, loc, "users");
  const c = (name: string, cast: string, empty = "null") => (cols.has(name) ? `u."${name}"::${cast}` : `${empty}::${cast}`);
  const txt = (name: string) => `nullif(btrim(${c(name, "text")}), '')`;
  const users = tableName(loc, "users");
  const from = `from ${users} u
    join hub.legacy_map m on m.source_table = 'users' and m.source_id = u.id::text and m.hub_table = 'experts'
    join hub.experts e on e.id = m.hub_id`;
  const order = `order by m.hub_id, ${cols.has("last_login_at") ? "u.last_login_at desc nulls last, " : ""}u.id desc`;

  // A column the copy keeps in step while only the copy has written the row; otherwise only filled if
  // empty. Once the expert has edited the row in the portal (updated_by 'expert-portal'), the copy
  // leaves it alone: an emptied field (no payout handle, education removed) stays empty.
  const upsert = async (table: "expert_details" | "expert_payout", fields: { name: string; src: string; empty: string }[], where: string, extra: { name: string; src: string; merge: string }[] = []) => {
    const merged = (f: { name: string; empty: string }) => `case when d.updated_by = 'expert-portal' then d.${f.name} when d.updated_by = '${COPY_BY}' or ${f.empty} then excluded.${f.name} else d.${f.name} end`;
    const names = [...fields.map((f) => f.name), ...extra.map((x) => x.name)];
    const res = rowsOf<{ inserted: boolean }>(
      await db.execute(
        sql.raw(`insert into hub.${table} as d (expert_id, ${names.join(", ")}, updated_by, updated_at)
          select distinct on (m.hub_id) m.hub_id, ${[...fields.map((f) => f.src), ...extra.map((x) => x.src)].join(", ")}, '${COPY_BY}', now()
          ${from} ${where} ${order}
          on conflict (expert_id) do update set
            ${[...fields.map((f) => `${f.name} = ${merged(f)}`), ...extra.map((x) => `${x.name} = ${x.merge}`)].join(",\n            ")},
            updated_at = now()
          where (${[...fields.map((f) => `d.${f.name}::text`), ...extra.map((x) => `d.${x.name}::text`)].join(", ")}, null)
            is distinct from (${[...fields.map((f) => `(${merged(f)})::text`), ...extra.map((x) => `(${x.merge})::text`)].join(", ")}, null)
          returning (xmax = 0) as inserted`),
      ),
    );
    return { inserted: res.filter((r) => r.inserted).length, updated: res.filter((r) => !r.inserted).length };
  };

  const details = await upsert(
    "expert_details",
    [
      { name: "experience", src: `coalesce(${c("experience", "jsonb")}, '[]'::jsonb)`, empty: `d.experience = '[]'::jsonb` },
      { name: "education", src: `coalesce(${c("education", "jsonb")}, '[]'::jsonb)`, empty: `d.education = '[]'::jsonb` },
      { name: "no_experience", src: c("no_experience", "boolean"), empty: "d.no_experience is null" },
      { name: "address_line1", src: txt("address_line1"), empty: "d.address_line1 is null" },
      { name: "address_line2", src: txt("address_line2"), empty: "d.address_line2 is null" },
      { name: "postal_code", src: txt("postal_code"), empty: "d.postal_code is null" },
      { name: "work_authorized", src: c("work_authorized", "boolean"), empty: "d.work_authorized is null" },
      { name: "work_authorized_at", src: c("work_authorized_at", "timestamptz"), empty: "d.work_authorized_at is null" },
      { name: "referral_code", src: txt("ref_code"), empty: "d.referral_code is null" },
    ],
    "",
    [{ name: "last_login_at", src: c("last_login_at", "timestamptz"), merge: "greatest(d.last_login_at, excluded.last_login_at)" }],
  );
  const payouts = await upsert(
    "expert_payout",
    [
      { name: "payout_method", src: txt("payout_method"), empty: "d.payout_method is null" },
      { name: "payout_handle", src: txt("payout_handle"), empty: "d.payout_handle is null" },
      { name: "tax_form_type", src: txt("tax_form_type"), empty: "d.tax_form_type is null" },
      { name: "tax_form_at", src: c("tax_form_at", "timestamptz"), empty: "d.tax_form_at is null" },
    ],
    `where coalesce(${txt("payout_method")}, ${txt("payout_handle")}, ${txt("tax_form_type")}) is not null or ${c("tax_form_at", "timestamptz")} is not null`,
  );
  if (cols.has("referred_by")) {
    await db.execute(
      sql.raw(`update hub.expert_details d set referred_by_expert_id = r.hub_id, updated_at = now()
        from ${users} u
        join hub.legacy_map m on m.source_table = 'users' and m.source_id = u.id::text
        join hub.legacy_map r on r.source_table = 'users' and r.source_id = u.referred_by::text
        join hub.experts re on re.id = r.hub_id
        where d.expert_id = m.hub_id and r.hub_id <> m.hub_id
          and d.referred_by_expert_id is distinct from r.hub_id
          and (d.updated_by = '${COPY_BY}' or d.referred_by_expert_id is null)`),
    );
  }
  if (cols.has("created_at")) {
    // "Added" on the profile: when they first signed up on the jobs site.
    await db.execute(
      sql.raw(`update hub.experts e set created_at = s.created_at
        from (select m.hub_id, min(u.created_at) as created_at ${from.replace("join hub.experts e on e.id = m.hub_id", "")} group by m.hub_id) s
        where e.id = s.hub_id and s.created_at < e.created_at`),
    );
  }
  return { details, payouts };
}

// ---------- Files ----------

export type FileRow = { id: number; user_id: number; kind: string; filename: string; mime: string; size: number; created_at: Date | string | null };

export type FileCounts = {
  engineFiles: number;
  copied: number;
  copiedBytes: number;
  /** Copied on an earlier run (or by npm run import:jobs): skipped. */
  already: number;
  /** Copied earlier by npm run import:jobs: linked, not copied again. */
  linked: number;
  /** The file's person isn't in the hub (staff, held for review). */
  notMapped: number;
  /** Deleted on the jobs site before its bytes were copied. */
  gone: number;
  /** Copied once, then deleted in the hub: not copied again. */
  removedInHub: number;
  toCopy: number;
  toCopyBytes: number;
  cvsSet: number;
  byKind: Record<string, number>;
};

export const fileKind = (k: string) => (k === "resume" ? "cv" : k === "tax" ? "tax" : "attachment");

/** Groups files into batches of at most 25 files and 20 MB (a single bigger file is a batch of its own). */
export function fileBatches<T extends { size: number }>(files: T[], maxBytes = MAX_BATCH_BYTES, maxFiles = MAX_BATCH_FILES): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let bytes = 0;
  for (const f of files) {
    const n = Number(f.size) || 0;
    if (cur.length && (cur.length >= maxFiles || bytes + n > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(f);
    bytes += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

export async function copyFiles(
  db: DB,
  raw: SqlRunner,
  src: ReadOnlySource,
  read: Reader,
  loc: JobsLocation,
  expertByUser: Map<number, string>,
  opts: { dryRun: boolean; has: HubTables; replica: boolean; log: (line: string) => void },
): Promise<FileCounts> {
  const files = (await read(`select id, user_id, kind, filename, mime, size, created_at from ${tableName(loc, "files")} order by id`)) as unknown as FileRow[];
  const legacy = await loadLegacy(db, "files", "expert_files", opts.has);
  const earlier = new Map<string, { id: string; expertId: string }>();
  if (opts.has("expert_files")) {
    for (const r of rowsOf<{ ref: string; id: string; expert_id: string }>(await db.execute(sql`select external_ref as ref, id::text as id, expert_id::text as expert_id from hub.expert_files where external_ref like 'jobs:%'`))) {
      earlier.set(r.ref, { id: r.id, expertId: r.expert_id });
    }
  }
  const c: FileCounts = { engineFiles: files.length, copied: 0, copiedBytes: 0, already: 0, linked: 0, notMapped: 0, gone: 0, removedInHub: 0, toCopy: 0, toCopyBytes: 0, cvsSet: 0, byKind: {} };
  const todo: (FileRow & { expertId: string })[] = [];
  const links: LegacyWrite[] = [];
  for (const f of files) {
    const expertId = expertByUser.get(Number(f.user_id));
    if (!expertId) {
      c.notMapped++;
      continue;
    }
    const m = legacy.get(String(f.id));
    if (m) {
      if (m.present) c.already++;
      else c.removedInHub++;
      continue;
    }
    const e = earlier.get(`jobs:${f.id}`);
    if (e && e.expertId === expertId) {
      links.push({ sourceTable: "files", sourceId: String(f.id), hubTable: "expert_files", hubId: e.id });
      c.linked++;
      continue;
    }
    todo.push({ ...f, expertId });
  }
  c.toCopy = todo.length;
  c.toCopyBytes = todo.reduce((n, f) => n + (Number(f.size) || 0), 0);
  if (opts.dryRun) return c;

  await saveLegacy(db, links);
  if (opts.replica) {
    for (const l of links) await raw.query(`update engine_copy.files set hub_file_id = $1::uuid where id::text = $2`, [l.hubId, l.sourceId]);
  }
  const batches = fileBatches(todo);
  if (todo.length) opts.log(`  Files to copy: ${todo.length} (${mb(c.toCopyBytes)} MB) in ${batches.length} batches of up to ${MAX_BATCH_FILES} files / ${mb(MAX_BATCH_BYTES)} MB.`);
  let done = 0;
  let doneBytes = 0;
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const ids = batch.map((f) => Number(f.id)).filter(Number.isInteger);
    const bytes = await src.select<{ id: string; b64: string; n: number }>(
      `select id::text as id, encode(data, 'base64') as b64, octet_length(data) as n from public.xdl_jobs_files where id = any($1::text::integer[])`,
      [`{${ids.join(",")}}`],
    );
    // encode() wraps base64 every 76 characters: drop the line breaks (smaller to send, exact sizes).
    const byId = new Map(bytes.map((r) => [String(r.id), { b64: r.b64.replace(/\s+/g, ""), n: Number(r.n) }]));
    for (const f of batch) {
      const got = byId.get(String(f.id));
      if (got == null) {
        c.gone++;
        continue;
      }
      const { b64, n: size } = got;
      const kind = fileKind(f.kind);
      const params = [
        f.expertId,
        kind,
        (cleanText(f.filename, 200) ?? `file-${f.id}`).slice(0, 200),
        cleanText(f.mime, 120) ?? "application/octet-stream",
        size,
        `jobs:${f.id}`,
        b64,
        f.created_at ? new Date(f.created_at).toISOString() : null,
        String(f.id),
      ];
      await raw.query(
        `with f as (
           insert into hub.expert_files (expert_id, kind, filename, mime, size, storage, external_ref, data, created_by, created_at)
           values ($1::uuid, $2, $3, $4, $5::int, 'upload', $6, decode($7, 'base64'), '${COPY_BY}', coalesce($8::timestamptz, now()))
           returning id
         ), m as (
           insert into hub.legacy_map (source_table, source_id, hub_table, hub_id, created_at, updated_at)
           select 'files', $9, 'expert_files', id, now(), now() from f
           on conflict (source_table, source_id) do update set hub_id = excluded.hub_id, hub_table = excluded.hub_table, updated_at = now()
           returning 1
         )${opts.replica ? `, u as (update engine_copy.files set hub_file_id = (select id from f) where id::text = $9 returning 1)` : ""}
         select id::text as id from f`,
        params,
      );
      c.copied++;
      c.copiedBytes += size;
      c.byKind[kind] = (c.byKind[kind] ?? 0) + 1;
      done++;
      doneBytes += size;
    }
    opts.log(`  Files: batch ${b + 1}/${batches.length} done, ${done}/${todo.length} files, ${mb(doneBytes)}/${mb(c.toCopyBytes)} MB`);
  }
  // The newest jobs-site resume becomes the current CV, unless someone uploaded one in the hub.
  const set = rowsOf<{ id: string }>(
    await db.execute(sql`
      update hub.experts e set cv_ref = 'upload:' || x.file_id
      from (
        select distinct on (f.expert_id) f.expert_id, f.id::text as file_id
        from hub.expert_files f
        join hub.legacy_map m on m.source_table = 'files' and m.hub_id = f.id
        where f.kind = 'cv'
        order by f.expert_id, f.created_at desc, m.source_id desc
      ) x
      where e.id = x.expert_id and e.cv_ref is distinct from ('upload:' || x.file_id)
        and (e.cv_ref is null or e.cv_ref like 'jobs:file:%' or e.cv_ref in (
          select 'upload:' || ef.id from hub.expert_files ef where ef.expert_id = e.id and ef.external_ref like 'jobs:%'))
      returning e.id::text as id`),
  );
  c.cvsSet = set.length;
  return c;
}

// ---------- Jobs ----------

export type JobCounts = { engineJobs: number; created: number; updated: number; unchanged: number; removedInHub: number };
type JobMapEntry = { hubId: string; fieldIds: Partial<Record<LegacyFormKey, string>> };

const JOB_COLUMNS = ["id", "slug", "title", "domain", "employment", "location", "regions", "pay_min", "pay_max", "pay_unit", "pay_currency", "hours", "summary", "description", "requirements", "status", "created_at"] as const;
const JOB_FIELDS: (keyof MappedJob)[] = ["title", "summary", "description", "location", "employmentType", "domains", "status", "internalRateNote"];
/** JSON with sorted keys: jsonb from the database comes back with its keys in another order. */
export function canonical(v: unknown): string {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
const same = (a: unknown, b: unknown) => canonical(a ?? null) === canonical(b ?? null);

async function selectAll(read: Reader, loc: JobsLocation, table: string, wanted: readonly string[], order: string) {
  const cols = await columnsOf(read, loc, table);
  const list = wanted.map((c) => (cols.has(c) ? `"${c}"` : `null as "${c}"`)).join(", ");
  return read(`select ${list} from ${tableName(loc, table)} order by ${order}`);
}

/**
 * Three-way merge for fields the team can edit: a field is updated from the jobs site only while the
 * hub still holds the value the copy last wrote. Returns the patch and the new `written` values.
 */
export function threeWay<T extends Record<string, unknown>>(hub: T, written: Partial<T> | null | undefined, incoming: T, fields: (keyof T)[]) {
  const patch: Partial<T> = {};
  const next = { ...(written ?? {}) } as Partial<T>;
  for (const f of fields) {
    if (same(hub[f], incoming[f])) {
      next[f] = incoming[f];
      continue;
    }
    if (written && f in written && same(hub[f], written[f])) {
      patch[f] = incoming[f];
      next[f] = incoming[f];
    }
  }
  return { patch, written: next };
}

export async function mapJobs(db: DB, actor: Actor, read: Reader, loc: JobsLocation, opts: { dryRun: boolean; has: HubTables }) {
  const rows = (await selectAll(read, loc, "jobs", JOB_COLUMNS, "id")) as unknown as JobsJob[];
  const legacy = await loadLegacy(db, "jobs", "jobs", opts.has);
  const counts: JobCounts = { engineJobs: rows.length, created: 0, updated: 0, unchanged: 0, removedInHub: 0 };
  const jobMap = new Map<number, JobMapEntry>();
  const taken = new Set<string>(opts.has("jobs") ? rowsOf<{ slug: string }>(await db.execute(sql`select slug from hub.jobs`)).map((r) => r.slug) : []);
  const current = new Map<string, MappedJob>();
  const mappedIds = [...legacy.values()].filter((l) => l.present).map((l) => l.hubId);
  if (mappedIds.length) {
    const hubRows = rowsOf<Record<string, unknown>>(
      await db.execute(sql`select id::text as id, title, summary, description, location, employment_type, domains, status, internal_rate_note from hub.jobs where id::text = any(${`{${mappedIds.join(",")}}`}::text[])`),
    );
    for (const r of hubRows) {
      current.set(String(r.id), {
        title: r.title as string,
        summary: (r.summary as string) ?? null,
        description: (r.description as string) ?? null,
        location: (r.location as string) ?? null,
        employmentType: r.employment_type as MappedJob["employmentType"],
        domains: (r.domains as string[]) ?? [],
        status: r.status as MappedJob["status"],
        internalRateNote: (r.internal_rate_note as string) ?? null,
      });
    }
  }
  const now = new Date();
  const log: (typeof activity.$inferInsert)[] = [];
  for (const j of rows) {
    const mapped = mapJobsJob(j);
    const m = legacy.get(String(j.id));
    if (m) {
      if (!m.present) {
        counts.removedInHub++;
        continue;
      }
      const fieldIds = ((m.written?.fieldIds ?? {}) as JobMapEntry["fieldIds"]) ?? {};
      jobMap.set(Number(j.id), { hubId: m.hubId, fieldIds });
      const hub = current.get(m.hubId);
      if (!hub) continue;
      const { patch, written } = threeWay(hub, (m.written?.fields ?? null) as Partial<MappedJob> | null, mapped, JOB_FIELDS);
      if (!Object.keys(patch).length) {
        counts.unchanged++;
        if (!opts.dryRun && !same(written, m.written?.fields)) await saveLegacy(db, [{ sourceTable: "jobs", sourceId: String(j.id), hubTable: "jobs", hubId: m.hubId, written: { ...(m.written ?? {}), fields: written } }]);
        continue;
      }
      counts.updated++;
      if (opts.dryRun) continue;
      await db.update(jobs).set({ ...patch, updatedAt: now }).where(sql`${jobs.id} = ${m.hubId}`);
      await saveLegacy(db, [{ sourceTable: "jobs", sourceId: String(j.id), hubTable: "jobs", hubId: m.hubId, written: { ...(m.written ?? {}), fields: written } }]);
      log.push({ entityType: "job", entityId: m.hubId, actorEmail: actorEmail(actor), actorRole: actorRole(actor), action: "updated_by_import", detail: { source: "jobs_site", fields: Object.keys(patch) } });
      continue;
    }
    counts.created++;
    const slug = slugFor(j.slug || mapped.title, taken);
    taken.add(slug);
    if (opts.dryRun) {
      jobMap.set(Number(j.id), { hubId: `new:${j.id}`, fieldIds: {} });
      continue;
    }
    const created = j.created_at ? new Date(j.created_at) : now;
    // Internal: the team sees it, the public board never lists it (jobs.fynolabs.si still serves the public jobs).
    const [row] = await db
      .insert(jobs)
      .values({ slug, ...mapped, visibility: "internal", featured: false, createdBy: COPY_BY, createdAt: created, updatedAt: now })
      .returning({ id: jobs.id });
    const defs = legacyFormFields();
    const fields = await db
      .insert(jobFormFields)
      .values(defs.map((d, i) => ({ jobId: row.id, position: i, type: d.type, label: d.label, helpText: d.helpText, required: d.required, options: d.options, mapsTo: d.mapsTo })))
      .returning({ id: jobFormFields.id, position: jobFormFields.position });
    const fieldIds: JobMapEntry["fieldIds"] = {};
    for (const f of fields) fieldIds[defs[f.position].key] = f.id;
    jobMap.set(Number(j.id), { hubId: row.id, fieldIds });
    await saveLegacy(db, [{ sourceTable: "jobs", sourceId: String(j.id), hubTable: "jobs", hubId: row.id, written: { fields: mapped, fieldIds } }]);
    log.push({ entityType: "job", entityId: row.id, actorEmail: actorEmail(actor), actorRole: actorRole(actor), action: "created", detail: { source: "jobs_site" } });
  }
  for (let i = 0; i < log.length; i += 500) await db.insert(activity).values(log.slice(i, i + 500));
  return { counts, jobMap };
}

// ---------- Applications ----------

export type ApplicationCounts = {
  engineApplications: number;
  created: number;
  updated: number;
  unchanged: number;
  /** The applicant isn't in the hub (staff, held for review). */
  personNotMapped: number;
  /** The job was deleted in the hub. */
  jobNotMapped: number;
  /** Two jobs-site accounts merged into one expert applied to the same job: one hub application. */
  merged: number;
  removedInHub: number;
  screenings: number;
  screeningsFolded: number;
};

type SourceApp = {
  id: number;
  job_id: number;
  user_id: number;
  status: string;
  why: string | null;
  hours_per_week: number | null;
  start_when: string | null;
  rate_expectation: number | null;
  resume_file_id: number | null;
  admin_note: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

const APP_COLUMNS = ["id", "job_id", "user_id", "status", "why", "hours_per_week", "start_when", "rate_expectation", "resume_file_id", "admin_note", "created_at", "updated_at"] as const;
type TeamFields = { status: ApplicationStatus; internalNote: string | null };

export async function mapApplications(
  db: DB,
  actor: Actor,
  read: Reader,
  loc: JobsLocation,
  ctx: { expertByUser: Map<number, string>; jobMap: Map<number, JobMapEntry>; users: { id: number; name: string; email: string }[] },
  opts: { dryRun: boolean; has: HubTables },
): Promise<ApplicationCounts> {
  const apps = (await selectAll(read, loc, "applications", APP_COLUMNS, "id")) as unknown as SourceApp[];
  const scr = (await selectAll(read, loc, "screenings", ["application_id", "stage", "answers"], "application_id, stage")) as unknown as { application_id: number; stage: number; answers: unknown }[];
  const screeningsOf = new Map<number, Record<number, unknown>>();
  for (const s of scr) screeningsOf.set(Number(s.application_id), { ...(screeningsOf.get(Number(s.application_id)) ?? {}), [Number(s.stage)]: s.answers });
  const userById = new Map(ctx.users.map((u) => [Number(u.id), u]));
  const legacy = await loadLegacy(db, "applications", "applications", opts.has);
  const files = new Map<string, FileAnswer & { expertId: string }>();
  if (opts.has("legacy_map") && opts.has("expert_files")) {
    for (const r of rowsOf<{ source_id: string; id: string; filename: string; size: number; expert_id: string }>(
      await db.execute(sql`select m.source_id, f.id::text as id, f.filename, f.size, f.expert_id::text as expert_id from hub.legacy_map m join hub.expert_files f on f.id = m.hub_id where m.source_table = 'files'`),
    )) {
      files.set(String(r.source_id), { fileId: r.id, filename: r.filename, size: Number(r.size), expertId: r.expert_id });
    }
  }
  const counts: ApplicationCounts = { engineApplications: apps.length, created: 0, updated: 0, unchanged: 0, personNotMapped: 0, jobNotMapped: 0, merged: 0, removedInHub: 0, screenings: scr.length, screeningsFolded: 0 };

  // One hub application per job and expert: when two merged accounts applied to the same job, the newest wins.
  const byPair = new Map<string, SourceApp[]>();
  for (const a of apps) {
    const expertId = ctx.expertByUser.get(Number(a.user_id));
    const job = ctx.jobMap.get(Number(a.job_id));
    if (!expertId) {
      counts.personNotMapped++;
      continue;
    }
    if (!job) {
      counts.jobNotMapped++;
      continue;
    }
    const k = `${job.hubId}|${expertId}`;
    byPair.set(k, [...(byPair.get(k) ?? []), a]);
  }
  const ts = (v: Date | string | null) => (v ? new Date(v).getTime() : 0);

  // What's in the hub now, for the three-way merge of status and note.
  const hubApps = new Map<string, { id: string; status: ApplicationStatus; internalNote: string | null; answers: unknown; rate: number | null; source: unknown }>();
  if (opts.has("applications")) {
    const jobIds = [...new Set([...ctx.jobMap.values()].map((j) => j.hubId).filter((id) => !id.startsWith("new:")))];
    if (jobIds.length) {
      for (const r of rowsOf<{ id: string; job_id: string; expert_id: string; status: ApplicationStatus; internal_note: string | null; answers: unknown; rate: number | null; source: unknown }>(
        await db.execute(sql`select id::text as id, job_id::text as job_id, expert_id::text as expert_id, status, internal_note, answers, rate_expectation_usd as rate, source from hub.applications where job_id::text = any(${`{${jobIds.join(",")}}`}::text[])`),
      )) {
        hubApps.set(`${r.job_id}|${r.expert_id}`, { id: r.id, status: r.status, internalNote: r.internal_note, answers: r.answers, rate: r.rate, source: r.source });
      }
    }
  }

  const now = new Date();
  const inserts: { pair: string; sourceIds: string[]; values: typeof applications.$inferInsert; written: TeamFields }[] = [];
  const legacyWrites: LegacyWrite[] = [];
  const log: (typeof activity.$inferInsert)[] = [];
  for (const [pair, group] of byPair) {
    group.sort((x, y) => ts(y.updated_at ?? y.created_at) - ts(x.updated_at ?? x.created_at) || Number(y.id) - Number(x.id));
    const a = group[0];
    counts.merged += group.length - 1;
    const [hubJobId, expertId] = pair.split("|");
    const job = ctx.jobMap.get(Number(a.job_id))!;
    const u = userById.get(Number(a.user_id));
    const s = screeningsOf.get(Number(a.id)) ?? {};
    const file = a.resume_file_id != null ? files.get(String(a.resume_file_id)) : undefined;
    const answers = legacyAnswers(job.fieldIds, {
      name: u?.name ?? null,
      email: u?.email ?? null,
      why: a.why,
      hours_per_week: a.hours_per_week,
      start_when: a.start_when,
      cv: file && file.expertId === expertId ? { fileId: file.fileId, filename: file.filename, size: file.size } : null,
      screening1: s[1],
      screening2: s[2],
    });
    const incoming: TeamFields = { status: applicationStatusFrom(a.status), internalNote: cleanLongText(a.admin_note, 4000) };
    const source = { ref: "jobs-site", jobsSite: { applicationId: Number(a.id), status: String(a.status) } };
    const rate = a.rate_expectation != null && Number.isFinite(Number(a.rate_expectation)) ? Math.round(Number(a.rate_expectation)) : null;
    const folded = Object.keys(s).length;
    const sourceIds = group.map((g) => String(g.id));
    const known = sourceIds.map((id) => legacy.get(id)).find((l) => l);
    if (known && !known.present) {
      counts.removedInHub++;
      continue;
    }
    counts.screeningsFolded += folded;
    const hub = hubApps.get(pair);
    if (hub) {
      const { patch, written } = threeWay({ status: hub.status, internalNote: hub.internalNote }, (known?.written ?? null) as Partial<TeamFields> | null, incoming, ["status", "internalNote"]);
      const answersChanged = !same(hub.answers, answers) || hub.rate !== rate || !same(hub.source, source);
      const legacyRows = sourceIds.map((id) => ({ sourceTable: "applications", sourceId: id, hubTable: "applications" as const, hubId: hub.id, written }));
      if (!Object.keys(patch).length && !answersChanged) {
        counts.unchanged++;
        if (!known || !same(known.written, written)) legacyWrites.push(...legacyRows);
        continue;
      }
      counts.updated++;
      if (opts.dryRun) continue;
      await db
        .update(applications)
        .set({ ...patch, answers, rateExpectationUsd: rate, source, updatedAt: now })
        .where(sql`${applications.id} = ${hub.id}`);
      legacyWrites.push(...legacyRows);
      if (patch.status) log.push({ entityType: "application", entityId: hub.id, actorEmail: actorEmail(actor), actorRole: actorRole(actor), action: "status_changed", detail: { jobId: hubJobId, from: hub.status, to: patch.status, via: "jobs_site" } });
      continue;
    }
    counts.created++;
    if (opts.dryRun) continue;
    inserts.push({
      pair,
      sourceIds,
      written: incoming,
      values: {
        jobId: hubJobId,
        expertId,
        status: incoming.status,
        answers,
        source,
        internalNote: incoming.internalNote,
        rateExpectationUsd: rate,
        createdAt: a.created_at ? new Date(a.created_at) : now,
        updatedAt: now,
      },
    });
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const rows = await db
      .insert(applications)
      .values(chunk.map((c) => c.values))
      .onConflictDoNothing()
      .returning({ id: applications.id, jobId: applications.jobId, expertId: applications.expertId });
    const idByPair = new Map(rows.map((r) => [`${r.jobId}|${r.expertId}`, r.id]));
    for (const c of chunk) {
      const id = idByPair.get(c.pair);
      if (!id) continue;
      for (const sid of c.sourceIds) legacyWrites.push({ sourceTable: "applications", sourceId: sid, hubTable: "applications", hubId: id, written: c.written });
      log.push({ entityType: "application", entityId: id, actorEmail: actorEmail(actor), actorRole: actorRole(actor), action: "created", detail: { jobId: c.values.jobId, expertId: c.values.expertId, source: "jobs_site" } });
    }
  }
  if (!opts.dryRun) {
    await saveLegacy(db, legacyWrites);
    for (let i = 0; i < log.length; i += 500) await db.insert(activity).values(log.slice(i, i + 500));
  }
  return counts;
}
