import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { experts, partners, requirements, submissions } from "@/db/schema";
import { SENT_TO_PARTNER, isOneOf, SUBMISSION_STATUSES, type SubmissionStatus } from "@/lib/constants";
import { scoreExpert } from "@/lib/match/score";
import { checkSubmissionMove, expertStatusAfter } from "@/lib/workflow";
import { actorEmail, logActivity, type Actor } from "./activity";
import { isUuid } from "./experts";
import { matchColumns, refreshRequirementStatus, toMatchRequirement, type MatchExpertRow } from "./requirements";

/** Adds experts to a requirement as "shortlisted", with their match score at that moment. */
export async function addToRequirement(db: DB, requirementId: string, expertIds: string[], actor: Actor) {
  const ids = [...new Set(expertIds.filter(isUuid))].slice(0, 200);
  const [req] = await db.select().from(requirements).where(eq(requirements.id, requirementId)).limit(1);
  if (!req) return { added: 0, already: 0, blocked: [] as string[], error: "Requirement not found." };
  if (!ids.length) return { added: 0, already: 0, blocked: [], error: "Select at least one expert." };
  const people = (await db.select(matchColumns).from(experts).where(inArray(experts.id, ids))) as MatchExpertRow[];
  let added = 0;
  let already = 0;
  const blocked: string[] = [];
  for (const p of people) {
    if (p.status === "do_not_contact") {
      blocked.push(`${p.fullName} (do not contact)`);
      continue;
    }
    const { score } = scoreExpert(toMatchRequirement(req), p);
    const [row] = await db
      .insert(submissions)
      .values({ requirementId, expertId: p.id, status: "shortlisted", score, createdBy: actorEmail(actor) })
      .onConflictDoNothing()
      .returning({ id: submissions.id });
    if (!row) {
      already++;
      continue;
    }
    added++;
    await logActivity(db, { entityType: "submission", entityId: row.id, actor, action: "shortlisted", detail: { requirementId, expertId: p.id, score } });
  }
  return { added, already, blocked, error: null as string | null };
}

export type MoveResult = { ok: true; changed: boolean } | { ok: false; reason: string };

export async function moveSubmission(
  db: DB,
  input: { id: string; to: string; partnerNote?: string | null; internalNote?: string | null; actor: Actor },
): Promise<MoveResult> {
  if (!isUuid(input.id) || !isOneOf(SUBMISSION_STATUSES, input.to)) return { ok: false, reason: "Unknown submission or status." };
  const [row] = await db
    .select({ sub: submissions, fullName: experts.fullName, cvConsent: experts.cvConsent, expertStatus: experts.status })
    .from(submissions)
    .innerJoin(experts, eq(experts.id, submissions.expertId))
    .where(eq(submissions.id, input.id))
    .limit(1);
  if (!row) return { ok: false, reason: "Submission not found." };
  const to = input.to as SubmissionStatus;
  const check = checkSubmissionMove({ from: row.sub.status, to, cvConsent: row.cvConsent, expertStatus: row.expertStatus, expertName: row.fullName });
  if (!check.ok) return check;

  const now = new Date();
  const patch: Partial<typeof submissions.$inferInsert> = { updatedAt: now };
  const statusChanged = row.sub.status !== to;
  if (statusChanged) patch.status = to;
  if (statusChanged && (SENT_TO_PARTNER as readonly string[]).includes(to) && !row.sub.submittedAt) patch.submittedAt = now;
  const notesChanged: string[] = [];
  if (input.partnerNote !== undefined && (input.partnerNote ?? null) !== (row.sub.partnerNote ?? null)) {
    patch.partnerNote = input.partnerNote;
    notesChanged.push("partner_note");
  }
  if (input.internalNote !== undefined && (input.internalNote ?? null) !== (row.sub.internalNote ?? null)) {
    patch.internalNote = input.internalNote;
    notesChanged.push("internal_note");
  }
  if (!statusChanged && !notesChanged.length) return { ok: true, changed: false };
  await db.update(submissions).set(patch).where(eq(submissions.id, input.id));
  await logActivity(db, {
    entityType: "submission",
    entityId: input.id,
    actor: input.actor,
    action: statusChanged ? "status_changed" : "notes_changed",
    detail: { requirementId: row.sub.requirementId, expertId: row.sub.expertId, ...(statusChanged ? { from: row.sub.status, to } : {}), ...(notesChanged.length ? { fields: notesChanged } : {}) },
  });
  if (statusChanged) {
    const next = expertStatusAfter(row.expertStatus, to);
    if (next && next !== row.expertStatus) {
      await db.update(experts).set({ status: next, updatedAt: now, ...(to === "submitted" ? { lastContactedAt: now } : {}) }).where(eq(experts.id, row.sub.expertId));
      await logActivity(db, { entityType: "expert", entityId: row.sub.expertId, actor: input.actor, action: "status_changed", detail: { from: row.expertStatus, to: next, because: `submission ${to}` } });
    }
    await refreshRequirementStatus(db, row.sub.requirementId, input.actor);
  }
  return { ok: true, changed: true };
}

export async function listSubmissions(
  db: DB,
  f: { requirementId?: string; expertId?: string; partnerId?: string; status?: string; limit?: number; partnerScope?: string[] | null },
) {
  const conds: SQL[] = [];
  // Pod leads: only their partners (an empty scope shows nothing).
  if (f.partnerScope) conds.push(f.partnerScope.length ? inArray(requirements.partnerId, f.partnerScope) : sql`false`);
  if (f.requirementId && isUuid(f.requirementId)) conds.push(eq(submissions.requirementId, f.requirementId));
  if (f.expertId && isUuid(f.expertId)) conds.push(eq(submissions.expertId, f.expertId));
  if (f.partnerId && isUuid(f.partnerId)) conds.push(eq(requirements.partnerId, f.partnerId));
  if (f.status === "waiting") conds.push(inArray(submissions.status, ["submitted", "partner_review"]));
  else if (f.status && isOneOf(SUBMISSION_STATUSES, f.status)) conds.push(eq(submissions.status, f.status));
  return db
    .select({
      sub: submissions,
      expertName: experts.fullName,
      expertEmail: experts.email,
      expertCountry: experts.country,
      cvConsent: experts.cvConsent,
      expertStatus: experts.status,
      reqTitle: requirements.title,
      reqStatus: requirements.status,
      partnerId: partners.id,
      partnerName: partners.name,
    })
    .from(submissions)
    .innerJoin(experts, eq(experts.id, submissions.expertId))
    .innerJoin(requirements, eq(requirements.id, submissions.requirementId))
    .innerJoin(partners, eq(partners.id, requirements.partnerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(
      sql`case ${submissions.status} when 'partner_review' then 0 when 'submitted' then 1 when 'approved' then 2 when 'consent_requested' then 3 when 'shortlisted' then 4 when 'active' then 5 else 6 end`,
      desc(submissions.score),
      asc(experts.fullName),
    )
    .limit(f.limit ?? 500);
}
export type SubmissionListRow = Awaited<ReturnType<typeof listSubmissions>>[number];

/** The partner a submission belongs to (through its requirement), for pod-lead scope checks. */
export async function submissionPartnerId(db: DB, submissionId: string): Promise<string | null> {
  if (!isUuid(submissionId)) return null;
  const [row] = await db
    .select({ partnerId: requirements.partnerId })
    .from(submissions)
    .innerJoin(requirements, eq(requirements.id, submissions.requirementId))
    .where(eq(submissions.id, submissionId))
    .limit(1);
  return row?.partnerId ?? null;
}
