// npm run db:migrate: applies drizzle/*.sql to DATABASE_URL. Only ever touches the `hub` schema.
// Refuses unless DATABASE_URL is set AND CONFIRM_DB=yes, and refuses any migration that reaches
// outside `hub` (the guard in src/lib/migration-guard.ts).
import { loadEnv, requireConfirm } from "./_env";
import { MigrationGuardError, migrateNeon } from "../src/lib/server/migrate";

loadEnv();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Locally you don't need this: `npm run dev` migrates the built-in database by itself.");
    process.exit(1);
  }
  const url = requireConfirm("Migrations");
  try {
    await migrateNeon(url);
  } catch (e) {
    if (e instanceof MigrationGuardError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
  console.log("Migrations applied (schema hub).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
