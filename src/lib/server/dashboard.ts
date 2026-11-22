import { count, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { experts, partners, placements, requirements, submissions } from "@/db/schema";
import { recentActivity } from "./activity";

export async function dashboardData(db: DB) {
  const [byStatus, openReqs, waiting, active, activity, [{ n: total }]] = await Promise.all([
    db.select({ status: experts.status, n: count() }).from(experts).groupBy(experts.status),
    db
      .select({
        id: requirements.id,
        title: requirements.title,
        status: requirements.status,
        slots: requirements.slots,
        deadline: requirements.deadline,
        partnerName: partners.name,
        filled: sql<number>`(select count(*) from ${submissions} s where s.requirement_id = ${requirements.id} and s.status in ('approved','active'))`.mapWith(Number),
        inPlay: sql<number>`(select count(*) from ${submissions} s where s.requirement_id = ${requirements.id} and s.status in ('shortlisted','consent_requested','submitted','partner_review'))`.mapWith(Number),
      })
      .from(requirements)
      .innerJoin(partners, eq(partners.id, requirements.partnerId))
      .where(inArray(requirements.status, ["open", "filling"]))
      .orderBy(sql`${requirements.deadline} asc nulls last`, desc(requirements.createdAt))
      .limit(20),
    db
      .select({
        id: submissions.id,
        status: submissions.status,
        submittedAt: submissions.submittedAt,
        expertId: experts.id,
        expertName: experts.fullName,
        reqId: requirements.id,
        reqTitle: requirements.title,
        partnerName: partners.name,
      })
      .from(submissions)
      .innerJoin(experts, eq(experts.id, submissions.expertId))
      .innerJoin(requirements, eq(requirements.id, submissions.requirementId))
      .innerJoin(partners, eq(partners.id, requirements.partnerId))
      .where(inArray(submissions.status, ["submitted", "partner_review"]))
      .orderBy(sql`${submissions.submittedAt} asc nulls last`)
      .limit(20),
    db
      .select({ p: placements, expertName: experts.fullName, partnerName: partners.name })
      .from(placements)
      .leftJoin(experts, eq(experts.id, placements.expertId))
      .innerJoin(partners, eq(partners.id, placements.partnerId))
      .where(eq(placements.status, "active"))
      .orderBy(desc(placements.startDate))
      .limit(20),
    recentActivity(db, 15),
    db.select({ n: count() }).from(experts),
  ]);
  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])) as Record<string, number>,
    total: Number(total),
    openReqs,
    waiting,
    active,
    activity,
  };
}
