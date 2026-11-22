// Applying the hub migrations to a real database (Neon), shared by `npm run db:migrate` and
// `npm run copy:engine`. The guard refuses any migration that reaches outside the `hub` schema.
import { checkMigrationsFolder, type GuardProblem } from "@/lib/migration-guard";

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

type NeonPool = InstanceType<(typeof import("@neondatabase/serverless"))["Pool"]>;

/** Migrates through an open Neon Pool (WebSocket, so the migrations run in one transaction). */
export async function migrateNeonPool(pool: NeonPool): Promise<void> {
  assertMigrationsSafe();
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
  await migrate(drizzle({ client: pool }), MIGRATIONS_CONFIG);
}

export async function neonPool(url: string, max = 1): Promise<NeonPool> {
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  return new Pool({ connectionString: url, max });
}

/** npm run db:migrate. */
export async function migrateNeon(url: string): Promise<void> {
  const pool = await neonPool(url);
  try {
    await migrateNeonPool(pool);
  } finally {
    await pool.end();
  }
}
