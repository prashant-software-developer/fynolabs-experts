// hub-sync, the logic: copies FynoLabs tables (read only) into the Expert Hub database, schema
// fynolabs_copy. No Deno or npm imports here, so the same file runs in the Supabase Edge Runtime
// (index.ts wires it to the real databases) and in the Expert Hub's tests (Node + PGlite):
// Experts - FynoLabs/tests/edge/hub-sync-logic.ts is a byte-for-byte copy.
//
// Rules:
//  - FynoLabs is only read: every statement on the source is a SELECT.
//  - One copy table per source table, created from the source catalog: same column names, types
//    (enums and domains become text, enum arrays text[], types from extensions text), NOT NULLs
//    and primary key. New source columns are added on the next run.
//  - Rows are upserted on the key in batches (at most 500 rows or about 2 MB per request); rows that
//    disappear from FynoLabs are kept (never deleted), except the rows of people the hub deleted on
//    request (hub.erasures), which are left out and removed from the copy.
//  - Answers carry counts and cursors only, never row data. A cursor is the key of the last row
//    copied (ids), never a name or an email.

export type Row = Record<string, unknown>;
/** The one method we need from a database driver (postgres.js, Neon HTTP, PGlite all fit). */
export interface Db {
  query(text: string, params?: unknown[]): Promise<Row[]>;
}
/** Downloads one stored file (the service-role storage client), or null when it is gone. */
export interface Storage {
  download(bucket: string, name: string): Promise<Uint8Array | null>;
}

export const COPY_SCHEMA = "fynolabs_copy";
export const AUTH_USERS = "auth_users";
export const STORAGE_OBJECTS = "storage_objects";
export const SYNC_LOG = "_sync_log";
export const BUCKETS = ["job-resumes", "talent-resumes", "expert-documents"] as const;
export const MAX_ROWS = 500;
export const MAX_BYTES = 2_000_000;
export const DEFAULT_BUDGET_MS = 100_000;
/** Per call, so one request stays well inside the Edge Runtime's CPU and memory limits; the runner calls again. */
export const MAX_ROWS_PER_CALL = 10_000;
export const MAX_FILE_BYTES_PER_CALL = 8_000_000;
const FILES_PER_PAGE = 50;

export const qi = (id: string) => `"${id.replace(/"/g, '""')}"`;
/** A text[] literal ('{"a","b"}'), so every driver passes arrays the same way. */
export const pgArray = (values: readonly string[]) => `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
const copyName = (t: string) => `${qi(COPY_SCHEMA)}.${qi(t)}`;

// ---------------------------------------------------------------- types and keys

/** What the source catalog says about one column. */
export type CatalogColumn = {
  name: string;
  type: string; // format_type()
  not_null: boolean;
  kind: string; // pg_type.typtype: b base, e enum, d domain, c composite, r range, p pseudo
  category: string; // pg_type.typcategory: A = array
  type_schema: string;
  elem_kind: string | null;
  elem_schema: string | null;
  base_type: string | null; // domains: the type underneath
  base_schema: string | null;
};

/** The copy's type for a source column: built-in types as they are; enums, domains and extension types as text. */
export function targetType(c: CatalogColumn): string {
  if (c.category === "A") {
    if (c.elem_kind === "e" || c.elem_kind === "d" || (c.elem_schema && c.elem_schema !== "pg_catalog")) return "text[]";
    return c.type;
  }
  if (c.kind === "e") return "text";
  if (c.kind === "d") return c.base_schema === "pg_catalog" && c.base_type ? c.base_type : "text";
  if (c.type_schema !== "pg_catalog" || c.kind !== "b") return "text";
  return c.type;
}

const isTimestamptz = (type: string) => /^timestamp(\(\d\))? with time zone$/.test(type);

/** A column as canonical text: timestamps in UTC, so both databases read and compare the same value. */
export function textExpr(col: string, type: string, alias = ""): string {
  const c = `${alias}${qi(col)}`;
  if (isTimestamptz(type)) return `case when ${c} is null then null when isfinite(${c}) then to_char(${c} at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00' else ${c}::text end`;
  return `${c}::text`;
}

/** The key the copy upserts on: the primary key, else a unique key on NOT NULL columns, else a hash of the whole row. */
export function chooseKey(primary: string[], uniques: string[][], columns: { name: string; not_null: boolean }[]): { key: string[]; rowHash: boolean } {
  if (primary.length) return { key: primary, rowHash: false };
  const notNull = new Set(columns.filter((c) => c.not_null).map((c) => c.name));
  const u = uniques.find((cols) => cols.length && cols.every((c) => notNull.has(c)));
  if (u) return { key: u, rowHash: false };
  return { key: ["_row_hash"], rowHash: true };
}

export type ShapeColumn = { name: string; type: string; sourceType: string; notNull: boolean; expr: string };
export type Shape = { table: string; from: string; columns: ShapeColumn[]; key: string[]; keyTypes: string[]; rowHash: boolean };

/** Every base table in public, in name order. */
export async function sourceTables(src: Db): Promise<string[]> {
  const rows = await src.query(
    `select c.relname::text as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition order by 1`,
  );
  return rows.map((r) => String(r.t));
}

/** auth.users, the part the hub needs to know who a team member is: never passwords, tokens or phone codes. */
export function authUsersShape(): Shape {
  const col = (name: string, type: string, expr: string, notNull = false): ShapeColumn => ({ name, type, sourceType: type, notNull, expr });
  return {
    table: AUTH_USERS,
    from: "auth.users",
    columns: [
      col("id", "uuid", "id::text", true),
      col("email", "text", "email::text"),
      col("name", "text", "coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')"),
      col("created_at", "timestamp with time zone", textExpr("created_at", "timestamp with time zone")),
      col("last_sign_in_at", "timestamp with time zone", textExpr("last_sign_in_at", "timestamp with time zone")),
    ],
    key: ["id"],
    keyTypes: ["uuid"],
    rowHash: false,
  };
}

export async function readShape(src: Db, table: string): Promise<Shape> {
  if (table === AUTH_USERS) return authUsersShape();
  const [reg] = await src.query(`select to_regclass($1::text)::oid::text as oid`, [`public.${qi(table)}`]);
  if (!reg?.oid) throw new SyncError("unknown_table", `There is no table public.${table}.`);
  const oid = String(reg.oid);
  const cols = (await src.query(
    `select a.attname::text as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null,
            t.typtype::text as kind, t.typcategory::text as category, tn.nspname::text as type_schema,
            et.typtype::text as elem_kind, en.nspname::text as elem_schema,
            case when t.typtype = 'd' then format_type(t.typbasetype, t.typtypmod) end as base_type,
            bn.nspname::text as base_schema
     from pg_attribute a
     join pg_type t on t.oid = a.atttypid
     join pg_namespace tn on tn.oid = t.typnamespace
     left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
     left join pg_namespace en on en.oid = et.typnamespace
     left join pg_type bt on bt.oid = t.typbasetype and t.typtype = 'd'
     left join pg_namespace bn on bn.oid = bt.typnamespace
     where a.attrelid = $1::oid and a.attnum > 0 and not a.attisdropped order by a.attnum`,
    [oid],
  )) as unknown as CatalogColumn[];
  const pk = await src.query(
    `select a.attname::text as name from pg_index i cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = $1::oid and i.indisprimary order by k.ord`,
    [oid],
  );
  const uq = await src.query(
    `select i.indexrelid::text as idx, a.attname::text as name from pg_index i cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = $1::oid and i.indisunique and not i.indisprimary and i.indpred is null and i.indexprs is null order by i.indexrelid, k.ord`,
    [oid],
  );
  const uniques = new Map<string, string[]>();
  for (const r of uq) uniques.set(String(r.idx), [...(uniques.get(String(r.idx)) ?? []), String(r.name)]);
  const { key, rowHash } = chooseKey(pk.map((r) => String(r.name)), [...uniques.values()], cols);
  const columns: ShapeColumn[] = cols.map((c) => ({ name: c.name, type: targetType(c), sourceType: c.type, notNull: Boolean(c.not_null), expr: textExpr(c.name, c.type) }));
  const keyTypes = rowHash ? ["text"] : key.map((k) => columns.find((c) => c.name === k)!.type);
  return { table, from: `public.${qi(table)}`, columns, key, keyTypes, rowHash };
}

// ---------------------------------------------------------------- cursors and batches

/** The key of the last row copied, as an opaque base64url string. */
export function encodeCursor(key: (string | null)[]): string {
  return b64url(new TextEncoder().encode(JSON.stringify(key)));
}

export function decodeCursor(cursor: string | null | undefined, size: number): string[] | null {
  if (!cursor) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(fromB64url(cursor)));
    if (Array.isArray(v) && v.length === size && v.every((x) => typeof x === "string")) return v;
  } catch {
    /* fall through */
  }
  throw new SyncError("bad_cursor", "The cursor is not one this function gave out.");
}

/** The next batch: at most maxRows rows and about maxBytes of text (a single bigger row is a batch of its own). */
export function takeBatch<T extends (string | null)[]>(rows: T[], start: number, maxRows = MAX_ROWS, maxBytes = MAX_BYTES): T[] {
  const out: T[] = [];
  let bytes = 0;
  for (let i = start; i < rows.length && out.length < maxRows; i++) {
    const n = rowBytes(rows[i]);
    if (out.length && bytes + n > maxBytes) break;
    out.push(rows[i]);
    bytes += n;
  }
  return out;
}

export const rowBytes = (r: (string | null)[]) => r.reduce((n, v) => n + (v ? v.length : 0), 0);

// ---------------------------------------------------------------- people deleted on request

/** What the hub has erased: SHA-256 of their emails, and their FynoLabs profile ids. */
export type Erased = { hashes: string[]; profileIds: string[] };

const emailHashSql = (col: string) => `encode(sha256(convert_to(lower(btrim(${col})), 'UTF8')), 'hex')`;

/** hub.erasures (if the hub has that table yet). FynoLabs profile ids are kept as source 'admin_crm'. */
export async function readErased(hub: Db): Promise<Erased> {
  const [has] = await hub.query(`select to_regclass('hub.erasures') is not null as ok`);
  if (!has?.ok) return { hashes: [], profileIds: [] };
  const rows = await hub.query(`select email_sha256, source, external_id from hub.erasures`);
  return {
    hashes: [...new Set(rows.map((r) => r.email_sha256).filter((v): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v)))],
    profileIds: [...new Set(rows.filter((r) => r.source === "admin_crm" && typeof r.external_id === "string").map((r) => String(r.external_id)))],
  };
}

/** Their talent_profiles ids in FynoLabs: by profile id or by the email's hash. */
export async function erasedProfiles(src: Db, e: Erased): Promise<string[]> {
  if (!e.hashes.length && !e.profileIds.length) return [];
  const rows = await src.query(
    `select id::text as id from public.talent_profiles where id::text = any($1::text[]) or (email is not null and ${emailHashSql("email")} = any($2::text[]))`,
    [pgArray(e.profileIds), pgArray(e.hashes)],
  );
  return [...new Set([...e.profileIds, ...rows.map((r) => String(r.id))])];
}

/**
 * The SQL condition that is true for rows of erased people (or null when no column can tell):
 * the profile itself, rows with their profile_id, and rows with their email or recipient_email.
 * $1 = erased profile ids (text[]), $2 = email hashes (text[]). `alias` prefixes the columns.
 */
export function erasedCondition(table: string, columnNames: string[], alias = ""): string | null {
  const has = (c: string) => columnNames.includes(c);
  const parts: string[] = [];
  if (table === "talent_profiles" && has("id")) parts.push(`${alias}"id"::text = any($1::text[])`);
  if (has("profile_id")) parts.push(`${alias}"profile_id"::text = any($1::text[])`);
  for (const c of ["email", "recipient_email"]) if (has(c)) parts.push(`(${alias}${qi(c)} is not null and ${emailHashSql(`${alias}${qi(c)}`)} = any($2::text[]))`);
  // Both parameters are always named, so their types are known whichever columns the table has.
  // coalesce: a row with no profile and no email is nobody's, never "unknown" (NOT NULL would drop it).
  return parts.length ? `coalesce(cardinality($1::text[]) + cardinality($2::text[]) > 0 and (${parts.join(" or ")}), false)` : null;
}

// ---------------------------------------------------------------- the copy side (hub database)

export async function ensureSyncLog(hub: Db): Promise<void> {
  await hub.query(`create schema if not exists ${qi(COPY_SCHEMA)}`);
  await hub.query(
    `create table if not exists ${copyName(SYNC_LOG)} (
       id bigint generated by default as identity primary key, run_id text, "table" text, source_rows bigint,
       copied_rows bigint, started_at timestamptz not null default now(), finished_at timestamptz, error text)`,
  );
}

async function copyColumns(hub: Db, table: string): Promise<Map<string, { type: string; notNull: boolean }> | null> {
  const [reg] = await hub.query(`select to_regclass($1::text)::oid::text as oid`, [`${COPY_SCHEMA}.${qi(table)}`]);
  if (!reg?.oid) return null;
  const rows = await hub.query(
    `select a.attname::text as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null
     from pg_attribute a where a.attrelid = $1::oid and a.attnum > 0 and not a.attisdropped order by a.attnum`,
    [String(reg.oid)],
  );
  return new Map(rows.map((r) => [String(r.name), { type: String(r.type), notNull: Boolean(r.not_null) }]));
}

export type ShapeChange = { created: boolean; added: string[]; relaxed: string[]; typeDiffs: string[] };

/** The CREATE TABLE for a new copy table. */
export function createTableSql(shape: Shape): string {
  const defs = shape.columns.map((c) => `${qi(c.name)} ${c.type}${c.notNull ? " not null" : ""}`);
  if (shape.rowHash) defs.push(`"_row_hash" text not null`);
  defs.push(`primary key (${shape.key.map(qi).join(", ")})`);
  return `create table if not exists ${copyName(shape.table)} (${defs.join(", ")})`;
}

/** Creates the copy table, or brings it in line with the source (new columns, a NOT NULL dropped). */
export async function ensureCopyTable(hub: Db, shape: Shape): Promise<ShapeChange> {
  const change: ShapeChange = { created: false, added: [], relaxed: [], typeDiffs: [] };
  await hub.query(`create schema if not exists ${qi(COPY_SCHEMA)}`);
  const existing = await copyColumns(hub, shape.table);
  if (!existing) {
    await hub.query(createTableSql(shape));
    change.created = true;
    return change;
  }
  for (const c of shape.columns) {
    const t = existing.get(c.name);
    if (!t) {
      // Added as nullable: the rows already copied get their value on this same run.
      await hub.query(`alter table ${copyName(shape.table)} add column ${qi(c.name)} ${c.type}`);
      change.added.push(c.name);
      continue;
    }
    if (t.type !== c.type) change.typeDiffs.push(c.name);
    if (t.notNull && !c.notNull && !shape.key.includes(c.name)) {
      await hub.query(`alter table ${copyName(shape.table)} alter column ${qi(c.name)} drop not null`);
      change.relaxed.push(c.name);
    }
  }
  return change;
}

/** One INSERT ... ON CONFLICT for n rows; a row is only rewritten when a value differs. */
export function upsertSql(shape: Shape, n: number, types?: Map<string, { type: string }>): string {
  const cols = [...shape.columns.map((c) => ({ name: c.name, type: types?.get(c.name)?.type ?? c.type })), ...(shape.rowHash ? [{ name: "_row_hash", type: "text" }] : [])];
  const width = cols.length;
  const values = Array.from({ length: n }, (_, r) => `(${cols.map((c, j) => `$${r * width + j + 1}::${c.type}`).join(", ")})`).join(", ");
  const nonKey = cols.filter((c) => !shape.key.includes(c.name));
  const conflict = nonKey.length
    ? `do update set ${nonKey.map((c) => `${qi(c.name)} = excluded.${qi(c.name)}`).join(", ")}
       where (${nonKey.map((c) => `t.${qi(c.name)}::text`).join(", ")}, null) is distinct from (${nonKey.map((c) => `excluded.${qi(c.name)}::text`).join(", ")}, null)`
    : "do nothing";
  return `insert into ${copyName(shape.table)} as t (${cols.map((c) => qi(c.name)).join(", ")}) values ${values}
    on conflict (${shape.key.map(qi).join(", ")}) ${conflict} returning (xmax = 0) as inserted`;
}

/** Rows per INSERT: 500 at most, and never more than about 30,000 parameters. */
export const rowsPerInsert = (width: number) => Math.max(1, Math.min(MAX_ROWS, Math.floor(30_000 / Math.max(1, width))));

// ---------------------------------------------------------------- one table

export type CopyResult = {
  table: string;
  copied: number;
  inserted: number;
  updated: number;
  left_out: number;
  purged: number;
  next_cursor: string | null;
  change: ShapeChange | null;
};

export class SyncError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SyncError";
  }
}

/**
 * Copies one table from the cursor on, for at most budgetMs, and returns where to carry on
 * (next_cursor null = the table is done). Safe to repeat: rows are upserted on the key.
 */
export async function copyTable(
  src: Db,
  hub: Db,
  table: string,
  cursor: string | null,
  opts: { budgetMs?: number; pageRows?: number; maxBytes?: number; maxRowsPerCall?: number; now?: () => number; erased?: Erased } = {},
): Promise<CopyResult> {
  const now = opts.now ?? (() => Date.now());
  const started = now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const page = opts.pageRows ?? 2000;
  const shape = await readShape(src, table);
  const change = await ensureCopyTable(hub, shape);
  const types = await copyColumns(hub, shape.table);
  const erased = opts.erased ?? { hashes: [], profileIds: [] };
  const profiles = await erasedProfiles(src, erased);
  const condition = table === AUTH_USERS ? null : erasedCondition(table, shape.columns.map((c) => c.name), "s.");
  const filtering = Boolean(condition && (profiles.length || erased.hashes.length));
  const res: CopyResult = { table, copied: 0, inserted: 0, updated: 0, left_out: 0, purged: 0, next_cursor: null, change };

  // Rows of people deleted on request: counted once (first call), never read.
  if (filtering && !cursor) {
    const [n] = await src.query(`select count(*)::int as n from ${shape.from} s where ${condition}`, [pgArray(profiles), pgArray(erased.hashes)]);
    res.left_out = Number(n?.n ?? 0);
  }
  const keyExpr = shape.rowHash ? [`md5(s::text)`] : shape.key.map((k) => `s.${qi(k)}`);
  const width = shape.columns.length + (shape.rowHash ? 1 : 0);
  let last = decodeCursor(cursor, shape.key.length);
  for (;;) {
    const params: unknown[] = filtering ? [pgArray(profiles), pgArray(erased.hashes)] : [];
    const where: string[] = [];
    if (filtering) where.push(`not ${condition}`);
    if (last) {
      const at = params.length;
      where.push(`(${keyExpr.join(", ")}) > (${last.map((_, i) => `$${at + i + 1}::${shape.keyTypes[i]}`).join(", ")})`);
      params.push(...last);
    }
    const select = [...shape.columns.map((c, i) => `${c.expr} as c${i}`), ...(shape.rowHash ? [`md5(s::text) as c${shape.columns.length}`] : [])];
    const keyIdx = shape.rowHash ? [shape.columns.length] : shape.key.map((k) => shape.columns.findIndex((c) => c.name === k));
    const rows = (await src.query(
      `select ${select.join(", ")} from ${shape.from} s ${where.length ? `where ${where.join(" and ")}` : ""} order by ${keyExpr.join(", ")} limit ${page}`,
      params,
    )).map((r) => Array.from({ length: width }, (_, i) => (r[`c${i}`] == null ? null : String(r[`c${i}`]))));
    for (let i = 0; i < rows.length; ) {
      const batch = takeBatch(rows, i, rowsPerInsert(width), opts.maxBytes ?? MAX_BYTES);
      const out = await hub.query(upsertSql(shape, batch.length, types ?? undefined), batch.flat());
      for (const r of out) (r.inserted === true || r.inserted === "t" ? res.inserted++ : res.updated++);
      res.copied += batch.length;
      i += batch.length;
    }
    if (rows.length < page) {
      res.next_cursor = null;
      break;
    }
    last = keyIdx.map((i) => rows[rows.length - 1][i] ?? "");
    if (now() - started > budget || res.copied >= (opts.maxRowsPerCall ?? MAX_ROWS_PER_CALL)) {
      res.next_cursor = encodeCursor(last);
      break;
    }
  }
  // The table is done: remove rows of people deleted on request that an earlier run copied.
  if (!res.next_cursor && filtering) {
    const c = erasedCondition(table, shape.columns.map((x) => x.name), "t.");
    const del = await hub.query(`with d as (delete from ${copyName(shape.table)} t where ${c} returning 1) select count(*)::int as n from d`, [pgArray(profiles), pgArray(erased.hashes)]);
    res.purged = Number(del[0]?.n ?? 0);
  }
  return res;
}

// ---------------------------------------------------------------- counts

/** Rows in every source table (and auth users, and stored files in the three buckets). */
export async function countSource(src: Db): Promise<{ table: string; rows: number }[]> {
  const tables = await sourceTables(src);
  const parts = tables.map((t) => `select '${t.replace(/'/g, "''")}'::text as t, count(*)::int as n from public.${qi(t)}`);
  parts.push(`select '${AUTH_USERS}'::text, count(*)::int from auth.users`);
  parts.push(`select '${STORAGE_OBJECTS}'::text, count(*)::int from storage.objects where bucket_id = any(array[${BUCKETS.map((b) => `'${b}'`).join(", ")}])`);
  const rows = await src.query(parts.join(" union all "));
  const byName = new Map(rows.map((r) => [String(r.t), Number(r.n)]));
  return [...tables, AUTH_USERS, STORAGE_OBJECTS].map((t) => ({ table: t, rows: byName.get(t) ?? 0 }));
}

// ---------------------------------------------------------------- stored files

export type StorageResult = { table: string; copied: number; skipped: number; gone: number; left_out: number; bytes: number; next_cursor: string | null };

export async function ensureStorageTable(hub: Db): Promise<void> {
  await hub.query(`create schema if not exists ${qi(COPY_SCHEMA)}`);
  await hub.query(
    `create table if not exists ${copyName(STORAGE_OBJECTS)} (
       bucket text not null, name text not null, object_id uuid, mime text, size bigint, data bytea,
       created_at timestamptz, updated_at timestamptz, primary key (bucket, name))`,
  );
}

/** "bucket/name" paths of files that belong to people deleted on request. */
async function erasedPaths(src: Db, profiles: string[], hashes: string[]): Promise<Set<string>> {
  if (!profiles.length && !hashes.length) return new Set();
  const h = (c: string) => `(${c} is not null and ${emailHashSql(c)} = any($2::text[]))`;
  const rows = await src.query(
    `select resume_path as p from public.talent_profiles where id::text = any($1::text[]) or ${h("email")}
     union all select resume_path from public.job_applications where profile_id::text = any($1::text[]) or ${h("email")}
     union all select resume_path from public.talent_applications where profile_id::text = any($1::text[]) or ${h("email")}
     union all select file_path from public.expert_documents where profile_id::text = any($1::text[])
     union all select signed_path from public.expert_documents where profile_id::text = any($1::text[])`,
    [pgArray(profiles), pgArray(hashes)],
  );
  return new Set(rows.map((r) => r.p).filter((p): p is string => typeof p === "string" && p.length > 0));
}

/** "talent-resumes/abc/cv.pdf" and "abc/cv.pdf" (in bucket talent-resumes) are the same file. */
const pathKeys = (bucket: string, name: string) => [`${bucket}/${name}`, name];

/**
 * Copies stored files (metadata and bytes) of the three buckets, in id order, from the cursor on.
 * A file already copied with the same updated_at and size is skipped; nothing is ever deleted.
 */
export async function copyStorage(
  src: Db,
  hub: Db,
  storage: Storage,
  cursor: string | null,
  opts: { budgetMs?: number; maxBytes?: number; maxCallBytes?: number; now?: () => number; erased?: Erased } = {},
): Promise<StorageResult> {
  const now = opts.now ?? (() => Date.now());
  const started = now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  await ensureStorageTable(hub);
  const erased = opts.erased ?? { hashes: [], profileIds: [] };
  const blocked = await erasedPaths(src, await erasedProfiles(src, erased), erased.hashes);
  const res: StorageResult = { table: STORAGE_OBJECTS, copied: 0, skipped: 0, gone: 0, left_out: 0, bytes: 0, next_cursor: null };
  let last = decodeCursor(cursor, 1)?.[0] ?? null;
  for (;;) {
    const objects = await src.query(
      `select id::text as id, bucket_id as bucket, name, metadata->>'mimetype' as mime, metadata->>'size' as size,
              ${textExpr("created_at", "timestamp with time zone")} as created_at, ${textExpr("updated_at", "timestamp with time zone")} as updated_at
       from storage.objects where bucket_id = any($1::text[]) and name is not null ${last ? "and id > $2::uuid" : ""}
       order by id limit ${FILES_PER_PAGE}`,
      last ? [pgArray(BUCKETS), last] : [pgArray(BUCKETS)],
    );
    if (!objects.length) break;
    const have = await hub.query(
      `select bucket, name, ${textExpr("updated_at", "timestamp with time zone")} as updated_at, size::text as size from ${copyName(STORAGE_OBJECTS)}
       where (bucket, name) in (select * from unnest($1::text[], $2::text[]))`,
      [pgArray(objects.map((o) => String(o.bucket))), pgArray(objects.map((o) => String(o.name)))],
    );
    const known = new Map(have.map((h) => [`${h.bucket}/${h.name}`, `${h.updated_at}|${h.size ?? ""}`]));
    let batch: (string | null)[][] = [];
    let batchBytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const values = batch.map((_, r) => `($${r * 8 + 1}, $${r * 8 + 2}, $${r * 8 + 3}::uuid, $${r * 8 + 4}, $${r * 8 + 5}::bigint, decode($${r * 8 + 6}, 'base64'), $${r * 8 + 7}::timestamptz, $${r * 8 + 8}::timestamptz)`).join(", ");
      await hub.query(
        `insert into ${copyName(STORAGE_OBJECTS)} (bucket, name, object_id, mime, size, data, created_at, updated_at) values ${values}
         on conflict (bucket, name) do update set object_id = excluded.object_id, mime = excluded.mime, size = excluded.size, data = excluded.data,
           created_at = excluded.created_at, updated_at = excluded.updated_at`,
        batch.flat(),
      );
      batch = [];
      batchBytes = 0;
    };
    let stopped = false;
    for (const o of objects) {
      const bucket = String(o.bucket);
      const name = String(o.name);
      last = String(o.id);
      if (pathKeys(bucket, name).some((k) => blocked.has(k))) {
        res.left_out++;
        continue;
      }
      if (known.get(`${bucket}/${name}`) === `${o.updated_at}|${o.size ?? ""}`) {
        res.skipped++;
        continue;
      }
      const bytes = await storage.download(bucket, name);
      if (!bytes) {
        res.gone++;
        continue;
      }
      const b64 = toBase64(bytes);
      if (batch.length && batchBytes + b64.length > maxBytes) await flush();
      batch.push([bucket, name, String(o.id), o.mime == null ? null : String(o.mime), String(o.size ?? bytes.byteLength), b64, o.created_at == null ? null : String(o.created_at), o.updated_at == null ? null : String(o.updated_at)]);
      batchBytes += b64.length;
      res.copied++;
      res.bytes += bytes.byteLength;
      if (now() - started > budget || res.bytes >= (opts.maxCallBytes ?? MAX_FILE_BYTES_PER_CALL)) {
        stopped = true;
        break;
      }
    }
    await flush();
    if (stopped) {
      res.next_cursor = encodeCursor([last]);
      return res;
    }
    if (objects.length < FILES_PER_PAGE) break;
    if (now() - started > budget || res.bytes >= (opts.maxCallBytes ?? MAX_FILE_BYTES_PER_CALL)) {
      res.next_cursor = encodeCursor([last]);
      return res;
    }
  }
  return res;
}

// ---------------------------------------------------------------- the request

export type Env = { token: string | undefined; hubConfigured: boolean };

/** Same length and same bytes, compared without an early exit (SHA-256 first, so lengths don't leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i];
  return diff === 0;
}

export function authorized(header: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || secret.length < 16 || !header) return Promise.resolve(false);
  return safeEqual(header, secret);
}

/** A database error without the values in it: the SQLSTATE and the message with quoted parts removed. */
export function safeError(e: unknown): { code: string; message: string } {
  if (e instanceof SyncError) return { code: e.code, message: e.message };
  const o = (e ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof o.code === "string" && /^[0-9A-Z]{5}$/.test(o.code) ? o.code : "error";
  const message = String(o.message ?? "The copy stopped.")
    .split("\n")[0]
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/postgres(ql)?:\/\/\S+/gi, "(database address)")
    .replace(/:\s.*$/, "")
    .slice(0, 200);
  return { code, message };
}

export type Handled = { status: number; body: Record<string, unknown> };

/**
 * One request: GET ?op=tables, POST ?op=copy&table=&cursor=&run=, POST ?op=storage&cursor=&run=.
 * The caller has already checked the token.
 */
export async function handle(url: URL, method: string, deps: { src: Db; hub: Db; storage: Storage; budgetMs?: number }): Promise<Handled> {
  const op = url.searchParams.get("op") ?? "";
  const run = (url.searchParams.get("run") ?? "").replace(/[^\w.:-]/g, "").slice(0, 64) || null;
  const budget = Math.min(Math.max(Number(url.searchParams.get("budget_ms")) || (deps.budgetMs ?? DEFAULT_BUDGET_MS), 1_000), 120_000);
  if (op === "tables") {
    if (method !== "GET") return { status: 405, body: { error: "Use GET for op=tables." } };
    return { status: 200, body: { tables: await countSource(deps.src) } };
  }
  if (op !== "copy" && op !== "storage") return { status: 400, body: { error: "op must be tables, copy or storage." } };
  if (method !== "POST") return { status: 405, body: { error: `Use POST for op=${op}.` } };
  const cursor = url.searchParams.get("cursor") || null;
  const table = op === "storage" ? STORAGE_OBJECTS : url.searchParams.get("table") ?? "";
  if (op === "copy") {
    const known = [...(await sourceTables(deps.src)), AUTH_USERS];
    if (!known.includes(table)) return { status: 400, body: { error: "Unknown table.", code: "unknown_table" } };
  }
  await ensureSyncLog(deps.hub);
  const startedAt = new Date().toISOString();
  const [logRow] = await deps.hub.query(`insert into ${copyName(SYNC_LOG)} (run_id, "table", started_at) values ($1, $2, $3::timestamptz) returning id::text as id`, [run, table, startedAt]);
  const finish = (copied: number | null, error: string | null, sourceRows: number | null) =>
    deps.hub.query(`update ${copyName(SYNC_LOG)} set finished_at = now(), copied_rows = $2::bigint, error = $3, source_rows = $4::bigint where id = $1::bigint`, [logRow.id, copied, error, sourceRows]);
  try {
    const erased = await readErased(deps.hub);
    if (op === "storage") {
      const r = await copyStorage(deps.src, deps.hub, deps.storage, cursor, { budgetMs: budget, erased });
      await finish(r.copied, null, null);
      return { status: 200, body: r };
    }
    const r = await copyTable(deps.src, deps.hub, table, cursor, { budgetMs: budget, erased });
    const from = table === AUTH_USERS ? "auth.users" : `public.${qi(table)}`;
    const [n] = cursor ? [null] : await deps.src.query(`select count(*)::int as n from ${from}`);
    await finish(r.copied, null, n ? Number(n.n) : null);
    const { change, ...body } = r;
    return { status: 200, body: { ...body, new_columns: change?.added.length ?? 0, created: change?.created ?? false } };
  } catch (e) {
    const err = safeError(e);
    await finish(null, `${err.code}: ${err.message}`, null).catch(() => {});
    return { status: e instanceof SyncError && e.code !== "error" ? 400 : 500, body: { error: `The copy of ${table} stopped.`, ...err } };
  }
}

// ---------------------------------------------------------------- base64 (no Buffer in Deno)

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
