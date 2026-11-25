// The expert portal (/me). A verified expert account is linked to its hub.experts row
// (linkExpertForAccount in accounts.ts). Every function here takes the expert id from the signed-in
// session only (see src/lib/auth/expert.ts), so an expert can only ever read or change their own
// record. Tested in tests/portal.test.ts.
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, dataRequests, expertDetails, expertFiles, expertPayout, experts, jobs, type Expert } from "@/db/schema";
import { APPLICATION_STATUS_FOR_EXPERT, AVAILABILITY, DOMAINS, isOneOf, type ApplicationStatus } from "@/lib/constants";
import { answerText, type Answer } from "@/lib/forms/job-fields";
import { toCountryName } from "@/lib/countries";
import { splitSkills } from "@/lib/match/dictionary";
import { cleanText, emailHash, normalizeLinkedin, normalizePhone, splitList, toInt } from "@/lib/normalize";
import { logActivity, type Actor } from "./activity";
import { checkCvUpload } from "./cv";
import { currentCv, filesFor } from "./experts";
import { jobFields } from "./jobs";

const PORTAL_ACTOR: Actor = { email: "expert-portal", role: "expert" };

/** The columns an expert sees of their own record (no notes, tags, status, rate or sources). */
export const ownColumns = {
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
  cvConsent: experts.cvConsent,
  cvConsentAt: experts.cvConsentAt,
  cvRef: experts.cvRef,
  onboardingDone: experts.onboardingDone,
  portalJoinedAt: experts.portalJoinedAt,
  createdAt: experts.createdAt,
  updatedAt: experts.updatedAt,
};
export type OwnProfile = Pick<Expert, keyof typeof ownColumns>;

export async function ownProfile(db: DB, expertId: string): Promise<OwnProfile | null> {
  const [row] = await db.select(ownColumns).from(experts).where(eq(experts.id, expertId)).limit(1);
  return (row as OwnProfile) ?? null;
}

export async function ownCv(db: DB, expertId: string) {
  const files = await filesFor(db, expertId);
  const [e] = await db.select({ cvRef: experts.cvRef }).from(experts).where(eq(experts.id, expertId)).limit(1);
  const cvs = files.filter((f) => f.kind === "cv");
  return currentCv(e?.cvRef ?? null, cvs);
}

// ---------- Onboarding ----------

export const ONBOARDING_STEPS = [
  { id: "basics", title: "Basics", blurb: "Your name, where you are and how to reach you." },
  { id: "expertise", title: "Expertise & skills", blurb: "Your field and what you are good at." },
  { id: "experience", title: "Experience & education", blurb: "Years of experience and your highest degree." },
  { id: "cv", title: "CV", blurb: "A PDF or Word file, up to 4 MB." },
  { id: "availability", title: "Availability & hours", blurb: "When you can work and how much." },
  { id: "consent", title: "Consent", blurb: "Whether we may share your profile with partners." },
] as const;
export type StepId = (typeof ONBOARDING_STEPS)[number]["id"];
export const isStep = (v: unknown): v is StepId => ONBOARDING_STEPS.some((s) => s.id === v);

/** Profile completeness: 12 things a partner-ready profile has. */
export function completeness(p: Pick<OwnProfile, "fullName" | "country" | "linkedinUrl" | "headline" | "domain" | "skills" | "yearsExperience" | "highestDegree" | "fieldOfStudy" | "hoursPerWeek" | "cvConsent" | "phone">, hasCv: boolean) {
  const items: { label: string; done: boolean; step: StepId }[] = [
    { label: "Name", done: Boolean(p.fullName), step: "basics" },
    { label: "Country", done: Boolean(p.country), step: "basics" },
    { label: "Phone", done: Boolean(p.phone), step: "basics" },
    { label: "LinkedIn", done: Boolean(p.linkedinUrl), step: "basics" },
    { label: "Headline", done: Boolean(p.headline), step: "expertise" },
    { label: "Field", done: Boolean(p.domain), step: "expertise" },
    { label: "Skills", done: (p.skills?.length ?? 0) > 0, step: "expertise" },
    { label: "Years of experience", done: p.yearsExperience != null, step: "experience" },
    { label: "Highest degree", done: Boolean(p.highestDegree), step: "experience" },
    { label: "CV", done: hasCv, step: "cv" },
    { label: "Hours per week", done: p.hoursPerWeek != null, step: "availability" },
    { label: "Consent answered", done: p.cvConsent === "yes" || p.cvConsent === "no", step: "consent" },
  ];
  const done = items.filter((i) => i.done).length;
  return { percent: Math.round((done / items.length) * 100), items, missing: items.filter((i) => !i.done) };
}

export type StepValues = Record<string, string>;
export type StepResult = { ok: true } | { ok: false; errors: Record<string, string>; values: StepValues; message?: string };

const v = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Checks one onboarding step's form and saves it to the expert's own record. */
export async function saveStep(db: DB, expertId: string, step: StepId, fd: FormData): Promise<StepResult> {
  const errors: Record<string, string> = {};
  const values: StepValues = {};
  for (const [k, val] of fd.entries()) if (typeof val === "string") values[k] = val;
  const patch: Partial<typeof experts.$inferInsert> = {};
  if (step === "basics") {
    const fullName = cleanText(v(fd, "fullName"), 200);
    if (!fullName) errors.fullName = "Your name is required.";
    const country = v(fd, "country") ? toCountryName(v(fd, "country")) : null;
    if (!country) errors.country = "Pick your country.";
    const phone = v(fd, "phone") ? normalizePhone(v(fd, "phone")) : null;
    if (v(fd, "phone") && !phone) errors.phone = "Enter a phone number with the country code.";
    const linkedin = v(fd, "linkedinUrl") ? normalizeLinkedin(v(fd, "linkedinUrl")) : null;
    if (v(fd, "linkedinUrl") && (!linkedin || !/linkedin\.com\/(in|pub|profile)/i.test(linkedin))) errors.linkedinUrl = "Paste your profile link (linkedin.com/in/...).";
    Object.assign(patch, { fullName: fullName ?? undefined, country, phone, linkedinUrl: linkedin, city: cleanText(v(fd, "city"), 80), region: cleanText(v(fd, "region"), 80) });
  } else if (step === "expertise") {
    const domain = v(fd, "domain");
    if (domain && !isOneOf(DOMAINS, domain)) errors.domain = "Pick a field from the list.";
    const skills = splitSkills(v(fd, "skills"));
    if (!skills.length) errors.skills = "Add at least one skill.";
    if (skills.length > 40) errors.skills = "Up to 40 skills.";
    Object.assign(patch, { headline: cleanText(v(fd, "headline"), 200), domain: domain || null, skills, languages: splitList(v(fd, "languages"), 20) });
  } else if (step === "experience") {
    const years = v(fd, "yearsExperience") ? toInt(v(fd, "yearsExperience"), 0, 70) : null;
    if (!v(fd, "yearsExperience")) errors.yearsExperience = "Add your years of experience (0 is fine).";
    else if (years == null) errors.yearsExperience = "Whole years from 0 to 70.";
    Object.assign(patch, { yearsExperience: years, highestDegree: cleanText(v(fd, "highestDegree"), 120), fieldOfStudy: cleanText(v(fd, "fieldOfStudy"), 120), university: cleanText(v(fd, "university"), 160) });
  } else if (step === "cv") {
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      const problem = checkCvUpload(file);
      if (problem) errors.file = problem;
      else await uploadOwnCv(db, expertId, { filename: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    } else if (!(await ownCv(db, expertId))) errors.file = "Choose your CV (PDF or Word).";
  } else if (step === "availability") {
    const availability = v(fd, "availability");
    if (!isOneOf(AVAILABILITY, availability)) errors.availability = "Pick one.";
    const hours = v(fd, "hoursPerWeek") ? toInt(v(fd, "hoursPerWeek"), 0, 80) : null;
    if (!v(fd, "hoursPerWeek")) errors.hoursPerWeek = "Roughly how many hours a week?";
    else if (hours == null) errors.hoursPerWeek = "A number from 0 to 80.";
    Object.assign(patch, { availability: isOneOf(AVAILABILITY, availability) ? availability : undefined, hoursPerWeek: hours });
  } else if (step === "consent") {
    const c = v(fd, "consent");
    if (c !== "yes" && c !== "no") errors.consent = "Choose one.";
    else Object.assign(patch, { cvConsent: c, cvConsentAt: new Date() });
  }
  if (Object.keys(errors).length) return { ok: false, errors, values, message: "Check the highlighted fields." };
  const [cur] = await db.select({ done: experts.onboardingDone }).from(experts).where(eq(experts.id, expertId)).limit(1);
  const done = [...new Set([...(cur?.done ?? []), step])];
  const clean = Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined));
  await db.update(experts).set({ ...clean, onboardingDone: done, updatedAt: new Date() }).where(eq(experts.id, expertId));
  await logActivity(db, { entityType: "expert", entityId: expertId, actor: PORTAL_ACTOR, action: step === "consent" ? "cv_consent_recorded" : "updated_by_expert", detail: step === "consent" ? { value: clean.cvConsent, via: "portal" } : { step, fields: Object.keys(clean) } });
  return { ok: true };
}

export async function uploadOwnCv(db: DB, expertId: string, file: { filename: string; mime: string; bytes: Uint8Array }) {
  const b64 = Buffer.from(file.bytes).toString("base64");
  const { sql } = await import("drizzle-orm");
  const [row] = await db
    .insert(expertFiles)
    .values({ expertId, kind: "cv", filename: file.filename.slice(0, 200), mime: file.mime || "application/octet-stream", size: file.bytes.byteLength, storage: "upload", data: sql`decode(${b64}, 'base64')`, createdBy: "expert-portal" })
    .returning({ id: expertFiles.id });
  await db.update(experts).set({ cvRef: `upload:${row.id}`, updatedAt: new Date() }).where(eq(experts.id, expertId));
  await logActivity(db, { entityType: "expert", entityId: expertId, actor: PORTAL_ACTOR, action: "cv_uploaded", detail: { size: file.bytes.byteLength, via: "portal" } });
  return row.id;
}

export async function setOwnConsent(db: DB, expertId: string, value: "yes" | "no") {
  const now = new Date();
  await db.update(experts).set({ cvConsent: value, cvConsentAt: now, updatedAt: now }).where(eq(experts.id, expertId));
  await logActivity(db, { entityType: "expert", entityId: expertId, actor: PORTAL_ACTOR, action: "cv_consent_recorded", detail: { value, via: "portal" } });
}

// ---------- Applications, data export, deletion ----------

/** Their applications with the expert-facing status (internal notes are never selected). */
export async function ownApplications(db: DB, expertId: string) {
  const rows = await db
    .select({ id: applications.id, status: applications.status, createdAt: applications.createdAt, updatedAt: applications.updatedAt, title: jobs.title, slug: jobs.slug, jobStatus: jobs.status, visibility: jobs.visibility, closesOn: jobs.closesOn })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applications.expertId, expertId))
    .orderBy(desc(applications.createdAt));
  return rows.map((r) => ({ ...r, statusLabel: APPLICATION_STATUS_FOR_EXPERT[r.status as ApplicationStatus] ?? "Received", linkable: r.visibility !== "internal" && r.jobStatus !== "draft" }));
}

/** "Download my data": what they gave us and their applications, as JSON. No internal team fields. */
export async function exportOwnData(db: DB, expertId: string) {
  const profile = await ownProfile(db, expertId);
  if (!profile) return null;
  const files = (await filesFor(db, expertId)).map((f) => ({ filename: f.filename, kind: f.kind, size: f.size, uploadedAt: f.createdAt }));
  const apps = await db
    .select({ id: applications.id, jobId: applications.jobId, status: applications.status, answers: applications.answers, createdAt: applications.createdAt, updatedAt: applications.updatedAt, title: jobs.title, slug: jobs.slug })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applications.expertId, expertId));
  const withAnswers = await Promise.all(
    apps.map(async (a) => {
      const fields = await jobFields(db, a.jobId);
      const answers = fields
        .filter((f) => f.type !== "section")
        .map((f) => ({ question: f.label, answer: answerText((a.answers as Record<string, Answer>)[f.id]) }))
        .filter((x) => x.answer !== "");
      return { job: a.title, link: `/jobs/${a.slug}`, status: APPLICATION_STATUS_FOR_EXPERT[a.status as ApplicationStatus] ?? a.status, appliedAt: a.createdAt, updatedAt: a.updatedAt, answers };
    }),
  );
  const { id: _id, cvRef: _cv, onboardingDone: _o, ...rest } = profile;
  // What they gave the old jobs site (copied into the hub): their own details, payout and tax form included.
  const [details] = await db.select().from(expertDetails).where(eq(expertDetails.expertId, expertId)).limit(1);
  const [payout] = await db.select().from(expertPayout).where(eq(expertPayout.expertId, expertId)).limit(1);
  const fromJobsSite = details || payout
    ? {
        experience: details?.experience ?? [],
        education: details?.education ?? [],
        address: details ? { line1: details.addressLine1, line2: details.addressLine2, postalCode: details.postalCode } : null,
        workAuthorized: details?.workAuthorized ?? null,
        referralCode: details?.referralCode ?? null,
        payout: payout ? { method: payout.payoutMethod, handle: payout.payoutHandle, taxForm: payout.taxFormType, taxFormAt: payout.taxFormAt } : null,
      }
    : null;
  await logActivity(db, { entityType: "expert", entityId: expertId, actor: PORTAL_ACTOR, action: "data_exported" });
  return {
    exportedAt: new Date().toISOString(),
    about: "Your details and applications held by FynoLabs. To ask for anything else we hold, or for deletion, write to hello@fynolabs.si.",
    profile: rest,
    ...(fromJobsSite ? { fromJobsSite } : {}),
    files,
    applications: withAnswers,
  };
}

/** "Delete my data": records a request for the team (one open request at a time). */
export async function requestDeletion(db: DB, expertId: string, note: string | null) {
  const [open] = await db.select({ id: dataRequests.id, createdAt: dataRequests.createdAt }).from(dataRequests).where(and(eq(dataRequests.expertId, expertId), eq(dataRequests.kind, "delete"), eq(dataRequests.status, "open"))).limit(1);
  if (open) return { created: false, at: open.createdAt };
  const [row] = await db.insert(dataRequests).values({ expertId, kind: "delete", note: cleanText(note, 500) }).returning({ id: dataRequests.id, createdAt: dataRequests.createdAt });
  await logActivity(db, { entityType: "data_request", entityId: row.id, actor: PORTAL_ACTOR, action: "deletion_requested", detail: { expertId } });
  return { created: true, at: row.createdAt };
}

export async function openDeletionRequest(db: DB, expertId: string) {
  const [open] = await db.select({ id: dataRequests.id, createdAt: dataRequests.createdAt }).from(dataRequests).where(and(eq(dataRequests.expertId, expertId), eq(dataRequests.kind, "delete"), eq(dataRequests.status, "open"))).limit(1);
  return open ?? null;
}
