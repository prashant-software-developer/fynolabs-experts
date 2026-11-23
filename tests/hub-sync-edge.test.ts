// The hub-sync edge function (Main Website - FyonLabs/supabase/functions/hub-sync): its logic module,
// copied to tests/edge/hub-sync-logic.ts, run against PGlite on both sides (FynoLabs and the hub).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { emailHash } from "@/lib/normalize";
import {
  authorized,
  chooseKey,
  copyStorage,
  copyTable,
  decodeCursor,
  encodeCursor,
  handle,
  pgArray,
  safeEqual,
  safeError,
  takeBatch,
  targetType,
  type CatalogColumn,
} from "./edge/hub-sync-logic";
import { asDb, copyEverything, fakeStorage, newFynoLabs, SYNC_URL } from "./fixtures/fynolabs-edge";
import { FILES, P } from "./fixtures/fynolabs-data";
import { FYNOLABS_TABLES } from "./fixtures/fynolabs-schema";
import { openTestDb } from "./fixtures/db";

const col = (o: Partial<CatalogColumn>): CatalogColumn => ({ name: "c", type: "text", not_null: false, kind: "b", category: "S", type_schema: "pg_catalog", elem_kind: null, elem_schema: null, base_type: null, base_schema: null, ...o });

describe("hub-sync logic: pure parts", () => {
  it("is the same file as the edge function's logic.ts", () => {
    const main = path.join(process.cwd(), "..", "Main Website - FyonLabs", "supabase", "functions", "hub-sync", "logic.ts");
    if (!existsSync(main)) return; // only checked where both repos sit side by side
    const norm = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    expect(norm(path.join(process.cwd(), "tests", "edge", "hub-sync-logic.ts"))).toBe(norm(main));
  });

  it("maps types: built-ins kept, enums and domains to text, enum arrays to text[], extension types to text", () => {
    expect(targetType(col({ type: "uuid" }))).toBe("uuid");
    expect(targetType(col({ type: "numeric(12,2)" }))).toBe("numeric(12,2)");
    expect(targetType(col({ type: "timestamp with time zone" }))).toBe("timestamp with time zone");
    expect(targetType(col({ type: "text[]", category: "A", elem_kind: "b", elem_schema: "pg_catalog" }))).toBe("text[]");
    expect(targetType(col({ type: "uuid[]", category: "A", elem_kind: "b", elem_schema: "pg_catalog" }))).toBe("uuid[]");
    expect(targetType(col({ type: "app_role", kind: "e", type_schema: "public" }))).toBe("text");
    expect(targetType(col({ type: "app_role[]", category: "A", elem_kind: "e", elem_schema: "public", type_schema: "public" }))).toBe("text[]");
    expect(targetType(col({ type: "email_address", kind: "d", type_schema: "public", base_type: "character varying(255)", base_schema: "pg_catalog" }))).toBe("character varying(255)");
    expect(targetType(col({ type: "citext", type_schema: "extensions" }))).toBe("text");
    expect(targetType(col({ type: "tsvector" }))).toBe("tsvector");
  });

  it("chooses the key: primary key, else a unique key on NOT NULL columns, else a hash of the row", () => {
    const cols = [{ name: "a", not_null: true }, { name: "b", not_null: false }, { name: "c", not_null: true }];
    expect(chooseKey(["a"], [["c"]], cols)).toEqual({ key: ["a"], rowHash: false });
    expect(chooseKey([], [["b"], ["c", "a"]], cols)).toEqual({ key: ["c", "a"], rowHash: false });
    expect(chooseKey([], [["b"]], cols)).toEqual({ key: ["_row_hash"], rowHash: true });
  });

  it("batches by rows and by bytes (a single bigger row goes alone)", () => {
    const rows = Array.from({ length: 7 }, (_, i) => [String(i), "x".repeat(i === 3 ? 50 : 10)]);
    expect(takeBatch(rows, 0, 3, 1000)).toHaveLength(3);
    expect(takeBatch(rows, 0, 10, 25)).toHaveLength(2);
    expect(takeBatch(rows, 3, 10, 25)).toHaveLength(1);
  });

  it("cursors are opaque and refuse anything they didn't give out", () => {
    const c = encodeCursor(["2026-11-20", "linkedin"]);
    expect(c).not.toMatch(/linkedin/);
    expect(decodeCursor(c, 2)).toEqual(["2026-11-20", "linkedin"]);
    expect(decodeCursor(null, 1)).toBeNull();
    expect(() => decodeCursor(c, 1)).toThrow(/cursor/);
    expect(() => decodeCursor("not-a-cursor", 1)).toThrow(/cursor/);
  });

  it("token: missing or short secret, missing header and wrong token all fail; the right one passes", async () => {
    const secret = "s".repeat(32);
    expect(await authorized(secret, undefined)).toBe(false);
    expect(await authorized("short", "short")).toBe(false);
    expect(await authorized(null, secret)).toBe(false);
    expect(await authorized(`${secret}x`, secret)).toBe(false);
    expect(await authorized(secret, secret)).toBe(true);
    expect(await safeEqual("abc", "abd")).toBe(false);
  });

  it("errors carry the code and no values", () => {
    const e = Object.assign(new Error('invalid input syntax for type uuid: "asha.rao@example.com"\nDETAIL: Key (email)=(asha.rao@example.com)'), { code: "22P02" });
    const s = safeError(e);
    expect(s.code).toBe("22P02");
    expect(JSON.stringify(s)).not.toContain("asha");
    expect(safeError(new Error("connect to postgresql://u:pw@host/db failed")).message).not.toContain("pw@");
    expect(pgArray(['a"b', "c\\d"])).toBe('{"a\\"b","c\\\\d"}');
  });
});

describe("hub-sync against a copy of the FynoLabs schema", () => {
  let src: PGlite;
  let hub: PGlite;
  let first: Awaited<ReturnType<typeof copyEverything>>;
  const fingerprint = async (c: PGlite) => {
    const parts: string[] = [];
    for (const t of [...FYNOLABS_TABLES.map((x) => `public."${x}"`), "auth.users", "storage.objects"]) {
      const r = await c.query<{ h: string }>(`select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from ${t} x`);
      parts.push(r.rows[0].h);
    }
    return parts.join(",");
  };
  const n = async (sql: string) => Number((await hub.query<{ n: number }>(sql)).rows[0].n);
  let before = "";

  beforeAll(async () => {
    src = await newFynoLabs();
    ({ client: hub } = await openTestDb({ jobsStub: false }));
    // Eve was deleted on request in the hub: her rows must never be copied.
    await hub.query(`insert into hub.erasures (email_sha256, actor_email) values ($1, 'test')`, [emailHash("eve@example.com")]);
    before = await fingerprint(src);
    first = await copyEverything(src, hub);
  });
  afterAll(async () => {
    await src.close();
    await hub.close();
  });

  it("op=tables counts every public table, auth users and the stored files", async () => {
    const names = first.tables.map((t) => t.table);
    expect(names).toEqual([...[...FYNOLABS_TABLES].sort(), "auth_users", "storage_objects"]);
    for (const t of first.tables.filter((x) => FYNOLABS_TABLES.includes(x.table as never))) {
      const real = Number((await src.query<{ n: number }>(`select count(*)::int as n from public."${t.table}"`)).rows[0].n);
      expect(t.rows, t.table).toBe(real);
    }
    expect(first.tables.find((t) => t.table === "storage_objects")!.rows).toBe(FILES.length);
  });

  it("never writes to FynoLabs", async () => {
    expect(await fingerprint(src)).toBe(before);
  });

  it("copies every table with the same columns, key and rows (less the erased person's)", async () => {
    for (const t of FYNOLABS_TABLES) {
      const srcCols = (await src.query<{ c: string }>(`select string_agg(column_name::text, ',' order by ordinal_position) as c from information_schema.columns where table_schema = 'public' and table_name = $1`, [t])).rows[0].c;
      const copyCols = (await hub.query<{ c: string }>(`select string_agg(column_name::text, ',' order by ordinal_position) as c from information_schema.columns where table_schema = 'fynolabs_copy' and table_name = $1`, [t])).rows[0].c;
      expect(copyCols, t).toBe(srcCols);
      const all = Number((await src.query<{ n: number }>(`select count(*)::int as n from public."${t}"`)).rows[0].n);
      const leftOut = first.results.filter((r) => r.table === t).reduce((s, r) => s + Number(r.left_out ?? 0), 0);
      expect(await n(`select count(*)::int as n from fynolabs_copy."${t}"`), t).toBe(all - leftOut);
    }
    // Eve: profile, pipeline, timeline and referral left out.
    expect(await n(`select count(*)::int as n from fynolabs_copy.talent_profiles where id = '${P.eve}'`)).toBe(0);
    expect(await n(`select count(*)::int as n from fynolabs_copy.expert_activities where profile_id = '${P.eve}'`)).toBe(0);
    expect(await n(`select count(*)::int as n from fynolabs_copy.talent_referrals where recipient_email = 'eve@example.com'`)).toBe(0);
    // Keys and types: the enum became text, the primary keys are the same.
    const role = (await hub.query<{ t: string }>(`select data_type as t from information_schema.columns where table_schema = 'fynolabs_copy' and table_name = 'user_roles' and column_name = 'role'`)).rows[0].t;
    expect(role).toBe("text");
    const pk = (await hub.query<{ c: string }>(`select string_agg(a.attname::text, ',' order by k.ord) as c from pg_index i cross join lateral unnest(i.indkey::int2[]) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum where i.indrelid = 'fynolabs_copy.visitor_source_sessions'::regclass and i.indisprimary`)).rows[0].c;
    expect(pk).toBe("visit_date,source,session_id");
    // Values survive the trip: arrays, jsonb, numeric, times.
    const a = (await hub.query<Record<string, unknown>>(`select languages, attributes, default_commission_percent::text as pct from fynolabs_copy.talent_profiles where id = '${P.asha}'`)).rows[0];
    expect(a).toMatchObject({ languages: ["English", "Hindi"], attributes: { github_stars: 120 }, pct: "15.00" });
    const ev = (await hub.query<Record<string, unknown>>(`select start_time::text as s, team_ids from fynolabs_copy.calendar_events`)).rows[0];
    expect(ev.s).toBe("18:30:00");
  });

  it("copies only id, email, name and dates of auth users (no passwords, tokens or phones)", async () => {
    const cols = (await hub.query<{ c: string }>(`select string_agg(column_name::text, ',' order by ordinal_position) as c from information_schema.columns where table_schema = 'fynolabs_copy' and table_name = 'auth_users'`)).rows[0].c;
    expect(cols).toBe("id,email,name,created_at,last_sign_in_at");
    expect((await hub.query(`select name from fynolabs_copy.auth_users order by email`)).rows).toEqual([{ name: "Nitin Singh" }, { name: null }, { name: "Prashant" }]);
  });

  it("copies the stored files of the three buckets once (not the erased person's) and skips them next time", async () => {
    const files = (await hub.query<{ bucket: string; name: string; body: string; size: string }>(`select bucket, name, convert_from(data, 'UTF8') as body, size::text as size from fynolabs_copy.storage_objects order by name`)).rows;
    expect(files).toHaveLength(FILES.length - 1);
    for (const f of FILES.filter((x) => !x.name.startsWith("eve/"))) expect(files.find((x) => x.name === f.name)?.body).toBe(f.body);
    const storage = fakeStorage();
    const again = await handle(new URL(`${SYNC_URL}?op=storage`), "POST", { src: asDb(src), hub: asDb(hub), storage });
    expect(again.body).toMatchObject({ copied: 0, skipped: FILES.length - 1, left_out: 1, next_cursor: null });
    expect(storage.downloads).toBe(0);
  });

  it("answers carry counts and cursors only", () => {
    const text = JSON.stringify(first);
    for (const s of ["asha", "Asha", "example.com", "Rust engineer", "%PDF", "secret-hash"]) expect(text).not.toContain(s);
  });

  it("is idempotent; changed rows are updated, rows gone from FynoLabs are kept, new columns are added", async () => {
    const again = await copyEverything(src, hub);
    expect(again.results.reduce((s, r) => s + Number(r.inserted ?? 0) + Number(r.updated ?? 0), 0)).toBe(0);
    await src.query(`update public.leads set stage = 'won' where name = 'Lena Park'`);
    await src.query(`delete from public.leads where name = 'Omar Haddad'`);
    await src.query(`alter table public.leads add column linkedin text`);
    const r = await handle(new URL(`${SYNC_URL}?op=copy&table=leads`), "POST", { src: asDb(src), hub: asDb(hub), storage: fakeStorage() });
    expect(r.body).toMatchObject({ copied: 1, inserted: 0, updated: 1, new_columns: 1, next_cursor: null });
    // Omar is no longer in FynoLabs: kept here.
    expect(await n(`select count(*)::int as n from fynolabs_copy.leads`)).toBe(2);
    expect(await n(`select count(*)::int as n from fynolabs_copy.leads where stage = 'won'`)).toBe(1);
    const log = await n(`select count(*)::int as n from fynolabs_copy._sync_log where "table" = 'leads' and finished_at is not null and error is null`);
    expect(log).toBeGreaterThanOrEqual(3);
  });

  it("stops after its time budget and carries on from the cursor", async () => {
    let clock = 0;
    const hubDb = asDb(hub);
    await hub.query(`delete from fynolabs_copy.visitor_pageviews`);
    const r1 = await copyTable(asDb(src), hubDb, "visitor_pageviews", null, { pageRows: 2, budgetMs: 5, now: () => (clock += 10) });
    expect(r1.copied).toBe(2);
    expect(r1.next_cursor).toBeTruthy();
    let cursor = r1.next_cursor;
    let total = r1.copied;
    while (cursor) {
      const r = await copyTable(asDb(src), hubDb, "visitor_pageviews", cursor, { pageRows: 2, budgetMs: 5, now: () => (clock += 10) });
      total += r.copied;
      cursor = r.next_cursor;
    }
    expect(total).toBe(5);
    expect(await n(`select count(*)::int as n from fynolabs_copy.visitor_pageviews`)).toBe(5);
  });

  it("stops after its rows or bytes per call and carries on (storage too)", async () => {
    await hub.query(`delete from fynolabs_copy.visitor_pageviews`);
    const r = await copyTable(asDb(src), asDb(hub), "visitor_pageviews", null, { pageRows: 2, maxRowsPerCall: 3 });
    expect(r).toMatchObject({ copied: 4 });
    expect(r.next_cursor).toBeTruthy();
    const r2 = await copyTable(asDb(src), asDb(hub), "visitor_pageviews", r.next_cursor, { pageRows: 2, maxRowsPerCall: 3 });
    expect(r2).toMatchObject({ copied: 1, next_cursor: null });
    await hub.query(`delete from fynolabs_copy.storage_objects`);
    const s1 = await copyStorage(asDb(src), asDb(hub), fakeStorage(), null, { maxCallBytes: 10 });
    expect(s1.copied).toBe(1);
    expect(s1.next_cursor).toBeTruthy();
    let cursor = s1.next_cursor;
    let copied = s1.copied;
    while (cursor) {
      const s = await copyStorage(asDb(src), asDb(hub), fakeStorage(), cursor, { maxCallBytes: 10 });
      copied += s.copied;
      cursor = s.next_cursor;
    }
    expect(copied).toBe(FILES.length);
  });

  it("refuses unknown tables and wrong methods", async () => {
    const deps = { src: asDb(src), hub: asDb(hub), storage: fakeStorage() };
    expect((await handle(new URL(`${SYNC_URL}?op=copy&table=pg_authid`), "POST", deps)).status).toBe(400);
    expect((await handle(new URL(`${SYNC_URL}?op=copy&table=leads`), "GET", deps)).status).toBe(405);
    expect((await handle(new URL(`${SYNC_URL}?op=drop`), "POST", deps)).status).toBe(400);
    expect((await handle(new URL(`${SYNC_URL}?op=copy&table=leads&cursor=bogus`), "POST", deps)).status).toBe(400);
  });
});
