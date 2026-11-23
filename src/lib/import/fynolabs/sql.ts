// Small SQL helpers for the FynoLabs mapping, and the one generic step most tables use:
// fynolabs_copy.<source> -> hub.<target>, keeping the FynoLabs id, in set-based statements.
//
// Rules of the generic step (copySimple):
//  - a row the sync has never written is inserted (with the FynoLabs id) and remembered in
//    hub.legacy_map ('fynolabs.<source>', id);
//  - a row it wrote before is updated when FynoLabs changed it, but only while updated_by is still
//    'fynolabs sync' (once the team edits it in the hub, the sync leaves it alone: "kept");
//  - a row the team deleted in the hub is not brought back ("removed in the hub");
//  - rows whose required link is missing (their expert was deleted on request, say) are skipped.
import type { SqlRunner } from "@/lib/import/engine/source";
import { COPY_SCHEMA, legacyName, SYNC_BY } from "./tables";

export const qi = (id: string) => `"${id.replace(/"/g, '""')}"`;
export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
export const copyTable = (t: string) => `${qi(COPY_SCHEMA)}.${qi(t)}`;

/** The hub id a FynoLabs id became (null when it was never mapped, or the hub row is gone). */
export const ref = (source: string, hubTable: string, expr: string) =>
  `(select m.hub_id from hub.legacy_map m join hub.${qi(hubTable)} h on h.id = m.hub_id where m.source_table = ${lit(legacyName(source))} and m.source_id = (${expr})::text limit 1)`;

/** Same, for an array of FynoLabs ids (unmapped ones dropped). */
export const refArray = (source: string, hubTable: string, expr: string) =>
  `coalesce((select array_agg(m.hub_id order by x.ord) from unnest(${expr}) with ordinality as x(id, ord) join hub.legacy_map m on m.source_table = ${lit(legacyName(source))} and m.source_id = x.id::text join hub.${qi(hubTable)} h on h.id = m.hub_id), '{}'::uuid[])`;

/** A FynoLabs user id as the person's email (team members and other logins), else "fynolabs:<id>". */
export const who = (expr: string) =>
  `(case when (${expr}) is null then null else coalesce((select lower(u.email) from ${copyTable("auth_users")} u where u.id = (${expr})), 'fynolabs:' || (${expr})::text) end)`;

/** A deterministic uuid for a FynoLabs row whose key isn't a uuid (re-runs give the same id). */
export const stableId = (source: string, expr: string) => `md5(${lit(`fynolabs.${source}:`)} || (${expr})::text)::uuid`;

export async function rows<T = Record<string, unknown>>(raw: SqlRunner, text: string, params: unknown[] = []): Promise<T[]> {
  return (await raw.query<T>(text, params)).rows;
}

export async function one(raw: SqlRunner, text: string, params: unknown[] = []): Promise<number> {
  const [r] = await rows<{ n: number | string }>(raw, text, params);
  return Number(r?.n ?? 0);
}

export async function tableExists(raw: SqlRunner, qualified: string): Promise<boolean> {
  const [r] = await rows<{ ok: boolean }>(raw, `select to_regclass($1::text) is not null as ok`, [qualified]);
  return Boolean(r?.ok);
}

export async function columnsOf(raw: SqlRunner, schema: string, table: string): Promise<Set<string>> {
  const r = await rows<{ c: string }>(raw, `select column_name::text as c from information_schema.columns where table_schema = $1 and table_name = $2`, [schema, table]);
  return new Set(r.map((x) => x.c));
}

export type TableCounts = {
  source: string;
  hub: string;
  /** Rows in fynolabs_copy. */
  copyRows: number;
  /** FynoLabs rows the hub has now (merged ones included): hubRows + skipped + removedInHub = copyRows. */
  hubRows: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Edited in the hub since the sync wrote them: not overwritten. */
  kept: number;
  /** Not mapped: their person isn't in the hub (deleted on request) or a required link is missing. */
  skipped: number;
  /** Deleted in the hub after an earlier sync: not brought back. */
  removedInHub: number;
  /** Of hubRows, the ones folded into another record (same person and job twice, same email twice...). */
  merged: number;
  note?: string;
};

export const emptyCounts = (source: string, hub: string): TableCounts => ({ source, hub, copyRows: 0, hubRows: 0, inserted: 0, updated: 0, unchanged: 0, kept: 0, skipped: 0, removedInHub: 0, merged: 0 });

export type SimpleSpec = {
  source: string;
  target: string;
  /** hub column -> SQL over the copy row "s". The key columns must be in here. */
  select: Record<string, string>;
  /** The hub table's key (default ["id"], the FynoLabs id). */
  key?: string[];
  /** The FynoLabs id for hub.legacy_map (default s.id). null: no legacy rows (composite keys, analytics). */
  legacyId?: string | null;
  /** hub columns that must not be null, else the row is skipped. */
  required?: string[];
  /** Extra condition on the copy rows. */
  where?: string;
  /** The hub table has updated_by (default true): rows the team edited are kept. */
  tracked?: boolean;
  /** Plain upsert on the key (analytics, logs: nobody edits them). */
  plain?: boolean;
};

/** fynolabs_copy.<source> -> hub.<target>, keeping ids. Returns the counts for the report. */
export async function copySimple(raw: SqlRunner, spec: SimpleSpec): Promise<TableCounts> {
  const c = emptyCounts(spec.source, spec.target);
  if (!(await tableExists(raw, `${COPY_SCHEMA}.${spec.source}`))) return { ...c, note: "not copied yet" };
  const key = spec.key ?? ["id"];
  const tracked = spec.tracked ?? true;
  const legacyId = spec.legacyId === undefined ? "s.id" : spec.legacyId;
  const cols = Object.keys(spec.select);
  const target = `hub.${qi(spec.target)}`;
  const where = spec.where ? `where ${spec.where}` : "";
  c.copyRows = await one(raw, `select count(*)::int as n from ${copyTable(spec.source)}`);

  await raw.query(`drop table if exists pg_temp._fyno_m`);
  await raw.query(
    `create temp table _fyno_m as select ${cols.map((k) => `${spec.select[k]} as ${qi(k)}`).join(", ")}${legacyId ? `, (${legacyId})::text as _sid` : ""}
     from ${copyTable(spec.source)} s ${where}`,
  );
  const keyMatch = (a: string, b: string) => key.map((k) => `${a}.${qi(k)} = ${b}.${qi(k)}`).join(" and ");
  // Left out by the condition (people deleted on request, say).
  c.skipped = c.copyRows - (await one(raw, `select count(*)::int as n from _fyno_m`));
  if (spec.required?.length) {
    c.skipped += await one(raw, `with d as (delete from _fyno_m where ${spec.required.map((r) => `${qi(r)} is null`).join(" or ")} returning 1) select count(*)::int as n from d`);
  }
  if (legacyId) {
    // Copied before, then deleted in the hub: stays deleted.
    c.removedInHub = await one(
      raw,
      `with d as (delete from _fyno_m f where exists (select 1 from hub.legacy_map m where m.source_table = $1 and m.source_id = f._sid)
         and not exists (select 1 from ${target} t where ${keyMatch("t", "f")}) returning 1) select count(*)::int as n from d`,
      [legacyName(spec.source)],
    );
  }
  const insertCols = [...cols, ...(tracked ? ["updated_by"] : [])];
  const nonKey = cols.filter((k) => !key.includes(k));
  if (spec.plain) {
    const res = await rows<{ inserted: boolean }>(
      raw,
      `insert into ${target} as t (${cols.map(qi).join(", ")}) select ${cols.map(qi).join(", ")} from _fyno_m
       on conflict (${key.map(qi).join(", ")}) ${nonKey.length ? `do update set ${nonKey.map((k) => `${qi(k)} = excluded.${qi(k)}`).join(", ")} where (${nonKey.map((k) => `t.${qi(k)}::text`).join(", ")}, null) is distinct from (${nonKey.map((k) => `excluded.${qi(k)}::text`).join(", ")}, null)` : "do nothing"}
       returning (xmax = 0) as inserted`,
    );
    c.inserted = res.filter((r) => r.inserted).length;
    c.updated = res.length - c.inserted;
  } else {
    const ins = await rows(
      raw,
      `insert into ${target} (${insertCols.map(qi).join(", ")})
       select ${cols.map(qi).join(", ")}${tracked ? `, ${lit(SYNC_BY)}` : ""} from _fyno_m f
       where not exists (select 1 from ${target} t where ${keyMatch("t", "f")})
       on conflict do nothing returning 1`,
    );
    c.inserted = ins.length;
    if (nonKey.length) {
      const upd = await rows(
        raw,
        `update ${target} t set ${nonKey.map((k) => `${qi(k)} = f.${qi(k)}`).join(", ")}
         from _fyno_m f where ${keyMatch("t", "f")} ${tracked ? `and t.updated_by = ${lit(SYNC_BY)}` : ""}
           and (${nonKey.map((k) => `t.${qi(k)}::text`).join(", ")}, null) is distinct from (${nonKey.map((k) => `f.${qi(k)}::text`).join(", ")}, null)
         returning 1`,
      );
      c.updated = upd.length;
    }
    if (tracked) c.kept = await one(raw, `select count(*)::int as n from _fyno_m f join ${target} t on ${keyMatch("t", "f")} where t.updated_by is distinct from ${lit(SYNC_BY)}`);
  }
  if (legacyId && key.length === 1 && key[0] === "id") {
    await raw.query(
      `insert into hub.legacy_map (source_table, source_id, hub_table, hub_id, created_at, updated_at)
       select $1, f._sid, $2, f.id, now(), now() from _fyno_m f join ${target} t on t.id = f.id
       on conflict (source_table, source_id) do nothing`,
      [legacyName(spec.source), spec.target],
    );
  }
  const present = await one(raw, `select count(*)::int as n from _fyno_m f join ${target} t on ${keyMatch("t", "f")}`);
  // Rows that collided with another key (the same person and job invited twice, say): folded into that row.
  c.hubRows = await one(raw, `select count(*)::int as n from _fyno_m`);
  c.merged = c.hubRows - present;
  c.unchanged = Math.max(0, present - c.inserted - c.updated - c.kept);
  await raw.query(`drop table if exists pg_temp._fyno_m`);
  return c;
}
