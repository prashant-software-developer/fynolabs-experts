// Job radar: roles found on other platforms (hub.radar_listings), with the keywords they matched.
// The team approves, discards or restores them, and can publish one as a hub job: always a draft
// and internal (never public automatically), with the platform's referral added to the apply link.
// Scanning runs in the FynoLabs admin for now; the hub shows the last scan's settings read-only.
import { and, count, desc, eq, ilike, inArray, max, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { jobs, platforms, radarListings, settings } from "@/db/schema";
import { DEFAULT_COMPANY_LABEL } from "@/lib/constants";
import { RADAR_STATUSES, withReferral } from "@/lib/talent";
import { logActivity, type Actor } from "./activity";
import { isUuid } from "./experts";
import { createJob, getJob } from "./jobs";

export type RadarTab = (typeof RADAR_STATUSES)[number] | "published" | "all";

function radarWhere(f: { tab: RadarTab; q?: string; platform?: string; keyword?: string }): SQL | undefined {
  const c: SQL[] = [];
  if (f.tab === "published") c.push(sql`exists (select 1 from ${jobs} j where j.radar_listing_id = ${radarListings.id})`);
  else if (f.tab !== "all") c.push(eq(radarListings.status, f.tab));
  if (f.platform) c.push(eq(radarListings.platform, f.platform));
  if (f.keyword) c.push(sql`${f.keyword.toLowerCase()} = any(${radarListings.matchedKeywords})`);
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
    c.push(or(ilike(radarListings.title, like), ilike(radarListings.platform, like), ilike(radarListings.company, like))!);
  }
  return c.length ? and(...c) : undefined;
}

/** Listings for a tab, newest posting first (no date last). Pay is money: pass `money` to keep it. */
export async function listRadar(db: DB, f: { tab: RadarTab; q?: string; platform?: string; keyword?: string; money: boolean }) {
  const rows = await db
    .select({
      id: radarListings.id,
      platform: radarListings.platform,
      platformId: radarListings.platformId,
      title: radarListings.title,
      company: radarListings.company,
      location: radarListings.location,
      url: radarListings.url,
      payMin: radarListings.payMin,
      payMax: radarListings.payMax,
      payPeriod: radarListings.payPeriod,
      postedAt: radarListings.postedAt,
      status: radarListings.status,
      matchedKeywords: radarListings.matchedKeywords,
      createdAt: radarListings.createdAt,
      updatedBy: radarListings.updatedBy,
      referralUrl: platforms.referralUrl,
      publishedJobId: sql<string | null>`(select j.id from ${jobs} j where j.radar_listing_id = "hub"."radar_listings"."id" limit 1)`,
    })
    .from(radarListings)
    .leftJoin(platforms, eq(platforms.id, radarListings.platformId))
    .where(radarWhere(f))
    .orderBy(sql`${radarListings.postedAt} desc nulls last`, desc(radarListings.createdAt))
    .limit(500);
  return rows.map((r) => ({
    ...r,
    payMin: f.money ? r.payMin : null,
    payMax: f.money ? r.payMax : null,
    payPeriod: f.money ? r.payPeriod : null,
    applyUrl: withReferral(r.url, r.referralUrl),
  }));
}
export type RadarRow = Awaited<ReturnType<typeof listRadar>>[number];

export async function radarCounts(db: DB, f: { q?: string; platform?: string; keyword?: string }) {
  const one = async (tab: RadarTab) => Number((await db.select({ n: count() }).from(radarListings).where(radarWhere({ ...f, tab })))[0].n);
  const [n, a, d, p] = await Promise.all([one("new"), one("approved"), one("discarded"), one("published")]);
  return { new: n, approved: a, discarded: d, published: p };
}

export async function radarPlatforms(db: DB) {
  const rows = await db.select({ platform: radarListings.platform, n: count() }).from(radarListings).groupBy(radarListings.platform).orderBy(radarListings.platform);
  return rows.map((r) => ({ platform: r.platform, n: Number(r.n) }));
}

/** The scan settings (keywords, minimum pay) as the last scan used them, and when roles last came in. */
export async function scanInfo(db: DB, money: boolean) {
  const rows = await db.select().from(settings).where(inArray(settings.key, ["job_radar", "job_scan_settings"]));
  const s = rows.find((r) => r.key === "job_radar") ?? rows.find((r) => r.key === "job_scan_settings") ?? null;
  const v = (s?.value ?? {}) as { keywords?: unknown; min_pay?: unknown };
  const [last] = await db.select({ at: max(radarListings.createdAt), n: count() }).from(radarListings);
  return {
    keywords: Array.isArray(v.keywords) ? v.keywords.filter((k): k is string => typeof k === "string") : [],
    minPay: money && v.min_pay != null && v.min_pay !== "" ? Number(v.min_pay) : null,
    settingsUpdatedAt: s?.updatedAt ?? null,
    settingsUpdatedBy: s?.updatedBy ?? null,
    lastFoundAt: last?.at ?? null,
    total: Number(last?.n ?? 0),
  };
}

export async function setRadarStatus(db: DB, actor: Actor, ids: string[], status: string) {
  if (!(RADAR_STATUSES as readonly string[]).includes(status)) return { ok: false as const, reason: "Pick a status." };
  const clean = [...new Set(ids.filter(isUuid))].slice(0, 500);
  if (!clean.length) return { ok: false as const, reason: "Tick at least one role." };
  const by = typeof actor === "string" ? actor : actor.email;
  const rows = await db.update(radarListings).set({ status, updatedAt: new Date(), updatedBy: by }).where(and(inArray(radarListings.id, clean), sql`${radarListings.status} <> ${status}`)).returning({ id: radarListings.id });
  for (const r of rows) await logActivity(db, { entityType: "radar", entityId: r.id, actor, action: `status_${status}` });
  return { ok: true as const, changed: rows.length };
}

const payText = (r: { payMin: number | null; payMax: number | null; payPeriod: string | null }) => {
  if (r.payMin == null && r.payMax == null) return null;
  const range = r.payMin != null && r.payMax != null && r.payMin !== r.payMax ? `${r.payMin}–${r.payMax}` : String(r.payMin ?? r.payMax);
  return `${range}${r.payPeriod === "hour" || r.payPeriod === "hourly" ? "/hr" : r.payPeriod ? ` per ${r.payPeriod}` : ""}`;
};

/**
 * A hub job from a radar role: a draft, internal, with the role's title, company (internal), location
 * and the apply link with the referral. The role's pay goes into the internal rate note (money).
 * Publishing it to the board stays a separate, deliberate step on the job's page.
 */
export async function publishAsJob(db: DB, actor: Actor & { email: string }, id: string) {
  if (!isUuid(id)) return { ok: false as const, reason: "Unknown role." };
  const [r] = await db.select({ l: radarListings, referralUrl: platforms.referralUrl }).from(radarListings).leftJoin(platforms, eq(platforms.id, radarListings.platformId)).where(eq(radarListings.id, id)).limit(1);
  if (!r) return { ok: false as const, reason: "That role no longer exists." };
  const [existing] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.radarListingId, id)).limit(1);
  if (existing) return { ok: true as const, id: existing.id, created: false };
  const l = r.l;
  const pay = payText(l);
  const res = await createJob(db, actor, {
    title: l.title.slice(0, 160),
    publicCompanyLabel: DEFAULT_COMPANY_LABEL,
    partnerId: null,
    requirementId: null,
    summary: null,
    description: null,
    location: l.location?.slice(0, 120) ?? "Remote",
    employmentType: "contract",
    domains: [],
    skills: [],
    countriesAllowed: [],
    countriesBlocked: [],
    minYears: null,
    openings: 1,
    closesOn: null,
    visibility: "internal",
    featured: false,
    internalRateNote: pay ? `Pay on the ${l.platform} listing: ${pay}` : null,
  });
  if (!res.ok) return { ok: false as const, reason: res.reason };
  const applyUrl = withReferral(l.url, r.referralUrl) ?? l.url;
  await db
    .update(jobs)
    .set({ companyName: l.company ?? l.platform, applyUrl, radarListingId: l.id, requireGithub: true, sourceVisibility: "internal", updatedAt: new Date() })
    .where(eq(jobs.id, res.id));
  if (l.status === "new") await db.update(radarListings).set({ status: "approved", updatedAt: new Date(), updatedBy: actor.email }).where(eq(radarListings.id, l.id));
  await logActivity(db, { entityType: "radar", entityId: l.id, actor, action: "published_as_job", detail: { jobId: res.id } });
  const found = await getJob(db, res.id);
  return { ok: true as const, id: res.id, created: true, status: found?.job.status, visibility: found?.job.visibility };
}
