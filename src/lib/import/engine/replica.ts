// The exact replica: Engine's expert tables copied column for column into the schema `engine_copy`
// of the hub's database (outside `hub`, so the migration guard and Drizzle never see it).
//
//  - each table is created from Engine's catalog (column names, format_type types, NOT NULL, key);
//  - columns Engine gains later are added; a column Engine makes nullable is made nullable here;
//  - rows are upserted on the key: new rows added, changed rows updated, nothing ever deleted
//    (rows gone from Engine stay and are reported), except the rows of people deleted on request;
//  - values travel as text and are cast back to the column's type, so nothing is lost or rounded
//    (timestamps as UTC text, so both sides compare the same).
import type { EngineTable } from "./tables";
import { ENGINE_TABLES, REPLICA_SCHEMA, SOURCE_SCHEMA, sourceTable } from "./tables";
import type { ReadOnlySource, SqlRunner } from "./source";

export type Column = { name: string; type: string; notNull: boolean };
export type SourceShape = { table: EngineTable; exists: boolean; columns: Column[]; key: string[] };
type Row = (string | null)[];

export const qi = (id: string) => `"${id.replace(/"/g, '""')}"`;
const replicaName = (name: string) => `${qi(REPLICA_SCHEMA)}.${qi(name)}`;
const sourceName = (name: string) => `${qi(SOURCE_SCHEMA)}.${qi(sourceTable(name))}`;
const isTimestamptz = (type: string) => /^timestamp(\(\d\))? with time zone$/.test(type);

/** The column as canonical text: timestamps in UTC so source and replica compare equal. */
export function textExpr(col: string, type: string, alias = ""): string {
  const c = `${alias}${qi(col)}`;
  if (isTimestamptz(type)) return `case when ${c} is null then null when isfinite(${c}) then to_char(${c} at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00' else ${c}::text end`;
  return `${c}::text`;
}

// ---------- Engine (read only) ----------

export async function readShape(src: ReadOnlySource, table: EngineTable): Promise<SourceShape> {
  const [reg] = await src.select<{ oid: string | null }>(`select to_regclass($1::text)::oid::text as oid`, [`${SOURCE_SCHEMA}.${sourceTable(table.name)}`]);
  if (!reg?.oid) return { table, exists: false, columns: [], key: [] };
  const cols = await src.select<{ name: string; type: string; not_null: boolean }>(
    `select a.attname::text as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null
     from pg_attribute a where a.attrelid = $1::oid and a.attnum > 0 and not a.attisdropped order by a.attnum`,
    [reg.oid],
  );
  const pk = await src.select<{ name: string }>(
    `select a.attname::text as name
     from pg_index i cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = $1::oid and i.indisprimary order by k.ord`,
    [reg.oid],
  );
  const columns = cols.filter((c) => !table.exclude.includes(c.name)).map((c) => ({ name: c.name, type: c.type, notNull: Boolean(c.not_null) }));
  const key = pk.length ? pk.map((p) => p.name) : [...(table.naturalKey ?? [])];
  if (!key.length) throw new Error(`Engine table ${sourceTable(table.name)} has no primary key and no natural key is set.`);
  for (const k of key) if (!columns.some((c) => c.name === k)) throw new Error(`Key column ${k} of ${sourceTable(table.name)} is missing or left out.`);
  return { table, exists: true, columns, key };
}

const keyOf = (row: Row, idx: number[]) => idx.map((i) => row[i] ?? "\u0000").join("\u0001");

/** Every row of one Engine table as text, in key order, read in pages (the bytes of files are never read here). */
export async function readSourceRows(src: ReadOnlySource, shape: SourceShape, page = 2000): Promise<Row[]> {
  const exprs = shape.columns.map((c, i) => `${textExpr(c.name, c.type)} as c${i}`).join(", ");
  const keyCols = shape.key.map((k) => shape.columns.find((c) => c.name === k)!);
  const order = keyCols.map((c) => qi(c.name)).join(", ");
  const keyIdx = shape.key.map((k) => shape.columns.findIndex((c) => c.name === k));
  const out: Row[] = [];
  let last: Row | null = null;
  for (;;) {
    const where = last ? `where (${order}) > (${keyCols.map((c, i) => `$${i + 1}::${c.type}`).join(", ")})` : "";
    const params = last ? keyIdx.map((i) => last![i]) : [];
    const rows = await src.select<Record<string, string | null>>(`select ${exprs} from ${sourceName(shape.table.name)} ${where} order by ${order} limit ${page}`, params);
    for (const r of rows) out.push(shape.columns.map((_, i) => r[`c${i}`] ?? null));
    if (rows.length < page) break;
    last = out[out.length - 1];
  }
  return out;
}

// ---------- The replica (in the hub's database) ----------

export async function replicaColumns(target: SqlRunner, name: string): Promise<Map<string, { type: string; notNull: boolean }> | null> {
  const { rows: reg } = await target.query<{ oid: string | null }>(`select to_regclass($1::text)::oid::text as oid`, [`${REPLICA_SCHEMA}.${name}`]);
  if (!reg[0]?.oid) return null;
  const { rows } = await target.query<{ name: string; type: string; not_null: boolean }>(
    `select a.attname::text as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null
     from pg_attribute a where a.attrelid = $1::oid and a.attnum > 0 and not a.attisdropped order by a.attnum`,
    [reg[0].oid],
  );
  return new Map(rows.map((r) => [r.name, { type: r.type, notNull: Boolean(r.not_null) }]));
}

export type ShapeChange = { created: boolean; added: string[]; relaxed: string[]; typeDiffs: string[] };

/** Creates the replica table, or brings it in line with Engine (new columns, nullability). */
export async function ensureReplicaTable(target: SqlRunner, shape: SourceShape): Promise<ShapeChange> {
  const change: ShapeChange = { created: false, added: [], relaxed: [], typeDiffs: [] };
  await target.query(`create schema if not exists ${qi(REPLICA_SCHEMA)}`);
  const existing = await replicaColumns(target, shape.table.name);
  if (!existing) {
    const defs = [
      ...shape.columns.map((c) => `${qi(c.name)} ${c.type}${c.notNull ? " not null" : ""}`),
      ...shape.table.extra.map((x) => `${qi(x.name)} ${x.type}`),
      `primary key (${shape.key.map(qi).join(", ")})`,
    ];
    await target.query(`create table ${replicaName(shape.table.name)} (${defs.join(", ")})`);
    change.created = true;
    return change;
  }
  for (const c of shape.columns) {
    const t = existing.get(c.name);
    if (!t) {
      // Added as nullable: rows already in the replica get the value on this same run.
      await target.query(`alter table ${replicaName(shape.table.name)} add column ${qi(c.name)} ${c.type}`);
      change.added.push(c.name);
      continue;
    }
    if (t.type !== c.type) change.typeDiffs.push(`${c.name}: ${t.type} here, ${c.type} in Engine`);
    if (t.notNull && !c.notNull && !shape.key.includes(c.name)) {
      await target.query(`alter table ${replicaName(shape.table.name)} alter column ${qi(c.name)} drop not null`);
      change.relaxed.push(c.name);
    }
  }
  for (const x of shape.table.extra) {
    if (!existing.has(x.name)) {
      await target.query(`alter table ${replicaName(shape.table.name)} add column ${qi(x.name)} ${x.type}`);
      change.added.push(x.name);
    }
  }
  return change;
}

/** The replica's rows (the columns Engine has), keyed like the source rows. */
export async function readReplicaRows(target: SqlRunner, shape: SourceShape, present: Map<string, { type: string }>): Promise<Map<string, Row>> {
  const exprs = shape.columns.map((c, i) => (present.has(c.name) ? `${textExpr(c.name, present.get(c.name)!.type)} as c${i}` : `null::text as c${i}`)).join(", ");
  const { rows } = await target.query<Record<string, string | null>>(`select ${exprs} from ${replicaName(shape.table.name)}`);
  const keyIdx = shape.key.map((k) => shape.columns.findIndex((c) => c.name === k));
  const out = new Map<string, Row>();
  for (const r of rows) {
    const row = shape.columns.map((_, i) => r[`c${i}`] ?? null);
    out.set(keyOf(row, keyIdx), row);
  }
  return out;
}

const sameRow = (a: Row, b: Row) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Inserts or updates rows on the key; a row is only rewritten if a value differs. Returns what changed. */
export async function upsertRows(target: SqlRunner, shape: SourceShape, rows: Row[], types: Map<string, { type: string }>): Promise<{ inserted: number; updated: number }> {
  if (!rows.length) return { inserted: 0, updated: 0 };
  const cols = shape.columns;
  const typeOf = (c: Column) => types.get(c.name)?.type ?? c.type;
  const nonKey = cols.filter((c) => !shape.key.includes(c.name));
  const conflict = nonKey.length
    ? `do update set ${nonKey.map((c) => `${qi(c.name)} = excluded.${qi(c.name)}`).join(", ")}
       where (${nonKey.map((c) => textExpr(c.name, typeOf(c), "t.")).join(", ")}, null) is distinct from (${nonKey.map((c) => textExpr(c.name, typeOf(c), "excluded.")).join(", ")}, null)`
    : "do nothing";
  const perRow = cols.length;
  const maxRows = Math.max(1, Math.min(500, Math.floor(30_000 / perRow)));
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; ) {
    // Pages of at most maxRows rows and about 4 MB of text.
    const batch: Row[] = [];
    let bytes = 0;
    while (i < rows.length && batch.length < maxRows && (batch.length === 0 || bytes < 4_000_000)) {
      bytes += rows[i].reduce((n, v) => n + (v?.length ?? 0), 0);
      batch.push(rows[i++]);
    }
    const params: (string | null)[] = [];
    const values = batch.map((r) => `(${r.map((v, j) => `$${params.push(v)}::${typeOf(cols[j])}`).join(", ")})`).join(", ");
    const { rows: out } = await target.query<{ inserted: boolean }>(
      `insert into ${replicaName(shape.table.name)} as t (${cols.map((c) => qi(c.name)).join(", ")}) values ${values}
       on conflict (${shape.key.map(qi).join(", ")}) ${conflict} returning (xmax = 0) as inserted`,
      params,
    );
    for (const r of out) (r.inserted ? inserted++ : updated++);
  }
  return { inserted, updated };
}

// ---------- One run ----------

export type TableReport = {
  name: string;
  inEngine: boolean;
  required: boolean;
  engineRows: number;
  /** Rows of people deleted on request: not copied (and removed from the replica if an earlier run had them). */
  leftOut: number;
  purged: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Rows in the replica that are no longer in Engine (kept, never deleted). */
  gone: number;
  replicaRows: number;
  change: ShapeChange | null;
};

export type ReplicaResult = { tables: TableReport[]; shapes: Map<string, SourceShape>; erasedUserIds: Set<string> };

/**
 * Copies every table in ENGINE_TABLES. `isErased(id, email)` says whether a jobs-site user was
 * deleted on request in the hub. Dry run: reads both sides and counts, writes nothing.
 */
export async function replicate(
  src: ReadOnlySource,
  target: SqlRunner,
  opts: { dryRun: boolean; isErased: (userId: string, email: string | null) => boolean; log?: (line: string) => void },
): Promise<ReplicaResult> {
  const log = opts.log ?? (() => {});
  const shapes = new Map<string, SourceShape>();
  const reports: TableReport[] = [];
  const erasedUsers = new Set<string>();
  const erasedApps = new Set<string>();
  for (const table of ENGINE_TABLES) {
    const shape = await readShape(src, table);
    shapes.set(table.name, shape);
    const rep: TableReport = { name: table.name, inEngine: shape.exists, required: table.required, engineRows: 0, leftOut: 0, purged: 0, inserted: 0, updated: 0, unchanged: 0, gone: 0, replicaRows: 0, change: null };
    reports.push(rep);
    if (!shape.exists) {
      if (table.required) throw new Error(`Engine has no table public.${sourceTable(table.name)}: is ENGINE_DATABASE_URL / the --source-key the jobs site's production database?`);
      log(`  ${table.name}: not in Engine, skipped`);
      continue;
    }
    const all = await readSourceRows(src, shape);
    rep.engineRows = all.length;
    let present = await replicaColumns(target, table.name);
    const current = present ? await readReplicaRows(target, shape, present) : new Map<string, Row>();
    const col = (name: string) => shape.columns.findIndex((c) => c.name === name);
    // People deleted on request: found among Engine's rows and the replica's (they may be gone from Engine too).
    if (table.name === "users") {
      const id = col("id");
      const email = col("email");
      for (const r of [...all, ...current.values()]) if (r[id] != null && opts.isErased(r[id]!, email >= 0 ? r[email] : null)) erasedUsers.add(r[id]!);
    }
    if (table.name === "applications") {
      const id = col("id");
      const user = col("user_id");
      for (const r of [...all, ...current.values()]) if (r[id] != null && erasedUsers.has(r[user] ?? "")) erasedApps.add(r[id]!);
    }
    const userIdx = table.userCols.map(col).filter((i) => i >= 0);
    const appIdx = table.appCols.map(col).filter((i) => i >= 0);
    const leftOut = (r: Row) => userIdx.some((i) => r[i] != null && erasedUsers.has(r[i]!)) || appIdx.some((i) => r[i] != null && erasedApps.has(r[i]!));
    const rows = all.filter((r) => !leftOut(r));
    rep.leftOut = all.length - rows.length;

    if (!opts.dryRun) {
      rep.change = await ensureReplicaTable(target, shape);
      present = await replicaColumns(target, table.name);
    } else if (!present) {
      rep.change = { created: true, added: [], relaxed: [], typeDiffs: [] };
    } else {
      rep.change = { created: false, added: shape.columns.filter((c) => !present!.has(c.name)).map((c) => c.name), relaxed: [], typeDiffs: [] };
    }
    const keyIdx = shape.key.map((k) => shape.columns.findIndex((c) => c.name === k));
    const toWrite: Row[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const k = keyOf(r, keyIdx);
      seen.add(k);
      const was = current.get(k);
      if (!was) toWrite.push(r);
      else if (!sameRow(was, r)) toWrite.push(r);
      else rep.unchanged++;
    }
    // Rows of people deleted on request that an earlier run copied.
    const purge = [...current.entries()].filter(([, r]) => leftOut(r));
    rep.gone = [...current.keys()].filter((k) => !seen.has(k)).length - purge.length;
    if (opts.dryRun) {
      for (const r of toWrite) (current.has(keyOf(r, keyIdx)) ? rep.updated++ : rep.inserted++);
      rep.purged = purge.length;
      rep.replicaRows = current.size - purge.length + rep.inserted;
    } else {
      const res = await upsertRows(target, shape, toWrite, present!);
      rep.inserted = res.inserted;
      rep.updated = res.updated;
      rep.unchanged += toWrite.length - res.inserted - res.updated;
      if (purge.length) {
        for (const c of [...table.userCols.map((n) => ({ n, set: erasedUsers })), ...table.appCols.map((n) => ({ n, set: erasedApps }))]) {
          if (!present!.has(c.n) || !c.set.size) continue;
          const { rows: del } = await target.query<{ n: number }>(
            `with d as (delete from ${replicaName(table.name)} where ${qi(c.n)}::text = any($1::text[]) returning 1) select count(*)::int as n from d`,
            [`{${[...c.set].map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",")}}`],
          );
          rep.purged += Number(del[0]?.n ?? 0);
        }
      }
      const { rows: n } = await target.query<{ n: number }>(`select count(*)::int as n from ${replicaName(table.name)}`);
      rep.replicaRows = Number(n[0]?.n ?? 0);
    }
    log(`  ${table.name}: ${rep.engineRows} in Engine${rep.leftOut ? `, ${rep.leftOut} left out (deleted on request)` : ""}; ${rep.inserted} new, ${rep.updated} changed, ${rep.unchanged} unchanged${rep.gone ? `, ${rep.gone} no longer in Engine (kept)` : ""}`);
  }
  return { tables: reports, shapes, erasedUserIds: erasedUsers };
}
