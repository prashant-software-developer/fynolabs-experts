// PGlite (a real Postgres inside Node) for the automated tests and local smoke tests only: opens
// a database in memory or in a folder and runs the migrations. Never used with DATABASE_URL set.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../schema";
import type { DB } from "../client";
import { JOBS_STUB_SQL } from "./jobs-stub";

export const MIGRATIONS = {
  migrationsFolder: path.join(process.cwd(), "drizzle"),
  migrationsSchema: "hub",
  migrationsTable: "__drizzle_migrations",
};

export type LocalDb = { db: DB; client: PGlite };

/** `jobsStub`: also create an empty copy of the old jobs site's tables (tests of the jobs-site import). */
export async function openLocalDbWithClient(opts: { dataDir?: string; jobsStub?: boolean } = {}): Promise<LocalDb> {
  if (opts.dataDir) mkdirSync(opts.dataDir, { recursive: true });
  const client = opts.dataDir ? new PGlite(opts.dataDir) : new PGlite();
  await client.waitReady;
  if (opts.jobsStub) await client.exec(JOBS_STUB_SQL);
  const db = drizzle({ client, schema }) as unknown as DB;
  await migrate(drizzle({ client }), MIGRATIONS);
  return { db, client };
}

export async function openLocalDb(opts: { dataDir?: string } = {}): Promise<DB> {
  return (await openLocalDbWithClient(opts)).db;
}
