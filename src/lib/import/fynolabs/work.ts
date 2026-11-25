// Companies, jobs and pipelines from the FynoLabs admin, merged field by field (merge.ts) so a
// record the team edits in the hub keeps the edit.
import { cleanLongText, cleanText, normalizeEmail } from "@/lib/normalize";
import { cleanSlug, slugFor } from "@/lib/import/jobs";
import { APPLICATION_CHANNELS, isOneOf, PIPELINE_STAGES, REJECT_REASONS, statusForStage, type PipelineStage } from "@/lib/constants";
import type { SqlRunner } from "@/lib/import/engine/source";
import { mergeFields, same, type Json } from "./merge";
import { ensureFile, expertForApplicant, insertRow, loadLegacy, logChange, saveLegacy, setCurrentCv, updateRow, type Ctx } from "./people";
import { copyTable, emptyCounts, rows, tableExists, type TableCounts } from "./sql";
import { COPY_SCHEMA, SYNC_BY } from "./tables";

type Row = Record<string, Json>;

// ---------------------------------------------------------------- companies

/** FynoLabs account kind -> hub company kind (same meaning; the hub's names for the two that differ). */
export const companyKind = (k: unknown) => (k === "partner" ? "data_partner" : k === "marketplace" ? "expert_platform" : ["agency", "staffing", "talent_source", "trainer_gig", "client", "other"].includes(String(k)) ? String(k) : "other");

const COMPANY_BLANKS: Record<string, readonly Json[]> = { stage: ["active"], priority: ["normal"], business_line: ["ai_training"], kind: ["data_partner"] };

/** accounts -> hub.partners (companies): one record per organisation (same name, any capitals = same company). */
export async function mapCompanies(ctx: Ctx): Promise<TableCounts> {
  const { raw } = ctx;
  const c = emptyCounts("accounts", "partners");
  if (!(await tableExists(raw, `${COPY_SCHEMA}.accounts`))) return { ...c, note: "not copied yet" };
  const accounts = (await rows<{ j: Row }>(raw, `select to_jsonb(a) as j from ${copyTable("accounts")} a order by a.created_at, a.id`)).map((r) => r.j);
  c.copyRows = accounts.length;
  const legacy = await loadLegacy(raw, "accounts", "partners");
  const linked = new Set([...legacy.values()].map((l) => l.hubId));
  const platforms = new Set((await rows<{ id: string }>(raw, `select id::text as id from hub.platforms`)).map((r) => r.id));
  for (const a of accounts) {
    const id = String(a.id);
    const name = cleanText(a.name, 200);
    if (!name) {
      c.skipped++;
      continue;
    }
    const l = legacy.get(id);
    if (l && !l.present) {
      c.removedInHub++;
      continue;
    }
    const incoming: Row = {
      name,
      kind: companyKind(a.kind),
      website: cleanText(a.website_url, 500),
      notes: cleanLongText(a.notes, 20_000),
      business_line: a.business_line ?? "ai_training",
      stage: a.stage ?? "researching",
      priority: a.priority ?? "normal",
      owner_team_member_id: a.owner_id ? (ctx.teamByUser.get(String(a.owner_id)) ?? null) : null,
      owner_name: cleanText(a.owner_name, 100),
      next_step: cleanText(a.next_step, 1000),
      next_step_due: a.next_step_due ?? null,
      best_route: cleanText(a.best_route, 500),
      domain: cleanText(a.domain, 200),
      location: cleanText(a.location, 120),
      platform_id: a.platform_id && platforms.has(String(a.platform_id)) ? String(a.platform_id) : null,
      tags: Array.isArray(a.tags) ? a.tags : [],
      stage_changed_at: a.stage_changed_at ?? null,
      last_activity_at: a.last_activity_at ?? null,
    };
    let hubId = l?.hubId ?? null;
    if (!hubId) {
      const [same] = await rows<{ id: string }>(raw, `select id::text as id from hub.partners where lower(name) = lower($1)`, [name]);
      if (same && !linked.has(same.id)) hubId = same.id;
      else if (same) {
        // Two FynoLabs accounts with the same name: one company in the hub.
        ctx.companyByAccount.set(id, same.id);
        await saveLegacy(raw, "accounts", id, "partners", same.id, null);
        c.merged++;
        c.hubRows++;
        continue;
      }
    }
    if (!hubId) {
      const values: Row = { ...incoming, created_by: a.created_by ? (ctx.emailByUser.get(String(a.created_by)) ?? null) : null, created_at: a.created_at, updated_at: a.updated_at, updated_by: SYNC_BY };
      for (const k of Object.keys(values)) if (values[k] == null) delete values[k];
      const newId = await insertRow(raw, "partners", values);
      if (!newId) {
        c.skipped++;
        continue;
      }
      ctx.companyByAccount.set(id, newId);
      linked.add(newId);
      await saveLegacy(raw, "accounts", id, "partners", newId, Object.fromEntries(Object.entries(incoming).filter(([, v]) => v != null)));
      await logChange(raw, ctx.actorEmail, "partner", newId, "created", { source: "fynolabs" });
      c.inserted++;
      c.hubRows++;
      continue;
    }
    const [hub] = await rows<{ j: Row }>(raw, `select to_jsonb(p) as j from hub.partners p where id = $1::uuid`, [hubId]);
    if (!hub) {
      c.removedInHub++;
      continue;
    }
    ctx.companyByAccount.set(id, hubId);
    linked.add(hubId);
    const { patch, written, kept } = mergeFields(hub.j, incoming, l?.written ?? null, { blanks: COMPANY_BLANKS, lists: ["tags"] });
    if (patch.name) {
      const [clash] = await rows<{ id: string }>(raw, `select id::text as id from hub.partners where lower(name) = lower($1) and id <> $2::uuid`, [String(patch.name), hubId]);
      if (clash) delete patch.name;
    }
    if (Object.keys(patch).length) {
      await updateRow(raw, "partners", hubId, patch);
      await logChange(raw, ctx.actorEmail, "partner", hubId, "updated_by_fynolabs", { fields: Object.keys(patch) });
      c.updated++;
    } else if (kept.length) c.kept++;
    else c.unchanged++;
    await saveLegacy(raw, "accounts", id, "partners", hubId, written);
    c.hubRows++;
  }
  return c;
}

// ---------------------------------------------------------------- jobs

export type JobEntry = { hubId: string; fieldIds: Record<string, string> };

type FieldDef = { key: string; type: string; label: string; mapsTo?: string | null; required?: boolean; help?: string | null };

const JOB_FORM: FieldDef[] = [
  { key: "name", type: "short_text", label: "Full name", mapsTo: "full_name", required: true },
  { key: "email", type: "email", label: "Email", mapsTo: "email", required: true },
  { key: "link", type: "url", label: "LinkedIn or portfolio" },
  { key: "github", type: "url", label: "GitHub" },
  { key: "note", type: "long_text", label: "Note from the applicant" },
  { key: "cv", type: "file", label: "CV", mapsTo: "cv", help: "PDF, up to 4 MB" },
];

const TALENT_FORM: FieldDef[] = [
  { key: "name", type: "short_text", label: "Full name", mapsTo: "full_name", required: true },
  { key: "email", type: "email", label: "Email", mapsTo: "email", required: true },
  { key: "location", type: "short_text", label: "Where are you based?" },
  { key: "role", type: "short_text", label: "Role" },
  { key: "skills", type: "long_text", label: "Skills" },
  { key: "projects", type: "long_text", label: "Projects" },
  { key: "links", type: "long_text", label: "Links" },
  { key: "availability", type: "short_text", label: "Availability" },
  { key: "notes", type: "long_text", label: "Anything else" },
  { key: "cv", type: "file", label: "CV", mapsTo: "cv", help: "PDF, up to 4 MB" },
];

async function addForm(raw: SqlRunner, jobId: string, form: FieldDef[]): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (let i = 0; i < form.length; i++) {
    const f = form[i];
    const [r] = await rows<{ id: string }>(
      raw,
      `insert into hub.job_form_fields (job_id, position, type, label, help_text, required, maps_to) values ($1::uuid, $2, $3, $4, $5, $6, $7) returning id::text as id`,
      [jobId, i, f.type, f.label, f.help ?? (f.key === "note" || f.key === "github" ? "Copied from the FynoLabs admin." : null), Boolean(f.required), f.mapsTo ?? null],
    );
    ids[f.key] = r.id;
  }
  return ids;
}

export const employmentFromFynolabs = (t: unknown) => (t === "part-time" ? "part_time" : t === "full-time" ? "full_time" : "contract");

/** posted_jobs -> hub.jobs. Always internal on creation: the hub never publishes a copied job (the team opens it on Share). */
export async function mapJobs(ctx: Ctx): Promise<{ counts: TableCounts; jobByPosted: Map<string, JobEntry>; talentJob: JobEntry }> {
  const { raw } = ctx;
  const c = emptyCounts("posted_jobs", "jobs");
  const jobByPosted = new Map<string, JobEntry>();
  const taken = new Set((await rows<{ slug: string }>(raw, `select slug from hub.jobs`)).map((r) => r.slug));
  const talentJob = await ensureTalentJob(raw, taken);
  if (!(await tableExists(raw, `${COPY_SCHEMA}.posted_jobs`))) return { counts: { ...c, note: "not copied yet" }, jobByPosted, talentJob };
  const posted = (await rows<{ j: Row }>(raw, `select to_jsonb(p) as j from ${copyTable("posted_jobs")} p order by p.created_at, p.id`)).map((r) => r.j);
  c.copyRows = posted.length;
  const legacy = await loadLegacy(raw, "posted_jobs", "jobs");
  const has = async (table: string, id: unknown) => (id ? (await rows(raw, `select 1 from hub."${table}" where id = $1::uuid`, [String(id)])).length > 0 : false);
  for (const p of posted) {
    const id = String(p.id);
    const l = legacy.get(id);
    if (l && !l.present) {
      c.removedInHub++;
      continue;
    }
    const parts = [cleanLongText(p.responsibilities, 10_000) ? `Responsibilities\n\n${cleanLongText(p.responsibilities, 10_000)}` : null, cleanLongText(p.requirements, 10_000) ? `Requirements\n\n${cleanLongText(p.requirements, 10_000)}` : null].filter(Boolean);
    const projectId = (await has("projects", p.project_id)) ? String(p.project_id) : null;
    const [proj] = projectId ? await rows<{ company_id: string | null }>(raw, `select company_id::text as company_id from hub.projects where id = $1::uuid`, [projectId]) : [];
    const incoming: Row = {
      title: cleanText(p.title, 200) ?? "FynoLabs job",
      summary: cleanText(p.summary, 500),
      description: parts.join("\n\n") || null,
      location: cleanText(p.location, 120),
      employment_type: employmentFromFynolabs(p.job_type),
      status: ["draft", "open", "paused", "closed"].includes(String(p.status)) ? p.status : "draft",
      closes_on: p.closes_on ?? null,
      internal_rate_note: cleanText(p.pay, 300) ? `FynoLabs pay: ${cleanText(p.pay, 300)}` : null,
      pay_unit: cleanText(p.pay_unit, 20),
      company_name: cleanText(p.company, 200),
      apply_url: cleanText(p.apply_url, 500),
      require_github: Boolean(p.require_github),
      badge: cleanText(p.badge, 40),
      project_id: projectId,
      track_id: (await has("project_tracks", p.track_id)) ? String(p.track_id) : null,
      radar_listing_id: (await has("radar_listings", p.source_listing_id)) ? String(p.source_listing_id) : null,
      partner_id: proj?.company_id ?? null,
      source_visibility: cleanText(p.visibility, 20),
    };
    if (!l) {
      const slug = slugFor(String(p.slug || incoming.title), taken);
      taken.add(slug);
      const values: Row = { ...incoming, slug, visibility: "internal", featured: false, created_by: SYNC_BY, created_at: p.created_at, updated_at: p.updated_at };
      for (const k of Object.keys(values)) if (values[k] == null) delete values[k];
      const hubId = await insertRow(raw, "jobs", values);
      if (!hubId) {
        c.skipped++;
        continue;
      }
      const fieldIds = await addForm(raw, hubId, JOB_FORM);
      jobByPosted.set(id, { hubId, fieldIds });
      await saveLegacy(raw, "posted_jobs", id, "jobs", hubId, { fields: Object.fromEntries(Object.entries(incoming).filter(([, v]) => v != null)), fieldIds });
      await logChange(raw, ctx.actorEmail, "job", hubId, "created", { source: "fynolabs" });
      c.inserted++;
      c.hubRows++;
      continue;
    }
    const fieldIds = ((l.written?.fieldIds ?? {}) as Record<string, string>) ?? {};
    jobByPosted.set(id, { hubId: l.hubId, fieldIds });
    const [hub] = await rows<{ j: Row }>(raw, `select to_jsonb(j) as j from hub.jobs j where id = $1::uuid`, [l.hubId]);
    const { patch, written, kept } = mergeFields(hub.j, incoming, (l.written?.fields ?? null) as Row | null, { blanks: { require_github: [false], employment_type: ["contract"] } });
    if (Object.keys(patch).length) {
      await updateRow(raw, "jobs", l.hubId, patch);
      c.updated++;
    } else if (kept.length) c.kept++;
    else c.unchanged++;
    await saveLegacy(raw, "posted_jobs", id, "jobs", l.hubId, { ...(l.written ?? {}), fields: written, fieldIds });
    c.hubRows++;
  }
  return { counts: c, jobByPosted, talentJob };
}

/** The internal job the FynoLabs talent form's applications sit on (one pipeline per person, like every job). */
async function ensureTalentJob(raw: SqlRunner, taken: Set<string>): Promise<JobEntry> {
  const legacy = await loadLegacy(raw, "talent_call", "jobs");
  const l = legacy.get("job");
  if (l?.present) return { hubId: l.hubId, fieldIds: (l.written?.fieldIds ?? {}) as Record<string, string> };
  const slug = slugFor(cleanSlug("fynolabs-talent-call"), taken);
  taken.add(slug);
  const hubId = (await insertRow(raw, "jobs", {
    slug,
    title: "Talent call (FynoLabs)",
    summary: "Applications from the FynoLabs talent form (join the expert pool). Internal: never on the public board.",
    status: "closed",
    visibility: "internal",
    featured: false,
    created_by: SYNC_BY,
  }))!;
  const fieldIds = await addForm(raw, hubId, TALENT_FORM);
  await saveLegacy(raw, "talent_call", "job", "jobs", hubId, { fieldIds });
  return { hubId, fieldIds };
}

// ---------------------------------------------------------------- pipelines

const APP_BLANKS: Record<string, readonly Json[]> = { stage: ["new"], channel: ["applied"], next_action_auto: [false], screening: [{}] };

export type AppCounts = TableCounts & { expertsCreated: number; erased: number };

type Pair = { key: string; expertId: string; job: JobEntry; items: { table: "job_applications" | "talent_applications"; row: Row }[] };

/**
 * job_applications and talent_applications -> hub.applications: one pipeline per person per job,
 * with FynoLabs' stage. Two FynoLabs rows for the same person and job (two emails merged into one
 * expert, say) become one pipeline: the newest wins.
 */
export async function mapApplications(ctx: Ctx, jobs: { jobByPosted: Map<string, JobEntry>; talentJob: JobEntry }): Promise<{ job: AppCounts; talent: AppCounts; appBySource: Map<string, string> }> {
  const { raw } = ctx;
  const job: AppCounts = { ...emptyCounts("job_applications", "applications"), expertsCreated: 0, erased: 0 };
  const talent: AppCounts = { ...emptyCounts("talent_applications", "applications"), expertsCreated: 0, erased: 0 };
  const appBySource = new Map<string, string>();
  const pairs = new Map<string, Pair>();
  const add = async (table: Pair["items"][number]["table"], r: Row, jobEntry: JobEntry | undefined, counts: AppCounts) => {
    if (!jobEntry) {
      counts.skipped++;
      return;
    }
    let expertId = r.profile_id ? ctx.expertByProfile.get(String(r.profile_id)) : undefined;
    if (!expertId && r.profile_id && ctx.erased.profileIds.has(String(r.profile_id))) {
      counts.erased++;
      counts.skipped++;
      return;
    }
    if (!expertId) {
      const found = await expertForApplicant(ctx, { name: (r.name as string) ?? null, email: (r.email as string) ?? null, link: (r.link as string) ?? null, location: (r.location as string) ?? null, channel: table === "talent_applications" ? "talent_call" : "job", createdAt: r.created_at });
      if (found.erased) {
        counts.erased++;
        counts.skipped++;
        return;
      }
      if (!found.id) {
        counts.skipped++;
        return;
      }
      if (found.created) counts.expertsCreated++;
      expertId = found.id;
    }
    const key = `${jobEntry.hubId}|${expertId}`;
    const pair = pairs.get(key) ?? { key, expertId, job: jobEntry, items: [] };
    pair.items.push({ table, row: r });
    pairs.set(key, pair);
  };
  if (await tableExists(raw, `${COPY_SCHEMA}.job_applications`)) {
    const list = (await rows<{ j: Row }>(raw, `select to_jsonb(a) as j from ${copyTable("job_applications")} a order by a.created_at, a.id`)).map((r) => r.j);
    job.copyRows = list.length;
    for (const r of list) await add("job_applications", r, jobs.jobByPosted.get(String(r.job_id)), job);
  }
  if (await tableExists(raw, `${COPY_SCHEMA}.talent_applications`)) {
    const list = (await rows<{ j: Row }>(raw, `select to_jsonb(a) as j from ${copyTable("talent_applications")} a order by a.created_at, a.id`)).map((r) => r.j);
    talent.copyRows = list.length;
    for (const r of list) await add("talent_applications", r, jobs.talentJob, talent);
  }
  const legacyJob = await loadLegacy(raw, "job_applications", "applications");
  const legacyTalent = await loadLegacy(raw, "talent_applications", "applications");
  const legacyOf = (t: Pair["items"][number]["table"], id: string) => (t === "job_applications" ? legacyJob : legacyTalent).get(id);
  const ts = (v: Json) => (v ? new Date(String(v)).getTime() : 0);

  for (const pair of pairs.values()) {
    pair.items.sort((a, b) => ts(b.row.updated_at ?? b.row.created_at) - ts(a.row.updated_at ?? a.row.created_at));
    const { table, row: a } = pair.items[0];
    const counts = table === "job_applications" ? job : talent;
    for (const extra of pair.items.slice(1)) (extra.table === "job_applications" ? job : talent).merged++;
    const known = pair.items.map((i) => ({ i, l: legacyOf(i.table, String(i.row.id)) })).find((x) => x.l);
    if (known?.l && !known.l.present) {
      for (const i of pair.items) (i.table === "job_applications" ? job : talent).removedInHub++;
      continue;
    }
    // The CV, as a file of the expert (bytes stay in fynolabs_copy).
    const bucket = table === "job_applications" ? "job-resumes" : "talent-resumes";
    const fileId = typeof a.resume_path === "string" && a.resume_path ? await ensureFile(raw, pair.expertId, bucket, a.resume_path, "cv") : null;
    if (fileId) await setCurrentCv(raw, pair.expertId, fileId);
    const [file] = fileId ? await rows<{ filename: string; size: number }>(raw, `select filename, size from hub.expert_files where id = $1::uuid`, [fileId]) : [];
    const f = pair.job.fieldIds;
    const answers: Row = {};
    const put = (k: string, v: Json) => {
      if (f[k] && v != null && v !== "") answers[f[k]] = v;
    };
    put("name", cleanText(a.name, 200));
    put("email", normalizeEmail(a.email));
    if (table === "job_applications") {
      put("link", cleanText(a.link, 500));
      put("github", cleanText(a.github_url, 300));
      put("note", cleanLongText(a.note, 5000));
    } else {
      for (const k of ["location", "role", "availability"]) put(k, cleanText(a[k], 300));
      for (const k of ["skills", "projects", "links", "notes"]) put(k, cleanLongText(a[k], 5000));
    }
    if (file) put("cv", { fileId, filename: file.filename, size: Number(file.size) });
    const stage: PipelineStage = table === "talent_applications" ? "new" : isOneOf(PIPELINE_STAGES, a.status) ? a.status : "new";
    const incoming: Row = {
      stage,
      status: table === "talent_applications" && a.handled_at ? "reviewing" : statusForStage(stage),
      stage_changed_at: a.stage_changed_at ?? null,
      started_on: a.started_on ?? null,
      ended_on: a.ended_on ?? null,
      owner_team_member_id: a.owner_id ? (ctx.teamByUser.get(String(a.owner_id)) ?? null) : null,
      track_id: a.track_id ? await existing(raw, "project_tracks", a.track_id) : null,
      channel: table === "talent_applications" ? "applied" : isOneOf(APPLICATION_CHANNELS, a.source) ? a.source : "applied",
      screening: a.screening && typeof a.screening === "object" ? a.screening : {},
      eligible: typeof a.eligible === "boolean" ? a.eligible : null,
      next_action: cleanText(a.next_action, 500),
      next_action_due: a.next_action_due ?? null,
      next_action_auto: Boolean(a.next_action_auto),
      reject_reason: isOneOf(REJECT_REASONS, a.reject_reason) ? a.reject_reason : null,
      consent_version: cleanText(a.consent_version, 40),
      consent_at: a.consent_at ?? null,
      handled_at: a.handled_at ?? null,
      handled_by: a.handled_by ? (ctx.emailByUser.get(String(a.handled_by)) ?? `fynolabs:${a.handled_by}`) : null,
      created_by: a.created_by ? (ctx.emailByUser.get(String(a.created_by)) ?? `fynolabs:${a.created_by}`) : null,
    };
    const source = { ref: "fynolabs", fynolabs: { table, id: String(a.id) } };
    const [hub] = await rows<{ j: Row }>(raw, `select to_jsonb(x) - 'rate_expectation_usd' as j from hub.applications x where job_id = $1::uuid and expert_id = $2::uuid`, [pair.job.hubId, pair.expertId]);
    let appId: string;
    if (!hub) {
      const values: Row = { ...incoming, job_id: pair.job.hubId, expert_id: pair.expertId, answers, source, created_at: a.created_at, updated_at: a.updated_at ?? a.created_at };
      for (const k of Object.keys(values)) if (values[k] == null) delete values[k];
      const id = await insertRow(raw, "applications", values);
      if (!id) {
        counts.skipped++;
        continue;
      }
      appId = id;
      counts.inserted++;
      await logChange(raw, ctx.actorEmail, "application", id, "created", { source: "fynolabs", jobId: pair.job.hubId, expertId: pair.expertId });
      for (const i of pair.items) await saveLegacy(raw, i.table, String(i.row.id), "applications", id, Object.fromEntries(Object.entries(incoming).filter(([, v]) => v != null)));
    } else {
      appId = String(hub.j.id);
      const written = (known?.l?.written ?? null) as Row | null;
      // Status and stage move together: the stage decides, the status follows it.
      const { patch, written: next, kept } = mergeFields(hub.j, { ...incoming, status: undefined }, written, { blanks: APP_BLANKS });
      if (patch.stage) patch.status = incoming.status;
      const changedAnswers = !same(hub.j.answers ?? {}, answers) && Object.keys(answers).length > 0;
      if (changedAnswers) patch.answers = answers;
      if (Object.keys(patch).length) {
        await updateRow(raw, "applications", appId, patch);
        counts.updated++;
      } else if (kept.length) counts.kept++;
      else counts.unchanged++;
      for (const i of pair.items) await saveLegacy(raw, i.table, String(i.row.id), "applications", appId, next);
    }
    for (const i of pair.items) appBySource.set(`${i.table}:${i.row.id}`, appId);
    counts.hubRows += pair.items.length;
    // Consent given on a FynoLabs form counts for the expert record too (only if nothing was recorded yet).
    if (a.consent_at) await raw.query(`update hub.experts set cv_consent = 'yes', cv_consent_at = $2::timestamptz, updated_at = now() where id = $1::uuid and cv_consent = 'unknown'`, [pair.expertId, a.consent_at]);
  }
  return { job, talent, appBySource };
}

async function existing(raw: SqlRunner, table: string, id: Json): Promise<string | null> {
  const r = await rows<{ id: string }>(raw, `select id::text as id from hub."${table}" where id = $1::uuid`, [String(id)]);
  return r[0]?.id ?? null;
}

/** expert_documents: their files become expert_files (storage fynolabs) first, so the documents can point at them. */
export async function documentFiles(ctx: Ctx): Promise<number> {
  const { raw } = ctx;
  if (!(await tableExists(raw, `${COPY_SCHEMA}.expert_documents`))) return 0;
  let n = 0;
  for (const d of await rows<{ profile_id: string; file_path: string | null; signed_path: string | null }>(raw, `select profile_id::text as profile_id, file_path, signed_path from ${copyTable("expert_documents")}`)) {
    const expertId = ctx.expertByProfile.get(d.profile_id);
    if (!expertId) continue;
    for (const p of [d.file_path, d.signed_path]) if (p && (await ensureFile(raw, expertId, "expert-documents", p, "document"))) n++;
  }
  return n;
}
