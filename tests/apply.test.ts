// The public application flow on a real (in-memory) database: find-or-create by email, dedupe by
// LinkedIn, the merge rules, CV storage, consent, refusals, rate limits and the honeypot.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import { rowsOf, type DB } from "@/db/client";
import { applications, erasures, expertFiles, experts, jobs, partners, submitAttempts, type Job } from "@/db/schema";
import { emptyJobValues } from "@/lib/forms/job";
import { answerInputFrom, inputName, type FieldDef, type UploadedFile } from "@/lib/forms/job-fields";
import { emailHash } from "@/lib/normalize";
import { REFUSED_MESSAGE, submitApplication, type Applicant } from "@/lib/server/applications";
import { getFileRow, readCv } from "@/lib/server/cv";
import { changeField, createJob, getJob, jobFields, setJobState } from "@/lib/server/jobs";
import { parseJobForm } from "@/lib/forms/job";

let db: DB;
let client: PGlite;
let job: Job;
let fields: FieldDef[];
const admin = { email: "admin@xocket.sh", role: "admin" as const, partnerIds: [] };

const pdf = (name = "cv.pdf", text = "%PDF-1.4 test"): UploadedFile => {
  const bytes = new TextEncoder().encode(text);
  return { name, type: "application/pdf", size: bytes.byteLength, bytes };
};
const key = (k: string) => inputName(fields.find((f) => f.mapsTo === k || f.label === k)!.id);

function answers(o: Partial<Record<string, string | string[] | UploadedFile>> = {}) {
  const base: Record<string, string | string[] | UploadedFile> = {
    [key("full_name")]: "Ada Applicant",
    [key("email")]: "ada.applicant@example.org",
    [key("country")]: "India",
    [key("linkedin_url")]: "https://www.linkedin.com/in/ada-applicant-example",
    [key("years_experience")]: "6",
    [key("skills")]: "Python, numerical analysis",
    [key("cv")]: pdf(),
    [key("cv_consent")]: "yes",
  };
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return answerInputFrom(base);
}

const submit = (o: Parameters<typeof answers>[0] = {}, extra: { applicant?: Applicant; ip?: string | null; honeypot?: string; j?: Job } = {}) =>
  submitApplication(db, { job: extra.j ?? job, fields, answers: answers(o), applicant: extra.applicant ?? { kind: "guest" }, ip: extra.ip === undefined ? null : extra.ip, honeypot: extra.honeypot ?? null, source: { utm: { source: "linkedin" } } });

async function newJob(title: string, status = "open"): Promise<Job> {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...emptyJobValues(), title })) if (!Array.isArray(v)) fd.set(k, v);
  const { data } = parseJobForm(fd);
  const res = await createJob(db, admin, data!);
  if (!res.ok) throw new Error(res.reason);
  if (status !== "draft") {
    const r = await setJobState(db, admin, res.id, { status: "open" });
    if (!r.ok) throw new Error(r.reason);
    if (status !== "open") await setJobState(db, admin, res.id, { status });
  }
  return (await getJob(db, res.id))!.job;
}

beforeAll(async () => {
  ({ db, client } = await openTestDb());
  await db.insert(partners).values({ name: "Apply Test Partner" });
  job = await newJob("Scientific Coding Expert - Mathematics");
  fields = await jobFields(db, job.id);
});
afterAll(async () => {
  await client.close();
});

describe("a guest applies", () => {
  it("creates the expert from the answers, stores the CV as current, records consent and one application", async () => {
    const res = await submit();
    expect(res).toMatchObject({ ok: true, newExpert: true, reapplied: false, hasPortalAccount: false });
    if (!res.ok) return;
    const [e] = await db.select().from(experts).where(eq(experts.id, res.expertId));
    expect(e).toMatchObject({ fullName: "Ada Applicant", email: "ada.applicant@example.org", country: "India", yearsExperience: 6, skills: ["python", "numerical methods"], primarySource: "job_form", status: "applicant", cvConsent: "yes" });
    expect(e.cvConsentAt).toBeInstanceOf(Date);
    expect(e.tags).toContain("job-form");
    expect(e.cvRef).toMatch(/^upload:/);
    const file = await getFileRow(db, e.cvRef!.slice(7));
    expect(Buffer.from((await readCv(db, file!))!.bytes).toString()).toBe("%PDF-1.4 test");
    const [app] = await db.select().from(applications).where(eq(applications.id, res.applicationId));
    expect(app).toMatchObject({ jobId: job.id, expertId: e.id, status: "new", source: { utm: { source: "linkedin" } } });
    const cvAnswer = (app.answers as Record<string, { fileId: string }>)[fields.find((f) => f.mapsTo === "cv")!.id];
    expect(cvAnswer.fileId).toBe(e.cvRef!.slice(7));
    const log = rowsOf<{ action: string; actor_email: string }>(await db.execute(sql`select action, actor_email from hub.activity where entity_id = ${e.id} order by created_at`));
    expect(log.map((l) => l.action)).toEqual(["created", "cv_uploaded", "cv_consent_recorded"]);
    expect(log.every((l) => l.actor_email === "job-form")).toBe(true);
  });

  it("applying again (any letter case) updates the same application and never overwrites team edits", async () => {
    const [e] = await db.select().from(experts).where(eq(experts.email, "ada.applicant@example.org"));
    await db.update(experts).set({ fullName: "Ada A. (edited by team)", country: "Germany", headline: null, city: null }).where(eq(experts.id, e.id));
    const res = await submit({ [key("email")]: "ADA.Applicant@Example.org", [key("country")]: "United States", [key("full_name")]: "Someone Else", [key("skills")]: "Python, LaTeX", [key("city")]: "Pune", [key("cv")]: pdf("new-cv.pdf", "%PDF-1.4 newer") });
    expect(res).toMatchObject({ ok: true, newExpert: false, reapplied: true });
    const [after] = await db.select().from(experts).where(eq(experts.id, e.id));
    expect(after.fullName).toBe("Ada A. (edited by team)");
    expect(after.country).toBe("Germany");
    expect(after.city).toBe("Pune");
    expect(after.skills).toEqual(["python", "numerical methods", "latex"]);
    // The newest CV always becomes the current one.
    const current = await getFileRow(db, after.cvRef!.slice(7));
    expect(current?.filename).toBe("new-cv.pdf");
    expect(await db.$count(applications, and(eq(applications.jobId, job.id), eq(applications.expertId, e.id)))).toBe(1);
    expect(await db.$count(experts, eq(experts.email, "ada.applicant@example.org"))).toBe(1);
  });

  it("a withdrawn application comes back as new when they apply again", async () => {
    const [e] = await db.select().from(experts).where(eq(experts.email, "ada.applicant@example.org"));
    await db.update(applications).set({ status: "withdrawn" }).where(eq(applications.expertId, e.id));
    await submit();
    const [app] = await db.select().from(applications).where(eq(applications.expertId, e.id));
    expect(app.status).toBe("new");
  });
});

describe("dedupe on email and LinkedIn", () => {
  it("same LinkedIn URL, record without an email: the same person (email filled in)", async () => {
    const [old] = await db.insert(experts).values({ fullName: "Bo Register", linkedinUrl: "https://www.linkedin.com/in/bo-register-example", primarySource: "register", phone: "+1 555 0123" }).returning();
    const res = await submit({ [key("email")]: "bo.new@example.org", [key("full_name")]: "Bo Register", [key("linkedin_url")]: "linkedin.com/in/Bo-Register-Example/" });
    expect(res).toMatchObject({ ok: true, expertId: old.id, newExpert: false });
    const [after] = await db.select().from(experts).where(eq(experts.id, old.id));
    expect(after.email).toBe("bo.new@example.org");
    expect(after.primarySource).toBe("register");
    expect(after.phone).toBe("+1 555 0123");
  });

  it("same LinkedIn URL but a different email on file: a new record, flagged as a possible duplicate", async () => {
    const [old] = await db.insert(experts).values({ fullName: "Cy Twice", email: "cy.first@example.org", linkedinUrl: "https://www.linkedin.com/in/cy-twice-example" }).returning();
    const res = await submit({ [key("email")]: "cy.second@example.org", [key("full_name")]: "Cy Twice", [key("linkedin_url")]: "https://www.linkedin.com/in/cy-twice-example" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.expertId).not.toBe(old.id);
    const [fresh] = await db.select().from(experts).where(eq(experts.id, res.expertId));
    expect(fresh.tags).toEqual(["job-form", "possible-duplicate"]);
    const [log] = rowsOf<{ detail: { possibleDuplicateOf?: string } }>(await db.execute(sql`select detail from hub.activity where entity_id = ${fresh.id} and action = 'created'`));
    expect(log.detail.possibleDuplicateOf).toBe(old.id);
    const [first] = await db.select().from(experts).where(eq(experts.id, old.id));
    expect(first.cvRef).toBeNull();
  });
});

describe("consent", () => {
  it("a form whose consent box isn't required: unticked leaves CV consent as it was", async () => {
    const j = await newJob("Consent Optional Job");
    const jf = await jobFields(db, j.id);
    const consent = jf.find((f) => f.mapsTo === "cv_consent")!;
    await changeField(db, admin, j.id, { op: "update", id: consent.id, raw: { ...consent, required: false } });
    const f2 = await jobFields(db, j.id);
    const k = (m: string) => inputName(f2.find((f) => f.mapsTo === m)!.id);
    const res = await submitApplication(db, {
      job: j,
      fields: f2,
      answers: answerInputFrom({ [k("full_name")]: "Dee No Consent", [k("email")]: "dee.noconsent@example.org", [k("country")]: "France", [k("linkedin_url")]: "linkedin.com/in/dee-no-consent", [k("years_experience")]: "2", [k("skills")]: "Rust", [k("cv")]: pdf() }),
      applicant: { kind: "guest" },
      ip: null,
      source: {},
    });
    expect(res.ok).toBe(true);
    const [e] = await db.select().from(experts).where(eq(experts.email, "dee.noconsent@example.org"));
    expect(e.cvConsent).toBe("unknown");
    expect(e.cvConsentAt).toBeNull();
  });
});

describe("refusals, limits and spam", () => {
  it("do-not-contact and deleted-on-request people are refused politely, without saying why", async () => {
    await db.insert(experts).values({ fullName: "Nope Person", email: "nope@example.org", status: "do_not_contact" });
    const before = await db.$count(applications);
    const r1 = await submit({ [key("email")]: "Nope@example.org" });
    expect(r1).toEqual({ ok: false, kind: "refused", message: REFUSED_MESSAGE });
    expect(REFUSED_MESSAGE).not.toMatch(/contact list|do not contact|deleted|erase/i);
    await db.insert(erasures).values({ emailSha256: emailHash("gone@example.org"), actorEmail: "admin@xocket.sh" });
    const r2 = await submit({ [key("email")]: "gone@example.org", [key("linkedin_url")]: "linkedin.com/in/gone-person" });
    expect(r2).toEqual({ ok: false, kind: "refused", message: REFUSED_MESSAGE });
    expect(await db.$count(experts, eq(experts.email, "gone@example.org"))).toBe(0);
    expect(await db.$count(applications)).toBe(before);
  });

  it("checks every answer on the server and keeps what they typed", async () => {
    const res = await submit({ [key("email")]: "not-an-email", [key("cv")]: { name: "cv.exe", type: "application/x-msdownload", size: 10, bytes: new Uint8Array(10) }, [key("cv_consent")]: undefined });
    expect(res.ok).toBe(false);
    if (res.ok || res.kind !== "invalid") return;
    expect(Object.values(res.errors)).toEqual(expect.arrayContaining([expect.stringMatching(/valid email/), expect.stringMatching(/PDF or Word/), expect.stringMatching(/tick/)]));
    expect(res.values[fields.find((f) => f.mapsTo === "email")!.id]).toBe("not-an-email");
  });

  it("the honeypot: filled in means nothing is stored (the bot sees the same thank-you)", async () => {
    const before = [await db.$count(experts), await db.$count(applications)];
    const res = await submit({ [key("email")]: "bot@example.org" }, { honeypot: "http://spam.example" });
    expect(res).toMatchObject({ ok: false, kind: "spam" });
    expect([await db.$count(experts), await db.$count(applications)]).toEqual(before);
  });

  it("per-email and per-IP rate limits", async () => {
    for (let i = 0; i < 5; i++) expect((await submit({ [key("email")]: "eager@example.org", [key("linkedin_url")]: "linkedin.com/in/eager" })).ok).toBe(true);
    expect(await submit({ [key("email")]: "eager@example.org", [key("linkedin_url")]: "linkedin.com/in/eager" })).toMatchObject({ ok: false, kind: "rate_limited" });
    await db.delete(submitAttempts);
    for (let i = 0; i < 10; i++) expect((await submit({ [key("email")]: `p${i}@example.org`, [key("linkedin_url")]: `linkedin.com/in/p${i}-x` }, { ip: "203.0.113.9" })).ok).toBe(true);
    expect(await submit({ [key("email")]: "p11@example.org" }, { ip: "203.0.113.9" })).toMatchObject({ ok: false, kind: "rate_limited" });
    expect((await submit({ [key("email")]: "p12@example.org", [key("linkedin_url")]: "linkedin.com/in/p12-x" }, { ip: "198.51.100.1" })).ok).toBe(true);
    const stored = rowsOf<{ key_hash: string }>(await db.execute(sql`select key_hash from hub.submit_attempts`));
    expect(stored.some((r) => r.key_hash.includes("203.0.113.9") || r.key_hash.includes("@"))).toBe(false);
  });

  it("closed, paused and draft jobs take no applications", async () => {
    for (const status of ["closed", "paused"]) {
      const j = await newJob(`Status ${status}`, status);
      expect((await submitApplication(db, { job: j, fields: await jobFields(db, j.id), answers: answers(), applicant: { kind: "guest" }, ip: null, source: {} })).ok).toBe(false);
    }
    const d = await newJob("Status draft", "draft");
    expect(await submitApplication(db, { job: d, fields: await jobFields(db, d.id), answers: answers(), applicant: { kind: "guest" }, ip: null, source: {} })).toMatchObject({ ok: false, kind: "closed" });
    const past = await newJob("Past date");
    await db.update(jobs).set({ closesOn: "2020-01-01" }).where(eq(jobs.id, past.id));
    const pj = (await getJob(db, past.id))!.job;
    expect(await submitApplication(db, { job: pj, fields: await jobFields(db, pj.id), answers: answers(), applicant: { kind: "guest" }, ip: null, source: {} })).toMatchObject({ ok: false, kind: "closed" });
  });
});

describe("a signed-in expert applies", () => {
  it("files the answers under their account email and reuses the CV on file", async () => {
    await db.delete(submitAttempts);
    const [me] = await db.insert(experts).values({ fullName: "Signed In", email: "signed.in@example.org", portalJoinedAt: new Date() }).returning();
    const [f] = await db.insert(expertFiles).values({ expertId: me.id, kind: "cv", filename: "mine.pdf", mime: "application/pdf", size: 3, storage: "upload", data: new Uint8Array([1, 2, 3]) }).returning({ id: expertFiles.id });
    await db.update(experts).set({ cvRef: `upload:${f.id}` }).where(eq(experts.id, me.id));
    const res = await submit({ [key("email")]: "someone.else@example.org", [key("full_name")]: "Signed In", [key("cv")]: undefined }, { applicant: { kind: "expert", email: "signed.in@example.org", expertId: me.id } });
    expect(res).toMatchObject({ ok: true, expertId: me.id, newExpert: false, hasPortalAccount: true });
    expect(await db.$count(experts, eq(experts.email, "someone.else@example.org"))).toBe(0);
    const [app] = await db.select().from(applications).where(and(eq(applications.expertId, me.id), eq(applications.jobId, job.id)));
    const a = app.answers as Record<string, unknown>;
    expect(a[fields.find((x) => x.mapsTo === "email")!.id]).toBe("signed.in@example.org");
    expect(a[fields.find((x) => x.mapsTo === "cv")!.id]).toEqual({ fileId: f.id, filename: "mine.pdf", size: 3 });
  });
});
