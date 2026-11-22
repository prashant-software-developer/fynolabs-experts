// One database handle for the whole app.
//  - DATABASE_URL set   -> Neon Postgres over HTTP (production, staging branches).
//  - DATABASE_URL unset -> PGlite, a real Postgres running inside Node, stored in .data/pglite
//                          (in memory for tests). Migrated and filled with demo data automatically.
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Schema = typeof schema;
export type DB = PgDatabase<PgQueryResultHKT, Schema>;

type Holder = { __expertHubDb?: Promise<DB>; __expertHubLocal?: boolean };
const g = globalThis as Holder;

export function getDb(): Promise<DB> {
  if (!g.__expertHubDb) {
    g.__expertHubDb = createDb().catch((err) => {
      g.__expertHubDb = undefined;
      throw err;
    });
  }
  return g.__expertHubDb;
}

/** True when the app runs on the built-in local PGlite database (never in production). */
export function isLocalDb(): boolean {
  return !process.env.DATABASE_URL;
}

async function createDb(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle({ client: neon(url), schema }) as unknown as DB;
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DB !== "yes") {
    throw new Error("DATABASE_URL is not set. Production needs a real database (see docs/DEPLOY.md).");
  }
  const { openLocalDb } = await import("./local/open");
  const inMemory = process.env.NODE_ENV === "test";
  return openLocalDb({ dataDir: inMemory ? undefined : localDataDir(), seed: true });
}

export function localDataDir(): string {
  return process.env.PGLITE_DIR || ".data/pglite";
}

/** Rows from db.execute(), which returns a slightly different shape per driver. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = (result as { rows?: unknown[] } | null)?.rows;
  return (r ?? []) as T[];
}
