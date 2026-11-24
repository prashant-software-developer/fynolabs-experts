// Projects (P### codes) with their tracks, team, required documents, fee rules (money: admins and
// finance only), partner reports, linked jobs and the funnel (pipelines on the project's jobs, and
// referrals made for it).
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  applications,
  experts,
  jobs,
  partnerReports,
  partners,
  platforms,
  projectDocuments,
  projectFeeRules,
  projectMembers,
  projectTracks,
  projects,
  referrals,
  teamMembers,
} from "@/db/schema";
import { DOCUMENT_KINDS, DOCUMENT_STAGES, PIPELINE_STAGES, PROJECT_KINDS, PROJECT_ROLES, PROJECT_STATUSES, isOneOf } from "@/lib/constants";
import { canSeeContact, canSeeMoney, maskEmail, rowsWithoutMoney, type Role } from "@/lib/auth/permissions";
import { addDays, dateIST, isIsoDate, weekStart } from "@/lib/crm/dates";
import { webUrl } from "@/lib/crm/labels";
import { cleanLongText, cleanText, toInt, toMoney } from "@/lib/normalize";
import { actorEmail, logActivity, type Actor } from "./activity";
import type { Result } from "./companies";
import { isUuid } from "./experts";

export type ProjectRow = typeof projects.$inferSelect & {
  companyName: string | null;
  platformName: string | null;
  ownerMemberName: string | null;
  ownerMemberEmail: string | null;
  roles: number;
};

const projectCols = {
  id: projects.id,
  code: projects.code,
  name: projects.name,
  kind: projects.kind,
  status: projects.status,
  companyId: projects.companyId,
  platformId: projects.platformId,
  referralUrl: projects.referralUrl,
  ownerTeamMemberId: projects.ownerTeamMemberId,
  targetCount: projects.targetCount,
  startsOn: projects.startsOn,
  endsOn: projects.endsOn,
  countries: projects.countries,
  rules: projects.rules,
  discord: projects.discord,
  externalRef: projects.externalRef,
  description: projects.description,
  notes: projects.notes,
  createdBy: projects.createdBy,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  updatedBy: projects.updatedBy,
  companyName: partners.name,
  platformName: platforms.name,
  ownerMemberName: teamMembers.name,
  ownerMemberEmail: teamMembers.email,
  roles: sql<number>`(select count(*) from ${jobs} j where j.project_id = ${projects.id})`.mapWith(Number),
};

const baseQuery = (db: DB) =>
  db
    .select(projectCols)
    .from(projects)
    .leftJoin(partners, eq(partners.id, projects.companyId))
    .leftJoin(platforms, eq(platforms.id, projects.platformId))
    .leftJoin(teamMembers, eq(teamMembers.id, projects.ownerTeamMemberId));

export async function allProjects(db: DB): Promise<ProjectRow[]> {
  return baseQuery(db).orderBy(asc(projects.code));
}

export async function getProject(db: DB, id: string): Promise<ProjectRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await baseQuery(db).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

export const PROJECT_TABS = ["active", "planned", "paused_closed", "all"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];
export const PROJECT_TAB_LABELS: Record<ProjectTab, string> = { active: "Active", planned: "Planned", paused_closed: "Paused or closed", all: "All" };

export function projectView(all: ProjectRow[], tab: ProjectTab, q: string) {
  const needle = q.trim().toLowerCase();
  const searched = all.filter((p) => !needle || [p.code, p.name, p.companyName].some((v) => (v ?? "").toLowerCase().includes(needle)));
  const match = (p: ProjectRow, t: ProjectTab) => (t === "all" ? true : t === "paused_closed" ? p.status === "paused" || p.status === "closed" : p.status === t);
  const counts = Object.fromEntries(PROJECT_TABS.map((t) => [t, searched.filter((p) => match(p, t)).length])) as Record<ProjectTab, number>;
  const active = all.filter((p) => p.status === "active");
  return {
    rows: searched.filter((p) => match(p, tab)),
    counts,
    stats: {
      active: active.length,
      planned: all.filter((p) => p.status === "planned").length,
      roles: all.reduce((n, p) => n + p.roles, 0),
      target: active.reduce((n, p) => n + (p.targetCount ?? 0), 0),
    },
  };
}

// ---------- Writes: the project ----------

/** "t500" -> "T500"; A–Z, 0–9 and dashes, 2 to 20 characters. */
export function normalizeCode(raw: unknown): string | null {
  const s = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  return s.length >= 2 ? s : null;
}

/** "US, gb, India" -> ["US", "GB"]: two-letter codes only. */
export function cleanCountries(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[\s,;]+/);
  return [...new Set(parts.map((p) => p.trim().toUpperCase()).filter((p) => /^[A-Z]{2}$/.test(p)))];
}

export type ProjectInput = Partial<{
  code: string;
  name: string;
  kind: string;
  status: string;
  companyId: string | null;
  platformId: string | null;
  ownerTeamMemberId: string | null;
  targetCount: string | number | null;
  startsOn: string | null;
  endsOn: string | null;
  countries: string | string[];
  referralUrl: string | null;
  discord: string | null;
  description: string | null;
  notes: string | null;
  /** JSON text of an object. */
  rules: string | null;
}>;

async function exists(db: DB, table: typeof partners | typeof platforms | typeof teamMembers, id: string) {
  const [r] = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  return Boolean(r);
}

async function projectValues(db: DB, input: ProjectInput, exceptId?: string): Promise<Result<{ values: Partial<typeof projects.$inferInsert> }>> {
  const v: Partial<typeof projects.$inferInsert> = {};
  if (input.code !== undefined) {
    const code = normalizeCode(input.code);
    if (!code) return { ok: false, reason: "Add a code (2+ letters or digits) and a name." };
    const [clash] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.code, code), exceptId ? ne(projects.id, exceptId) : undefined)).limit(1);
    if (clash) return { ok: false, reason: `The code ${code} is taken.` };
    v.code = code;
  }
  if (input.name !== undefined) {
    const name = cleanText(input.name, 160);
    if (!name) return { ok: false, reason: "Add a code (2+ letters or digits) and a name." };
    v.name = name;
  }
  if (input.kind !== undefined) {
    if (!isOneOf(PROJECT_KINDS, input.kind)) return { ok: false, reason: "Pick a type." };
    v.kind = input.kind;
  }
  if (input.status !== undefined) {
    if (!isOneOf(PROJECT_STATUSES, input.status)) return { ok: false, reason: "Pick a status." };
    v.status = input.status;
  }
  for (const [key, table, what] of [
    ["companyId", partners, "account"],
    ["platformId", platforms, "platform"],
    ["ownerTeamMemberId", teamMembers, "owner"],
  ] as const) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (raw && (!isUuid(raw) || !(await exists(db, table, raw)))) return { ok: false, reason: `Pick the ${what} from the list.` };
    (v as Record<string, unknown>)[key] = raw || null;
  }
  if (input.targetCount !== undefined) {
    const t = input.targetCount === null || input.targetCount === "" ? null : toInt(input.targetCount, 0, 100_000);
    if (input.targetCount !== null && input.targetCount !== "" && t === null) return { ok: false, reason: "The target is a number of people." };
    v.targetCount = t;
  }
  for (const key of ["startsOn", "endsOn"] as const) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (raw && !isIsoDate(raw)) return { ok: false, reason: "Dates are dates." };
    v[key] = raw || null;
  }
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) return { ok: false, reason: "The project ends before it starts." };
  if (input.countries !== undefined) v.countries = cleanCountries(input.countries);
  if (input.referralUrl !== undefined) v.referralUrl = webUrl(cleanText(input.referralUrl, 600));
  if (input.discord !== undefined) v.discord = cleanText(input.discord, 300);
  if (input.description !== undefined) v.description = cleanLongText(input.description, 8000);
  if (input.notes !== undefined) v.notes = cleanLongText(input.notes, 8000);
  if (input.rules !== undefined) {
    const raw = (input.rules ?? "").trim();
    if (!raw) v.rules = {};
    else {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "Rules are a JSON object, like {\"github_required\": true}." };
        v.rules = parsed as Record<string, unknown>;
      } catch {
        return { ok: false, reason: "Rules aren't valid JSON." };
      }
    }
  }
  return { ok: true, values: v };
}

export async function createProject(db: DB, input: ProjectInput & { code: string; name: string }, actor: Actor): Promise<Result> {
  const checked = await projectValues(db, { kind: "referral", ...input, status: "planned" });
  if (!checked.ok) return checked;
  const email = actorEmail(actor);
  const [row] = await db
    .insert(projects)
    .values({ ...checked.values, code: checked.values.code!, name: checked.values.name!, createdBy: email, updatedBy: email })
    .returning({ id: projects.id });
  await logActivity(db, { entityType: "project", entityId: row.id, actor, action: "created" });
  return { ok: true, id: row.id };
}

export async function updateProject(db: DB, id: string, input: ProjectInput, actor: Actor): Promise<Result> {
  if (!(await getProject(db, id))) return { ok: false, reason: "That project no longer exists." };
  const checked = await projectValues(db, input, id);
  if (!checked.ok) return checked;
  await db.update(projects).set({ ...checked.values, updatedAt: new Date(), updatedBy: actorEmail(actor) }).where(eq(projects.id, id));
  await logActivity(db, { entityType: "project", entityId: id, actor, action: "updated", detail: { fields: Object.keys(checked.values) } });
  return { ok: true, id };
}

export async function deleteProject(db: DB, id: string, actor: Actor): Promise<Result> {
  const p = await getProject(db, id);
  if (!p) return { ok: false, reason: "That project no longer exists." };
  await db.delete(projects).where(eq(projects.id, id));
  await logActivity(db, { entityType: "project", entityId: id, actor, action: "deleted", detail: { code: p.code } });
  return { ok: true, id };
}

// ---------- Writes: tracks, team, documents, fee rules (each list saved as a whole) ----------

type Row<T> = T & { id?: string | null; remove?: boolean };

/** Deletes the removed rows, updates the kept ones and inserts the new ones. */
async function saveList<T extends Record<string, unknown>>(
  db: DB,
  table: typeof projectTracks | typeof projectMembers | typeof projectDocuments | typeof projectFeeRules,
  projectId: string,
  rows: Row<T>[],
  actor: Actor,
) {
  const email = actorEmail(actor);
  const existing = await db.select({ id: table.id }).from(table).where(eq(table.projectId, projectId));
  const known = new Set(existing.map((r) => r.id));
  for (const r of rows) {
    const { id, remove, ...values } = r;
    if (id && known.has(id)) {
      if (remove) await db.delete(table).where(eq(table.id, id));
      else await db.update(table).set({ ...values, updatedBy: email } as never).where(eq(table.id, id));
    } else if (!remove) {
      await db.insert(table).values({ ...values, projectId, updatedBy: email } as never);
    }
  }
}

export type TrackInput = Row<{ name: string; targetCount: string | number | null }>;

export async function saveTracks(db: DB, projectId: string, rows: TrackInput[], actor: Actor): Promise<Result> {
  if (!(await getProject(db, projectId))) return { ok: false, reason: "That project no longer exists." };
  const kept = rows.filter((r) => !r.remove && (r.id || cleanText(r.name, 160)));
  const clean: Row<{ name: string; targetCount: number | null; position: number }>[] = [];
  let pos = 0;
  for (const r of rows) {
    const name = cleanText(r.name, 160);
    if (!r.remove && !name) {
      if (r.id) return { ok: false, reason: "Every track needs a name." };
      continue;
    }
    const t = r.targetCount === null || r.targetCount === "" || r.targetCount === undefined ? null : toInt(r.targetCount, 0, 100_000);
    if (!r.remove && r.targetCount !== null && r.targetCount !== "" && r.targetCount !== undefined && t === null) return { ok: false, reason: "A track's target is a number of people." };
    clean.push({ id: r.id, remove: r.remove, name: name ?? "", targetCount: t, position: r.remove ? 0 : pos++ });
  }
  const names = kept.map((r) => (cleanText(r.name, 160) ?? "").toLowerCase());
  if (new Set(names).size !== names.length) return { ok: false, reason: "Two tracks have the same name." };
  await saveList(db, projectTracks, projectId, clean, actor);
  await logActivity(db, { entityType: "project", entityId: projectId, actor, action: "tracks_saved" });
  return { ok: true, id: projectId };
}

export type MemberInput = Row<{ teamMemberId: string; role: string; capacity: string | number | null; active: boolean }>;

export async function saveMembers(db: DB, projectId: string, rows: MemberInput[], actor: Actor): Promise<Result> {
  if (!(await getProject(db, projectId))) return { ok: false, reason: "That project no longer exists." };
  const live = rows.filter((r) => !r.remove && (r.id || r.teamMemberId));
  if (live.some((r) => !r.teamMemberId || !isUuid(r.teamMemberId))) return { ok: false, reason: "Pick a person on every line." };
  const ids = live.map((r) => r.teamMemberId);
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "Someone is on the team twice." };
  if (live.some((r) => !isOneOf(PROJECT_ROLES, r.role))) return { ok: false, reason: "Pick a role on every line." };
  const found = ids.length ? await db.select({ id: teamMembers.id }).from(teamMembers).where(inArray(teamMembers.id, ids)) : [];
  if (found.length !== ids.length) return { ok: false, reason: "Pick a person on every line." };
  const clean: Row<{ teamMemberId: string; role: string; capacity: number | null; active: boolean }>[] = [];
  for (const r of rows) {
    if (!r.remove && !r.id && !r.teamMemberId) continue;
    const cap = r.capacity === null || r.capacity === "" || r.capacity === undefined ? null : toInt(r.capacity, 0, 1000);
    clean.push({ id: r.id, remove: r.remove, teamMemberId: r.teamMemberId, role: r.role, capacity: cap, active: r.active });
  }
  await saveList(db, projectMembers, projectId, clean, actor);
  await logActivity(db, { entityType: "project", entityId: projectId, actor, action: "team_saved" });
  return { ok: true, id: projectId };
}

export type DocumentInput = Row<{ title: string; kind: string; requiredStage: string; expiresAfterDays: string | number | null }>;

export async function saveDocuments(db: DB, projectId: string, rows: DocumentInput[], actor: Actor): Promise<Result> {
  if (!(await getProject(db, projectId))) return { ok: false, reason: "That project no longer exists." };
  const clean: Row<{ title: string; kind: string; requiredStage: string; expiresAfterDays: number | null; position: number }>[] = [];
  let pos = 0;
  for (const r of rows) {
    const title = cleanText(r.title, 200);
    if (!r.remove && !title) {
      if (r.id) return { ok: false, reason: "Every document needs a title." };
      continue;
    }
    if (!r.remove && !isOneOf(DOCUMENT_KINDS, r.kind)) return { ok: false, reason: "Pick a kind for every document." };
    if (!r.remove && !isOneOf(DOCUMENT_STAGES, r.requiredStage)) return { ok: false, reason: "Pick when every document is needed." };
    const raw = r.expiresAfterDays;
    const days = raw === null || raw === "" || raw === undefined ? null : toInt(raw, 1, 3650);
    if (!r.remove && raw !== null && raw !== "" && raw !== undefined && days === null) return { ok: false, reason: "Validity is 1 to 3,650 days." };
    clean.push({ id: r.id, remove: r.remove, title: title ?? "", kind: r.kind, requiredStage: r.requiredStage, expiresAfterDays: days, position: r.remove ? 0 : pos++ });
  }
  const titles = clean.filter((r) => !r.remove).map((r) => r.title.toLowerCase());
  if (new Set(titles).size !== titles.length) return { ok: false, reason: "Two documents have the same title." };
  await saveList(db, projectDocuments, projectId, clean, actor);
  await logActivity(db, { entityType: "project", entityId: projectId, actor, action: "documents_saved" });
  return { ok: true, id: projectId };
}

export type FeeRuleInput = Row<{ trackId: string | null; amount: string | number | null; currency: string; earnedAtStage: string; paymentTermsDays: string | number | null; active: boolean; notes: string | null }>;

/** Money: the caller has checked the role (admins and finance). */
export async function saveFeeRules(db: DB, projectId: string, rows: FeeRuleInput[], actor: Actor): Promise<Result> {
  if (!(await getProject(db, projectId))) return { ok: false, reason: "That project no longer exists." };
  const tracks = await db.select({ id: projectTracks.id }).from(projectTracks).where(eq(projectTracks.projectId, projectId));
  const email = actorEmail(actor);
  const clean: Row<Record<string, unknown>>[] = [];
  for (const r of rows) {
    const blank = !r.id && (r.amount === null || r.amount === "" || r.amount === undefined);
    if (blank) continue;
    if (!r.remove) {
      const amount = toMoney(r.amount);
      if (amount === null || amount < 0) return { ok: false, reason: "Every fee rule needs a fee per person." };
      const currency = String(r.currency ?? "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, reason: "Currency is three letters, like USD." };
      if (!isOneOf(DOCUMENT_STAGES, r.earnedAtStage)) return { ok: false, reason: "Pick the stage where the fee is earned." };
      const terms = r.paymentTermsDays === null || r.paymentTermsDays === "" || r.paymentTermsDays === undefined ? 30 : toInt(r.paymentTermsDays, 0, 365);
      if (terms === null) return { ok: false, reason: "Payment terms are 0 to 365 days." };
      if (r.trackId && !tracks.some((t) => t.id === r.trackId)) return { ok: false, reason: "Pick a track of this project." };
      clean.push({ id: r.id, trackId: r.trackId || null, amount, currency, earnedAtStage: r.earnedAtStage, paymentTermsDays: terms, active: r.active, notes: cleanText(r.notes, 500), updatedAt: new Date(), ...(r.id ? {} : { createdBy: email }) });
    } else clean.push({ id: r.id, remove: true });
  }
  await saveList(db, projectFeeRules, projectId, clean, actor);
  await logActivity(db, { entityType: "project", entityId: projectId, actor, action: "fee_rules_saved" });
  return { ok: true, id: projectId };
}

/** Links jobs to the project (or unlinks them with projectId null). */
export async function linkJobs(db: DB, projectId: string | null, jobIds: string[], actor: Actor): Promise<Result<{ id: string; n: number }>> {
  const ids = jobIds.filter(isUuid);
  if (!ids.length) return { ok: false, reason: "Tick the roles to link." };
  if (projectId && !(await getProject(db, projectId))) return { ok: false, reason: "That project no longer exists." };
  const rows = await db.update(jobs).set({ projectId, updatedAt: new Date() }).where(inArray(jobs.id, ids)).returning({ id: jobs.id });
  for (const r of rows) await logActivity(db, { entityType: "job", entityId: r.id, actor, action: projectId ? "linked_to_project" : "unlinked_from_project", detail: projectId ? { projectId } : undefined });
  return { ok: true, id: projectId ?? "", n: rows.length };
}

// ---------- Reads for the project page ----------

export async function projectParts(db: DB, id: string, role: Role) {
  const [tracks, members, documents, feeRules, reports, roles] = await Promise.all([
    db.select().from(projectTracks).where(eq(projectTracks.projectId, id)).orderBy(asc(projectTracks.position), asc(projectTracks.createdAt)),
    db
      .select({ id: projectMembers.id, teamMemberId: projectMembers.teamMemberId, role: projectMembers.role, active: projectMembers.active, capacity: projectMembers.capacity, name: teamMembers.name, email: teamMembers.email })
      .from(projectMembers)
      .innerJoin(teamMembers, eq(teamMembers.id, projectMembers.teamMemberId))
      .where(eq(projectMembers.projectId, id))
      .orderBy(asc(projectMembers.createdAt)),
    db.select().from(projectDocuments).where(eq(projectDocuments.projectId, id)).orderBy(asc(projectDocuments.position), asc(projectDocuments.createdAt)),
    // Money-only: never read for other roles.
    canSeeMoney(role) ? db.select().from(projectFeeRules).where(eq(projectFeeRules.projectId, id)).orderBy(asc(projectFeeRules.createdAt)) : Promise.resolve([]),
    db.select().from(partnerReports).where(eq(partnerReports.projectId, id)).orderBy(desc(partnerReports.periodEnd), desc(partnerReports.createdAt)),
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        visibility: jobs.visibility,
        trackId: jobs.trackId,
        closesOn: jobs.closesOn,
        people: sql<number>`(select count(*) from ${applications} a where a.job_id = ${jobs.id})`.mapWith(Number),
      })
      .from(jobs)
      .where(eq(jobs.projectId, id))
      .orderBy(asc(jobs.title)),
  ]);
  return { tracks, members, documents, feeRules: rowsWithoutMoney(role, "project_fee_rules", feeRules), reports, roles };
}

/** Jobs not in this project, for "Link existing role": not in a project first. */
export async function linkableJobs(db: DB, projectId: string) {
  return db
    .select({ id: jobs.id, title: jobs.title, status: jobs.status, projectId: jobs.projectId, projectCode: projects.code })
    .from(jobs)
    .leftJoin(projects, eq(projects.id, jobs.projectId))
    .where(sql`${jobs.projectId} is distinct from ${projectId}`)
    .orderBy(sql`case when ${jobs.projectId} is null then 0 else 1 end`, asc(jobs.title))
    .limit(300);
}

export type ProjectPerson = { applicationId: string; expertId: string; name: string; email: string | null; jobId: string; jobTitle: string; trackId: string | null; trackName: string | null; stage: string; stageChangedAt: Date; owner: string | null };

export async function projectPeople(db: DB, id: string, role: Role, stage?: string): Promise<ProjectPerson[]> {
  const rows = await db
    .select({
      applicationId: applications.id,
      expertId: experts.id,
      name: experts.fullName,
      email: experts.email,
      jobId: jobs.id,
      jobTitle: jobs.title,
      trackId: sql<string | null>`coalesce(${applications.trackId}, ${jobs.trackId})`,
      trackName: sql<string | null>`(select t.name from ${projectTracks} t where t.id = coalesce(${applications.trackId}, ${jobs.trackId}))`,
      stage: applications.stage,
      stageChangedAt: applications.stageChangedAt,
      owner: sql<string | null>`coalesce((select coalesce(m.name, m.email) from ${teamMembers} m where m.id = ${applications.ownerTeamMemberId}), ${applications.ownerName})`,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(experts, eq(experts.id, applications.expertId))
    .where(and(eq(jobs.projectId, id), stage && isOneOf(PIPELINE_STAGES, stage) ? eq(applications.stage, stage) : undefined))
    .orderBy(desc(applications.stageChangedAt))
    .limit(2000);
  const contact = canSeeContact(role);
  return rows.map((r) => ({ ...r, email: contact ? r.email : maskEmail(r.email) }));
}

// ---------- The funnel (pure, from rows) ----------

export type FunnelInput = {
  kind: string;
  targetCount: number | null;
  pipelines: { expertId: string; stage: string; createdAt: Date; stageChangedAt: Date; trackId: string | null }[];
  referrals: { personKey: string; outcome: string; sentAt: Date; outcomeAt: Date | null }[];
  tracks: { id: string; name: string; targetCount: number | null }[];
};

export type Funnel = {
  people: number;
  rejected: number;
  stages: Record<string, number>;
  achieved: number;
  weekly: { week: string; added: number; achieved: number }[];
  pace: number;
  projected: string | null;
  tracks: { id: string; name: string; targetCount: number | null; achieved: number; inPipeline: number }[];
};

const ACHIEVED_STAGES = ["active", "ended"];

/**
 * People, stage counts, achieved, the last 12 weeks (India-time weeks from Monday), the pace over the
 * last 4 full weeks and the projected date. Referral and agency projects count referrals that became
 * active; the other kinds count pipelines that reached Active (or later ended).
 */
export function projectFunnel(input: FunnelInput, now: Date = new Date()): Funnel {
  const today = dateIST(now);
  const stages = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0])) as Record<string, number>;
  for (const p of input.pipelines) stages[p.stage] = (stages[p.stage] ?? 0) + 1;
  const people = new Set([...input.pipelines.map((p) => `e:${p.expertId}`), ...input.referrals.map((r) => r.personKey)]).size;
  const byReferral = input.kind === "referral" || input.kind === "agency";
  // Each person once, at their earliest date.
  const firstAchieved = new Map<string, { at: Date; trackId: string | null }>();
  if (byReferral) {
    for (const r of input.referrals)
      if (r.outcome === "active") {
        const at = r.outcomeAt ?? r.sentAt;
        const prev = firstAchieved.get(r.personKey);
        if (!prev || at < prev.at) firstAchieved.set(r.personKey, { at, trackId: null });
      }
  } else {
    for (const p of input.pipelines)
      if (ACHIEVED_STAGES.includes(p.stage)) {
        const key = `e:${p.expertId}`;
        const prev = firstAchieved.get(key);
        if (!prev || p.stageChangedAt < prev.at) firstAchieved.set(key, { at: p.stageChangedAt, trackId: p.trackId });
      }
  }
  const thisWeek = weekStart(today);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(thisWeek, -7 * (11 - i)));
  const weekOf = (d: Date) => weekStart(dateIST(d));
  const added = new Map<string, number>();
  for (const p of input.pipelines) added.set(weekOf(p.createdAt), (added.get(weekOf(p.createdAt)) ?? 0) + 1);
  for (const r of input.referrals) added.set(weekOf(r.sentAt), (added.get(weekOf(r.sentAt)) ?? 0) + 1);
  const achievedBy = new Map<string, number>();
  for (const a of firstAchieved.values()) achievedBy.set(weekOf(a.at), (achievedBy.get(weekOf(a.at)) ?? 0) + 1);
  const weekly = weeks.map((w) => ({ week: w, added: added.get(w) ?? 0, achieved: achievedBy.get(w) ?? 0 }));
  // The last 4 full weeks: the 4 before this one.
  const lastFour = weeks.slice(-5, -1);
  const pace = lastFour.reduce((n, w) => n + (achievedBy.get(w) ?? 0), 0) / 4;
  const achieved = firstAchieved.size;
  const remaining = input.targetCount != null ? input.targetCount - achieved : 0;
  const projected = input.targetCount != null && remaining > 0 && pace > 0 ? addDays(today, Math.ceil((remaining / pace) * 7)) : null;
  const tracks = input.tracks.map((t) => ({
    ...t,
    achieved: byReferral ? 0 : [...firstAchieved.values()].filter((a) => a.trackId === t.id).length,
    inPipeline: input.pipelines.filter((p) => p.trackId === t.id && p.stage !== "rejected" && p.stage !== "ended").length,
  }));
  return { people, rejected: stages.rejected ?? 0, stages, achieved, weekly, pace, projected, tracks };
}

export async function funnelFor(db: DB, p: { id: string; kind: string; targetCount: number | null }, tracks: { id: string; name: string; targetCount: number | null }[], now = new Date()): Promise<Funnel> {
  const [pipes, refs] = await Promise.all([
    db
      .select({ expertId: applications.expertId, stage: applications.stage, createdAt: applications.createdAt, stageChangedAt: applications.stageChangedAt, trackId: sql<string | null>`coalesce(${applications.trackId}, ${jobs.trackId})` })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(eq(jobs.projectId, p.id)),
    db
      .select({ personKey: sql<string>`case when ${referrals.expertId} is not null then 'e:' || ${referrals.expertId}::text else 'm:' || lower(${referrals.recipientEmail}) end`, outcome: referrals.outcome, sentAt: referrals.sentAt, outcomeAt: referrals.outcomeAt })
      .from(referrals)
      .where(eq(referrals.projectId, p.id)),
  ]);
  return projectFunnel({ kind: p.kind, targetCount: p.targetCount, pipelines: pipes, referrals: refs, tracks }, now);
}

/** Owner and team choices. */
export async function activeTeam(db: DB) {
  return db.select({ id: teamMembers.id, name: teamMembers.name, email: teamMembers.email }).from(teamMembers).where(eq(teamMembers.active, true)).orderBy(sql`coalesce(${teamMembers.name}, ${teamMembers.email})`);
}

