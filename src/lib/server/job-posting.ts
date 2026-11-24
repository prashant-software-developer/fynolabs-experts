// The FynoLabs posted-job fields of a hub job (badge, apply link, project and track, "GitHub
// required", the company the post names). Internal: the public page keeps the hub's company label;
// pay unit is money (admins and finance).
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { jobs, projectTracks, projects, radarListings } from "@/db/schema";
import { cleanText } from "@/lib/normalize";
import { JOB_BADGES } from "@/lib/talent";
import { logActivity, type Actor } from "./activity";
import { isUuid } from "./experts";

export const PAY_UNITS = [
  { value: "hour", label: "Per hour" },
  { value: "task", label: "Per approved task" },
  { value: "month", label: "Per month" },
  { value: "project", label: "Per project" },
] as const;

export type PostingInput = { companyName?: unknown; badge?: unknown; applyUrl?: unknown; projectId?: unknown; trackId?: unknown; requireGithub?: boolean; payUnit?: unknown };

export async function jobPosting(db: DB, id: string) {
  if (!isUuid(id)) return null;
  const [r] = await db
    .select({ companyName: jobs.companyName, badge: jobs.badge, applyUrl: jobs.applyUrl, projectId: jobs.projectId, trackId: jobs.trackId, requireGithub: jobs.requireGithub, payUnit: jobs.payUnit, radarListingId: jobs.radarListingId, sourceVisibility: jobs.sourceVisibility, projectCode: projects.code, radarTitle: radarListings.title, radarPlatform: radarListings.platform })
    .from(jobs)
    .leftJoin(projects, eq(projects.id, jobs.projectId))
    .leftJoin(radarListings, eq(radarListings.id, jobs.radarListingId))
    .where(eq(jobs.id, id))
    .limit(1);
  return r ?? null;
}

/** `money`: whether the person may set the pay unit (money); otherwise it is left as it is. */
export async function updateJobPosting(db: DB, actor: Actor, id: string, input: PostingInput, money: boolean) {
  const before = await jobPosting(db, id);
  if (!before) return { ok: false as const, reason: "This job no longer exists." };
  const applyUrl = cleanText(input.applyUrl, 1000);
  if (applyUrl && !/^https:\/\//i.test(applyUrl)) return { ok: false as const, reason: "The apply link must start with https://." };
  const badge = typeof input.badge === "string" && (JOB_BADGES as readonly string[]).includes(input.badge) ? input.badge : null;
  const projectId = typeof input.projectId === "string" && isUuid(input.projectId) ? input.projectId : null;
  let trackId = typeof input.trackId === "string" && isUuid(input.trackId) ? input.trackId : null;
  if (trackId) {
    const [t] = await db.select({ p: projectTracks.projectId }).from(projectTracks).where(eq(projectTracks.id, trackId)).limit(1);
    if (!t || t.p !== projectId) trackId = null;
  }
  const patch: Partial<typeof jobs.$inferInsert> = { companyName: cleanText(input.companyName, 160), badge, applyUrl, projectId, trackId, requireGithub: Boolean(input.requireGithub) };
  if (money) patch.payUnit = typeof input.payUnit === "string" && ["hour", "task", "month", "project"].includes(input.payUnit) ? input.payUnit : null;
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => JSON.stringify((before as Record<string, unknown>)[k] ?? null) !== JSON.stringify(patch[k] ?? null));
  if (!changed.length) return { ok: true as const, changed };
  await db.update(jobs).set({ ...patch, updatedAt: new Date() }).where(eq(jobs.id, id));
  await logActivity(db, { entityType: "job", entityId: id, actor, action: "posting_updated", detail: { fields: changed } });
  return { ok: true as const, changed };
}
