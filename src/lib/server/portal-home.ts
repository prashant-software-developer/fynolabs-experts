// Expert portal Home (/me) and the frame around every portal page: the expert's name and avatar,
// what needs their attention, their projects (placements), invitations and applications. Every
// function takes the expert id from the signed-in session (src/lib/auth/expert.ts).
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { expertDetails, experts, jobInvites, jobs, partners, placements } from "@/db/schema";
import { partnerNameTerms } from "@/lib/public-copy";
import { logActivity, type Actor } from "./activity";
import { coursesInProgress } from "./learn";
import { completeness, ownCv, ownProfile } from "./portal";
import { documentsToSign } from "./portal-documents";

const PORTAL_ACTOR: Actor = { email: "expert-portal", role: "expert" };
const WEEK = 7 * 24 * 3600 * 1000;

export type PortalFrame = { name: string; avatarUrl: string | null; attention: { documents?: number; profile?: number } };

/** Name, avatar and the to-do counts the rail shows. */
export async function portalFrame(db: DB, expertId: string): Promise<PortalFrame> {
  const [[e], docs] = await Promise.all([
    db
      .select({ name: experts.fullName, avatar: expertDetails.avatarFileId })
      .from(experts)
      .leftJoin(expertDetails, eq(expertDetails.expertId, experts.id))
      .where(eq(experts.id, expertId))
      .limit(1),
    documentsToSign(db, expertId),
  ]);
  return { name: e?.name ?? "", avatarUrl: e?.avatar ? `/api/me/avatar?v=${e.avatar.slice(0, 8)}` : null, attention: { documents: docs.length || undefined } };
}

/** A project name as the expert sees it: never the partner's (client's) name. */
export function projectTitleForExpert(projectName: string, partnerName: string | null): string {
  let out = projectName;
  for (const term of partnerNameTerms(partnerName)) out = out.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "");
  out = out.replace(/^[\s\-–—:·|/]+|[\s\-–—:·|/]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return out || "Project";
}

export type HomeTask = { key: string; due: string | null; title: string; body: string; href: string; cta: string; form?: "confirm-availability" };

/** Everything Home shows. */
export async function homeData(db: DB, expertId: string) {
  const now = Date.now();
  const [profile, cv, docs, learning, details, projectRows, inviteRows] = await Promise.all([
    ownProfile(db, expertId),
    ownCv(db, expertId),
    documentsToSign(db, expertId),
    coursesInProgress(db, expertId),
    db.select({ confirmed: expertDetails.availabilityConfirmedAt, looking: expertDetails.lookingForWork }).from(expertDetails).where(eq(expertDetails.expertId, expertId)).limit(1),
    db
      .select({
        id: placements.id,
        projectName: placements.projectName,
        partnerName: partners.name,
        basis: placements.basis,
        rate: placements.rateToExpert,
        currency: placements.currency,
        status: placements.status,
        startDate: placements.startDate,
        endDate: placements.endDate,
        updatedAt: placements.updatedAt,
      })
      .from(placements)
      .leftJoin(partners, eq(partners.id, placements.partnerId))
      .where(eq(placements.expertId, expertId))
      .orderBy(desc(placements.updatedAt)),
    db
      .select({ id: jobInvites.id, createdAt: jobInvites.createdAt, expiresAt: jobInvites.expiresAt, title: jobs.title, slug: jobs.slug, closesOn: jobs.closesOn })
      .from(jobInvites)
      .innerJoin(jobs, eq(jobs.id, jobInvites.jobId))
      .where(and(eq(jobInvites.expertId, expertId), isNull(jobInvites.applicationId), eq(jobs.status, "open"), or(isNull(jobInvites.expiresAt), sql`${jobInvites.expiresAt} > now()`)))
      .orderBy(desc(jobInvites.createdAt)),
  ]);
  const score = profile ? completeness(profile, Boolean(cv)) : null;
  const tasks: HomeTask[] = [];
  for (const d of docs)
    tasks.push({ key: `doc-${d.ref}`, due: d.dueOn, title: `Sign: ${d.title}`, body: "Read it and sign in the portal. It takes a minute.", href: `/me/documents/${d.ref}`, cta: "Review and sign" });
  if (score && score.percent < 100)
    tasks.push({ key: "profile", due: null, title: "Complete your profile", body: `${score.percent}% done. Still missing: ${score.missing.map((m) => m.label.toLowerCase()).slice(0, 3).join(", ")}${score.missing.length > 3 ? "…" : ""}.`, href: "/me/profile", cta: "Complete profile" });
  const det = details[0];
  const looking = det?.looking ?? true;
  if (looking && (!det?.confirmed || now - det.confirmed.getTime() > WEEK))
    tasks.push({ key: "checkin", due: null, title: "Weekly availability check-in", body: "Confirm your hours are still right, so we match you to projects you can take.", href: "/me/profile?tab=availability", cta: "Confirm", form: "confirm-availability" });
  for (const c of learning.slice(0, 2)) tasks.push({ key: `learn-${c.slug}`, due: null, title: `Continue: ${c.title}`, body: `${c.done} of ${c.total} done.`, href: `/me/learn/${c.slug}`, cta: "Continue" });
  const projects = projectRows.map((p) => ({ ...p, title: projectTitleForExpert(p.projectName, p.partnerName) }));
  return {
    firstName: (profile?.fullName ?? "").split(/\s+/)[0] || "there",
    tasks,
    current: projects.filter((p) => p.status !== "ended"),
    past: projects.filter((p) => p.status === "ended"),
    invites: inviteRows,
  };
}

/** Weekly check-in: the expert confirms their availability is still right. */
export async function confirmAvailability(db: DB, expertId: string) {
  const now = new Date();
  await db.insert(expertDetails).values({ expertId, availabilityConfirmedAt: now, updatedBy: "expert-portal", updatedAt: now }).onConflictDoUpdate({ target: expertDetails.expertId, set: { availabilityConfirmedAt: now, updatedBy: "expert-portal", updatedAt: now } });
  await logActivity(db, { entityType: "expert", entityId: expertId, actor: PORTAL_ACTOR, action: "availability_confirmed" });
}
