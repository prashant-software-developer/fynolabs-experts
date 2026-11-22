import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { experts, partners, placements, requirements, submissions } from "@/db/schema";
import { computeMoney } from "@/lib/money";
import { logActivity } from "./activity";
import { isUuid } from "./experts";
import { moveSubmission } from "./submissions";

export type PlacementInput = {
  expertId: string | null;
  partnerId: string;
  submissionId: string | null;
  projectName: string;
  startDate: string | null;
  endDate: string | null;
  basis: "hourly" | "per_task";
  rateToExpert: number | null;
  rateFromPartner: number | null;
  currency: string;
  hoursApproved: number | null;
  tasksAccepted: number | null;
  earnedByExpert: number | null;
  revenue: number | null;
  status: "active" | "paused" | "ended";
  notes: string | null;
};

export async function listPlacements(db: DB, f: { status?: string; partnerId?: string; expertId?: string } = {}) {
  const conds: SQL[] = [];
  if (f.status) conds.push(eq(placements.status, f.status));
  if (f.partnerId && isUuid(f.partnerId)) conds.push(eq(placements.partnerId, f.partnerId));
  if (f.expertId && isUuid(f.expertId)) conds.push(eq(placements.expertId, f.expertId));
  return db
    .select({ p: placements, expertName: experts.fullName, partnerName: partners.name })
    .from(placements)
    .leftJoin(experts, eq(experts.id, placements.expertId))
    .innerJoin(partners, eq(partners.id, placements.partnerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`case ${placements.status} when 'active' then 0 when 'paused' then 1 else 2 end`, desc(placements.startDate));
}
export type PlacementListRow = Awaited<ReturnType<typeof listPlacements>>[number];

export async function getPlacement(db: DB, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ p: placements, expertName: experts.fullName, partnerName: partners.name })
    .from(placements)
    .leftJoin(experts, eq(experts.id, placements.expertId))
    .innerJoin(partners, eq(partners.id, placements.partnerId))
    .where(eq(placements.id, id))
    .limit(1);
  return row ?? null;
}

/** Defaults for a new placement made from an approved submission. */
export async function placementDraftFromSubmission(db: DB, submissionId: string) {
  if (!isUuid(submissionId)) return null;
  const [row] = await db
    .select({ sub: submissions, reqTitle: requirements.title, partnerId: requirements.partnerId, expertName: experts.fullName })
    .from(submissions)
    .innerJoin(requirements, eq(requirements.id, submissions.requirementId))
    .innerJoin(experts, eq(experts.id, submissions.expertId))
    .where(eq(submissions.id, submissionId))
    .limit(1);
  return row ?? null;
}

function withMoney(input: PlacementInput) {
  const m = computeMoney(input);
  return { ...input, earnedByExpert: m.earned, revenue: m.revenue };
}

export async function createPlacement(db: DB, input: PlacementInput, actor: string): Promise<string> {
  const now = new Date();
  const [row] = await db
    .insert(placements)
    .values({ ...withMoney(input), createdBy: actor, createdAt: now, updatedAt: now })
    .returning({ id: placements.id });
  await logActivity(db, { entityType: "placement", entityId: row.id, actor, action: "created", detail: { submissionId: input.submissionId, expertId: input.expertId } });
  if (input.submissionId) {
    const [sub] = await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, input.submissionId));
    if (sub && sub.status === "approved" && input.status === "active") {
      await moveSubmission(db, { id: input.submissionId, to: "active", actor });
    }
  } else if (input.expertId && input.status === "active") {
    const [e] = await db.select({ status: experts.status }).from(experts).where(eq(experts.id, input.expertId));
    if (e && e.status !== "placed" && e.status !== "do_not_contact") {
      await db.update(experts).set({ status: "placed", updatedAt: now }).where(eq(experts.id, input.expertId));
      await logActivity(db, { entityType: "expert", entityId: input.expertId, actor, action: "status_changed", detail: { from: e.status, to: "placed", because: "placement created" } });
    }
  }
  return row.id;
}

export async function updatePlacement(db: DB, id: string, input: PlacementInput, actor: string) {
  const before = await getPlacement(db, id);
  if (!before) return false;
  const next = withMoney(input);
  const changed = Object.keys(next).filter((k) => {
    const a = (before.p as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    return String(a ?? "") !== String(b ?? "");
  });
  await db.update(placements).set({ ...next, updatedAt: new Date() }).where(eq(placements.id, id));
  await logActivity(db, { entityType: "placement", entityId: id, actor, action: "updated", detail: { fields: changed } });
  if (before.p.status !== "ended" && input.status === "ended" && before.p.submissionId) {
    const [sub] = await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, before.p.submissionId));
    if (sub?.status === "active") await moveSubmission(db, { id: before.p.submissionId, to: "ended", actor });
  }
  return true;
}
