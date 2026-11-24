// Visitor analytics of fynolabs.si (hub.visitor_source_daily, visitor_pageviews): visitors and page
// views per source per day, top landing pages and pages, top referrers, plus applications and
// contact messages per day. Days are UTC days, as the FynoLabs admin counted them.
import { and, gte, lte, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, messages, visitorPageviews, visitorSourceDaily } from "@/db/schema";
import { VISIT_SOURCES } from "@/lib/constants";
import { addDays, dayRange } from "@/lib/crm/dates";

export const RANGES = [7, 30, 90] as const;
export const SOURCE_LABELS: Record<string, string> = { linkedin: "LinkedIn", google: "Google", direct: "Direct", other: "Other" };
/** Chart order. */
export const SOURCE_ORDER = ["linkedin", "google", "direct", "other"] as const;

/** One day of a chart: the day and a number per series. */
export type DayPoint = { day: string } & Record<string, number | string>;

export type DailyRow = { visitDate: string; source: string; visitors: number; pageViews: number };

/** One point per day from start to end (missing days are zeros), stacked by source. Pure. */
export function seriesByDay(rows: DailyRow[], start: string, end: string) {
  const days = dayRange(start, end);
  const known = new Set<string>(VISIT_SOURCES);
  const byDay = new Map(days.map((d) => [d, Object.fromEntries(SOURCE_ORDER.map((s) => [s, 0])) as Record<string, number>]));
  const totals = Object.fromEntries(SOURCE_ORDER.map((s) => [s, { visitors: 0, pageViews: 0 }])) as Record<string, { visitors: number; pageViews: number }>;
  for (const r of rows) {
    if (!known.has(r.source) || r.visitDate < start || r.visitDate > end) continue;
    const d = byDay.get(r.visitDate);
    if (d) d[r.source] += Number(r.visitors);
    totals[r.source].visitors += Number(r.visitors);
    totals[r.source].pageViews += Number(r.pageViews);
  }
  const visitors = Object.values(totals).reduce((n, t) => n + t.visitors, 0);
  const pageViews = Object.values(totals).reduce((n, t) => n + t.pageViews, 0);
  const top = Math.max(1, ...Object.values(totals).map((t) => t.visitors));
  const sources = SOURCE_ORDER.map((s) => ({ source: s, label: SOURCE_LABELS[s], ...totals[s], share: visitors ? Math.round((totals[s].visitors / visitors) * 100) : 0, ofTop: totals[s].visitors / top })).sort((a, b) => b.visitors - a.visitors);
  const points = days.map((d): DayPoint => ({ ...byDay.get(d)!, day: d }));
  return { days: points, visitors, pageViews, sources };
}

/** Counts per day from a list of instants (UTC days). */
export function countByDay(instants: Date[], start: string, end: string): { day: string; n: number }[] {
  const m = new Map(dayRange(start, end).map((d) => [d, 0]));
  for (const t of instants) {
    const d = t.toISOString().slice(0, 10);
    if (m.has(d)) m.set(d, (m.get(d) ?? 0) + 1);
  }
  return [...m.entries()].map(([day, n]) => ({ day, n }));
}

export function rangeFor(days: number, today: string, from?: string, to?: string): { start: string; end: string; days: number } {
  if (from && to && from <= to) {
    const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    if (span <= 366) return { start: from, end: to, days: span };
  }
  return { start: addDays(today, -(days - 1)), end: today, days };
}

export async function visitorAnalytics(db: DB, range: { start: string; end: string }) {
  const startTs = `${range.start}T00:00:00Z`;
  const endTs = `${addDays(range.end, 1)}T00:00:00Z`;
  const inWindow = (col: typeof visitorPageviews.createdAt | typeof applications.createdAt | typeof messages.createdAt) => and(gte(col, new Date(startTs)), sql`${col} < ${endTs}::timestamptz`);
  const [daily, landing, pages, referrers, apps, msgs] = await Promise.all([
    db
      .select({ visitDate: visitorSourceDaily.visitDate, source: visitorSourceDaily.source, visitors: visitorSourceDaily.visitors, pageViews: visitorSourceDaily.pageViews })
      .from(visitorSourceDaily)
      .where(and(gte(visitorSourceDaily.visitDate, range.start), lte(visitorSourceDaily.visitDate, range.end))),
    db
      .select({ path: visitorPageviews.landingPath, sessions: sql<number>`count(distinct ${visitorPageviews.sessionId})`.mapWith(Number) })
      .from(visitorPageviews)
      .where(inWindow(visitorPageviews.createdAt))
      .groupBy(visitorPageviews.landingPath)
      .orderBy(sql`2 desc`, visitorPageviews.landingPath)
      .limit(10),
    db
      .select({ path: visitorPageviews.pagePath, views: sql<number>`count(*)`.mapWith(Number) })
      .from(visitorPageviews)
      .where(inWindow(visitorPageviews.createdAt))
      .groupBy(visitorPageviews.pagePath)
      .orderBy(sql`2 desc`, visitorPageviews.pagePath)
      .limit(10),
    db
      .select({ host: visitorPageviews.referrerHost, sessions: sql<number>`count(distinct ${visitorPageviews.sessionId})`.mapWith(Number) })
      .from(visitorPageviews)
      .where(and(inWindow(visitorPageviews.createdAt), sql`coalesce(${visitorPageviews.referrerHost}, '') <> ''`))
      .groupBy(visitorPageviews.referrerHost)
      .orderBy(sql`2 desc`, visitorPageviews.referrerHost)
      .limit(10),
    db.select({ at: applications.createdAt }).from(applications).where(inWindow(applications.createdAt)),
    db.select({ at: messages.createdAt }).from(messages).where(inWindow(messages.createdAt)),
  ]);
  const series = seriesByDay(daily.map((r) => ({ ...r, visitors: Number(r.visitors), pageViews: Number(r.pageViews) })), range.start, range.end);
  const appsByDay = countByDay(apps.map((a) => a.at), range.start, range.end);
  const msgsByDay = countByDay(msgs.map((m) => m.at), range.start, range.end);
  return {
    ...series,
    applications: apps.length,
    messages: msgs.length,
    activity: appsByDay.map((a, i) => ({ day: a.day, applications: a.n, messages: msgsByDay[i]?.n ?? 0 })),
    landing,
    pages,
    referrers: referrers.map((r) => ({ host: r.host ?? "", sessions: r.sessions })),
  };
}

/** Visitors in the last 30 days (dashboard tile). */
export async function visitors30(db: DB, today: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${visitorSourceDaily.visitors}), 0)`.mapWith(Number) })
    .from(visitorSourceDaily)
    .where(gte(visitorSourceDaily.visitDate, addDays(today, -29)));
  return r?.n ?? 0;
}
