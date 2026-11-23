// npm run db:migrate: applies drizzle/*.sql to DATABASE_URL. Only ever touches the `hub` schema.
// Refuses unless DATABASE_URL is set AND CONFIRM_DB=yes, and refuses any migration that reaches
// outside `hub` (the guard in src/lib/migration-guard.ts).
import { loadEnv, requireConfirm } from "./_env";
import { MigrationGuardError, migrateNeon } from "../src/lib/server/migrate";
import { finish } from "./_exit";

loadEnv();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Locally you don't need this: `npm run dev` migrates the built-in database by itself.");
    process.exit(1);
  }
  const url = requireConfirm("Migrations");
  try {
    const done = await migrateNeon(url);
    console.log(done === "up-to-date" ? "The tables are up to date (schema hub)." : "Migrations applied (schema hub).");
  } catch (e) {
    if (e instanceof MigrationGuardError) {
      console.error(e.message);
      return finish(1);
    }
    const { describeError, scrubSecrets } = await import("../src/lib/server/db-connect");
    console.error(`Stopped: ${scrubSecrets(describeError(e), [url])}`);
    return finish(1);
  }
}

main().catch(() => {
  console.error("Stopped with an unexpected error (details hidden: they could include the database address).");
  finish(1);
});
