// Opening the two databases for the copy (src/lib/server/db-connect: TCP first, Neon WebSocket as
// the fallback). Engine: one connection to the direct host (no pooler: one long read-only
// snapshot). Target: a pool of one connection, used by Drizzle and the raw statements alike. pglite:<folder> addresses (local PGlite) for --local-test.
import { mkdirSync } from "node:fs";
import type { DB } from "@/db/client";
import { directUrl, parseDbUrl } from "./env";
import type { SqlRunner } from "./source";

export type TargetConn = { db: DB; raw: SqlRunner; via?: "tcp" | "websocket"; note?: string; migrate: () => Promise<void>; close: () => Promise<void> };
export type SourceConn = { raw: SqlRunner; via?: "tcp" | "websocket"; note?: string; close: () => Promise<void> };

export async function openTarget(url: string): Promise<TargetConn> {
  const ref = parseDbUrl(url);
  if (!ref) throw new Error("DATABASE_URL isn't a database address.");
  if (ref.kind === "pglite") {
    mkdirSync(ref.dir, { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const { assertMigrationsSafe } = await import("@/lib/server/migrate");
    const { MIGRATIONS } = await import("@/db/local/open");
    const schema = await import("@/db/schema");
    const client = new PGlite(ref.dir);
    await client.waitReady;
    return {
      db: drizzle({ client, schema }) as unknown as DB,
      raw: client as unknown as SqlRunner,
      migrate: async () => {
        assertMigrationsSafe();
        await migrate(drizzle({ client }), MIGRATIONS);
      },
      close: () => client.close(),
    };
  }
  const { migrateOpened } = await import("@/lib/server/migrate");
  const { openPool } = await import("@/lib/server/db-connect");
  const schema = await import("@/db/schema");
  const conn = await openPool(url, 1);
  const drizzleMod = conn.via === "tcp" ? await import("drizzle-orm/node-postgres") : await import("drizzle-orm/neon-serverless");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (drizzleMod.drizzle as any)({ client: conn.pool, schema }) as DB;
  return {
    db,
    raw: conn.pool as unknown as SqlRunner,
    via: conn.via,
    note: conn.note,
    migrate: () => migrateOpened(conn),
    close: () => conn.pool.end(),
  };
}

export async function openSource(url: string): Promise<SourceConn> {
  const ref = parseDbUrl(url);
  if (!ref) throw new Error("Engine's address isn't a database address.");
  if (ref.kind === "pglite") {
    const { PGlite } = await import("@electric-sql/pglite");
    const client = new PGlite(ref.dir);
    await client.waitReady;
    return { raw: client as unknown as SqlRunner, close: () => client.close() };
  }
  const { openClient } = await import("@/lib/server/db-connect");
  const conn = await openClient(directUrl(url));
  return { raw: conn.client as unknown as SqlRunner, via: conn.via, note: conn.note, close: () => conn.client.end() };
}
