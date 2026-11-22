// Opening the two databases for the copy. Engine: one Neon connection to the direct host (no
// pooler: one long read-only snapshot). Target: a Neon Pool of one WebSocket connection, used by
// Drizzle and the raw statements alike. pglite:<folder> addresses (local PGlite) for --local-test.
import { mkdirSync } from "node:fs";
import type { DB } from "@/db/client";
import { directUrl, parseDbUrl } from "./env";
import type { SqlRunner } from "./source";

export type TargetConn = { db: DB; raw: SqlRunner; migrate: () => Promise<void>; close: () => Promise<void> };
export type SourceConn = { raw: SqlRunner; close: () => Promise<void> };

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
  const { migrateNeonPool, neonPool } = await import("@/lib/server/migrate");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const schema = await import("@/db/schema");
  const pool = await neonPool(url, 1);
  // A dropped connection fails the statement that was running (reported, scrubbed); don't crash on the event.
  pool.on("error", () => {});
  return {
    db: drizzle({ client: pool, schema }) as unknown as DB,
    raw: pool as unknown as SqlRunner,
    migrate: () => migrateNeonPool(pool),
    close: () => pool.end(),
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
  const { Client, neonConfig } = await import("@neondatabase/serverless");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const client = new Client({ connectionString: directUrl(url) });
  client.on("error", () => {});
  await client.connect();
  return { raw: client as unknown as SqlRunner, close: () => client.end() };
}
