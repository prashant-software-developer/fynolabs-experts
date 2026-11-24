// Platforms (FynoLabs "Platforms", org_logos): expert platforms and agencies with our referral link,
// jobs page, logo, status, notes and reference links; the companies and projects linked to them and
// the referrals sent through them (read only here: sending lives with the talent screens).
import { and, asc, count, desc, eq, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { experts, partners, platforms, projects, referrals } from "@/db/schema";
import { isOneOf } from "@/lib/constants";
import { PLATFORM_KINDS, PLATFORM_STATUSES, domainOf, webUrl } from "@/lib/crm/labels";
import { cleanLongText, cleanText } from "@/lib/normalize";
import { canSeeContact, maskEmail, type Role } from "@/lib/auth/permissions";
import { actorEmail, logActivity, type Actor } from "./activity";
import type { Result } from "./companies";
import { isUuid } from "./experts";

export type PlatformRow = typeof platforms.$inferSelect & { referred: number };
export type ReferenceLink = { label: string; url: string };

/** People referred through a platform: by its id, or by its name for older rows (as FynoLabs counted them). */
const referredSql = sql<number>`(
  select count(distinct coalesce(r.expert_id::text, lower(r.recipient_email)))
  from ${referrals} r
  where r.platform_id = ${platforms.id} or lower(r.platform) = lower(${platforms.name})
)`.mapWith(Number);

export async function allPlatforms(db: DB): Promise<PlatformRow[]> {
  return db
    .select({
      id: platforms.id,
      name: platforms.name,
      kind: platforms.kind,
      domain: platforms.domain,
      logoUrl: platforms.logoUrl,
      websiteUrl: platforms.websiteUrl,
      referralUrl: platforms.referralUrl,
      jobsUrl: platforms.jobsUrl,
      status: platforms.status,
      notes: platforms.notes,
      referenceLinks: platforms.referenceLinks,
      lastOpenedAt: platforms.lastOpenedAt,
      createdAt: platforms.createdAt,
      updatedAt: platforms.updatedAt,
      updatedBy: platforms.updatedBy,
      referred: referredSql,
    })
    .from(platforms)
    .orderBy(desc(platforms.updatedAt), asc(platforms.name));
}

export async function getPlatform(db: DB, id: string) {
  if (!isUuid(id)) return null;
  const [p] = await db.select().from(platforms).where(eq(platforms.id, id)).limit(1);
  return p ?? null;
}

export const PLATFORM_TABS = ["all", "platforms", "agencies", "no_link"] as const;
export type PlatformTab = (typeof PLATFORM_TABS)[number];
export const PLATFORM_TAB_LABELS: Record<PlatformTab, string> = { all: "All", platforms: "Platforms", agencies: "Agencies", no_link: "No referral link" };

export function platformView(all: PlatformRow[], tab: PlatformTab, q: string) {
  const needle = q.trim().toLowerCase();
  const searched = all.filter((p) => !needle || [p.name, p.domain, p.notes].some((v) => (v ?? "").toLowerCase().includes(needle)));
  const match = (p: PlatformRow, t: PlatformTab) =>
    t === "all" ? true : t === "platforms" ? p.kind === "platform" || p.kind === "both" : t === "agencies" ? p.kind === "agency" || p.kind === "both" : !p.referralUrl;
  const counts = Object.fromEntries(PLATFORM_TABS.map((t) => [t, searched.filter((p) => match(p, t)).length])) as Record<PlatformTab, number>;
  return { rows: searched.filter((p) => match(p, tab)), counts };
}

/** Keeps label + URL pairs with a URL; at most 30. */
export function cleanReferenceLinks(raw: { label?: unknown; url?: unknown }[]): ReferenceLink[] {
  const out: ReferenceLink[] = [];
  for (const r of raw) {
    const url = webUrl(cleanText(r.url, 600));
    if (!url) continue;
    out.push({ label: cleanText(r.label, 120) ?? domainOf(url) ?? url, url });
    if (out.length >= 30) break;
  }
  return out;
}

export function referenceLinksOf(v: unknown): ReferenceLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x.url === "string"))
    .map((x) => ({ label: typeof x.label === "string" && x.label ? x.label : String(x.url), url: String(x.url) }));
}

export type PlatformInput = {
  name: string;
  kind: string;
  domain: string | null;
  websiteUrl: string | null;
  jobsUrl: string | null;
  referralUrl: string | null;
  status: string;
  notes: string | null;
  logoUrl?: string | null;
  referenceLinks: { label?: unknown; url?: unknown }[];
};

/** Logo: a web address, or a small uploaded image as a data URL (at most 200 KB). */
function cleanLogo(raw: string | null | undefined): string | null | "bad" {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(s)) return s.length <= 280_000 ? s : "bad";
  return webUrl(s);
}

export async function savePlatform(db: DB, id: string | null, input: PlatformInput, actor: Actor): Promise<Result> {
  const name = cleanText(input.name, 120);
  if (!name) return { ok: false, reason: "Give this platform a name first." };
  if (!isOneOf(PLATFORM_KINDS, input.kind)) return { ok: false, reason: "Pick a type." };
  if (!isOneOf(PLATFORM_STATUSES, input.status)) return { ok: false, reason: "Pick a status." };
  const logo = cleanLogo(input.logoUrl);
  if (logo === "bad") return { ok: false, reason: "The logo is too big (200 KB at most)." };
  const domain = domainOf(cleanText(input.domain, 200)) ?? domainOf(input.websiteUrl);
  const websiteUrl = webUrl(cleanText(input.websiteUrl, 600)) ?? (domain ? `https://${domain}` : null);
  const values = {
    name,
    kind: input.kind,
    domain,
    websiteUrl,
    jobsUrl: webUrl(cleanText(input.jobsUrl, 600)),
    referralUrl: webUrl(cleanText(input.referralUrl, 600)),
    status: input.status,
    notes: cleanLongText(input.notes, 8000),
    referenceLinks: cleanReferenceLinks(input.referenceLinks),
    ...(input.logoUrl !== undefined ? { logoUrl: logo } : {}),
    updatedAt: new Date(),
    updatedBy: actorEmail(actor),
  };
  const [clash] = await db
    .select({ id: platforms.id })
    .from(platforms)
    .where(sql`lower(${platforms.name}) = ${name.toLowerCase()}${id ? sql` and ${platforms.id} <> ${id}` : sql``}`)
    .limit(1);
  if (clash) return { ok: false, reason: `There's already a platform called ${name}.` };
  if (id) {
    const current = await getPlatform(db, id);
    if (!current) return { ok: false, reason: "That platform could not be found." };
    await db.update(platforms).set(values).where(eq(platforms.id, id));
    await logActivity(db, { entityType: "platform", entityId: id, actor, action: "updated" });
    return { ok: true, id };
  }
  const [row] = await db.insert(platforms).values(values).returning({ id: platforms.id });
  await logActivity(db, { entityType: "platform", entityId: row.id, actor, action: "created" });
  return { ok: true, id: row.id };
}

export async function deletePlatform(db: DB, id: string, actor: Actor): Promise<Result> {
  const current = await getPlatform(db, id);
  if (!current) return { ok: false, reason: "That platform could not be found." };
  await db.delete(platforms).where(eq(platforms.id, id));
  await logActivity(db, { entityType: "platform", entityId: id, actor, action: "deleted" });
  return { ok: true, id };
}

/** Companies and projects linked to the platform, and the referrals sent through it. */
export async function platformLinks(db: DB, p: { id: string; name: string }, role: Role) {
  const throughIt = or(eq(referrals.platformId, p.id), sql`lower(${referrals.platform}) = lower(${p.name})`);
  const [companyRows, projectRows, outcomeRows, people] = await Promise.all([
    db.select({ id: partners.id, name: partners.name, kind: partners.kind, stage: partners.stage, nextStepDue: partners.nextStepDue }).from(partners).where(eq(partners.platformId, p.id)).orderBy(asc(partners.name)),
    db.select({ id: projects.id, code: projects.code, name: projects.name, status: projects.status, kind: projects.kind }).from(projects).where(eq(projects.platformId, p.id)).orderBy(asc(projects.code)),
    db.select({ outcome: referrals.outcome, n: count() }).from(referrals).where(throughIt).groupBy(referrals.outcome),
    db
      .select({
        key: sql<string>`coalesce(${referrals.expertId}::text, lower(${referrals.recipientEmail}))`,
        expertId: referrals.expertId,
        name: sql<string | null>`max(coalesce(${experts.fullName}, ${referrals.recipientName}))`,
        email: sql<string>`max(${referrals.recipientEmail})`,
        times: count(),
        last: sql<Date>`max(${referrals.sentAt})`.mapWith((v: unknown) => new Date(String(v))),
        outcome: sql<string>`(array_agg(${referrals.outcome} order by ${referrals.sentAt} desc))[1]`,
      })
      .from(referrals)
      .leftJoin(experts, eq(experts.id, referrals.expertId))
      .where(and(throughIt))
      .groupBy(sql`coalesce(${referrals.expertId}::text, lower(${referrals.recipientEmail}))`, referrals.expertId)
      .orderBy(sql`max(${referrals.sentAt}) desc`)
      .limit(200),
  ]);
  const contact = canSeeContact(role);
  return {
    companies: companyRows,
    projects: projectRows,
    outcomes: Object.fromEntries(outcomeRows.map((r) => [r.outcome, Number(r.n)])) as Record<string, number>,
    people: people.map((r) => ({ ...r, times: Number(r.times), email: contact ? r.email : maskEmail(r.email), name: r.name ?? (contact ? r.email : maskEmail(r.email)) })),
  };
}

export async function platformChoices(db: DB) {
  return db.select({ id: platforms.id, name: platforms.name }).from(platforms).orderBy(asc(platforms.name));
}
