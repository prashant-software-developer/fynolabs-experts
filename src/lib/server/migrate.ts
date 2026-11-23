// Applying the hub migrations to the real database (Neon), shared by `npm run db:migrate`,
// `npm run admin:create` and `npm run copy:engine`. The guard refuses any migration that reaches
// outside the `hub` schema.
//
// Step 1 asks over HTTPS (the same way the web app talks to Neon) whether anything is pending; if
// not, nothing else is opened. Step 2, only when something is pending, applies it through a
// connection from db-connect (TCP first, Neon WebSocket as the fallback), in one transaction.
import { checkMigrationsFolder, type GuardProblem } from "@/lib/migration-guard";
import { openPool, type OpenedPool } from "./db-connect";

export const MIGRATIONS_CONFIG = { migrationsFolder: "drizzle", migrationsSchema: "hub", migrationsTable: "__drizzle_migrations" } as const;

export class MigrationGuardError extends Error {
  constructor(readonly problems: GuardProblem[]) {
    super(`Refusing: these statements reach outside the hub schema:\n${problems.map((p) => `  ${p.file}: ${p.reason}\n    ${p.statement}`).join("\n")}`);
    this.name = "MigrationGuardError";
  }
}

export function assertMigrationsSafe(): void {
  const problems = checkMigrationsFolder();
  if (problems.length) throw new MigrationGuardError(problems);
}

/** The newest migration in drizzle/ (journal "when"), the same number drizzle stores as created_at. */
export async function latestLocalMigration(): Promise<number> {
  const { readMigrationFiles } = await import("drizzle-orm/migrator");
  const files = readMigrationFiles(MIGRATIONS_CONFIG);
  return files.reduce((m, f) => Math.max(m, f.folderMillis), 0);
}

/**
 * True when the database already has every migration in drizzle/. Asked over HTTPS; any problem
 * (not a Neon address, no table yet, no network) answers false so the normal path runs.
 */
export async function upToDateOverHttp(url: string): Promise<boolean> {
  try {
    const latest = await latestLocalMigration();
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    const rows = (await sql.query(
      `select coalesce(max(created_at), 0)::text as m from "${MIGRATIONS_CONFIG.migrationsSchema}"."${MIGRATIONS_CONFIG.migrationsTable}"`,
    )) as unknown as { m: string }[];
    return Number(rows?.[0]?.m ?? 0) >= latest;
  } catch {
    return false;
  }
}

/** Applies pending migrations through an open connection (node-postgres or Neon WebSocket). */
export async function migrateOpened(conn: OpenedPool): Promise<void> {
  assertMigrationsSafe();
  if (conn.via === "tcp") {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(drizzle({ client: conn.pool as any }), MIGRATIONS_CONFIG);
  } else {
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(drizzle({ client: conn.pool as any }), MIGRATIONS_CONFIG);
  }
}

/** npm run db:migrate (and the first step of admin:create). Returns what it did. */
export async function migrateNeon(url: string): Promise<"up-to-date" | "applied"> {
  assertMigrationsSafe();
  if (await upToDateOverHttp(url)) return "up-to-date";
  const conn = await openPool(url, 1);
  try {
    await migrateOpened(conn);
  } finally {
    await conn.pool.end().catch(() => {});
  }
  return "applied";
}
