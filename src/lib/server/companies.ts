// Companies (FynoLabs "Accounts"): hub.partners with the CRM fields, their activity log
// (hub.company_activities) and the records linked to them. Every write sets updated_by to the
// person, so the FynoLabs sync leaves the row alone from then on.
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  applications,
  calendarEvents,
  companyActivities,
  contacts,
  jobs,
  partners,
  placements,
  platforms,
  projects,
  referrals,
  requirements,
  teamMembers,
} from "@/db/schema";
import { BUSINESS_LINES, COMPANY_ACTIVITY_KINDS, COMPANY_PRIORITIES, COMPANY_STAGES, PARTNER_KINDS, isOneOf } from "@/lib/constants";
import { COMPANY_LANES, COMPANY_TABS, crmLabel, domainOf, isDueNow, isParked, stageRank, webUrl, type CompanyTab, type Lane } from "@/lib/crm/labels";
import { cleanLongText, cleanText, isoDate } from "@/lib/normalize";
import { logActivity, type Actor, actorEmail } from "./activity";
import { isUuid } from "./experts";

export type CompanyRow = {
  id: string;
  name: string;
  kind: string;
  website: string | null;
  domain: string | null;
  notes: string | null;
  businessLine: string;
  stage: string;
  priority: string;
  ownerTeamMemberId: string | null;
  ownerName: string | null;
  ownerMemberName: string | null;
  ownerMemberEmail: string | null;
  nextStep: string | null;
  nextStepDue: string | null;
  bestRoute: string | null;
  location: string | null;
  platformId: string | null;
  platformName: string | null;
  tags: string[];
  stageChangedAt: Date;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
  people: number;
};

/** Who owns it, in words: the team member's name (or the part of the email before @), else the typed name. */
export function ownerLabel(r: { ownerMemberName?: string | null; ownerMemberEmail?: string | null; ownerName?: string | null }): string | null {
  if (r.ownerMemberName) return r.ownerMemberName;
  if (r.ownerMemberEmail) return r.ownerMemberEmail.split("@")[0];
  return r.ownerName ?? null;
}

const companyColumns = {
  id: partners.id,
  name: partners.name,
  kind: partners.kind,
  website: partners.website,
  domain: partners.domain,
  notes: partners.notes,
  businessLine: partners.businessLine,
  stage: partners.stage,
  priority: partners.priority,
  ownerTeamMemberId: partners.ownerTeamMemberId,
  ownerName: partners.ownerName,
  ownerMemberName: teamMembers.name,
  ownerMemberEmail: teamMembers.email,
  nextStep: partners.nextStep,
  nextStepDue: partners.nextStepDue,
  bestRoute: partners.bestRoute,
  location: partners.location,
  platformId: partners.platformId,
  platformName: platforms.name,
  tags: partners.tags,
  stageChangedAt: partners.stageChangedAt,
  lastActivityAt: partners.lastActivityAt,
  createdAt: partners.createdAt,
  updatedAt: partners.updatedAt,
  updatedBy: partners.updatedBy,
  people: sql<number>`(select count(*) from ${contacts} c where c.company_id = ${partners.id})`.mapWith(Number),
};

export async function allCompanies(db: DB): Promise<CompanyRow[]> {
  return (await db
    .select(companyColumns)
    .from(partners)
    .leftJoin(teamMembers, eq(teamMembers.id, partners.ownerTeamMemberId))
    .leftJoin(platforms, eq(platforms.id, partners.platformId))
    .orderBy(asc(partners.name))) as CompanyRow[];
}

export async function getCompany(db: DB, id: string): Promise<CompanyRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select(companyColumns)
    .from(partners)
    .leftJoin(teamMembers, eq(teamMembers.id, partners.ownerTeamMemberId))
    .leftJoin(platforms, eq(platforms.id, partners.platformId))
    .where(eq(partners.id, id))
    .limit(1);
  return (row as CompanyRow) ?? null;
}

// ---------- Filters (pure) ----------

export type CompanyFilters = { tab: CompanyTab; q: string; kind: string; stage: string; owner: string; line: string; tag: string };

export function parseCompanyFilters(sp: Record<string, string | string[] | undefined>): CompanyFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
  const tab = one(sp.tab);
  return {
    tab: isOneOf(COMPANY_TABS, tab) ? tab : "pipeline",
    q: one(sp.q).slice(0, 200),
    kind: isOneOf(PARTNER_KINDS, one(sp.kind)) ? one(sp.kind) : "",
    stage: isOneOf(COMPANY_STAGES, one(sp.stage)) ? one(sp.stage) : "",
    owner: one(sp.owner).slice(0, 160),
    line: isOneOf(["ai_training", "product"] as const, one(sp.line)) ? one(sp.line) : "",
    tag: one(sp.tag).toLowerCase().slice(0, 40),
  };
}

const inTab = (r: CompanyRow, tab: CompanyTab, today: string) =>
  tab === "all" ? true : tab === "parked" ? isParked(r.stage) : tab === "due" ? !isParked(r.stage) && isDueNow(r.nextStepDue, today, r.stage) : !isParked(r.stage);

/** Owner filter: "" everyone, "me", "none", "tm:<team member id>", "name:<typed name>". */
function matchesOwner(r: CompanyRow, owner: string, meId: string | null): boolean {
  if (!owner) return true;
  if (owner === "me") return Boolean(meId) && r.ownerTeamMemberId === meId;
  if (owner === "none") return !r.ownerTeamMemberId && !r.ownerName;
  if (owner.startsWith("tm:")) return r.ownerTeamMemberId === owner.slice(3);
  if (owner.startsWith("name:")) return !r.ownerTeamMemberId && (r.ownerName ?? "").toLowerCase() === owner.slice(5).toLowerCase();
  return true;
}

function matchesSearch(r: CompanyRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [r.name, r.nextStep, r.notes, r.bestRoute, r.location, r.ownerName, ownerLabel(r), r.domain, ...r.tags].some((v) => (v ?? "").toLowerCase().includes(needle));
}

/** The table's order: stage (live talks first), then the due date (none last), then the name. */
export function sortCompanies(rows: CompanyRow[]): CompanyRow[] {
  return [...rows].sort(
    (a, b) =>
      stageRank(a.stage) - stageRank(b.stage) ||
      (a.nextStepDue ?? "9999-99-99").localeCompare(b.nextStepDue ?? "9999-99-99") ||
      a.name.localeCompare(b.name),
  );
}

const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

export type CompanyView = {
  rows: CompanyRow[];
  counts: Record<CompanyTab, number>;
  stats: { pipeline: number; inTalks: number; dueNow: number; won: number };
  lanes: { lane: Lane; rows: CompanyRow[]; due: number }[];
};

/** Everything the Accounts page shows, from every company and the filters. */
export function companyView(all: CompanyRow[], f: CompanyFilters, today: string, meId: string | null): CompanyView {
  // Tiles and tab counts follow the owner, line, type, tag and search filters (not the tab).
  const base = all.filter(
    (r) =>
      matchesOwner(r, f.owner, meId) &&
      (!f.line || r.businessLine === f.line || r.businessLine === "both") &&
      (!f.kind || r.kind === f.kind) &&
      (!f.tag || r.tags.includes(f.tag)) &&
      matchesSearch(r, f.q),
  );
  const withStage = base.filter((r) => !f.stage || r.stage === f.stage);
  const counts = Object.fromEntries(COMPANY_TABS.map((t) => [t, withStage.filter((r) => inTab(r, t, today)).length])) as Record<CompanyTab, number>;
  const rows = sortCompanies(withStage.filter((r) => inTab(r, f.tab, today)));
  const live = base.filter((r) => !isParked(r.stage));
  const stats = {
    pipeline: live.length,
    inTalks: base.filter((r) => r.stage === "contacted" || r.stage === "talking").length,
    dueNow: live.filter((r) => isDueNow(r.nextStepDue, today, r.stage)).length,
    won: base.filter((r) => r.stage === "pilot" || r.stage === "active").length,
  };
  const laneList = f.tab === "parked" ? COMPANY_LANES.filter((l) => l.key === "parked") : f.tab === "all" ? COMPANY_LANES : COMPANY_LANES.filter((l) => l.key !== "parked");
  const lanes = laneList.map((lane) => {
    const inLane = rows
      .filter((r) => (lane.stages as readonly string[]).includes(r.stage))
      .sort(
        (a, b) =>
          (a.nextStepDue ?? "9999-99-99").localeCompare(b.nextStepDue ?? "9999-99-99") ||
          (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) ||
          a.name.localeCompare(b.name),
      );
    return { lane, rows: inLane, due: inLane.filter((r) => isDueNow(r.nextStepDue, today, r.stage)).length };
  });
  return { rows, counts, stats, lanes };
}

/** The owner filter's choices: team members, then names typed on companies without a login. */
export function ownerOptions(all: CompanyRow[], team: { id: string; name: string | null; email: string }[], meId: string | null) {
  const typed = [...new Set(all.filter((r) => !r.ownerTeamMemberId && r.ownerName).map((r) => r.ownerName!))].sort((a, b) => a.localeCompare(b));
  return [
    { value: "", label: "Everyone" },
    ...(meId ? [{ value: "me", label: "Mine" }] : []),
    ...team.filter((m) => m.id !== meId).map((m) => ({ value: `tm:${m.id}`, label: m.name || m.email.split("@")[0] })),
    ...typed.map((n) => ({ value: `name:${n}`, label: n })),
    { value: "none", label: "No owner" },
  ];
}

// ---------- Team members (owners, calendar people) ----------

export type TeamOption = { id: string; name: string | null; email: string; active: boolean };

export async function teamOptions(db: DB): Promise<TeamOption[]> {
  return db.select({ id: teamMembers.id, name: teamMembers.name, email: teamMembers.email, active: teamMembers.active }).from(teamMembers).orderBy(sql`coalesce(${teamMembers.name}, ${teamMembers.email})`);
}

/** The signed-in person's team member id (by email), or null (ADMIN_EMAILS without a row). */
export async function myTeamMemberId(db: DB, email: string): Promise<string | null> {
  const [m] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.email, email.toLowerCase())).limit(1);
  return m?.id ?? null;
}

// ---------- Writes ----------

export type Result<T = { id: string }> = ({ ok: true } & T) | { ok: false; reason: string };

export type CompanyInput = Partial<{
  name: string;
  kind: string;
  businessLine: string;
  stage: string;
  priority: string;
  /** "tm:<id>", "name:<typed name>" or "none". */
  owner: string;
  nextStep: string | null;
  nextStepDue: string | null;
  bestRoute: string | null;
  website: string | null;
  location: string | null;
  platformId: string | null;
  tags: string | string[] | null;
  notes: string | null;
}>;

/** Comma separated, trimmed, lower case, no repeats, at most 20 (as on the FynoLabs account page). */
export function cleanTags(raw: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,;\n]+/);
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim().toLowerCase().slice(0, 40);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

async function resolveOwner(db: DB, owner: string | undefined): Promise<{ ownerTeamMemberId: string | null; ownerName: string | null } | { error: string } | null> {
  if (owner === undefined) return null;
  if (!owner || owner === "none") return { ownerTeamMemberId: null, ownerName: null };
  if (owner.startsWith("tm:")) {
    const id = owner.slice(3);
    if (!isUuid(id)) return { error: "Pick an owner from the list." };
    const [m] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
    return m ? { ownerTeamMemberId: m.id, ownerName: null } : { error: "That team member isn't on the team any more." };
  }
  if (owner.startsWith("name:")) {
    const name = cleanText(owner.slice(5), 120);
    return name ? { ownerTeamMemberId: null, ownerName: name } : { error: "Type the owner's name, or pick someone with a login." };
  }
  return { error: "Pick an owner from the list." };
}

async function nameTaken(db: DB, name: string, exceptId?: string): Promise<boolean> {
  const [clash] = await db
    .select({ id: partners.id })
    .from(partners)
    .where(sql`lower(${partners.name}) = ${name.toLowerCase()}${exceptId ? sql` and ${partners.id} <> ${exceptId}` : sql``}`)
    .limit(1);
  return Boolean(clash);
}

/** Checks and cleans the fields that were sent. Only those are written. */
async function companyValues(db: DB, input: CompanyInput, exceptId?: string): Promise<Result<{ values: Partial<typeof partners.$inferInsert> }>> {
  const v: Partial<typeof partners.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = cleanText(input.name, 120);
    if (!name) return { ok: false, reason: "Add the company name." };
    if (await nameTaken(db, name, exceptId)) return { ok: false, reason: `${name} is already an account.` };
    v.name = name;
  }
  if (input.kind !== undefined) {
    if (!isOneOf(PARTNER_KINDS, input.kind)) return { ok: false, reason: "Pick a type." };
    v.kind = input.kind;
  }
  if (input.businessLine !== undefined) {
    if (!isOneOf(BUSINESS_LINES, input.businessLine)) return { ok: false, reason: "Pick a business line." };
    v.businessLine = input.businessLine;
  }
  if (input.stage !== undefined) {
    if (!isOneOf(COMPANY_STAGES, input.stage)) return { ok: false, reason: "Pick a stage." };
    v.stage = input.stage;
  }
  if (input.priority !== undefined) {
    if (!isOneOf(COMPANY_PRIORITIES, input.priority)) return { ok: false, reason: "Pick a priority." };
    v.priority = input.priority;
  }
  const owner = await resolveOwner(db, input.owner);
  if (owner && "error" in owner) return { ok: false, reason: owner.error };
  if (owner) Object.assign(v, owner);
  if (input.nextStep !== undefined) v.nextStep = cleanLongText(input.nextStep, 2000);
  if (input.nextStepDue !== undefined) {
    const d = input.nextStepDue ? isoDate(input.nextStepDue) : null;
    if (input.nextStepDue && !d) return { ok: false, reason: "The due date isn't a date." };
    v.nextStepDue = d;
  }
  if (input.bestRoute !== undefined) v.bestRoute = cleanText(input.bestRoute, 300);
  if (input.website !== undefined) {
    const site = cleanText(input.website, 300);
    v.website = site ? webUrl(site) : null;
    v.domain = domainOf(site);
  }
  if (input.location !== undefined) v.location = cleanText(input.location, 160);
  if (input.platformId !== undefined) {
    if (input.platformId && !isUuid(input.platformId)) return { ok: false, reason: "Pick a platform from the list." };
    if (input.platformId) {
      const [p] = await db.select({ id: platforms.id }).from(platforms).where(eq(platforms.id, input.platformId)).limit(1);
      if (!p) return { ok: false, reason: "That platform no longer exists." };
    }
    v.platformId = input.platformId || null;
  }
  if (input.tags !== undefined) v.tags = cleanTags(input.tags);
  if (input.notes !== undefined) v.notes = cleanLongText(input.notes, 8000);
  return { ok: true, values: v };
}

/** "Talking → Pilot". */
export const stageSummary = (from: string, to: string) => `${crmLabel(from)} → ${crmLabel(to)}`;

export async function createCompany(db: DB, input: CompanyInput & { name: string }, actor: Actor): Promise<Result> {
  const checked = await companyValues(db, { kind: "data_partner", businessLine: "ai_training", stage: "researching", ...input }, undefined);
  if (!checked.ok) return checked;
  const email = actorEmail(actor);
  const now = new Date();
  const [row] = await db
    .insert(partners)
    .values({ ...checked.values, name: checked.values.name!, createdBy: email, updatedBy: email, createdAt: now, updatedAt: now, stageChangedAt: now })
    .returning({ id: partners.id });
  await logActivity(db, { entityType: "partner", entityId: row.id, actor, action: "created" });
  return { ok: true, id: row.id };
}

/**
 * Saves the fields sent. A stage change sets stage_changed_at, writes a "stage" activity ("Talking →
 * Pilot") and moves last_activity_at, as the FynoLabs admin's trigger does.
 */
export async function updateCompany(db: DB, id: string, input: CompanyInput, actor: Actor): Promise<Result<{ id: string; stageChanged: boolean }>> {
  const current = await getCompany(db, id);
  if (!current) return { ok: false, reason: "That account no longer exists." };
  const checked = await companyValues(db, input, id);
  if (!checked.ok) return checked;
  const v = checked.values;
  const now = new Date();
  const email = actorEmail(actor);
  const stageChanged = v.stage !== undefined && v.stage !== current.stage;
  const changed = Object.keys(v).filter((k) => {
    const before = (current as unknown as Record<string, unknown>)[k];
    const after = (v as Record<string, unknown>)[k];
    return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
  });
  if (!changed.length) return { ok: true, id, stageChanged: false };
  await db
    .update(partners)
    .set({ ...v, updatedAt: now, updatedBy: email, ...(stageChanged ? { stageChangedAt: now, lastActivityAt: now } : {}) })
    .where(eq(partners.id, id));
  if (stageChanged) {
    await db.insert(companyActivities).values({ companyId: id, kind: "stage", summary: stageSummary(current.stage, v.stage!), happenedAt: now, createdBy: email, updatedBy: email });
  }
  await logActivity(db, { entityType: "partner", entityId: id, actor, action: stageChanged ? "stage_changed" : "updated", detail: { fields: changed, ...(stageChanged ? { from: current.stage, to: v.stage } : {}) } });
  return { ok: true, id, stageChanged };
}

/** A company can only go when nothing the hub keeps for accounting points at it. */
export async function deleteCompany(db: DB, id: string, actor: Actor): Promise<Result> {
  const current = await getCompany(db, id);
  if (!current) return { ok: false, reason: "That account no longer exists." };
  const [[r], [p]] = await Promise.all([
    db.select({ n: count() }).from(requirements).where(eq(requirements.partnerId, id)),
    db.select({ n: count() }).from(placements).where(eq(placements.partnerId, id)),
  ]);
  if (Number(r.n) || Number(p.n)) return { ok: false, reason: `${current.name} has requirements or placements, so it can't be deleted. Set the stage to Dropped instead.` };
  await db.delete(partners).where(eq(partners.id, id));
  await logActivity(db, { entityType: "partner", entityId: id, actor, action: "deleted" });
  return { ok: true, id };
}

// ---------- Activity log ----------

export type CompanyActivityRow = {
  id: string;
  kind: string;
  summary: string;
  detail: string | null;
  happenedAt: Date;
  createdBy: string | null;
  contactId: string | null;
  contactName: string | null;
  companyId: string;
  companyName?: string;
};

export async function companyActivityLog(db: DB, companyId: string, limit = 200): Promise<CompanyActivityRow[]> {
  return db
    .select({
      id: companyActivities.id,
      kind: companyActivities.kind,
      summary: companyActivities.summary,
      detail: companyActivities.detail,
      happenedAt: companyActivities.happenedAt,
      createdBy: companyActivities.createdBy,
      contactId: companyActivities.contactId,
      contactName: contacts.name,
      companyId: companyActivities.companyId,
    })
    .from(companyActivities)
    .leftJoin(contacts, eq(contacts.id, companyActivities.contactId))
    .where(eq(companyActivities.companyId, companyId))
    .orderBy(desc(companyActivities.happenedAt), desc(companyActivities.createdAt))
    .limit(limit);
}

/** The latest activity across every company (dashboard). */
export async function recentCompanyActivity(db: DB, limit = 10): Promise<CompanyActivityRow[]> {
  return db
    .select({
      id: companyActivities.id,
      kind: companyActivities.kind,
      summary: companyActivities.summary,
      detail: companyActivities.detail,
      happenedAt: companyActivities.happenedAt,
      createdBy: companyActivities.createdBy,
      contactId: companyActivities.contactId,
      contactName: contacts.name,
      companyId: companyActivities.companyId,
      companyName: partners.name,
    })
    .from(companyActivities)
    .innerJoin(partners, eq(partners.id, companyActivities.companyId))
    .leftJoin(contacts, eq(contacts.id, companyActivities.contactId))
    .orderBy(desc(companyActivities.happenedAt))
    .limit(limit);
}

export const LOGGABLE_KINDS = COMPANY_ACTIVITY_KINDS.filter((k) => k !== "stage");

/** Logs an email, call, meeting...: last_activity_at moves to it when it is the newest. */
export async function logCompanyActivity(
  db: DB,
  input: { companyId: string; kind: string; summary: string; detail?: string | null; happenedAt?: Date | null; contactId?: string | null },
  actor: Actor,
): Promise<Result> {
  const company = await getCompany(db, input.companyId);
  if (!company) return { ok: false, reason: "That account no longer exists." };
  if (!isOneOf(COMPANY_ACTIVITY_KINDS, input.kind)) return { ok: false, reason: "Pick what kind of activity it was." };
  const summary = cleanText(input.summary, 500);
  if (!summary) return { ok: false, reason: "Write what happened." };
  let contactId: string | null = null;
  if (input.contactId) {
    if (!isUuid(input.contactId)) return { ok: false, reason: "Pick a person from the list." };
    const [c] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.companyId, input.companyId))).limit(1);
    if (!c) return { ok: false, reason: "That person isn't at this account." };
    contactId = c.id;
  }
  const happenedAt = input.happenedAt && !Number.isNaN(input.happenedAt.getTime()) ? input.happenedAt : new Date();
  const email = actorEmail(actor);
  const [row] = await db
    .insert(companyActivities)
    .values({ companyId: input.companyId, contactId, kind: input.kind, summary, detail: cleanLongText(input.detail, 8000), happenedAt, createdBy: email, updatedBy: email })
    .returning({ id: companyActivities.id });
  await db
    .update(partners)
    .set({ lastActivityAt: sql`greatest(coalesce(${partners.lastActivityAt}, ${happenedAt.toISOString()}::timestamptz), ${happenedAt.toISOString()}::timestamptz)` })
    .where(eq(partners.id, input.companyId));
  await logActivity(db, { entityType: "partner", entityId: input.companyId, actor, action: "activity_logged", detail: { kind: input.kind } });
  return { ok: true, id: row.id };
}

// ---------- Linked records ----------

export async function companyLinks(db: DB, companyId: string) {
  const [jobRows, projectRows, reqRows, referralRows, eventRows] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        visibility: jobs.visibility,
        closesOn: jobs.closesOn,
        applicants: sql<number>`(select count(*) from ${applications} a where a.job_id = ${jobs.id})`.mapWith(Number),
      })
      .from(jobs)
      .where(eq(jobs.partnerId, companyId))
      .orderBy(desc(jobs.createdAt))
      .limit(100),
    db.select({ id: projects.id, code: projects.code, name: projects.name, kind: projects.kind, status: projects.status, targetCount: projects.targetCount }).from(projects).where(eq(projects.companyId, companyId)).orderBy(asc(projects.code)),
    db.select({ id: requirements.id, title: requirements.title, status: requirements.status, slots: requirements.slots, deadline: requirements.deadline }).from(requirements).where(eq(requirements.partnerId, companyId)).orderBy(desc(requirements.createdAt)).limit(100),
    db.select({ outcome: referrals.outcome, n: count() }).from(referrals).where(eq(referrals.companyId, companyId)).groupBy(referrals.outcome),
    db
      .select({ id: calendarEvents.id, title: calendarEvents.title, kind: calendarEvents.kind, status: calendarEvents.status, eventDate: calendarEvents.eventDate, startTime: calendarEvents.startTime, endTime: calendarEvents.endTime })
      .from(calendarEvents)
      .where(eq(calendarEvents.companyId, companyId))
      .orderBy(sql`${calendarEvents.eventDate} desc nulls first`, desc(calendarEvents.startTime))
      .limit(200),
  ]);
  return { jobs: jobRows, projects: projectRows, requirements: reqRows, referrals: Object.fromEntries(referralRows.map((r) => [r.outcome, Number(r.n)])) as Record<string, number>, events: eventRows };
}

/** Contacts with no company yet, those whose company text matches this one first (for "link a lead you already have"). */
export async function unlinkedContacts(db: DB, companyName: string, limit = 500) {
  return db
    .select({ id: contacts.id, name: contacts.name, company: contacts.company })
    .from(contacts)
    .where(isNull(contacts.companyId))
    .orderBy(sql`case when lower(coalesce(${contacts.company}, '')) = ${companyName.toLowerCase()} then 0 else 1 end`, asc(contacts.name))
    .limit(limit);
}

/** The companies to pick from in other forms (contacts, calendar, projects). */
export async function companyChoices(db: DB, ids?: string[]) {
  const q = db.select({ id: partners.id, name: partners.name, kind: partners.kind }).from(partners);
  return (ids ? q.where(inArray(partners.id, ids)) : q).orderBy(asc(partners.name));
}
