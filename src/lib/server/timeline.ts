// An expert's timeline (hub.expert_activities): notes, emails, stage changes, applications,
// documents, referrals, consent. Written by job forms, the portal, status changes and the FynoLabs
// sync; shown on the profile's Activity tab.
import { desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { expertActivities, experts, teamMembers } from "@/db/schema";
import { isUuid } from "./experts";

export async function timelineFor(db: DB, expertId: string, limit = 100) {
  if (!isUuid(expertId)) return [];
  return db
    .select({ id: expertActivities.id, kind: expertActivities.kind, summary: expertActivities.summary, detail: expertActivities.detail, happenedAt: expertActivities.happenedAt, createdBy: expertActivities.createdBy })
    .from(expertActivities)
    .where(eq(expertActivities.expertId, expertId))
    .orderBy(desc(expertActivities.happenedAt))
    .limit(limit);
}

/** A team member's name (owners of experts, companies and pipelines). */
export async function teamMemberName(db: DB, id: string | null | undefined): Promise<string | null> {
  if (!id || !isUuid(id)) return null;
  const [m] = await db.select({ name: teamMembers.name, email: teamMembers.email }).from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
  return m ? (m.name ?? m.email) : null;
}

/** The day-to-day fields the FynoLabs admin keeps on an expert (owner, outreach, next action, source...). */
export async function crmFieldsFor(db: DB, expertId: string) {
  if (!isUuid(expertId)) return null;
  const [r] = await db
    .select({
      ownerTeamMemberId: experts.ownerTeamMemberId,
      outreachStatus: experts.outreachStatus,
      nextAction: experts.nextAction,
      nextActionDue: experts.nextActionDue,
      lastActivityAt: experts.lastActivityAt,
      location: experts.location,
      timezone: experts.timezone,
      seniority: experts.seniority,
      links: experts.links,
      sourceChannel: experts.sourceChannel,
      sourceDetail: experts.sourceDetail,
      dncReason: experts.dncReason,
      emailOptOut: experts.emailOptOut,
    })
    .from(experts)
    .where(eq(experts.id, expertId))
    .limit(1);
  if (!r) return null;
  return { ...r, ownerName: await teamMemberName(db, r.ownerTeamMemberId) };
}
