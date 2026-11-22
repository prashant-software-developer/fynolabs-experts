// Jobs, their application forms and templates (admin side), plus the public board queries.
import { and, arrayOverlaps, asc, desc, eq, gte, ilike, inArray, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, experts, formTemplates, jobFormFields, jobInvites, jobs, partners, requirements, type Job, type JobFormField } from "@/db/schema";
import { cleanFieldDef, checkFormDefinition, defaultTemplate, FIELD_TYPE_INFO, isFieldType, isProfileKey, type FieldDef, type TemplateField } from "@/lib/forms/job-fields";
import type { JobData } from "@/lib/forms/job";
import { todayIso } from "@/lib/jobs-public";
import { normalizeSkill } from "@/lib/match/dictionary";
import { rankCandidates, type MatchRequirement } from "@/lib/match/score";
import { publicCopyProblems, type CopyProblem } from "@/lib/public-copy";
import { cleanText } from "@/lib/normalize";
import { logActivity, type Actor } from "./activity";
import { isUuid } from "./experts";
import { matchColumns, type MatchExpertRow } from "./requirements";

// ---------- Slugs ----------

export function slugBase(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "job";
}

export async function uniqueSlug(db: DB, title: string, excludeId?: string): Promise<string> {
  const base = slugBase(title);
  const rows = await db
    .select({ slug: jobs.slug, id: jobs.id })
    .from(jobs)
    .where(or(eq(jobs.slug, base), sql`${jobs.slug} like ${`${base}-%`}`));
  const taken = new Set(rows.filter((r) => r.id !== excludeId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

// ---------- Reading ----------

export async function getJob(db: DB, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ job: jobs, partnerName: partners.name, requirementTitle: requirements.title })
    .from(jobs)
    .leftJoin(partners, eq(partners.id, jobs.partnerId))
    .leftJoin(requirements, eq(requirements.id, jobs.requirementId))
    .where(eq(jobs.id, id))
    .limit(1);
  return row ?? null;
}

export async function getJobBySlug(db: DB, slug: string): Promise<Job | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const [row] = await db.select().from(jobs).where(eq(jobs.slug, slug)).limit(1);
  return row ?? null;
}

export type JobListFilters = { q?: string; status?: string; visibility?: string; partnerId?: string; featured?: boolean };

export async function listJobs(db: DB, f: JobListFilters = {}) {
  const conds: SQL[] = [];
  if (f.q) conds.push(or(ilike(jobs.title, `%${f.q.replace(/[\\%_]/g, "")}%`), ilike(jobs.summary, `%${f.q.replace(/[\\%_]/g, "")}%`))!);
  if (f.status === "live") conds.push(inArray(jobs.status, ["open", "paused"]));
  else if (f.status) conds.push(eq(jobs.status, f.status));
  if (f.visibility) conds.push(eq(jobs.visibility, f.visibility));
  if (f.partnerId && isUuid(f.partnerId)) conds.push(eq(jobs.partnerId, f.partnerId));
  if (f.featured) conds.push(eq(jobs.featured, true));
  return db
    .select({
      job: jobs,
      partnerName: partners.name,
      applicants: sql<number>`(select count(*) from ${applications} a where a.job_id = ${jobs.id})`.mapWith(Number),
      newApplicants: sql<number>`(select count(*) from ${applications} a where a.job_id = ${jobs.id} and a.status = 'new')`.mapWith(Number),
    })
    .from(jobs)
    .leftJoin(partners, eq(partners.id, jobs.partnerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`case ${jobs.status} when 'open' then 0 when 'paused' then 1 when 'draft' then 2 else 3 end`, desc(jobs.featured), desc(jobs.updatedAt));
}

export async function jobCounts(db: DB) {
  const rows = await db.select({ status: jobs.status, n: sql<number>`count(*)`.mapWith(Number) }).from(jobs).groupBy(jobs.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** The public board: open, public, not past the closing date. Featured first, then newest. */
export async function listPublicJobs(db: DB, f: { q?: string; domain?: string; today?: string } = {}): Promise<Job[]> {
  const today = f.today ?? todayIso();
  const conds: SQL[] = [eq(jobs.status, "open"), eq(jobs.visibility, "public"), or(isNull(jobs.closesOn), gte(jobs.closesOn, today))!];
  if (f.domain) conds.push(sql`${f.domain} = any(${jobs.domains})`);
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, "").slice(0, 100)}%`;
    const skill = normalizeSkill(f.q);
    conds.push(or(ilike(jobs.title, like), ilike(jobs.summary, like), ilike(jobs.description, like), ...(skill ? [arrayOverlaps(jobs.skills, [skill])] : []))!);
  }
  return db
    .select()
    .from(jobs)
    .where(and(...conds))
    .orderBy(desc(jobs.featured), sql`coalesce(${jobs.publishedAt}, ${jobs.createdAt}) desc`)
    .limit(200);
}

/** Domains that have at least one listed job (for the board's filter). */
export async function publicDomains(db: DB, today = todayIso()): Promise<string[]> {
  const rows = await db
    .select({ d: sql<string>`unnest(${jobs.domains})` })
    .from(jobs)
    .where(and(eq(jobs.status, "open"), eq(jobs.visibility, "public"), or(isNull(jobs.closesOn), gte(jobs.closesOn, today))));
  return [...new Set(rows.map((r) => r.d))].sort();
}

// ---------- Fields ----------

export function toFieldDef(f: JobFormField): FieldDef {
  return {
    id: f.id,
    type: isFieldType(f.type) ? f.type : "short_text",
    label: f.label,
    helpText: f.helpText,
    required: f.required,
    options: f.options ?? null,
    mapsTo: isProfileKey(f.mapsTo) ? f.mapsTo : null,
  };
}

export async function jobFields(db: DB, jobId: string): Promise<FieldDef[]> {
  if (!isUuid(jobId)) return [];
  const rows = await db.select().from(jobFormFields).where(eq(jobFormFields.jobId, jobId)).orderBy(asc(jobFormFields.position), asc(jobFormFields.createdAt));
  return rows.map(toFieldDef);
}

async function writeFields(db: DB, jobId: string, defs: TemplateField[]) {
  await db.delete(jobFormFields).where(eq(jobFormFields.jobId, jobId));
  if (!defs.length) return;
  await db.insert(jobFormFields).values(
    defs.map((d, i) => ({ jobId, position: i, type: d.type, label: d.label, helpText: d.helpText, required: d.required, options: d.options, mapsTo: d.mapsTo })),
  );
}

async function renumber(db: DB, jobId: string, ids: string[]) {
  for (let i = 0; i < ids.length; i++) await db.update(jobFormFields).set({ position: i }).where(and(eq(jobFormFields.id, ids[i]), eq(jobFormFields.jobId, jobId)));
}

async function touch(db: DB, jobId: string) {
  await db.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, jobId));
}

export type FieldOp =
  | { op: "add"; type: string; label?: string; afterId?: string | null }
  | { op: "update"; id: string; raw: Record<string, unknown> }
  | { op: "move"; id: string; dir: "up" | "down" }
  | { op: "delete"; id: string }
  | { op: "duplicate"; id: string };

export type FieldOpResult = { ok: true; fieldId?: string; message: string } | { ok: false; reason: string };

/** One builder change. A field another field's mapping depends on is protected (email, name). */
export async function changeField(db: DB, actor: Actor, jobId: string, change: FieldOp): Promise<FieldOpResult> {
  const fields = await jobFields(db, jobId);
  const idx = "id" in change ? fields.findIndex((f) => f.id === change.id) : -1;
  if ("id" in change && idx < 0) return { ok: false, reason: "That question no longer exists." };
  let message = "Saved.";
  let fieldId: string | undefined;
  if (change.op === "add") {
    if (!isFieldType(change.type)) return { ok: false, reason: "Pick a question type." };
    if (fields.length >= 60) return { ok: false, reason: "A form can have up to 60 questions." };
    const def = cleanFieldDef({ type: change.type, label: change.label || (change.type === "section" ? "New section" : `New ${FIELD_TYPE_INFO[change.type].label.toLowerCase()} question`), choices: FIELD_TYPE_INFO[change.type].choices ? ["Option 1", "Option 2"] : undefined });
    const at = change.afterId ? fields.findIndex((f) => f.id === change.afterId) + 1 : fields.length;
    const [row] = await db
      .insert(jobFormFields)
      .values({ jobId, position: at, type: def.type, label: def.label, helpText: def.helpText, required: def.required, options: def.options, mapsTo: null })
      .returning({ id: jobFormFields.id });
    const ids = fields.map((f) => f.id);
    ids.splice(at, 0, row.id);
    await renumber(db, jobId, ids);
    fieldId = row.id;
    message = "Question added. Edit its wording below.";
  } else if (change.op === "update") {
    const before = fields[idx];
    const def = cleanFieldDef({ ...change.raw, type: isFieldType(change.raw.type) ? change.raw.type : before.type });
    const others = fields.filter((f) => f.id !== before.id);
    if (def.mapsTo && others.some((f) => f.mapsTo === def.mapsTo)) return { ok: false, reason: "Another question already fills that profile field." };
    if ((before.mapsTo === "email" || before.mapsTo === "full_name") && def.mapsTo !== before.mapsTo) {
      return { ok: false, reason: `This question fills ${before.mapsTo === "email" ? "Email" : "Full name"}, which every application needs. Keep the mapping.` };
    }
    if ((def.mapsTo === "email" || def.mapsTo === "full_name") && !def.required) def.required = true;
    await db
      .update(jobFormFields)
      .set({ type: def.type, label: def.label, helpText: def.helpText, required: def.required, options: def.options, mapsTo: def.mapsTo })
      .where(and(eq(jobFormFields.id, before.id), eq(jobFormFields.jobId, jobId)));
    fieldId = before.id;
  } else if (change.op === "move") {
    const to = change.dir === "up" ? idx - 1 : idx + 1;
    if (to < 0 || to >= fields.length) return { ok: true, fieldId: change.id, message: "Already at the edge." };
    const ids = fields.map((f) => f.id);
    [ids[idx], ids[to]] = [ids[to], ids[idx]];
    await renumber(db, jobId, ids);
    fieldId = change.id;
    message = "Moved.";
  } else if (change.op === "delete") {
    const f = fields[idx];
    if (f.mapsTo === "email" || f.mapsTo === "full_name") return { ok: false, reason: "Every application needs a name and an email, so this question stays." };
    await db.delete(jobFormFields).where(and(eq(jobFormFields.id, f.id), eq(jobFormFields.jobId, jobId)));
    await renumber(db, jobId, fields.filter((x) => x.id !== f.id).map((x) => x.id));
    message = "Question deleted. Answers already given stay on the applications.";
  } else if (change.op === "duplicate") {
    if (fields.length >= 60) return { ok: false, reason: "A form can have up to 60 questions." };
    const f = fields[idx];
    const [row] = await db
      .insert(jobFormFields)
      .values({ jobId, position: idx + 1, type: f.type, label: `${f.label} (copy)`.slice(0, 600), helpText: f.helpText, required: f.required, options: f.options, mapsTo: null })
      .returning({ id: jobFormFields.id });
    const ids = fields.map((x) => x.id);
    ids.splice(idx + 1, 0, row.id);
    await renumber(db, jobId, ids);
    fieldId = row.id;
    message = "Question duplicated (the copy doesn't fill a profile field).";
  }
  await touch(db, jobId);
  await logActivity(db, { entityType: "job", entityId: jobId, actor, action: `form_${change.op}`, detail: fieldId ? { fieldId } : undefined });
  return { ok: true, fieldId, message };
}

// ---------- Templates ----------

export async function listTemplates(db: DB, viewerEmail: string) {
  return db
    .select()
    .from(formTemplates)
    .where(or(eq(formTemplates.shared, true), eq(formTemplates.createdBy, viewerEmail)))
    .orderBy(asc(formTemplates.name));
}

export async function saveTemplate(db: DB, actor: Actor & { email: string }, jobId: string, input: { name: unknown; shared: boolean }) {
  const name = cleanText(input.name, 80);
  if (!name) return { ok: false as const, reason: "Name the template." };
  const defs = (await jobFields(db, jobId)).map(({ id: _id, ...rest }) => rest);
  const [row] = await db.insert(formTemplates).values({ name, fields: defs, createdBy: actor.email, shared: input.shared }).returning({ id: formTemplates.id });
  await logActivity(db, { entityType: "job", entityId: jobId, actor, action: "form_saved_as_template", detail: { templateId: row.id } });
  return { ok: true as const, id: row.id };
}

/** Replaces the job's form with a template (or the default form when templateId is "default"). */
export async function applyTemplate(db: DB, actor: Actor & { email: string }, jobId: string, templateId: string) {
  let defs: TemplateField[];
  if (templateId === "default") defs = defaultTemplate();
  else {
    if (!isUuid(templateId)) return { ok: false as const, reason: "Pick a template." };
    const [tpl] = await db.select().from(formTemplates).where(eq(formTemplates.id, templateId)).limit(1);
    if (!tpl || (!tpl.shared && tpl.createdBy !== actor.email)) return { ok: false as const, reason: "That template no longer exists." };
    defs = (Array.isArray(tpl.fields) ? tpl.fields : []).slice(0, 60).map((f) => cleanFieldDef(f as Record<string, unknown>));
  }
  await writeFields(db, jobId, defs);
  await touch(db, jobId);
  await logActivity(db, { entityType: "job", entityId: jobId, actor, action: "form_from_template", detail: { templateId } });
  return { ok: true as const };
}

// ---------- Create / update / state ----------

/** Everything the public will read, checked for pay and the partner's name. */
export function jobCopyProblems(job: Pick<Job, "title" | "summary" | "description" | "publicCompanyLabel" | "location">, fields: readonly Pick<FieldDef, "label" | "helpText" | "options">[], partnerName: string | null): CopyProblem[] {
  const texts = [
    { field: "title", label: "The title", text: job.title },
    { field: "publicCompanyLabel", label: "The company label", text: job.publicCompanyLabel },
    { field: "summary", label: "The summary", text: job.summary },
    { field: "description", label: "The description", text: job.description },
    { field: "location", label: "The location", text: job.location },
    ...fields.flatMap((f, i) => [
      { field: `field:${i}`, label: `Question ${i + 1}`, text: [f.label, f.helpText, ...(f.options?.choices ?? [])].filter(Boolean).join(" \n ") },
    ]),
  ];
  return publicCopyProblems(texts, partnerName);
}

async function partnerNameOf(db: DB, partnerId: string | null): Promise<string | null> {
  if (!partnerId) return null;
  const [p] = await db.select({ name: partners.name }).from(partners).where(eq(partners.id, partnerId)).limit(1);
  return p?.name ?? null;
}

export type SaveJobResult = { ok: true; id: string; changed: string[] } | { ok: false; reason: string; field?: string };

export async function createJob(db: DB, actor: Actor & { email: string }, data: JobData): Promise<SaveJobResult> {
  const problems = jobCopyProblems(data, [], await partnerNameOf(db, data.partnerId));
  if (problems.length) return { ok: false, reason: problems[0].message, field: problems[0].field };
  const now = new Date();
  const slug = await uniqueSlug(db, data.title);
  const [row] = await db
    .insert(jobs)
    .values({ ...data, slug, status: "draft", createdBy: actor.email, createdAt: now, updatedAt: now })
    .returning({ id: jobs.id });
  await writeFields(db, row.id, defaultTemplate());
  await logActivity(db, { entityType: "job", entityId: row.id, actor, action: "created", detail: data.requirementId ? { requirementId: data.requirementId } : undefined });
  return { ok: true, id: row.id, changed: [] };
}

export async function updateJob(db: DB, actor: Actor, id: string, data: JobData): Promise<SaveJobResult> {
  const found = await getJob(db, id);
  if (!found) return { ok: false, reason: "This job no longer exists." };
  const fields = await jobFields(db, id);
  const problems = jobCopyProblems(data, fields, await partnerNameOf(db, data.partnerId));
  if (problems.length) return { ok: false, reason: problems[0].message, field: problems[0].field };
  const before = found.job;
  const changed = (Object.keys(data) as (keyof JobData)[]).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(data[k] ?? null));
  if (!changed.length) return { ok: true, id, changed };
  await db.update(jobs).set({ ...data, updatedAt: new Date() }).where(eq(jobs.id, id));
  await logActivity(db, { entityType: "job", entityId: id, actor, action: "updated", detail: { fields: changed } });
  return { ok: true, id, changed };
}

/** What stops a job going live: the form must have name + email, and no public text may mention pay or the partner. */
export async function publishProblems(db: DB, job: Job): Promise<string[]> {
  const fields = await jobFields(db, job.id);
  return [...checkFormDefinition(fields).map((p) => p.message), ...jobCopyProblems(job, fields, await partnerNameOf(db, job.partnerId)).map((p) => p.message)];
}

export type JobStatePatch = { status?: string; visibility?: string; featured?: boolean; closesOn?: string | null };

export async function setJobState(db: DB, actor: Actor, id: string, patch: JobStatePatch): Promise<{ ok: true; changed: string[] } | { ok: false; reason: string }> {
  const found = await getJob(db, id);
  if (!found) return { ok: false, reason: "This job no longer exists." };
  const job = found.job;
  const set: Partial<typeof jobs.$inferInsert> = {};
  if (patch.status !== undefined && patch.status !== job.status) {
    if (!["draft", "open", "paused", "closed"].includes(patch.status)) return { ok: false, reason: "Unknown status." };
    if (patch.status === "open") {
      const problems = await publishProblems(db, job);
      if (problems.length) return { ok: false, reason: `Can't open this job yet: ${problems[0]}` };
      if (!job.publishedAt) set.publishedAt = new Date();
    }
    set.status = patch.status;
  }
  if (patch.visibility !== undefined && patch.visibility !== job.visibility) {
    if (!["public", "unlisted", "internal"].includes(patch.visibility)) return { ok: false, reason: "Unknown visibility." };
    set.visibility = patch.visibility;
  }
  if (patch.featured !== undefined && patch.featured !== job.featured) set.featured = patch.featured;
  if (patch.closesOn !== undefined && (patch.closesOn || null) !== (job.closesOn || null)) {
    if (patch.closesOn && !/^\d{4}-\d{2}-\d{2}$/.test(patch.closesOn)) return { ok: false, reason: "Pick a closing date." };
    set.closesOn = patch.closesOn || null;
  }
  const changed = Object.keys(set).filter((k) => k !== "publishedAt");
  if (!changed.length) return { ok: true, changed };
  await db.update(jobs).set({ ...set, updatedAt: new Date() }).where(eq(jobs.id, id));
  await logActivity(db, {
    entityType: "job",
    entityId: id,
    actor,
    action: set.status ? "status_changed" : "sharing_changed",
    detail: { fields: changed, ...(set.status ? { from: job.status, to: set.status } : {}) },
  });
  return { ok: true, changed };
}

// ---------- Matches ----------

export function jobMatchRequirement(job: Pick<Job, "skills" | "domains" | "countriesAllowed" | "countriesBlocked" | "minYears">): MatchRequirement {
  return { mustSkills: job.skills, niceSkills: [], domains: job.domains, degrees: [], countriesAllowed: job.countriesAllowed, countriesBlocked: job.countriesBlocked, minYears: job.minYears };
}

/** Experts already in the hub who fit the job, best first, with reasons. People who applied are left out. */
export async function jobCandidates(db: DB, job: Job, opts: { limit?: number } = {}) {
  const skills = [...new Set(job.skills.map(normalizeSkill))].filter(Boolean);
  const conds: SQL[] = [
    notInArray(experts.status, ["do_not_contact", "inactive"]),
    sql`not exists (select 1 from ${applications} a where a.job_id = ${job.id} and a.expert_id = ${experts.id})`,
  ];
  const relevance: SQL[] = [];
  if (skills.length) relevance.push(arrayOverlaps(experts.skills, skills));
  if (job.domains.length) relevance.push(inArray(experts.domain, job.domains));
  for (const s of skills.slice(0, 12)) relevance.push(ilike(experts.headline, `%${s.replace(/[\\%_]/g, "")}%`));
  if (relevance.length) conds.push(or(...relevance)!);
  const pool = (await db.select(matchColumns).from(experts).where(and(...conds)).limit(3000)) as MatchExpertRow[];
  const { ranked, excluded } = rankCandidates(jobMatchRequirement(job), pool);
  const top = ranked.slice(0, opts.limit ?? 40);
  const invited = top.length
    ? await db.select({ expertId: jobInvites.expertId, createdAt: jobInvites.createdAt, emailed: jobInvites.emailed }).from(jobInvites).where(and(eq(jobInvites.jobId, job.id), inArray(jobInvites.expertId, top.map((m) => m.expertId))))
    : [];
  const invitedBy = new Map(invited.map((i) => [i.expertId, i]));
  return { pool: pool.length, ranked: top.map((m) => ({ ...m, invited: invitedBy.get(m.expertId) ?? null })), excludedTotal: excluded.length };
}

export async function markInvited(db: DB, actor: Actor, jobId: string, expertId: string, emailed: boolean) {
  const [e] = await db.select({ status: experts.status }).from(experts).where(eq(experts.id, expertId)).limit(1);
  if (!e) return { ok: false as const, reason: "This expert no longer exists." };
  if (e.status === "do_not_contact") return { ok: false as const, reason: "This person is marked do not contact." };
  const [row] = await db
    .insert(jobInvites)
    .values({ jobId, expertId, emailed, createdBy: typeof actor === "string" ? actor : actor.email })
    .onConflictDoUpdate({ target: [jobInvites.jobId, jobInvites.expertId], set: { emailed: sql`${jobInvites.emailed} or ${emailed}` } })
    .returning({ id: jobInvites.id });
  await logActivity(db, { entityType: "job", entityId: jobId, actor, action: "invited", detail: { expertId, emailed } });
  await db.update(experts).set({ lastContactedAt: new Date() }).where(eq(experts.id, expertId));
  return { ok: true as const, id: row.id };
}

export async function jobsForRequirement(db: DB, requirementId: string) {
  if (!isUuid(requirementId)) return [];
  return db.select({ id: jobs.id, title: jobs.title, status: jobs.status, slug: jobs.slug }).from(jobs).where(eq(jobs.requirementId, requirementId)).orderBy(desc(jobs.createdAt));
}

