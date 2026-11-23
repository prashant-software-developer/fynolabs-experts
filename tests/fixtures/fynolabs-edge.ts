// TEST ONLY. A stand-in for the FynoLabs side of hub-sync: a PGlite database with the FynoLabs
// schema (tests/fixtures/fynolabs-schema.ts) and data, a fake storage, and the edge function's
// request handler (tests/edge/hub-sync-logic.ts, a copy of supabase/functions/hub-sync/logic.ts)
// behind a fake fetch, so the runner can be tested end to end without the network.
import { PGlite } from "@electric-sql/pglite";
import { authorized, handle, type Db, type Storage } from "../edge/hub-sync-logic";
import { FILES, FYNOLABS_DATA_SQL, STORAGE_SQL } from "./fynolabs-data";
import { FYNOLABS_SCHEMA_SQL } from "./fynolabs-schema";

export const asDb = (c: PGlite): Db => ({ query: async (text, params = []) => (await c.query<Record<string, unknown>>(text, params as unknown[])).rows });

export async function newFynoLabs(opts: { data?: boolean } = {}): Promise<PGlite> {
  const c = new PGlite();
  await c.waitReady;
  await c.exec(FYNOLABS_SCHEMA_SQL);
  if (opts.data !== false) {
    await c.exec(FYNOLABS_DATA_SQL);
    await c.exec(STORAGE_SQL);
  }
  return c;
}

export function fakeStorage(files = FILES): Storage & { downloads: number } {
  const s = {
    downloads: 0,
    async download(bucket: string, name: string) {
      const f = files.find((x) => x.bucket === bucket && x.name === name);
      s.downloads++;
      return f ? new TextEncoder().encode(f.body) : null;
    },
  };
  return s;
}

export const SYNC_URL = "https://fyno.example/functions/v1/hub-sync";
export const TOKEN = "test-token-0123456789abcdef0123456789";

/** fetch() for the runner: checks the token like index.ts, then calls the real handler. */
export function fakeEdge(src: PGlite, hub: PGlite, storage = fakeStorage(), opts: { secret?: string; budgetMs?: number; calls?: string[] } = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    opts.calls?.push(`${init?.method ?? "GET"} ${url.searchParams.get("op")}${url.searchParams.get("table") ? `:${url.searchParams.get("table")}` : ""}`);
    if (!(await authorized(headers.get("x-hub-sync-token"), opts.secret ?? TOKEN))) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const out = await handle(url, init?.method ?? "GET", { src: asDb(src), hub: asDb(hub), storage, budgetMs: opts.budgetMs });
    return new Response(JSON.stringify(out.body), { status: out.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

/** Every op the runner would call: tables, copy for each table until done, storage until done. */
export async function copyEverything(src: PGlite, hub: PGlite, storage = fakeStorage()) {
  const deps = { src: asDb(src), hub: asDb(hub), storage };
  const t = await handle(new URL(`${SYNC_URL}?op=tables`), "GET", deps);
  const tables = (t.body.tables as { table: string; rows: number }[]).filter((x) => x.table !== "storage_objects");
  const results: Record<string, unknown>[] = [];
  for (const { table } of tables) {
    let cursor: string | null = null;
    do {
      const r = await handle(new URL(`${SYNC_URL}?op=copy&table=${table}${cursor ? `&cursor=${cursor}` : ""}`), "POST", deps);
      if (r.status !== 200) throw new Error(`copy ${table}: ${JSON.stringify(r.body)}`);
      results.push(r.body);
      cursor = (r.body.next_cursor as string | null) ?? null;
    } while (cursor);
  }
  let cursor: string | null = null;
  do {
    const r = await handle(new URL(`${SYNC_URL}?op=storage${cursor ? `&cursor=${cursor}` : ""}`), "POST", deps);
    if (r.status !== 200) throw new Error(`storage: ${JSON.stringify(r.body)}`);
    results.push(r.body);
    cursor = (r.body.next_cursor as string | null) ?? null;
  } while (cursor);
  return { tables: t.body.tables as { table: string; rows: number }[], results };
}
