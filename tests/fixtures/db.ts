// The test database: an in-memory PGlite with every migration, optionally filled with the
// fictional test data (experts, partners, requirements, five jobs and their applications).
import { openLocalDbWithClient, type LocalDb } from "@/db/local/open";
import { seedIfEmpty } from "./demo-data";
import { seedJobsIfEmpty } from "./demo-jobs";

export async function openTestDb(opts: { demo?: boolean; jobsStub?: boolean } = {}): Promise<LocalDb> {
  const local = await openLocalDbWithClient({ jobsStub: opts.jobsStub ?? true });
  if (opts.demo) {
    await seedIfEmpty(local.db);
    await seedJobsIfEmpty(local.db);
  }
  return local;
}
