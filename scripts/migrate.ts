// npm run db:migrate: applies drizzle/*.sql to DATABASE_URL. Only ever touches the `hub` schema.
// Refuses unless DATABASE_URL is set AND CONFIRM_DB=yes, and refuses any migration that reaches
// outside `hub` (the Engine database is shared with other apps).
import { loadEnv, requireConfirm } from "./_env";
import { checkMigrationsFolder } from "../src/lib/migration-guard";

loadEnv();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Locally you don't need this: `npm run dev` migrates the built-in database by itself.");
    process.exit(1);
  }
  const url = requireConfirm("Migrations");
  const problems = checkMigrationsFolder();
  if (problems.length) {
    console.error("Refusing: these statements reach outside the hub schema:");
    for (const p of problems) console.error(`  ${p.file}: ${p.reason}\n    ${p.statement}`);
    process.exit(1);
  }
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle", migrationsSchema: "hub", migrationsTable: "__drizzle_migrations" });
    console.log("Migrations applied (schema hub).");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
