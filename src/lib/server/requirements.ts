import { and, arrayOverlaps, asc, desc, eq, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { experts, partners, requirements, submissions, type Requirement } from "@/db/schema";
import { normalizeSkill } from "@/lib/match/dictionary";
import { rankCandidates, type MatchExpert, type MatchRequirement } from "@/lib/match/score";
import { requirementStatusAfter } from "@/lib/workflow";
import { logActivity } from "./activity";
import { isUuid } from "./experts";

export async function getRequirement(db: DB, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ req: requirements, partner: partners })
    .from(requirements)
    .innerJoin(partners, eq(partners.id, requirements.partnerId))
    .where(eq(requirements.id, id))
    .limit(1);
  return row ?? null;
}

export async function listRequirements(db: DB, f: { status?: string; partnerId?: string } = {}) {
  const conds: SQL[] = [];
  if (f.status === "active") conds.push(inArray(requirements.status, ["open", "filling"]));
  else if (f.status) conds.push(eq(requirements.status, f.status));
  if (f.partnerId && isUuid(f.partnerId)) conds.push(eq(requirements.partnerId, f.partnerId));
  const rows = await db
    .select({
      req: requirements,
      partnerName: partners.name,
      total: sql<number>`(select count(*) from ${submissions} s where s.requirement_id = ${requirements.id})`.mapWith(Number),
      filled: sql<number>`(select count(*) from ${submissions} s where s.requirement_id = ${requirements.id} and s.status in ('approved','active'))`.mapWith(Number),
      sent: sql<number>`(select count(*) from ${submissions} s where s.requirement_id = ${requirements.id} and s.status in ('submitted','partner_review'))`.mapWith(Number),
    })
    .from(requirements)
    .innerJoin(partners, eq(partners.id, requirements.partnerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`case ${requirements.status} when 'open' then 0 when 'filling' then 1 when 'filled' then 2 else 3 end`, asc(requirements.deadline), desc(requirements.createdAt));
  return rows;
}

export function toMatchRequirement(r: Requirement): MatchRequirement {
  return {
    mustSkills: r.mustSkills,
    niceSkills: r.niceSkills,
    domains: r.domains,
    degrees: r.degrees,
    countriesAllowed: r.countriesAllowed,
    countriesBlocked: r.countriesBlocked,
    minYears: r.minYears,
  };
}

export const matchColumns = {
  id: experts.id,
  fullName: experts.fullName,
  email: experts.email,
  skills: experts.skills,
  headline: experts.headline,
  fieldOfStudy: experts.fieldOfStudy,
  domain: experts.domain,
  highestDegree: experts.highestDegree,
  yearsExperience: experts.yearsExperience,
  country: experts.country,
  region: experts.region,
  city: experts.city,
  availability: experts.availability,
  status: experts.status,
  cvConsent: experts.cvConsent,
};
export type MatchExpertRow = MatchExpert & { email: string | null; city: string | null };

/**
 * Shortlist suggestions. SQL narrows the field to plausible people (shares a skill, the domain,
 * or mentions a skill in their headline; never do-not-contact / inactive; not already on this
 * requirement). TypeScript then scores and explains each one (src/lib/match/score.ts).
 */
export async function candidatesFor(db: DB, r: Requirement, opts: { limit?: number } = {}) {
  const skills = [...new Set([...r.mustSkills, ...r.niceSkills].map(normalizeSkill))].filter(Boolean);
  const conds: SQL[] = [
    notInArray(experts.status, ["do_not_contact", "inactive"]),
    sql`not exists (select 1 from ${submissions} s where s.requirement_id = ${r.id} and s.expert_id = ${experts.id})`,
  ];
  const relevance: SQL[] = [];
  if (skills.length) relevance.push(arrayOverlaps(experts.skills, skills));
  if (r.domains.length) relevance.push(inArray(experts.domain, r.domains));
  for (const s of skills.slice(0, 12)) relevance.push(ilike(experts.headline, `%${s.replace(/[\\%_]/g, "")}%`));
  for (const d of r.domains) relevance.push(ilike(experts.fieldOfStudy, `%${d.replace(/s$/i, "").replace(/[\\%_]/g, "")}%`));
  if (relevance.length) conds.push(or(...relevance)!);
  const pool = (await db.select(matchColumns).from(experts).where(and(...conds)).limit(3000)) as MatchExpertRow[];
  const { ranked, excluded } = rankCandidates(toMatchRequirement(r), pool);
  return { pool: pool.length, ranked: ranked.slice(0, opts.limit ?? 40), excluded: excluded.slice(0, 50), excludedTotal: excluded.length };
}

/** Moves the requirement between open / filling / filled based on its submissions. */
export async function refreshRequirementStatus(db: DB, requirementId: string, actor: string) {
  const [r] = await db.select({ status: requirements.status, slots: requirements.slots }).from(requirements).where(eq(requirements.id, requirementId));
  if (!r) return;
  const statuses = (await db.select({ s: submissions.status }).from(submissions).where(eq(submissions.requirementId, requirementId))).map((x) => x.s);
  const next = requirementStatusAfter({ current: r.status, slots: r.slots, statuses });
  if (next) {
    await db.update(requirements).set({ status: next, updatedAt: new Date() }).where(eq(requirements.id, requirementId));
    await logActivity(db, { entityType: "requirement", entityId: requirementId, actor, action: "status_changed", detail: { from: r.status, to: next, automatic: true } });
  }
}

export async function listPartners(db: DB) {
  return db.select().from(partners).orderBy(asc(partners.name));
}

export async function findOrCreatePartner(db: DB, name: string, actor: string): Promise<string> {
  const clean = name.trim().slice(0, 120);
  const [existing] = await db.select({ id: partners.id }).from(partners).where(sql`lower(${partners.name}) = ${clean.toLowerCase()}`).limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(partners).values({ name: clean, kind: "data_partner" }).returning({ id: partners.id });
  await logActivity(db, { entityType: "partner", entityId: row.id, actor, action: "created" });
  return row.id;
}
