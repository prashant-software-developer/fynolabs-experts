// Public applications: one form submission becomes (1) an expert record, found by email (or
// LinkedIn URL) or created, with the mapped answers merged in, (2) the CV stored and set as current,
// (3) CV consent recorded, and (4) one application row per person per job. Plus the team's side:
// listing applicants, changing status, notes and the CSV export.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, expertActivities, expertFiles, experts, jobs, type Application, type Job } from "@/db/schema";
import { APPLICATION_STATUSES, isOneOf, PIPELINE_STAGE_LABELS, stageForStatus, type ApplicationStatus } from "@/lib/constants";
import {
  consentGiven,
  mergeIntoProfile,
  profileFromAnswers,
  validateAnswers,
  type Answer,
  type AnswerInput,
  type FieldDef,
  type FileAnswer,
  type FormValues,
} from "@/lib/forms/job-fields";
import { acceptsApplications } from "@/lib/jobs-public";
import { normalizeLinkedin } from "@/lib/normalize";
import { isErasedEmail } from "./erasure";
import { logActivity, type Actor } from "./activity";
import { isUuid } from "./experts";
import { overLimit, recordAttempt } from "./rate-limit";
import { keyedHash, readInviteToken } from "./tokens";

/** Who filled in the form: nobody signed in, or a signed-in expert (their email is used). */
export type Applicant = { kind: "guest" } | { kind: "expert"; email: string; expertId: string | null };

export type SourceInfo = { utm?: Record<string, string>; ref?: string; invite?: string | null };

export type SubmitResult =
  | { ok: true; applicationId: string; expertId: string; newExpert: boolean; reapplied: boolean; hasPortalAccount: boolean }
  | { ok: false; kind: "invalid"; message: string; errors: Record<string, string>; values: FormValues }
  | { ok: false; kind: "closed" | "rate_limited" | "refused"; message: string }
  | { ok: false; kind: "spam"; message: string };

const JOB_FORM_ACTOR: Actor = { email: "job-form", role: "public" };

/** Shown to people we can't take an application from (do not contact, or deleted on request). Says nothing about why. */
export const REFUSED_MESSAGE = "Thanks for your interest. We can't accept this application online. If you think this is a mistake, write to hello@fynolabs.si.";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

/** utm_* and ref from the page URL (sent along as hidden fields), cleaned. */
export function sourceFromParams(get: (k: string) => string | null): SourceInfo {
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = (get(k) ?? "").trim().slice(0, 100);
    if (v && /^[\w .:/+-]+$/.test(v)) utm[k.slice(4)] = v;
  }
  const ref = (get("ref") ?? "").trim().slice(0, 40);
  const invite = (get("e") ?? "").trim().slice(0, 80) || null;
  return { ...(Object.keys(utm).length ? { utm } : {}), ...(ref && /^[\w-]+$/.test(ref) ? { ref } : {}), invite };
}

const isErased = isErasedEmail;

/** One line on the expert's timeline (hub.expert_activities), as the FynoLabs admin keeps it. */
export async function addTimeline(db: DB, e: { expertId: string; kind: string; summary: string; applicationId?: string | null; detail?: string | null; by: string }) {
  await db.insert(expertActivities).values({ expertId: e.expertId, applicationId: e.applicationId ?? null, kind: e.kind, summary: e.summary.slice(0, 500), detail: e.detail ?? null, createdBy: e.by, updatedBy: e.by });
}

const expertCols = {
  id: experts.id,
  email: experts.email,
  fullName: experts.fullName,
  status: experts.status,
  phone: experts.phone,
  country: experts.country,
  city: experts.city,
  linkedinUrl: experts.linkedinUrl,
  headline: experts.headline,
  yearsExperience: experts.yearsExperience,
  highestDegree: experts.highestDegree,
  fieldOfStudy: experts.fieldOfStudy,
  university: experts.university,
  skills: experts.skills,
  languages: experts.languages,
  hoursPerWeek: experts.hoursPerWeek,
  availability: experts.availability,
  cvConsent: experts.cvConsent,
  cvRef: experts.cvRef,
  portalJoinedAt: experts.portalJoinedAt,
};

async function storeFile(db: DB, expertId: string, f: { name: string; type: string; bytes: Uint8Array }, kind: "cv" | "attachment") {
  const b64 = Buffer.from(f.bytes).toString("base64");
  const [row] = await db
    .insert(expertFiles)
    .values({ expertId, kind, filename: f.name.slice(0, 200), mime: f.type || "application/octet-stream", size: f.bytes.byteLength, storage: "upload", data: sql`decode(${b64}, 'base64')`, createdBy: "job-form" })
    .returning({ id: expertFiles.id });
  return row.id;
}

/** The current CV of a signed-in expert, so they don't have to upload it again. */
async function currentCvAnswer(db: DB, expertId: string): Promise<FileAnswer | null> {
  const [e] = await db.select({ cvRef: experts.cvRef }).from(experts).where(eq(experts.id, expertId)).limit(1);
  const ref = e?.cvRef ?? "";
  if (!ref.startsWith("upload:")) return null;
  const [f] = await db.select({ id: expertFiles.id, filename: expertFiles.filename, size: expertFiles.size }).from(expertFiles).where(and(eq(expertFiles.id, ref.slice(7)), eq(expertFiles.expertId, expertId))).limit(1);
  return f ? { fileId: f.id, filename: f.filename, size: f.size } : null;
}

export async function submitApplication(
  db: DB,
  input: { job: Job; fields: FieldDef[]; answers: AnswerInput; applicant: Applicant; ip: string | null; source: SourceInfo; honeypot?: string | null; now?: Date },
): Promise<SubmitResult> {
  const { job, fields, applicant } = input;
  const now = input.now ?? new Date();
  if (!acceptsApplications(job, now.toISOString().slice(0, 10))) return { ok: false, kind: "closed", message: "This job is no longer accepting applications." };
  // Bots fill every field, including the hidden one. They get the same answer as everyone else.
  if (input.honeypot && input.honeypot.trim()) return { ok: false, kind: "spam", message: "Thanks." };
  if (input.ip && (await overLimit(db, "apply_ip", input.ip, now))) {
    return { ok: false, kind: "rate_limited", message: "Too many applications from this connection. Please try again in an hour." };
  }

  const cvField = fields.find((f) => f.type === "file" && f.mapsTo === "cv");
  const existingFile: Record<string, FileAnswer | null> = {};
  if (applicant.kind === "expert" && applicant.expertId && cvField) existingFile[cvField.id] = await currentCvAnswer(db, applicant.expertId);
  const v = validateAnswers(fields, input.answers, { existingFile });
  if (Object.keys(v.errors).length) return { ok: false, kind: "invalid", message: "Some answers need a look. Check the questions marked below.", errors: v.errors, values: v.values };

  const emailField = fields.find((f) => f.mapsTo === "email");
  const email = applicant.kind === "expert" ? applicant.email.toLowerCase() : (emailField ? (v.answers[emailField.id] as string | null) : null);
  if (!email) return { ok: false, kind: "invalid", message: "Add your email address.", errors: emailField ? { [emailField.id]: "This question is required." } : {}, values: v.values };
  if (emailField) v.answers[emailField.id] = email;

  if (await overLimit(db, "apply_email", email, now)) return { ok: false, kind: "rate_limited", message: "You have sent this form several times in the last hour. Please try again later." };
  if (await isErased(db, email)) return { ok: false, kind: "refused", message: REFUSED_MESSAGE };

  const incoming = profileFromAnswers(fields, v.answers);
  const linkedin = incoming.linkedinUrl ? normalizeLinkedin(incoming.linkedinUrl) : null;

  // Find the person: same email first, then the same LinkedIn URL (only if that record has no email).
  let [person] = await db.select(expertCols).from(experts).where(eq(experts.email, email)).limit(1);
  let possibleDuplicateOf: string | null = null;
  if (!person && linkedin) {
    const [byLinkedin] = await db.select(expertCols).from(experts).where(sql`lower(${experts.linkedinUrl}) = ${linkedin.toLowerCase()}`).limit(1);
    if (byLinkedin && !byLinkedin.email) person = byLinkedin;
    else if (byLinkedin) possibleDuplicateOf = byLinkedin.id;
  }
  if (person?.status === "do_not_contact") return { ok: false, kind: "refused", message: REFUSED_MESSAGE };

  await recordAttempt(db, "apply_email", email, now);
  if (input.ip) await recordAttempt(db, "apply_ip", input.ip, now);

  let expertId: string;
  let newExpert = false;
  if (!person) {
    const name = incoming.fullName ?? email.split("@")[0];
    const [row] = await db
      .insert(experts)
      .values({
        ...incoming,
        fullName: name,
        email,
        linkedinUrl: linkedin ?? incoming.linkedinUrl ?? null,
        primarySource: "job_form",
        status: "applicant",
        tags: possibleDuplicateOf ? ["job-form", "possible-duplicate"] : ["job-form"],
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: experts.id });
    if (!row) {
      // Someone with this email was added a moment ago: use that record.
      const [again] = await db.select(expertCols).from(experts).where(eq(experts.email, email)).limit(1);
      if (!again) return { ok: false, kind: "invalid", message: "Something went wrong. Please try again.", errors: {}, values: v.values };
      person = again;
      expertId = again.id;
    } else {
      expertId = row.id;
      newExpert = true;
      await logActivity(db, { entityType: "expert", entityId: expertId, actor: JOB_FORM_ACTOR, action: "created", detail: { source: "job_form", jobId: job.id, ...(possibleDuplicateOf ? { possibleDuplicateOf } : {}) } });
    }
  } else expertId = person.id;

  if (person) {
    const { patch, filled } = mergeIntoProfile(person, { ...incoming, ...(person.email ? {} : { email }) });
    if (filled.length) {
      await db.update(experts).set({ ...patch, updatedAt: now }).where(eq(experts.id, expertId));
      await logActivity(db, { entityType: "expert", entityId: expertId, actor: JOB_FORM_ACTOR, action: "updated_by_application", detail: { jobId: job.id, fields: filled } });
    }
  }

  // Files: the CV becomes the current CV (always); other uploads are kept as attachments.
  for (const f of fields) {
    const file = v.files[f.id];
    if (!file) continue;
    const kind = f.mapsTo === "cv" ? "cv" : "attachment";
    const fileId = await storeFile(db, expertId, file, kind);
    v.answers[f.id] = { fileId, filename: file.name.slice(0, 200), size: file.bytes.byteLength };
    if (kind === "cv") {
      await db.update(experts).set({ cvRef: `upload:${fileId}`, updatedAt: now }).where(eq(experts.id, expertId));
      await logActivity(db, { entityType: "expert", entityId: expertId, actor: JOB_FORM_ACTOR, action: "cv_uploaded", detail: { size: file.bytes.byteLength, jobId: job.id } });
    }
  }

  const consented = consentGiven(fields, v.answers);
  if (consented) {
    await db.update(experts).set({ cvConsent: "yes", cvConsentAt: now, updatedAt: now }).where(eq(experts.id, expertId));
    await logActivity(db, { entityType: "expert", entityId: expertId, actor: JOB_FORM_ACTOR, action: "cv_consent_recorded", detail: { value: "yes", via: "job_form", jobId: job.id } });
  }

  const invitedId = readInviteToken(input.source.invite);
  const source = { ...(input.source.utm ? { utm: input.source.utm } : {}), ...(input.source.ref ? { ref: input.source.ref } : {}), ...(invitedId && invitedId === expertId ? { invited: true } : {}) };
  const ipHash = input.ip ? keyedHash("ip", input.ip) : null;
  const answers = v.answers as Record<string, unknown>;
  const [existing] = await db.select({ id: applications.id, status: applications.status }).from(applications).where(and(eq(applications.jobId, job.id), eq(applications.expertId, expertId))).limit(1);
  let applicationId: string;
  if (existing) {
    applicationId = existing.id;
    await db
      .update(applications)
      .set({ answers, source, ipHash, updatedAt: now, ...(existing.status === "withdrawn" ? { status: "new" } : {}), ...(consented ? { consentAt: now } : {}) })
      .where(eq(applications.id, existing.id));
    await logActivity(db, { entityType: "application", entityId: applicationId, actor: JOB_FORM_ACTOR, action: "reapplied", detail: { jobId: job.id, expertId } });
    await addTimeline(db, { expertId, applicationId, kind: "application", summary: `Applied again to ${job.title}`, by: "job-form" });
  } else {
    // The pipeline starts at Applied (stage new), as in the FynoLabs admin.
    const [row] = await db
      .insert(applications)
      .values({ jobId: job.id, expertId, status: "new", stage: "new", channel: "applied", answers, source, ipHash, consentAt: consented ? now : null, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [applications.jobId, applications.expertId], set: { answers, source, ipHash, updatedAt: now } })
      .returning({ id: applications.id });
    applicationId = row.id;
    await logActivity(db, { entityType: "application", entityId: applicationId, actor: JOB_FORM_ACTOR, action: "created", detail: { jobId: job.id, expertId, ...(source.ref ? { ref: source.ref } : {}) } });
    await addTimeline(db, { expertId, applicationId, kind: "application", summary: `Applied to ${job.title}`, by: "job-form" });
  }
  if (consented) await addTimeline(db, { expertId, applicationId, kind: "consent", summary: "Consent to share their profile and CV recorded (job form)", by: "job-form" });

  const [after] = await db.select({ portalJoinedAt: experts.portalJoinedAt }).from(experts).where(eq(experts.id, expertId)).limit(1);
  return { ok: true, applicationId, expertId, newExpert, reapplied: Boolean(existing), hasPortalAccount: Boolean(after?.portalJoinedAt) };
}

// ---------- The team's side ----------

/** Every application column except money (rate_expectation_usd: applicationMoney(), admins and finance only). */
export const applicationColumns = {
  id: applications.id,
  jobId: applications.jobId,
  expertId: applications.expertId,
  status: applications.status,
  answers: applications.answers,
  source: applications.source,
  ipHash: applications.ipHash,
  internalNote: applications.internalNote,
  createdAt: applications.createdAt,
  updatedAt: applications.updatedAt,
  stage: applications.stage,
  stageChangedAt: applications.stageChangedAt,
  startedOn: applications.startedOn,
  endedOn: applications.endedOn,
  ownerTeamMemberId: applications.ownerTeamMemberId,
  ownerName: applications.ownerName,
  trackId: applications.trackId,
  channel: applications.channel,
  screening: applications.screening,
  eligible: applications.eligible,
  nextAction: applications.nextAction,
  nextActionDue: applications.nextActionDue,
  nextActionAuto: applications.nextActionAuto,
  rejectReason: applications.rejectReason,
  consentVersion: applications.consentVersion,
  consentAt: applications.consentAt,
  handledAt: applications.handledAt,
  handledBy: applications.handledBy,
  createdBy: applications.createdBy,
};

export const applicantColumns = {
  app: applicationColumns,
  expertName: experts.fullName,
  expertEmail: experts.email,
  expertPhone: experts.phone,
  expertCountry: experts.country,
  expertStatus: experts.status,
  cvConsent: experts.cvConsent,
  cvRef: experts.cvRef,
  yearsExperience: experts.yearsExperience,
};

export async function listApplicants(db: DB, jobId: string, f: { status?: string } = {}) {
  if (!isUuid(jobId)) return [];
  const conds = [eq(applications.jobId, jobId)];
  if (f.status && isOneOf(APPLICATION_STATUSES, f.status)) conds.push(eq(applications.status, f.status));
  return db
    .select(applicantColumns)
    .from(applications)
    .innerJoin(experts, eq(experts.id, applications.expertId))
    .where(and(...conds))
    .orderBy(sql`case ${applications.status} when 'new' then 0 when 'reviewing' then 1 when 'shortlisted' then 2 when 'submitted_to_partner' then 3 when 'hired' then 4 else 5 end`, desc(applications.updatedAt))
    .limit(2000);
}
export type ApplicantRow = Awaited<ReturnType<typeof listApplicants>>[number];

export async function applicantCounts(db: DB, jobId: string): Promise<Record<string, number>> {
  if (!isUuid(jobId)) return {};
  const rows = await db.select({ s: applications.status, n: sql<number>`count(*)`.mapWith(Number) }).from(applications).where(eq(applications.jobId, jobId)).groupBy(applications.status);
  return Object.fromEntries(rows.map((r) => [r.s, r.n]));
}

export async function getApplicant(db: DB, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db.select(applicantColumns).from(applications).innerJoin(experts, eq(experts.id, applications.expertId)).where(eq(applications.id, id)).limit(1);
  return row ?? null;
}

export async function setApplicationStatus(db: DB, actor: Actor, jobId: string, ids: string[], status: string) {
  if (!isOneOf(APPLICATION_STATUSES, status)) return { ok: false as const, reason: "Pick a status." };
  const clean = [...new Set(ids.filter(isUuid))].slice(0, 500);
  if (!clean.length) return { ok: false as const, reason: "Tick at least one applicant." };
  const rows = await db.select({ id: applications.id, status: applications.status }).from(applications).where(and(eq(applications.jobId, jobId), inArray(applications.id, clean)));
  const moving = rows.filter((r) => r.status !== status);
  if (moving.length) {
    // The pipeline stage follows the status (a database trigger keeps the two in step).
    await db.update(applications).set({ status: status as ApplicationStatus, updatedAt: new Date() }).where(inArray(applications.id, moving.map((r) => r.id)));
    const after = await db.select({ id: applications.id, expertId: applications.expertId, stage: applications.stage }).from(applications).where(inArray(applications.id, moving.map((r) => r.id)));
    const by = typeof actor === "string" ? actor : actor.email;
    for (const r of moving) {
      await logActivity(db, { entityType: "application", entityId: r.id, actor, action: "status_changed", detail: { jobId, from: r.status, to: status } });
      const a = after.find((x) => x.id === r.id);
      const from = PIPELINE_STAGE_LABELS[stageForStatus(r.status as ApplicationStatus)];
      if (a) await addTimeline(db, { expertId: a.expertId, applicationId: a.id, kind: "stage", summary: `Stage: ${from} -> ${PIPELINE_STAGE_LABELS[a.stage as keyof typeof PIPELINE_STAGE_LABELS] ?? a.stage}`, by });
    }
  }
  return { ok: true as const, changed: moving.length, unchanged: rows.length - moving.length };
}

export async function saveApplicationNote(db: DB, actor: Actor, id: string, note: string | null) {
  const [row] = isUuid(id) ? await db.select({ id: applications.id, jobId: applications.jobId, note: applications.internalNote }).from(applications).where(eq(applications.id, id)).limit(1) : [];
  if (!row) return { ok: false as const, reason: "That application no longer exists." };
  if ((row.note ?? null) === (note ?? null)) return { ok: true as const, changed: false, jobId: row.jobId };
  await db.update(applications).set({ internalNote: note, updatedAt: new Date() }).where(eq(applications.id, id));
  await logActivity(db, { entityType: "application", entityId: id, actor, action: "note_changed", detail: { jobId: row.jobId } });
  return { ok: true as const, changed: true, jobId: row.jobId };
}

/** Money: the rate the applicant asked for (jobs-site applications). Call only for roles that see money. */
export async function applicationMoney(db: DB, id: string): Promise<{ rateExpectationUsd: number | null } | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select({ rateExpectationUsd: applications.rateExpectationUsd }).from(applications).where(eq(applications.id, id)).limit(1);
  return row ?? null;
}

/** All applications of one expert (the admin profile and the portal). */
export async function applicationsOf(db: DB, expertId: string) {
  if (!isUuid(expertId)) return [];
  return db
    .select({ id: applications.id, status: applications.status, stage: applications.stage, stageChangedAt: applications.stageChangedAt, nextAction: applications.nextAction, nextActionDue: applications.nextActionDue, createdAt: applications.createdAt, updatedAt: applications.updatedAt, jobId: jobs.id, jobTitle: jobs.title, jobSlug: jobs.slug, jobStatus: jobs.status, jobVisibility: jobs.visibility, jobClosesOn: jobs.closesOn })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applications.expertId, expertId))
    .orderBy(desc(applications.createdAt));
}

export type { Answer, Application };
export const sortedAnswers = (fields: FieldDef[], a: Application) => fields.filter((f) => f.type !== "section").map((f) => ({ field: f, answer: (a.answers as Record<string, Answer>)[f.id] ?? null }));
