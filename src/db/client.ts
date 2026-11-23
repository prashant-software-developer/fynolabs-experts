// One database handle for the whole app: Neon Postgres over HTTP, at DATABASE_URL (the Neon project
// "expert-hub"). There is no other environment. Without DATABASE_URL the middleware shows the
// "Database not set up" page instead of the app (src/app/db-not-set-up).
// Automated tests open PGlite (a real Postgres inside Node) themselves through src/db/local/open.ts.
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { testDbDir } from "./env";

export { databaseConfigured, testDbDir } from "./env";

export type Schema = typeof schema;
export type DB = PgDatabase<PgQueryResultHKT, Schema>;

type Holder = { __expertHubDb?: Promise<DB> };
const g = globalThis as Holder;

export class DatabaseNotSetUp extends Error {
  constructor() {
    super("DATABASE_URL is not set. Put the expert-hub connection string in .env.local (see docs/DEPLOY.md).");
    this.name = "DatabaseNotSetUp";
  }
}

export function getDb(): Promise<DB> {
  if (!g.__expertHubDb) {
    g.__expertHubDb = createDb().catch((err) => {
      g.__expertHubDb = undefined;
      throw err;
    });
  }
  return g.__expertHubDb;
}

async function createDb(): Promise<DB> {
  const url = (process.env.DATABASE_URL ?? "").trim();
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle({ client: neon(url), schema }) as unknown as DB;
  }
  const dir = testDbDir();
  if (dir) {
    const { openLocalDb } = await import("./local/open");
    return openLocalDb({ dataDir: dir });
  }
  if (process.env.NODE_ENV === "production" && process.env.HUB_TEST_DB) console.error("[expert-hub] HUB_TEST_DB is a test-only switch and is refused in production.");
  throw new DatabaseNotSetUp();
}

/** Rows from db.execute(), which returns a slightly different shape per driver. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = (result as { rows?: unknown[] } | null)?.rows;
  return (r ?? []) as T[];
}
