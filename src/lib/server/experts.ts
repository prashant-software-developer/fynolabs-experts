import { and, arrayContains, asc, count, desc, eq, gte, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accounts, activity, applications, dataRequests, erasures, expertDetails, expertFiles, expertPayout, expertSources, experts, jobs, legacyMap, placements, submissions, teamMembers, type Expert, type ExpertDetails, type ExpertPayout } from "@/db/schema";
import { canSeeContact, canSeeMoney, type Role } from "@/lib/auth/permissions";
import { rowsOf } from "@/db/client";
import { EXPERT_STATUSES } from "@/lib/constants";
import type { ExpertFilters } from "@/lib/filters";
import { emailHash } from "@/lib/normalize";
import { actorEmail, logActivity, type Actor } from "./activity";

/** Columns for lists (everything except the search vector). */
export const expertListColumns = {
  id: experts.id,
  fullName: experts.fullName,
  email: experts.email,
  phone: experts.phone,
  country: experts.country,
  region: experts.region,
  city: experts.city,
  linkedinUrl: experts.linkedinUrl,
  headline: experts.headline,
  domain: experts.domain,
  skills: experts.skills,
  languages: experts.languages,
  yearsExperience: experts.yearsExperience,
  highestDegree: experts.highestDegree,
  fieldOfStudy: experts.fieldOfStudy,
  university: experts.university,
  hoursPerWeek: experts.hoursPerWeek,
  availability: experts.availability,
  rateExpectationUsd: experts.rateExpectationUsd,
  status: experts.status,
  cvConsent: experts.cvConsent,
  cvConsentAt: experts.cvConsentAt,
  cvRef: experts.cvRef,
  notes: experts.notes,
  tags: experts.tags,
  primarySource: experts.primarySource,
  createdAt: experts.createdAt,
  updatedAt: experts.updatedAt,
  lastContactedAt: experts.lastContactedAt,
  // The FynoLabs admin's workflow fields.
  ownerTeamMemberId: experts.ownerTeamMemberId,
  ownerName: experts.ownerName,
  outreachStatus: experts.outreachStatus,
  nextAction: experts.nextAction,
  nextActionDue: experts.nextActionDue,
  lastActivityAt: experts.lastActivityAt,
  sourceChannel: experts.sourceChannel,
  sourceDetail: experts.sourceDetail,
  emailOptOut: experts.emailOptOut,
  dncReason: experts.dncReason,
};
export type ExpertRow = Omit<Expert, "search">;

/** The stage of someone's leading pipeline: the most advanced open one, else the most advanced of all. */
export const leadingStageSql = sql<string | null>`(select a.stage from ${applications} a where a.expert_id = "hub"."experts"."id" order by (a.stage in ('ended', 'rejected')) asc, array_position(array['new','shortlisted','referred','selected','documents','signed','active','ended','rejected']::text[], a.stage) desc, a.stage_changed_at desc limit 1)`;
/** The owner's name (team member), for lists. */
export const ownerNameSql = sql<string | null>`(select coalesce(t.name, t.email) from ${teamMembers} t where t.id = "hub"."experts"."owner_team_member_id")`;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** "pyth numer" -> "pyth:* & numer:*" (prefix search on every word). */
export function toTsQuery(q: string): string | null {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(" & ") : null;
}

/** Has a pipeline matching the job / project / track / stage filters (all of them on the same pipeline). */
function pipelineCondition(f: ExpertFilters): SQL | null {
  const parts: SQL[] = [];
  if (f.job) parts.push(sql`a.job_id = ${f.job}::uuid`);
  if (f.track) parts.push(sql`a.track_id = ${f.track}::uuid`);
  if (f.stage) parts.push(sql`a.stage = ${f.stage}`);
  if (f.project) parts.push(sql`exists (select 1 from ${jobs} j where j.id = a.job_id and j.project_id = ${f.project}::uuid)`);
  if (!parts.length) return null;
  return sql`exists (select 1 from ${applications} a where a.expert_id = ${experts.id} and ${sql.join(parts, sql` and `)})`;
}

/**
 * `contact: false` (roles that see masked contact details): search can't match email or phone.
 * `meEmail`: who "owner = me" means.
 */
export function expertConditions(f: ExpertFilters, opts: { contact?: boolean; meEmail?: string; today?: string } = {}): SQL[] {
  const conds: SQL[] = [];
  if (f.q) {
    const tsq = toTsQuery(f.q);
    const like = `%${escapeLike(f.q)}%`;
    const parts: SQL[] = opts.contact === false ? [ilike(experts.linkedinUrl, like)] : [ilike(experts.email, like), ilike(experts.linkedinUrl, like), ilike(experts.phone, like)];
    if (tsq) parts.unshift(sql`${experts.search} @@ to_tsquery('simple', ${tsq})`);
    conds.push(or(...parts)!);
  }
  if (f.domain) conds.push(eq(experts.domain, f.domain));
  if (f.skills.length) conds.push(arrayContains(experts.skills, f.skills));
  if (f.country) conds.push(eq(experts.country, f.country));
  if (f.status) conds.push(eq(experts.status, f.status));
  if (f.availability) conds.push(eq(experts.availability, f.availability));
  if (f.consent) conds.push(eq(experts.cvConsent, f.consent));
  if (f.tag) conds.push(arrayContains(experts.tags, [f.tag]));
  if (f.minYears != null) conds.push(gte(experts.yearsExperience, f.minYears));
  if (f.source) {
    conds.push(
      or(
        eq(experts.primarySource, f.source),
        sql`exists (select 1 from ${expertSources} where ${expertSources.expertId} = ${experts.id} and ${expertSources.source} = ${f.source})`,
      )!,
    );
  }
  if (f.owner === "none") conds.push(sql`${experts.ownerTeamMemberId} is null`);
  else if (f.owner === "me") conds.push(sql`${experts.ownerTeamMemberId} in (select t.id from ${teamMembers} t where t.email = ${(opts.meEmail ?? "").toLowerCase()})`);
  else if (f.owner) conds.push(eq(experts.ownerTeamMemberId, f.owner));
  if (f.outreach) conds.push(eq(experts.outreachStatus, f.outreach));
  if (f.channel) conds.push(eq(experts.sourceChannel, f.channel));
  if (f.due) {
    const today = opts.today ?? new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    if (f.due === "overdue") conds.push(sql`${experts.nextActionDue} < ${today}::date`);
    if (f.due === "today") conds.push(sql`${experts.nextActionDue} <= ${today}::date`);
    if (f.due === "week") conds.push(sql`${experts.nextActionDue} <= (${today}::date + 7)`);
  }
  const pipe = pipelineCondition(f);
  if (pipe) conds.push(pipe);
  return conds;
}

function orderFor(f: ExpertFilters): SQL[] {
  const d = f.dir === "asc" ? asc : desc;
  switch (f.sort) {
    case "name":
      return [d(experts.fullName)];
    case "domain":
      return [d(experts.domain), asc(experts.fullName)];
    case "country":
      return [d(experts.country), asc(experts.fullName)];
    case "years":
      return [f.dir === "asc" ? sql`${experts.yearsExperience} asc nulls first` : sql`${experts.yearsExperience} desc nulls last`, asc(experts.fullName)];
    case "status":
      return [d(experts.status), asc(experts.fullName)];
    case "created":
      return [d(experts.createdAt)];
    case "next":
      return [f.dir === "asc" ? sql`${experts.nextActionDue} asc nulls last` : sql`${experts.nextActionDue} desc nulls last`, asc(experts.fullName)];
    case "activity":
      return [f.dir === "asc" ? sql`coalesce(${experts.lastActivityAt}, ${experts.updatedAt}) asc` : sql`coalesce(${experts.lastActivityAt}, ${experts.updatedAt}) desc`];
    case "rank": {
      const tsq = toTsQuery(f.q);
      if (tsq) return [sql`ts_rank(${experts.search}, to_tsquery('simple', ${tsq})) desc`, asc(experts.fullName)];
      return [desc(experts.updatedAt)];
    }
    default:
      return [d(experts.updatedAt)];
  }
}

export async function listExperts(db: DB, f: ExpertFilters, opts: { limit: number; offset: number; contact?: boolean; meEmail?: string }) {
  const where = and(...expertConditions(f, { contact: opts.contact, meEmail: opts.meEmail }));
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ ...expertListColumns, leadingStage: leadingStageSql, ownerMemberName: ownerNameSql })
      .from(experts)
      .where(where)
      .orderBy(...orderFor(f))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ n: count() }).from(experts).where(where),
  ]);
  return { rows: rows as (ExpertRow & { leadingStage: string | null; ownerMemberName: string | null })[], total: Number(n) };
}

/** Board layout: one column per status (the filters still apply), newest first, `perColumn` cards each. */
export async function expertBoard(db: DB, f: ExpertFilters, opts: { perColumn: number; contact?: boolean; meEmail?: string }) {
  const statuses = f.status ? [f.status] : [...EXPERT_STATUSES];
  const base = and(...expertConditions({ ...f, status: "" }, { contact: opts.contact, meEmail: opts.meEmail }));
  const counts = await db
    .select({ status: experts.status, n: count() })
    .from(experts)
    .where(and(base, inArray(experts.status, statuses)))
    .groupBy(experts.status);
  const byStatus = new Map(counts.map((c) => [c.status, Number(c.n)]));
  const columns = await Promise.all(
    statuses.map(async (status) => {
      const rows = byStatus.get(status)
        ? ((await db
            .select(expertListColumns)
            .from(experts)
            .where(and(base, eq(experts.status, status)))
            .orderBy(...orderFor(f))
            .limit(opts.perColumn)) as ExpertRow[])
        : [];
      return { status, total: byStatus.get(status) ?? 0, rows };
    }),
  );
  return columns;
}

export async function getExpert(db: DB, id: string): Promise<ExpertRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select(expertListColumns).from(experts).where(eq(experts.id, id)).limit(1);
  return (row as ExpertRow) ?? null;
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export type Duplicate = { id: string; fullName: string; matchedBy: "email" | "linkedin" };

export async function findDuplicates(db: DB, input: { email: string | null; linkedinUrl: string | null; excludeId?: string }): Promise<Duplicate[]> {
  const parts: SQL[] = [];
  if (input.email) parts.push(eq(experts.email, input.email));
  if (input.linkedinUrl) parts.push(sql`lower(${experts.linkedinUrl}) = ${input.linkedinUrl.toLowerCase()}`);
  if (!parts.length) return [];
  const conds = [or(...parts)!];
  if (input.excludeId) conds.push(ne(experts.id, input.excludeId));
  const rows = await db
    .select({ id: experts.id, fullName: experts.fullName, email: experts.email, linkedinUrl: experts.linkedinUrl })
    .from(experts)
    .where(and(...conds))
    .limit(5);
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    matchedBy: input.email && r.email === input.email ? "email" : "linkedin",
  }));
}

export async function distinctValues(db: DB) {
  const [countries, domains] = await Promise.all([
    db.selectDistinct({ v: experts.country }).from(experts).where(sql`${experts.country} is not null`).orderBy(asc(experts.country)),
    db.selectDistinct({ v: experts.domain }).from(experts).where(sql`${experts.domain} is not null`).orderBy(asc(experts.domain)),
  ]);
  return { countries: countries.map((r) => r.v!).filter(Boolean), domains: domains.map((r) => r.v!).filter(Boolean) };
}

export async function sourcesFor(db: DB, expertId: string) {
  return db.select().from(expertSources).where(eq(expertSources.expertId, expertId)).orderBy(asc(expertSources.createdAt));
}

export async function filesFor(db: DB, expertId: string) {
  return db
    .select({
      id: expertFiles.id,
      expertId: expertFiles.expertId,
      kind: expertFiles.kind,
      filename: expertFiles.filename,
      mime: expertFiles.mime,
      size: expertFiles.size,
      storage: expertFiles.storage,
      externalRef: expertFiles.externalRef,
      createdBy: expertFiles.createdBy,
      createdAt: expertFiles.createdAt,
    })
    .from(expertFiles)
    .where(eq(expertFiles.expertId, expertId))
    .orderBy(desc(expertFiles.createdAt));
}

/**
 * Profile details copied from the old jobs site (experience, education, address, work authorisation,
 * referral, last sign-in). The address lines are contact details: masked roles get null.
 */
export async function detailsFor(db: DB, expertId: string, role: Role): Promise<(ExpertDetails & { referredByName: string | null }) | null> {
  const [row] = await db
    .select({ d: expertDetails, referredByName: experts.fullName })
    .from(expertDetails)
    .leftJoin(experts, eq(experts.id, expertDetails.referredByExpertId))
    .where(eq(expertDetails.expertId, expertId))
    .limit(1);
  if (!row) return null;
  const d = { ...row.d, referredByName: row.referredByName ?? null };
  if (!canSeeContact(role)) {
    d.addressLine1 = null;
    d.addressLine2 = null;
    d.postalCode = null;
  }
  return d;
}

/** Money-only: payout method and handle, tax form. null for every role that can't see money. */
export async function payoutFor(db: DB, expertId: string, role: Role): Promise<ExpertPayout | null> {
  if (!canSeeMoney(role)) return null;
  const [row] = await db.select().from(expertPayout).where(eq(expertPayout.expertId, expertId)).limit(1);
  return row ?? null;
}

/** The file cv_ref points at ("jobs:file:12" or "upload:<uuid>"), else the newest file. */
export function currentCv<T extends { id: string; storage: string; externalRef: string | null }>(cvRef: string | null, files: T[]): T | null {
  if (cvRef?.startsWith("upload:")) {
    const f = files.find((x) => x.id === cvRef.slice("upload:".length));
    if (f) return f;
  }
  if (cvRef?.startsWith("jobs:file:")) {
    const f = files.find((x) => x.storage === "jobs_db" && x.externalRef === cvRef.slice("jobs:file:".length));
    if (f) return f;
  }
  return files[0] ?? null;
}

/**
 * Delete on request: removes the expert, their sources, files, applications, invites and submissions (cascade), keeps
 * placement money rows without the person, deletes their activity rows and remembers only a hash
 * of the email so imports don't bring them back.
 */
export async function deleteExpertOnRequest(db: DB, id: string, actor: Actor): Promise<boolean> {
  const e = await getExpert(db, id);
  if (!e) return false;
  const srcs = await sourcesFor(db, id);
  const rows: { emailSha256: string | null; source: string | null; externalId: string | null; actorEmail: string }[] = [];
  if (e.email) rows.push({ emailSha256: emailHash(e.email), source: null, externalId: null, actorEmail: actorEmail(actor) });
  for (const s of srcs) rows.push({ emailSha256: null, source: s.source, externalId: s.externalId, actorEmail: actorEmail(actor) });
  if (rows.length) await db.insert(erasures).values(rows);
  await db.update(placements).set({ notes: null, updatedAt: new Date() }).where(eq(placements.expertId, id));
  // From the FynoLabs admin: fee rows stay for accounting without the person; rows that only hold
  // their email go (their timeline, documents, engagements and referrals go with the record).
  await db.execute(sql`update hub.referral_fees set person_name = null, notes = null where expert_id = ${id}`);
  if (e.email) {
    const em = e.email.toLowerCase();
    for (const [t, c] of [["referral_group_members", "email"], ["messages", "email"], ["email_send_log", "recipient_email"], ["referrals", "recipient_email"], ["message_replies", "recipient_email"]] as const) {
      await db.execute(sql`delete from ${sql.raw(`hub."${t}"`)} where lower(${sql.raw(`"${c}"`)}) = ${em}`);
    }
  }
  await db.delete(activity).where(and(eq(activity.entityType, "expert"), eq(activity.entityId, id)));
  const subIds = (await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.expertId, id))).map((r) => r.id);
  if (subIds.length) await db.delete(activity).where(and(eq(activity.entityType, "submission"), inArray(activity.entityId, subIds)));
  const appIds = (await db.select({ id: applications.id }).from(applications).where(eq(applications.expertId, id))).map((r) => r.id);
  if (appIds.length) await db.delete(activity).where(and(eq(activity.entityType, "application"), inArray(activity.entityId, appIds)));
  const fyFiles = (await db.select({ ref: expertFiles.externalRef }).from(expertFiles).where(and(eq(expertFiles.expertId, id), eq(expertFiles.storage, "fynolabs")))).map((r) => r.ref ?? "");
  await forgetCopiedRecords(db, id, srcs);
  await forgetFynolabsCopy(db, { email: e.email, profileIds: srcs.filter((s) => s.source === "admin_crm").map((s) => s.externalId), fileRefs: fyFiles });
  // A "Delete my data" request from the portal is now done (the row keeps no link to the person).
  await db.update(dataRequests).set({ status: "done", handledBy: actorEmail(actor), handledAt: new Date() }).where(and(eq(dataRequests.expertId, id), eq(dataRequests.status, "open")));
  // Their expert login goes too (team accounts are never touched here).
  await db.delete(accounts).where(and(eq(accounts.accountType, "expert"), e.email ? or(eq(accounts.expertId, id), eq(accounts.email, e.email.toLowerCase())) : eq(accounts.expertId, id)));
  await db.delete(experts).where(eq(experts.id, id));
  await logActivity(db, { entityType: "expert", entityId: id, actor, action: "deleted_on_request", detail: { sources: srcs.map((s) => s.source) } });
  return true;
}

/**
 * Part of delete on request: the copy of their jobs-site records (engine_copy, outside hub) and the
 * links in hub.legacy_map go too. Later copies skip them (hub.erasures has their jobs-site id).
 */
async function forgetCopiedRecords(db: DB, expertId: string, srcs: { source: string; externalId: string }[]) {
  const fileIds = (await db.select({ id: expertFiles.id }).from(expertFiles).where(eq(expertFiles.expertId, expertId))).map((r) => r.id);
  const appIds = (await db.select({ id: applications.id }).from(applications).where(eq(applications.expertId, expertId))).map((r) => r.id);
  const hubIds = [expertId, ...fileIds, ...appIds];
  for (let i = 0; i < hubIds.length; i += 500) await db.delete(legacyMap).where(inArray(legacyMap.hubId, hubIds.slice(i, i + 500)));
  const userIds = srcs.filter((s) => s.source === "jobs_site" && /^\d+$/.test(s.externalId)).map((s) => s.externalId);
  if (!userIds.length) return;
  const [has] = rowsOf<{ ok: boolean }>(await db.execute(sql`select to_regclass('engine_copy.users') is not null as ok`));
  if (!has?.ok) return;
  const ids = `{${userIds.join(",")}}`;
  const tables = rowsOf<{ t: string; c: string }>(
    await db.execute(sql`select table_name::text as t, column_name::text as c from information_schema.columns
      where table_schema = 'engine_copy' and column_name in ('user_id', 'referrer_id', 'referred_id', 'application_id')`),
  );
  // Rows that hang off their applications first, then everything keyed by their user id, then the user.
  for (const { t, c } of tables.filter((x) => x.c === "application_id")) {
    await db.execute(sql.raw(`delete from engine_copy."${t}" where "${c}"::text in (select id::text from engine_copy.applications where user_id::text = any('${ids}'::text[]))`));
  }
  for (const { t, c } of tables.filter((x) => x.c !== "application_id")) {
    await db.execute(sql.raw(`delete from engine_copy."${t}" where "${c}"::text = any('${ids}'::text[])`));
  }
  await db.execute(sql.raw(`delete from engine_copy.users where id::text = any('${ids}'::text[])`));
}

/**
 * Part of delete on request: their rows in fynolabs_copy (the copy of the FynoLabs admin, outside
 * hub) go too: the profile, everything with their profile id or email, and their stored files.
 * The next copy leaves them out (hub.erasures has their email hash and FynoLabs id).
 */
export async function forgetFynolabsCopy(db: DB, input: { email: string | null; profileIds: string[]; fileRefs: string[] }) {
  const [has] = rowsOf<{ ok: boolean }>(await db.execute(sql`select to_regclass('fynolabs_copy.talent_profiles') is not null as ok`));
  if (!has?.ok) return;
  const ids = input.profileIds.filter((x) => isUuid(x));
  const email = input.email?.trim().toLowerCase() ?? null;
  const cols = rowsOf<{ t: string; c: string }>(
    await db.execute(sql`select table_name::text as t, column_name::text as c from information_schema.columns
      where table_schema = 'fynolabs_copy' and column_name in ('profile_id', 'email', 'recipient_email')`),
  );
  const idList = sql.raw(`'{${ids.join(",")}}'::text[]`);
  for (const { t, c } of cols) {
    const table = sql.raw(`fynolabs_copy."${t.replace(/"/g, "")}"`);
    if (c === "profile_id" && ids.length) await db.execute(sql`delete from ${table} where profile_id::text = any(${idList})`);
    if (c !== "profile_id" && email) await db.execute(sql`delete from ${table} where lower(btrim(${sql.raw(`"${c}"`)})) = ${email}`);
  }
  if (ids.length) await db.execute(sql`delete from fynolabs_copy.talent_profiles where id::text = any(${idList})`);
  const [st] = rowsOf<{ ok: boolean }>(await db.execute(sql`select to_regclass('fynolabs_copy.storage_objects') is not null as ok`));
  for (const ref of input.fileRefs) {
    const m = /^fynolabs:([^/]+)\/(.+)$/.exec(ref);
    if (m && st?.ok) await db.execute(sql`delete from fynolabs_copy.storage_objects where bucket = ${m[1]} and name = ${m[2]}`);
  }
}
