// The dashboard's CRM and operations numbers (FynoLabs Admin.tsx): companies by stage, next steps
// due, applications by stage and per day, today's calendar, open messages, visitors.
import { and, count, eq, gte, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, contacts, experts, messages, partners, platforms, referrals } from "@/db/schema";
import { COMPANY_STAGES, PIPELINE_STAGES } from "@/lib/constants";
import { addDays } from "@/lib/crm/dates";
import { PARKED } from "@/lib/crm/labels";
import { countByDay, visitors30 } from "./analytics";
import { openMessageCount } from "./messages";

export async function crmDashboard(db: DB, today: string) {
  const start30 = addDays(today, -29);
  const [byStage, due, contactsDue, appsByStage, apps30, openMsgs, visitors] = await Promise.all([
    db.select({ stage: partners.stage, n: count() }).from(partners).groupBy(partners.stage),
    db
      .select({ id: partners.id, name: partners.name, nextStep: partners.nextStep, due: partners.nextStepDue, stage: partners.stage, ownerName: partners.ownerName, owner: sql<string | null>`(select coalesce(m.name, m.email) from hub.team_members m where m.id = ${partners.ownerTeamMemberId})` })
      .from(partners)
      .where(and(isNotNull(partners.nextStepDue), lte(partners.nextStepDue, today), notInArray(partners.stage, [...PARKED])))
      .orderBy(partners.nextStepDue, partners.name)
      .limit(10),
    db
      .select({ id: contacts.id, name: contacts.name, due: contacts.nextFollowUp, company: sql<string | null>`coalesce((select p.name from hub.partners p where p.id = ${contacts.companyId}), ${contacts.company})` })
      .from(contacts)
      .where(and(isNotNull(contacts.nextFollowUp), lte(contacts.nextFollowUp, today), notInArray(contacts.stage, ["won", "lost"])))
      .orderBy(contacts.nextFollowUp, contacts.name)
      .limit(10),
    db.select({ stage: applications.stage, n: count() }).from(applications).groupBy(applications.stage),
    db.select({ at: applications.createdAt }).from(applications).where(gte(applications.createdAt, new Date(`${start30}T00:00:00Z`))),
    openMessageCount(db),
    visitors30(db, today),
  ]);
  const stageCounts = Object.fromEntries(COMPANY_STAGES.map((s) => [s, 0])) as Record<string, number>;
  for (const r of byStage) stageCounts[r.stage] = Number(r.n);
  const appCounts = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0])) as Record<string, number>;
  for (const r of appsByStage) appCounts[r.stage] = Number(r.n);
  const pipeline = COMPANY_STAGES.filter((s) => !(PARKED as readonly string[]).includes(s)).reduce((n, s) => n + stageCounts[s], 0);
  return {
    companiesByStage: stageCounts,
    companiesInPipeline: pipeline,
    nextStepsDue: due,
    followUpsDue: contactsDue,
    applicationsByStage: appCounts,
    inJobPipeline: PIPELINE_STAGES.filter((s) => s !== "rejected" && s !== "ended").reduce((n, s) => n + appCounts[s], 0),
    applicationsPerDay: countByDay(apps30.map((a) => a.at), start30, today),
    openMessages: openMsgs,
    visitors30: visitors,
  };
}

/** Referrals per day: the most-used platforms get their own series, the rest are "Other" (FynoLabs AdminDashboard). */
export function referralSeries(rows: { at: Date; platform: string | null }[], start: string, end: string, top = 4) {
  const days = countByDay([], start, end).map((d) => d.day);
  const inWindow = rows.filter((r) => {
    const d = r.at.toISOString().slice(0, 10);
    return d >= start && d <= end;
  });
  const byPlatform = new Map<string, number>();
  for (const r of inWindow) {
    const name = r.platform?.trim() || "Other";
    byPlatform.set(name, (byPlatform.get(name) ?? 0) + 1);
  }
  const named = [...byPlatform.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n).filter((n) => n !== "Other").slice(0, top);
  const series = [...byPlatform.keys()].some((n) => !named.includes(n)) ? [...named, "Other"] : named;
  const perDay = days.map((day) => Object.fromEntries([["day", day], ...series.map((s) => [s, 0])])) as ({ day: string } & Record<string, number | string>)[];
  const index = new Map(days.map((d, i) => [d, i]));
  for (const r of inWindow) {
    const row = perDay[index.get(r.at.toISOString().slice(0, 10)) ?? -1];
    if (!row) continue;
    const name = named.includes(r.platform?.trim() ?? "") ? (r.platform as string).trim() : "Other";
    row[name] = Number(row[name] ?? 0) + 1;
  }
  return { series, perDay, total: inWindow.length };
}

/** The FynoLabs dashboard's eight tiles and three 30-day charts, as numbers and dates only. */
export async function dashboardKpis(db: DB, today: string) {
  const start30 = addDays(today, -29);
  const since = new Date(`${start30}T00:00:00Z`);
  const [[ex], [applicants], [active], [plat], [refs], pipes, apps30, msgs30, refs30, openMsgs, visitors] = await Promise.all([
    db.select({ n: count() }).from(experts),
    db.select({ n: count() }).from(experts).where(eq(experts.status, "applicant")),
    db.select({ n: count() }).from(experts).where(eq(experts.status, "placed")),
    db.select({ n: count() }).from(platforms),
    db.select({ n: count() }).from(referrals),
    db.select({ n: count() }).from(applications).where(notInArray(applications.stage, ["rejected", "ended"])),
    db.select({ at: applications.createdAt }).from(applications).where(gte(applications.createdAt, since)),
    db.select({ at: messages.createdAt }).from(messages).where(gte(messages.createdAt, since)),
    db.select({ at: referrals.sentAt, platform: sql<string | null>`coalesce((select p.name from hub.platforms p where p.id = ${referrals.platformId}), ${referrals.platform})` }).from(referrals).where(gte(referrals.sentAt, since)),
    openMessageCount(db),
    visitors30(db, today),
  ]);
  const appsByDay = countByDay(apps30.map((a) => a.at), start30, today);
  const msgsByDay = countByDay(msgs30.map((m) => m.at), start30, today);
  const refSeries = referralSeries(refs30.map((r) => ({ at: r.at, platform: r.platform })), start30, today);
  return {
    experts: Number(ex?.n ?? 0),
    newToReview: Number(applicants?.n ?? 0),
    inJobPipeline: Number(pipes[0]?.n ?? 0),
    activeExperts: Number(active?.n ?? 0),
    platforms: Number(plat?.n ?? 0),
    openMessages: openMsgs,
    referrals: Number(refs?.n ?? 0),
    visitors30: visitors,
    perDay: appsByDay.map((a, i) => ({ day: a.day, applications: a.n, messages: msgsByDay[i]?.n ?? 0 })),
    referralSeries: refSeries,
  };
}
