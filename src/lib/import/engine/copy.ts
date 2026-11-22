// `npm run copy:engine`, the library part (the script only parses arguments and opens connections).
//
//   1. refuse if the target looks like Engine (it has public.xdl_jobs_users);
//   2. migrate the target (hub schema, with the migration guard);
//   3. one READ ONLY snapshot of Engine: the exact replica into engine_copy (replica.ts);
//   4. map into hub: experts, details, money-only fields, files, jobs, applications (hub.ts);
//   5. verify the counts and build a report with counts only (no names, no emails).
import { sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { rowsOf } from "@/db/client";
import { activity } from "@/db/schema";
import { emailHash } from "@/lib/normalize";
import { actorEmail, actorRole, type Actor } from "@/lib/server/activity";
import { dbReader, JOBS_SITE_TABLES, type JobsLocation, type Reader } from "@/lib/server/jobs-sync";
import { copyFiles, hubTables, mapApplications, mapJobs, mapPeople, mapPeopleDetails, type ApplicationCounts, type FileCounts, type JobCounts, type PeopleCounts } from "./hub";
import { replicate, type TableReport } from "./replica";
import { ReadOnlySource, type SqlRunner } from "./source";
import { REPLICA_SCHEMA } from "./tables";

export const REPLICA_TABLES: JobsLocation = { schema: REPLICA_SCHEMA, prefix: "" };

export type CopyOptions = {
  /** One connection to Engine (only SELECTs will run, inside a read-only snapshot). */
  source: SqlRunner;
  /** The hub's database: Drizzle and a raw runner on the same connection. */
  target: { db: DB; raw: SqlRunner };
  dryRun: boolean;
  actor: Actor;
  /** Applies the hub migrations (not called in a dry run). */
  migrate: () => Promise<void>;
  describe: { source: string; target: string };
  log?: (line: string) => void;
  now?: () => Date;
};

export type CopyResult = {
  ok: boolean;
  refused: string | null;
  dryRun: boolean;
  problems: string[];
  report: string;
  tables: TableReport[];
  people: PeopleCounts | null;
  files: FileCounts | null;
  jobs: JobCounts | null;
  applications: ApplicationCounts | null;
  hub: { experts: number; files: number; filesByKind: Record<string, number>; jobs: number; applications: number } | null;
  ms: number;
};

/** True if this database has the jobs site's own tables: it is Engine (or a copy of it), not expert-hub. */
export async function looksLikeEngine(raw: SqlRunner): Promise<boolean> {
  const { rows } = await raw.query<{ ok: boolean }>(`select to_regclass('public.xdl_jobs_users') is not null as ok`);
  return Boolean(rows[0]?.ok);
}

async function erasureCheck(db: DB, ready: boolean) {
  if (!ready) return (_id: string, _email: string | null) => false;
  const rows = rowsOf<{ email_sha256: string | null; source: string | null; external_id: string | null }>(await db.execute(sql`select email_sha256, source, external_id from hub.erasures`));
  const emails = new Set(rows.map((r) => r.email_sha256).filter(Boolean) as string[]);
  const ids = new Set(rows.filter((r) => r.source === "jobs_site" && r.external_id).map((r) => r.external_id!));
  return (userId: string, email: string | null) => ids.has(userId) || Boolean(email && emails.has(emailHash(email)));
}

async function hubCounts(db: DB) {
  const one = async (q: ReturnType<typeof sql>) => Number(rowsOf<{ n: number }>(await db.execute(q))[0]?.n ?? 0);
  const experts = await one(sql`select count(distinct m.hub_id)::int as n from hub.legacy_map m join hub.experts e on e.id = m.hub_id where m.source_table = 'users'`);
  const kinds = rowsOf<{ kind: string; n: number }>(await db.execute(sql`select f.kind, count(*)::int as n from hub.legacy_map m join hub.expert_files f on f.id = m.hub_id where m.source_table = 'files' group by f.kind`));
  const jobs = await one(sql`select count(*)::int as n from hub.legacy_map m join hub.jobs j on j.id = m.hub_id where m.source_table = 'jobs'`);
  const applications = await one(sql`select count(distinct m.hub_id)::int as n from hub.legacy_map m join hub.applications a on a.id = m.hub_id where m.source_table = 'applications'`);
  const filesByKind = Object.fromEntries(kinds.map((k) => [k.kind, Number(k.n)]));
  return { experts, files: Object.values(filesByKind).reduce((a, b) => a + b, 0), filesByKind, jobs, applications };
}

export async function copyFromEngine(o: CopyOptions): Promise<CopyResult> {
  const started = Date.now();
  const log = o.log ?? (() => {});
  const now = o.now ?? (() => new Date());
  const empty: CopyResult = { ok: false, refused: null, dryRun: o.dryRun, problems: [], report: "", tables: [], people: null, files: null, jobs: null, applications: null, hub: null, ms: 0 };

  if (await looksLikeEngine(o.target.raw)) {
    return { ...empty, refused: "Refusing: DATABASE_URL has the jobs site's own tables (public.xdl_jobs_users), so it is Engine or a copy of it. Point DATABASE_URL at the new expert-hub project." };
  }
  if (!o.dryRun) {
    log("Migrating the hub's database (schema hub)...");
    await o.migrate();
  }
  const { db, raw } = o.target;
  const has = await hubTables(db);
  const isErased = await erasureCheck(db, has("erasures"));

  const src = await ReadOnlySource.begin(o.source);
  src.keepAlive();
  let tables: TableReport[] = [];
  let people: PeopleCounts;
  let files: FileCounts;
  let jobsCounts: JobCounts;
  let apps: ApplicationCounts;
  try {
    log(o.dryRun ? "Reading Engine (read only) and comparing with engine_copy..." : "Copying Engine's expert tables into engine_copy (Engine is only read)...");
    const rep = await replicate(src, raw, { dryRun: o.dryRun, isErased, log });
    tables = rep.tables;

    // Real run: map from the replica just written. Dry run: straight from Engine (nothing written yet).
    const read: Reader = o.dryRun ? (text) => src.select(text) : dbReader(db);
    const loc = o.dryRun ? JOBS_SITE_TABLES : REPLICA_TABLES;
    log(o.dryRun ? "Planning experts..." : "Experts...");
    const p = await mapPeople(db, o.actor, read, loc, { dryRun: o.dryRun, has });
    people = p.counts;
    if (!o.dryRun) Object.assign(people, await mapPeopleDetails(db, read, loc));
    log(o.dryRun ? "Planning files..." : "Files (CVs and tax forms)...");
    files = await copyFiles(db, raw, src, read, loc, p.expertByUser, { dryRun: o.dryRun, has, replica: !o.dryRun, log });
    log(o.dryRun ? "Planning jobs and applications..." : "Jobs and applications...");
    const j = await mapJobs(db, o.actor, read, loc, { dryRun: o.dryRun, has });
    jobsCounts = j.counts;
    apps = await mapApplications(db, o.actor, read, loc, { expertByUser: p.expertByUser, jobMap: j.jobMap, users: p.users }, { dryRun: o.dryRun, has });
  } finally {
    await src.end();
  }

  const problems: string[] = [];
  let hub: CopyResult["hub"] = null;
  if (!o.dryRun) {
    for (const t of tables) {
      if (!t.inEngine) continue;
      const expected = t.engineRows - t.leftOut + t.gone;
      if (t.replicaRows !== expected) problems.push(`engine_copy.${t.name} has ${t.replicaRows} rows; expected ${expected} (Engine ${t.engineRows}, left out ${t.leftOut}, kept after leaving Engine ${t.gone}).`);
    }
    // The hub side reads engine_copy, so people kept there after leaving Engine are still experts here.
    const users = tables.find((t) => t.name === "users")!;
    const people_ = users.replicaRows - people.staff;
    const unexplained = people_ - people.mapped - people.held - people.skipped;
    if (unexplained !== 0) problems.push(`${unexplained} jobs-site accounts are neither in the hub nor explained (staff, held for review, skipped).`);
    hub = await hubCounts(db);
    if (hub.experts < people.experts) problems.push(`The hub has ${hub.experts} linked experts; expected ${people.experts}.`);
    if (hub.files !== files.copied + files.already + files.linked) problems.push(`The hub has ${hub.files} copied files; expected ${files.copied + files.already + files.linked}.`);
    if (hub.jobs !== jobsCounts.created + jobsCounts.updated + jobsCounts.unchanged) problems.push(`The hub has ${hub.jobs} copied jobs; expected ${jobsCounts.created + jobsCounts.updated + jobsCounts.unchanged}.`);
    if (hub.applications !== apps.created + apps.updated + apps.unchanged) problems.push(`The hub has ${hub.applications} copied applications; expected ${apps.created + apps.updated + apps.unchanged}.`);
    if (files.gone) problems.push(`${files.gone} files were deleted on the jobs site before their bytes could be copied (run again; if it repeats, they are gone for good).`);
    await db.insert(activity).values({
      entityType: "import",
      entityId: "engine_copy",
      actorEmail: actorEmail(o.actor),
      actorRole: actorRole(o.actor),
      action: "engine_copy",
      detail: {
        experts: { created: people.create, updated: people.update, unchanged: people.unchanged, held: people.held, mergedByEmail: people.mergedByEmail },
        files: { copied: files.copied, bytes: files.copiedBytes },
        jobs: { created: jobsCounts.created, updated: jobsCounts.updated },
        applications: { created: apps.created, updated: apps.updated },
        problems: problems.length,
      },
    });
  }
  const ms = Date.now() - started;
  const result: CopyResult = { ok: problems.length === 0, refused: null, dryRun: o.dryRun, problems, report: "", tables, people, files, jobs: jobsCounts, applications: apps, hub, ms };
  result.report = formatReport(result, o.describe, now());
  return result;
}

// ---------- The report (counts only) ----------

const n = (v: number) => v.toLocaleString("en-US");
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

function grid(rows: string[][]): string {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
  return rows.map((r) => r.map((c, i) => (i === 0 || i === r.length - 1 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("   ").trimEnd()).join("\n");
}

export function formatReport(r: CopyResult, d: { source: string; target: string }, at: Date): string {
  const p = r.people!;
  const f = r.files!;
  const j = r.jobs!;
  const a = r.applications!;
  const t = (name: string) => r.tables.find((x) => x.name === name);
  const dry = r.dryRun;
  const stamp = at.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const took = r.ms >= 60_000 ? `${Math.floor(r.ms / 60_000)} min ${Math.round((r.ms % 60_000) / 1000)} s` : `${Math.round(r.ms / 1000)} s`;
  const lines: string[] = [];
  lines.push(`${dry ? "DRY RUN (nothing written)" : "Copy from Engine"}, ${stamp}${dry ? "" : `, took ${took}`}`);
  lines.push(`  Read from (read only): ${d.source}`);
  lines.push(`  ${dry ? "Would write to:       " : "Wrote to:             "} ${d.target}`);
  lines.push("");
  const hub = r.hub;
  const users = t("users");
  const rows: string[][] = [["Table", "Engine", dry ? "engine_copy after" : "engine_copy", dry ? "hub after" : "hub", "Notes"]];
  rows.push([
    "users -> experts",
    n(users?.engineRows ?? 0),
    n(users?.replicaRows ?? 0),
    n(hub ? hub.experts : p.experts),
    `staff (not experts) ${n(p.staff)}; held for review (same LinkedIn, other email) ${n(p.held)}; skipped (no name, deleted on request) ${n(p.skipped)}; merged by email ${n(p.mergedByEmail)}${users?.leftOut ? `; deleted on request, not copied ${n(users.leftOut)}` : ""}`,
  ]);
  const ff = t("files");
  rows.push([
    "files -> expert_files",
    n(ff?.engineRows ?? 0),
    n(ff?.replicaRows ?? 0),
    n(hub ? hub.files : f.already + f.linked + f.toCopy),
    `bytes stored once, in hub (${hub ? Object.entries(hub.filesByKind).map(([k, v]) => `${k} ${n(v)}`).join(", ") || "none" : `${n(f.toCopy)} to copy, ${mb(f.toCopyBytes)}`}); of people not in the hub ${n(f.notMapped)}${f.removedInHub ? `; deleted in the hub, not copied again ${n(f.removedInHub)}` : ""}${f.gone ? `; gone from Engine ${n(f.gone)}` : ""}`,
  ]);
  const jj = t("jobs");
  rows.push(["jobs -> jobs (internal)", n(jj?.engineRows ?? 0), n(jj?.replicaRows ?? 0), n(hub ? hub.jobs : j.created + j.updated + j.unchanged), `never on the public board${j.removedInHub ? `; deleted in the hub, not re-created ${n(j.removedInHub)}` : ""}`]);
  const aa = t("applications");
  rows.push([
    "applications",
    n(aa?.engineRows ?? 0),
    n(aa?.replicaRows ?? 0),
    n(hub ? hub.applications : a.created + a.updated + a.unchanged),
    `by people not in the hub ${n(a.personNotMapped)}; merged (same job, merged accounts) ${n(a.merged)}${a.jobNotMapped ? `; for jobs deleted in the hub ${n(a.jobNotMapped)}` : ""}${a.removedInHub ? `; deleted in the hub ${n(a.removedInHub)}` : ""}`,
  ]);
  const ss = t("screenings");
  rows.push(["screenings", n(ss?.engineRows ?? 0), n(ss?.replicaRows ?? 0), n(a.screeningsFolded), "folded into the applications' answers"]);
  for (const x of r.tables) {
    if (["users", "files", "jobs", "applications", "screenings"].includes(x.name)) continue;
    rows.push([x.name, x.inEngine ? n(x.engineRows) : "-", x.inEngine ? n(x.replicaRows) : "-", "-", x.inEngine ? "replica only" : "not in Engine"]);
  }
  lines.push(grid(rows));
  lines.push("");
  lines.push(dry ? "What a real run would do:" : "What this run did:");
  const changed = r.tables.filter((x) => x.inserted || x.updated || x.gone || x.purged || x.change?.added.length);
  lines.push(
    `  engine_copy: ${changed.length ? changed.map((x) => `${x.name} ${n(x.inserted)} new / ${n(x.updated)} changed${x.gone ? ` / ${n(x.gone)} no longer in Engine (kept)` : ""}${x.purged ? ` / ${n(x.purged)} removed (deleted on request)` : ""}${x.change?.added.length ? ` / ${x.change.added.length} new columns` : ""}`).join("; ") : "no changes"}`,
  );
  lines.push(`  experts: ${n(p.create)} new, ${n(p.update)} filled in, ${n(p.unchanged)} unchanged${dry ? "" : `; details ${n(p.details.inserted)} new / ${n(p.details.updated)} updated; payout and tax (money-only) ${n(p.payouts.inserted)} new / ${n(p.payouts.updated)} updated`}`);
  lines.push(`  files: ${dry ? `${n(f.toCopy)} to copy (${mb(f.toCopyBytes)})` : `${n(f.copied)} copied (${mb(f.copiedBytes)}), current CV set for ${n(f.cvsSet)}`}; ${n(f.already)} already copied${f.linked ? `; ${n(f.linked)} linked to copies from npm run import:jobs` : ""}`);
  lines.push(`  jobs: ${n(j.created)} new, ${n(j.updated)} updated, ${n(j.unchanged)} unchanged`);
  lines.push(`  applications: ${n(a.created)} new, ${n(a.updated)} updated, ${n(a.unchanged)} unchanged`);
  const diffs = r.tables.flatMap((x) => (x.change?.typeDiffs ?? []).map((d) => `${x.name}.${d}`));
  if (diffs.length) lines.push(`  type differences (kept as they are here): ${diffs.join("; ")}`);
  lines.push("");
  if (dry) lines.push("Dry run: nothing was written. Check the numbers, then run the copy for real.");
  else if (r.problems.length) {
    lines.push(`CHECK FAILED: ${r.problems.length} problem(s):`);
    for (const x of r.problems) lines.push(`  - ${x}`);
  } else lines.push("CHECK OK: every Engine row is in engine_copy, and every expert record is in the hub or explained above.");
  return lines.join("\n");
}
