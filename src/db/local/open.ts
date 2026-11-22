// Opens the local PGlite database, runs migrations and (optionally) adds demo data.
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

export async function openLocalDbWithClient(opts: { dataDir?: string; seed?: boolean }): Promise<LocalDb> {
  if (opts.dataDir) mkdirSync(opts.dataDir, { recursive: true });
  const client = opts.dataDir ? new PGlite(opts.dataDir) : new PGlite();
  await client.waitReady;
  await client.exec(JOBS_STUB_SQL);
  const db = drizzle({ client, schema }) as unknown as DB;
  await migrate(drizzle({ client }), MIGRATIONS);
  if (opts.seed) {
    const { seedIfEmpty } = await import("./seed");
    await seedIfEmpty(db);
  }
  if (opts.dataDir && process.env.NODE_ENV !== "test") {
    console.info(`[expert-hub] Using the local PGlite database in ${opts.dataDir} (DATABASE_URL is not set).`);
  }
  return { db, client };
}

export async function openLocalDb(opts: { dataDir?: string; seed?: boolean }): Promise<DB> {
  return (await openLocalDbWithClient(opts)).db;
}
