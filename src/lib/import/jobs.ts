// Maps the old jobs site's records (public.xdl_jobs_*, or their copy in engine_copy.*) to hub
// records: users -> expert drafts, jobs -> internal hub jobs, applications -> hub applications.
// Pure functions: no database access, fully tested.
import { normalizeCountry, normalizeDomain, splitSkills } from "@/lib/match/dictionary";
import { cleanLongText, cleanText, normalizeEmail, normalizeLinkedin, normalizePhone, normalizeTags, splitList, toInt } from "@/lib/normalize";
import type { ApplicationStatus, EmploymentType, ExpertStatus, JobStatus } from "@/lib/constants";
import type { Answer, FileAnswer, TemplateField } from "@/lib/forms/job-fields";
import { emptyDraft, type DraftRow } from "./types";

export type JobsUser = {
  id: number;
  email: string;
  name: string;
  country: string | null;
  city: string | null;
  state: string | null;
  linkedin_url: string | null;
  headline: string | null;
  domain: string | null;
  years_experience: number | null;
  highest_degree: string | null;
  field_of_study: string | null;
  university: string | null;
  hours_per_week: number | null;
  phone: string | null;
  skills: string | null;
  languages: string | null;
  // The jobs site's own CRM (admin > People). Optional: older copies of the table don't have them.
  crm_stage?: string | null;
  crm_tags?: string[] | null;
  crm_note?: string | null;
};

export type JobsApplication = { user_id: number; status: string; rate_expectation: number | null; created_at: Date | string; title: string };

/** Furthest stage reached on the jobs site -> starting status here. */
export function statusFromApplications(apps: JobsApplication[]): ExpertStatus {
  const s = new Set(apps.map((a) => a.status));
  if (s.has("accepted") || s.has("selected")) return "bench";
  if (s.has("assessment") || s.has("reviewing") || s.has("client_interview")) return "screening";
  return "applicant";
}

/** The jobs site's CRM stage (new, contacted, vetted, shortlisted, placed, not_a_fit, do_not_contact) -> hub status. */
export function statusFromCrmStage(stage: string | null | undefined): ExpertStatus | null {
  switch ((stage ?? "").trim().toLowerCase()) {
    case "contacted":
      return "screening";
    case "vetted":
    case "shortlisted":
      return "bench";
    case "placed":
      return "placed";
    case "not_a_fit":
      return "inactive";
    case "do_not_contact":
      return "do_not_contact";
    default:
      return null; // "new" or empty: the applications decide
  }
}

const STATUS_RANK: Record<string, number> = { applicant: 0, screening: 1, bench: 2, submitted: 3, placed: 4 };

/** One starting status from the CRM stage and the applications: "do not contact" and "not a fit" win, else the furthest stage. */
export function combinedStatus(crm: ExpertStatus | null, fromApps: ExpertStatus): ExpertStatus {
  if (crm === "do_not_contact" || crm === "inactive") return crm;
  if (!crm) return fromApps;
  return (STATUS_RANK[crm] ?? 0) >= (STATUS_RANK[fromApps] ?? 0) ? crm : fromApps;
}

export function mapJobsUser(u: JobsUser, apps: JobsApplication[]): DraftRow {
  const d = emptyDraft();
  const warnings: string[] = [];
  d.fullName = cleanText(u.name, 200);
  d.email = normalizeEmail(u.email);
  if (!d.email) warnings.push("Email not valid");
  d.phone = normalizePhone(u.phone);
  d.country = normalizeCountry(u.country);
  d.region = cleanText(u.state, 80);
  d.city = cleanText(u.city, 80);
  d.linkedinUrl = normalizeLinkedin(u.linkedin_url);
  d.headline = cleanText(u.headline, 200);
  d.domain = u.domain ? normalizeDomain(u.domain) : null;
  d.skills = splitSkills(u.skills);
  d.languages = splitList(u.languages, 20);
  d.yearsExperience = u.years_experience != null ? toInt(u.years_experience, 0, 70) : null;
  d.highestDegree = cleanText(u.highest_degree, 120);
  d.fieldOfStudy = cleanText(u.field_of_study, 120);
  d.university = cleanText(u.university, 160);
  d.hoursPerWeek = u.hours_per_week != null ? toInt(u.hours_per_week, 0, 80) : null;
  const sorted = [...apps].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  d.rateExpectationUsd = sorted.find((a) => a.rate_expectation != null)?.rate_expectation ?? null;
  const fromApps = apps.length ? statusFromApplications(apps) : "applicant";
  d.status = combinedStatus(statusFromCrmStage(u.crm_stage), fromApps);
  d.tags = ["jobs-site", ...normalizeTags(u.crm_tags ?? []).filter((t) => t !== "jobs-site")];
  const note = cleanLongText(u.crm_note, 4000);
  d.notes = note ? `Jobs site note: ${note}` : null;
  return { row: u.id, source: "jobs_site", externalId: String(u.id), draft: d, warnings };
}

// ---------- Jobs ----------

export type JobsJob = {
  id: number;
  slug: string;
  title: string;
  domain: string | null;
  employment: string | null;
  location: string | null;
  regions: string | null;
  pay_min: number | null;
  pay_max: number | null;
  pay_unit: string | null;
  pay_currency?: string | null;
  hours: string | null;
  summary: string | null;
  description: string | null;
  requirements: string | null;
  status: string;
  created_at: Date | string | null;
};

/** The fields of a hub job the copy fills (and keeps in step until someone edits them in the hub). */
export type MappedJob = {
  title: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  employmentType: EmploymentType;
  domains: string[];
  status: JobStatus;
  internalRateNote: string | null;
};

/** "my--Old_Slug-" -> "my-old-slug" (the hub's slug rule: a-z, 0-9 and single hyphens). */
export function cleanSlug(raw: string | null | undefined): string {
  const s = String(raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
  return s || "job";
}

/** The slug kept from the jobs site, or "<slug>-2", "-3", ... when the hub already uses it. */
export function slugFor(raw: string, taken: ReadonlySet<string>): string {
  const base = cleanSlug(raw);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10_000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

export function employmentFrom(raw: string | null | undefined): EmploymentType {
  const s = (raw ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (s.startsWith("parttime")) return "part_time";
  if (s.startsWith("fulltime")) return "full_time";
  if (s.startsWith("freelance")) return "freelance";
  return "contract";
}

export function jobStatusFrom(raw: string | null | undefined): JobStatus {
  return raw === "open" || raw === "paused" || raw === "closed" ? raw : "closed";
}

/** Pay goes in the internal rate note only (money: admins and finance). Never in public text. */
export function rateNoteFrom(j: Pick<JobsJob, "pay_min" | "pay_max" | "pay_unit" | "pay_currency">): string | null {
  const cur = (j.pay_currency || "USD").toUpperCase();
  const unit = j.pay_unit ? ` per ${j.pay_unit}` : "";
  const min = j.pay_min != null ? Number(j.pay_min) : null;
  const max = j.pay_max != null ? Number(j.pay_max) : null;
  if (min == null && max == null) return null;
  const range = min != null && max != null && min !== max ? `${min}–${max}` : String(min ?? max);
  return `Jobs site pay: ${range} ${cur}${unit}.`;
}

export function mapJobsJob(j: JobsJob): MappedJob {
  const parts = [cleanLongText(j.description, 20_000)];
  const req = cleanLongText(j.requirements, 10_000);
  if (req) parts.push(`Requirements\n\n${req}`);
  const hours = cleanText(j.hours, 200);
  if (hours) parts.push(`Hours: ${hours}`);
  const description = parts.filter(Boolean).join("\n\n") || null;
  const location = [cleanText(j.location, 120), cleanText(j.regions, 200)].filter(Boolean).join(" · ") || null;
  const domain = j.domain ? normalizeDomain(j.domain) : null;
  return {
    title: cleanText(j.title, 200) ?? `Jobs site job ${j.id}`,
    summary: cleanText(j.summary, 500),
    description,
    location,
    employmentType: employmentFrom(j.employment),
    domains: domain ? [domain] : [],
    status: jobStatusFrom(j.status),
    internalRateNote: rateNoteFrom(j),
  };
}

/** The application form every copied job gets: the old site's questions, so answers show on the Applicants tab. */
export const LEGACY_FORM_KEYS = ["name", "email", "why", "hours", "start", "cv", "screening1", "screening2"] as const;
export type LegacyFormKey = (typeof LEGACY_FORM_KEYS)[number];

export const START_CHOICES = ["Immediately", "Within 1 week", "Within 2 weeks", "Within a month"];

export function legacyFormFields(): (TemplateField & { key: LegacyFormKey })[] {
  const f = (key: LegacyFormKey, type: TemplateField["type"], label: string, extra: Partial<TemplateField> = {}) => ({ key, type, label, helpText: null, required: false, options: null, mapsTo: null, ...extra });
  return [
    f("name", "short_text", "Full name", { required: true, mapsTo: "full_name" }),
    f("email", "email", "Email", { required: true, mapsTo: "email" }),
    f("why", "long_text", "Why are you a good fit?"),
    f("hours", "number", "Hours per week you can give", { mapsTo: "hours_per_week" }),
    f("start", "single_select", "When can you start?", { options: { choices: START_CHOICES } }),
    f("cv", "file", "CV", { helpText: "PDF or Word, up to 4 MB", mapsTo: "cv" }),
    f("screening1", "long_text", "Screening 1 answers (jobs site)", { helpText: "Copied from the old jobs site." }),
    f("screening2", "long_text", "Screening 2 answers (jobs site)", { helpText: "Copied from the old jobs site." }),
  ];
}

// ---------- Applications ----------

/** Jobs-site status (submitted, reviewing, client_interview, selected, assessment, accepted, rejected, withdrawn) -> hub status. */
export function applicationStatusFrom(raw: string | null | undefined): ApplicationStatus {
  switch (raw) {
    case "reviewing":
      return "reviewing";
    case "client_interview":
    case "selected":
    case "assessment":
      return "submitted_to_partner";
    case "accepted":
      return "hired";
    case "rejected":
      return "rejected";
    case "withdrawn":
      return "withdrawn";
    default:
      return "new";
  }
}

export type ScreeningPair = { q?: unknown; a?: unknown };

/** [{q, a}, ...] -> "1. question\nanswer\n\n2. ..." (what the Applicants tab shows). */
export function screeningText(answers: unknown): string | null {
  const list = Array.isArray(answers) ? (answers as ScreeningPair[]) : [];
  const parts = list
    .map((p, i) => {
      const q = cleanText(p?.q, 1000);
      const a = cleanLongText(p?.a, 6000);
      if (!q && !a) return null;
      return `${i + 1}. ${q ?? "(question)"}\n${a ?? "–"}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join("\n\n").slice(0, 30_000) : null;
}

export type LegacyApplicationInput = {
  name: string | null;
  email: string | null;
  why: string | null;
  hours_per_week: number | null;
  start_when: string | null;
  cv: FileAnswer | null;
  screening1: unknown;
  screening2: unknown;
};

/** Answers keyed by the copied job's field ids (fieldIds from legacyFormFields(), by key). */
export function legacyAnswers(fieldIds: Partial<Record<LegacyFormKey, string>>, a: LegacyApplicationInput): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  const put = (k: LegacyFormKey, v: Answer | undefined) => {
    const id = fieldIds[k];
    if (id && v != null && v !== "") out[id] = v;
  };
  put("name", cleanText(a.name, 200));
  put("email", normalizeEmail(a.email));
  put("why", cleanLongText(a.why, 5000));
  put("hours", a.hours_per_week != null ? toInt(a.hours_per_week, 0, 168) : null);
  put("start", cleanText(a.start_when, 120));
  put("cv", a.cv);
  put("screening1", screeningText(a.screening1));
  put("screening2", screeningText(a.screening2));
  return out;
}
