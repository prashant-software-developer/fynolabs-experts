// npm run db:seed: (re)creates the LOCAL demo database in .data/pglite. Never touches a real one.
//   npm run db:seed            add demo data if the local database is empty
//   npm run db:seed -- --reset wipe the local database first
// Stop `npm run dev` first: two programs must not open the same local database at once.
import { rmSync } from "node:fs";
import { loadEnv } from "./_env";

loadEnv();

async function main() {
  if (process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL is set. Demo data is for the local database only (unset DATABASE_URL).");
    process.exit(1);
  }
  const { localDataDir } = await import("../src/db/client");
  const dir = localDataDir();
  if (process.argv.includes("--reset")) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`Removed ${dir}`);
  }
  const { openLocalDbWithClient } = await import("../src/db/local/open");
  const { seedIfEmpty } = await import("../src/db/local/seed");
  const { seedJobsIfEmpty } = await import("../src/db/local/seed-jobs");
  const { db, client } = await openLocalDbWithClient({ dataDir: dir, seed: false });
  const added = await seedIfEmpty(db);
  const jobsAdded = await seedJobsIfEmpty(db);
  await client.close();
  if (added) console.log("Demo data added (all fictional).");
  else if (jobsAdded) console.log("Demo jobs and applications added to the existing demo data (all fictional).");
  else console.log("The local database already has demo data; nothing added. Use --reset to start over.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
