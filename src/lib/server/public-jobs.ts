// Loading a job for its public page: hidden jobs (draft, internal) are a 404 for everyone except
// the team, who see a preview banner.
import type { DB } from "@/db/client";
import type { Job } from "@/db/schema";
import type { Account } from "@/lib/auth/session";
import { publicState, type PublicState } from "@/lib/jobs-public";
import { getJobBySlug } from "./jobs";

export type PageJob = { job: Job; state: PublicState; preview: boolean };

export async function jobForPage(db: DB, slug: string, account: Account | null): Promise<PageJob | null> {
  const job = await getJobBySlug(db, slug);
  if (!job) return null;
  const state = publicState(job);
  if (state === "hidden") {
    if (account?.kind === "team" && !account.user.blocked) return { job, state, preview: true };
    return null;
  }
  return { job, state, preview: false };
}
