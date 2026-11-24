// Send referrals: an expert sent to a platform, project or partner (hub.referrals), by a method
// (referral email, sign-up link, their recruitment form, profile shared, introduction, other), and
// what came of it (sent -> needs info -> in review -> signed up -> qualified -> working, or not a
// fit / already a member / stopped working). Profile shares and introductions need the person's
// consent on record (CV consent yes) or a confirmation that they agreed, which is then recorded.
// Never anyone marked do not contact. Each referral and outcome writes the expert's timeline.
import { and, count, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, experts, jobs, platforms, projects, referralGroupMembers, referralGroups, referrals } from "@/db/schema";
import { REFERRAL_METHODS, REFERRAL_OUTCOMES, isOneOf, type PipelineStage } from "@/lib/constants";
import { cleanLongText, cleanText } from "@/lib/normalize";
import { emailsFrom, needsConsent, needsLink, outcomeSummary, pipelineForOutcome, referralSummary } from "@/lib/talent";
import { actorEmail, logActivity, type Actor } from "./activity";
import { addTimeline } from "./applications";
import { emailConfigured } from "./email";
import { isUuid } from "./experts";
import { setPipelineStage } from "./pipelines";

// ---------------------------------------------------------------- platforms

export async function platformOptions(db: DB) {
  return db.select({ id: platforms.id, name: platforms.name, referralUrl: platforms.referralUrl, domain: platforms.domain, status: platforms.status, kind: platforms.kind }).from(platforms).orderBy(sql`lower(${platforms.name})`).limit(1000);
}

/** The platform a link belongs to (its domain, or the host of its saved referral link). */
export function platformForLink<T extends { domain: string | null; referralUrl: string | null }>(list: T[], link: string): T | null {
  let host: string;
  try {
    host = new URL(link).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  const hostOf = (u: string | null) => {
    try {
      return u ? new URL(u).hostname.replace(/^www\./, "").toLowerCase() : null;
    } catch {
      return null;
    }
  };
  return list.find((p) => (p.domain && (host === p.domain.toLowerCase() || host.endsWith(`.${p.domain.toLowerCase()}`))) || hostOf(p.referralUrl) === host) ?? null;
}

// ---------------------------------------------------------------- recording referrals

export type ReferralInput = {
  expertIds: string[];
  platformId?: string | null;
  projectId?: string | null;
  /** A destination typed by hand when there is no platform record (a partner's form, say). */
  destination?: string | null;
  referralUrl?: string | null;
  method: string;
  personalNote?: string | null;
  /** They agreed to have their profile shared (recorded as consent when none is on file). */
  consentConfirmed?: boolean;
  allowRepeat?: boolean;
  externalRef?: string | null;
};

export type ReferralItem = { expertId: string; name: string; result: "recorded" | "skipped" | "failed"; why?: string; referralId?: string };

/**
 * Records one referral per person. Refused (per person): not found, do not contact (skipped), no
 * email, no consent for a profile share or introduction (unless confirmed), the same person +
 * method + destination in the last 30 days (unless allowRepeat). The referral email itself is sent
 * only once email is set up: until then "Referral email" is refused and the team sends the
 * message themselves (record it as a sign-up link).
 */
export async function recordReferrals(db: DB, actor: Actor, input: ReferralInput): Promise<{ ok: true; items: ReferralItem[]; recorded: number } | { ok: false; reason: string }> {
  if (!isOneOf(REFERRAL_METHODS, input.method)) return { ok: false, reason: "Pick how they were referred." };
  if (input.method === "email" && !emailConfigured()) return { ok: false, reason: "Email isn't set up yet. Record it as a sign-up link and send the message yourself (copy it from the preview)." };
  const url = cleanText(input.referralUrl, 1000);
  if (url && !/^https?:\/\//i.test(url)) return { ok: false, reason: "The referral link must start with https://." };
  if (needsLink(input.method) && !url) return { ok: false, reason: "This method needs the referral link." };
  const platform = input.platformId && isUuid(input.platformId) ? (await db.select().from(platforms).where(eq(platforms.id, input.platformId)).limit(1))[0] : undefined;
  const project = input.projectId && isUuid(input.projectId) ? (await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1))[0] : undefined;
  if (input.platformId && !platform) return { ok: false, reason: "That platform no longer exists." };
  if (input.projectId && !project) return { ok: false, reason: "That project no longer exists." };
  const projectPlatform = !platform && project?.platformId ? (await db.select().from(platforms).where(eq(platforms.id, project.platformId)).limit(1))[0] : undefined;
  const dest = platform ?? projectPlatform;
  const destName = dest?.name ?? cleanText(input.destination, 120) ?? (project ? `${project.code} · ${project.name}` : null);
  if (!destName) return { ok: false, reason: "Say where they were sent: a platform, a project or a name." };
  const ids = [...new Set(input.expertIds.filter(isUuid))].slice(0, 500);
  if (!ids.length) return { ok: false, reason: "Pick at least one person." };
  const people = await db.select({ id: experts.id, name: experts.fullName, email: experts.email, status: experts.status, cvConsent: experts.cvConsent }).from(experts).where(inArray(experts.id, ids));
  const found = new Map(people.map((p) => [p.id, p]));
  const by = actorEmail(actor);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const note = cleanLongText(input.personalNote, 2000);
  const items: ReferralItem[] = [];
  for (const id of ids) {
    const p = found.get(id);
    if (!p) {
      items.push({ expertId: id, name: "Unknown", result: "failed", why: "Not in the hub" });
      continue;
    }
    if (p.status === "do_not_contact") {
      items.push({ expertId: id, name: p.name, result: "skipped", why: "Do not contact" });
      continue;
    }
    if (!p.email) {
      items.push({ expertId: id, name: p.name, result: "failed", why: "Needs an email first" });
      continue;
    }
    if (needsConsent(input.method) && p.cvConsent !== "yes") {
      if (!input.consentConfirmed) {
        items.push({ expertId: id, name: p.name, result: "failed", why: "Needs their consent on record first" });
        continue;
      }
      if (p.cvConsent === "no") {
        items.push({ expertId: id, name: p.name, result: "failed", why: "They said no to sharing their profile" });
        continue;
      }
    }
    if (!input.allowRepeat) {
      const [dup] = await db
        .select({ sentAt: referrals.sentAt })
        .from(referrals)
        .where(and(eq(referrals.expertId, id), eq(referrals.method, input.method), dest ? eq(referrals.platformId, dest.id) : eq(referrals.platform, destName), project ? eq(referrals.projectId, project.id) : undefined, gte(referrals.sentAt, since)))
        .orderBy(desc(referrals.sentAt))
        .limit(1);
      if (dup) {
        items.push({ expertId: id, name: p.name, result: "skipped", why: `Already sent there on ${dup.sentAt.toISOString().slice(0, 10)}` });
        continue;
      }
    }
    const now = new Date();
    if (needsConsent(input.method) && p.cvConsent !== "yes" && input.consentConfirmed) {
      await db.update(experts).set({ cvConsent: "yes", cvConsentAt: now, consentSource: "recorded", updatedAt: now }).where(eq(experts.id, id));
      await addTimeline(db, { expertId: id, kind: "consent", summary: "Consent recorded: agreed to have their profile shared", detail: `Before sharing their profile with ${destName}`, by });
      await logActivity(db, { entityType: "expert", entityId: id, actor, action: "cv_consent_recorded", detail: { value: "yes", source: "recorded" } });
    }
    // The pipeline it belongs to: their application on a job of this project, when there is one.
    const [pipe] = project
      ? await db.select({ id: applications.id }).from(applications).innerJoin(jobs, eq(jobs.id, applications.jobId)).where(and(eq(applications.expertId, id), eq(jobs.projectId, project.id))).orderBy(desc(applications.stageChangedAt)).limit(1)
      : [];
    const [row] = await db
      .insert(referrals)
      .values({
        expertId: id,
        platformId: dest?.id ?? null,
        platform: destName,
        companyId: project?.companyId ?? null,
        projectId: project?.id ?? null,
        applicationId: pipe?.id ?? null,
        referralUrl: url,
        recipientEmail: p.email,
        recipientName: p.name,
        personalNote: note,
        status: "sent",
        method: input.method,
        outcome: "sent",
        sentAt: now,
        externalRef: cleanText(input.externalRef, 120),
        submittedBy: by,
        createdAt: now,
        updatedAt: now,
        updatedBy: by,
      })
      .returning({ id: referrals.id });
    await addTimeline(db, { expertId: id, applicationId: pipe?.id ?? null, kind: "referral", summary: referralSummary(input.method, destName), detail: note, by });
    await logActivity(db, { entityType: "referral", entityId: row.id, actor, action: "recorded", detail: { method: input.method, platformId: dest?.id ?? null, projectId: project?.id ?? null } });
    await db.update(experts).set({ lastActivityAt: now }).where(eq(experts.id, id));
    items.push({ expertId: id, name: p.name, result: "recorded", referralId: row.id });
  }
  return { ok: true, items, recorded: items.filter((i) => i.result === "recorded").length };
}

/**
 * Outcome changes (one or many). Stamps outcome_at, and responded_at once it is past "sent"; the
 * linked pipeline follows (never backwards): working -> Active, stopped working -> Ended, not a fit
 * and already a member -> Rejected, anything else -> at least Proposed to client.
 */
export async function setReferralOutcome(db: DB, actor: Actor, ids: string[], outcome: string, at?: string | null) {
  if (!isOneOf(REFERRAL_OUTCOMES, outcome)) return { ok: false as const, reason: "Pick an outcome." };
  const clean = [...new Set(ids.filter(isUuid))].slice(0, 2000);
  if (!clean.length) return { ok: false as const, reason: "Tick at least one referral." };
  const when = at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? new Date(`${at}T12:00:00Z`) : new Date();
  const rows = await db.select().from(referrals).where(inArray(referrals.id, clean));
  const by = actorEmail(actor);
  let changed = 0;
  for (const r of rows) {
    if (r.outcome === outcome) continue;
    await db
      .update(referrals)
      .set({ outcome, outcomeAt: when, respondedAt: outcome !== "sent" ? (r.respondedAt ?? when) : r.respondedAt, updatedAt: new Date(), updatedBy: by })
      .where(eq(referrals.id, r.id));
    if (r.expertId) await addTimeline(db, { expertId: r.expertId, applicationId: r.applicationId, kind: "referral", summary: outcomeSummary(r.platform, outcome), by });
    await logActivity(db, { entityType: "referral", entityId: r.id, actor, action: "outcome_changed", detail: { from: r.outcome, to: outcome } });
    if (r.applicationId) {
      const [a] = await db.select({ stage: applications.stage }).from(applications).where(eq(applications.id, r.applicationId)).limit(1);
      const move = a ? pipelineForOutcome(outcome, a.stage as PipelineStage) : null;
      if (move) await setPipelineStage(db, actor, r.applicationId, { stage: move.stage, rejectReason: move.rejectReason ?? null });
    }
    changed++;
  }
  return { ok: true as const, changed };
}

// ---------------------------------------------------------------- lists

export type ReferralFilters = { q?: string; platformId?: string; projectId?: string; outcome?: string; method?: string; expertId?: string };

function referralWhere(f: ReferralFilters): SQL | undefined {
  const c: SQL[] = [];
  if (f.platformId && isUuid(f.platformId)) c.push(eq(referrals.platformId, f.platformId));
  if (f.projectId && isUuid(f.projectId)) c.push(eq(referrals.projectId, f.projectId));
  if (f.outcome && isOneOf(REFERRAL_OUTCOMES, f.outcome)) c.push(eq(referrals.outcome, f.outcome));
  if (f.method && isOneOf(REFERRAL_METHODS, f.method)) c.push(eq(referrals.method, f.method));
  if (f.expertId && isUuid(f.expertId)) c.push(eq(referrals.expertId, f.expertId));
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
    c.push(or(ilike(referrals.recipientName, like), ilike(referrals.recipientEmail, like), ilike(referrals.platform, like))!);
  }
  return c.length ? and(...c) : undefined;
}

export async function listReferrals(db: DB, f: ReferralFilters & { limit: number; offset: number }) {
  const where = referralWhere(f);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: referrals.id,
        expertId: referrals.expertId,
        name: referrals.recipientName,
        email: referrals.recipientEmail,
        platform: referrals.platform,
        platformId: referrals.platformId,
        projectId: referrals.projectId,
        projectCode: projects.code,
        method: referrals.method,
        outcome: referrals.outcome,
        outcomeAt: referrals.outcomeAt,
        sentAt: referrals.sentAt,
        openCount: referrals.openCount,
        clickCount: referrals.clickCount,
        lastOpenedAt: referrals.lastOpenedAt,
        lastClickedAt: referrals.lastClickedAt,
        referralUrl: referrals.referralUrl,
        personalNote: referrals.personalNote,
        submittedBy: referrals.submittedBy,
        externalRef: referrals.externalRef,
        applicationId: referrals.applicationId,
      })
      .from(referrals)
      .leftJoin(projects, eq(projects.id, referrals.projectId))
      .where(where)
      .orderBy(desc(referrals.sentAt))
      .limit(f.limit)
      .offset(f.offset),
    db.select({ n: count() }).from(referrals).where(where),
  ]);
  return { rows, total: Number(n) };
}
export type ReferralRow = Awaited<ReturnType<typeof listReferrals>>["rows"][number];

/** Counts per outcome plus the tracking totals (opened, clicked), for the filters picked. */
export async function referralCounts(db: DB, f: ReferralFilters) {
  const where = referralWhere({ ...f, outcome: undefined });
  const [byOutcome, [t]] = await Promise.all([
    db.select({ o: referrals.outcome, n: count() }).from(referrals).where(where).groupBy(referrals.outcome),
    db.select({ all: count(), opened: sql<number>`count(*) filter (where ${referrals.openCount} > 0)`.mapWith(Number), clicked: sql<number>`count(*) filter (where ${referrals.clickCount} > 0)`.mapWith(Number) }).from(referrals).where(where),
  ]);
  return { byOutcome: Object.fromEntries(byOutcome.map((r) => [r.o, Number(r.n)])) as Record<string, number>, all: Number(t.all), opened: t.opened, clicked: t.clicked };
}

/** Referrals of one expert (the profile's Referrals tab). */
export async function referralsOf(db: DB, expertId: string) {
  return (await listReferrals(db, { expertId, limit: 200, offset: 0 })).rows;
}

/** People already referred to this platform (the "Already referred" badge). */
export async function alreadyReferred(db: DB, platformId: string | null, expertIds: string[]): Promise<Set<string>> {
  if (!platformId || !isUuid(platformId) || !expertIds.length) return new Set();
  const rows = await db.select({ e: referrals.expertId }).from(referrals).where(and(eq(referrals.platformId, platformId), inArray(referrals.expertId, expertIds.filter(isUuid))));
  return new Set(rows.map((r) => r.e).filter((x): x is string => Boolean(x)));
}

// ---------------------------------------------------------------- groups

export async function listGroups(db: DB, f: { q?: string; status?: string } = {}) {
  const members = sql<number>`(select count(*) from ${referralGroupMembers} m where m.group_id = "hub"."referral_groups"."id")`.mapWith(Number);
  const linked = sql<number>`(select count(*) from ${referralGroupMembers} m where m.group_id = "hub"."referral_groups"."id" and m.expert_id is not null)`.mapWith(Number);
  const c: SQL[] = [];
  if (f.q) c.push(ilike(referralGroups.name, `%${f.q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`));
  if (f.status === "active" || f.status === "inactive") c.push(eq(referralGroups.status, f.status));
  return db
    .select({ id: referralGroups.id, name: referralGroups.name, status: referralGroups.status, createdAt: referralGroups.createdAt, updatedBy: referralGroups.updatedBy, members, linked })
    .from(referralGroups)
    .where(c.length ? and(...c) : undefined)
    .orderBy(sql`case ${referralGroups.status} when 'active' then 0 else 1 end`, sql`lower(${referralGroups.name})`);
}

export async function getGroup(db: DB, id: string) {
  if (!isUuid(id)) return null;
  const [g] = await db.select().from(referralGroups).where(eq(referralGroups.id, id)).limit(1);
  return g ?? null;
}

export async function groupMembers(db: DB, id: string) {
  if (!isUuid(id)) return [];
  return db
    .select({ id: referralGroupMembers.id, email: referralGroupMembers.email, name: referralGroupMembers.name, expertId: referralGroupMembers.expertId, expertName: experts.fullName, expertStatus: experts.status, headline: experts.headline, createdAt: referralGroupMembers.createdAt })
    .from(referralGroupMembers)
    .leftJoin(experts, eq(experts.id, referralGroupMembers.expertId))
    .where(eq(referralGroupMembers.groupId, id))
    .orderBy(sql`lower(coalesce(${experts.fullName}, ${referralGroupMembers.name}, ${referralGroupMembers.email}))`);
}

export async function createGroup(db: DB, actor: Actor, name: unknown) {
  const n = cleanText(name, 100) ?? "Untitled group";
  const [row] = await db.insert(referralGroups).values({ name: n, status: "active", updatedBy: actorEmail(actor) }).returning({ id: referralGroups.id });
  await logActivity(db, { entityType: "group", entityId: row.id, actor, action: "created" });
  return { ok: true as const, id: row.id };
}

export async function updateGroup(db: DB, actor: Actor, id: string, input: { name?: unknown; status?: unknown }) {
  const g = await getGroup(db, id);
  if (!g) return { ok: false as const, reason: "That group no longer exists." };
  const name = input.name !== undefined ? cleanText(input.name, 100) : g.name;
  if (!name) return { ok: false as const, reason: "Give the group a name." };
  const status = input.status === "active" || input.status === "inactive" ? input.status : g.status;
  if (name === g.name && status === g.status) return { ok: true as const, changed: false };
  await db.update(referralGroups).set({ name, status, updatedBy: actorEmail(actor) }).where(eq(referralGroups.id, id));
  await logActivity(db, { entityType: "group", entityId: id, actor, action: "updated", detail: { fields: [name !== g.name ? "name" : null, status !== g.status ? "status" : null].filter(Boolean) } });
  return { ok: true as const, changed: true };
}

export async function deleteGroup(db: DB, actor: Actor, id: string) {
  const g = await getGroup(db, id);
  if (!g) return { ok: false as const, reason: "That group no longer exists." };
  await db.delete(referralGroups).where(eq(referralGroups.id, id));
  await logActivity(db, { entityType: "group", entityId: id, actor, action: "deleted" });
  return { ok: true as const };
}

/** Adds people by email (pasted) and/or by expert. An email that belongs to an expert is linked to them. */
export async function addGroupMembers(db: DB, actor: Actor, id: string, input: { emailsText?: string; expertIds?: string[] }) {
  const g = await getGroup(db, id);
  if (!g) return { ok: false as const, reason: "That group no longer exists." };
  const emails = emailsFrom(input.emailsText ?? "").slice(0, 2000);
  const ids = [...new Set((input.expertIds ?? []).filter(isUuid))].slice(0, 2000);
  if (!emails.length && !ids.length) return { ok: false as const, reason: "Paste at least one email or pick experts." };
  const byId = ids.length ? await db.select({ id: experts.id, name: experts.fullName, email: experts.email }).from(experts).where(inArray(experts.id, ids)) : [];
  const byEmail = emails.length ? await db.select({ id: experts.id, name: experts.fullName, email: experts.email }).from(experts).where(inArray(experts.email, emails)) : [];
  const want = new Map<string, { email: string; name: string | null; expertId: string | null }>();
  for (const e of emails) want.set(e, { email: e, name: null, expertId: null });
  for (const e of [...byEmail, ...byId]) if (e.email) want.set(e.email, { email: e.email, name: e.name, expertId: e.id });
  const noEmail = byId.filter((e) => !e.email).length;
  const have = new Set((await db.select({ email: referralGroupMembers.email }).from(referralGroupMembers).where(eq(referralGroupMembers.groupId, id))).map((r) => r.email));
  const by = actorEmail(actor);
  const fresh = [...want.values()].filter((w) => !have.has(w.email));
  if (fresh.length) {
    await db.insert(referralGroupMembers).values(fresh.map((w) => ({ groupId: id, email: w.email, name: w.name, expertId: w.expertId, updatedBy: by }))).onConflictDoNothing();
    for (const w of fresh) if (w.expertId) await logActivity(db, { entityType: "expert", entityId: w.expertId, actor, action: "added_to_group", detail: { groupId: id } });
  }
  await logActivity(db, { entityType: "group", entityId: id, actor, action: "members_added", detail: { added: fresh.length } });
  return { ok: true as const, added: fresh.length, already: want.size - fresh.length, noEmail };
}

export async function removeGroupMembers(db: DB, actor: Actor, id: string, memberIds: string[]) {
  const clean = memberIds.filter(isUuid);
  if (!clean.length) return { ok: false as const, reason: "Tick at least one person." };
  const gone = await db.delete(referralGroupMembers).where(and(eq(referralGroupMembers.groupId, id), inArray(referralGroupMembers.id, clean))).returning({ expertId: referralGroupMembers.expertId });
  for (const g of gone) if (g.expertId) await logActivity(db, { entityType: "expert", entityId: g.expertId, actor, action: "removed_from_group", detail: { groupId: id } });
  await logActivity(db, { entityType: "group", entityId: id, actor, action: "members_removed", detail: { removed: gone.length } });
  return { ok: true as const, removed: gone.length };
}

/** Expert ids in a group (members linked to an expert, or whose email is an expert's). */
export async function groupExpertIds(db: DB, id: string): Promise<string[]> {
  if (!isUuid(id)) return [];
  const rows = await db
    .select({ id: experts.id })
    .from(referralGroupMembers)
    .innerJoin(experts, sql`${experts.id} = ${referralGroupMembers.expertId} or ${experts.email} = lower(${referralGroupMembers.email})`)
    .where(eq(referralGroupMembers.groupId, id));
  return [...new Set(rows.map((r) => r.id))];
}
