// Jobs end to end on the demo database, called the way Next.js calls them, as each role and as an
// expert: public listing rules, nothing internal in public HTML, job-from-requirement, the builder,
// matches and invites, who may change what, and experts kept to their own data.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import type { PGlite } from "@electric-sql/pglite";

const state = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(public url: string) {
      super(`REDIRECT ${url}`);
    }
  }
  return { user: null as unknown, db: null as unknown, Redirect };
});

vi.mock("@/lib/auth/session", () => {
  type U = { kind?: string; blocked?: boolean } | null;
  return {
    getAccount: async () => {
      const u = state.user as U;
      if (!u) return null;
      return u.kind === "expert" ? u : { kind: "team", user: u };
    },
    getCurrentUser: async () => {
      const u = state.user as U;
      return u && u.kind !== "expert" ? u : null;
    },
    requireUser: async () => {
      const u = state.user as U;
      if (!u) throw new state.Redirect("/signin");
      if (u.kind === "expert") throw new state.Redirect("/team-only");
      return u;
    },
  };
});
vi.mock("@/db/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db/client")>()), getDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new state.Redirect(url);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "jobs.example.test" }), cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import { openLocalDbWithClient } from "@/db/local/open";
import { rowsOf, type DB } from "@/db/client";
import { applications, dataRequests, experts, jobFormFields, jobInvites, jobs, partners, requirements, type Job } from "@/db/schema";
import type { Role } from "@/lib/auth/permissions";
import { jobPrefillFromRequirement } from "@/lib/forms/job";
import { isListed, jobPostingJsonLd, publicState, toPublicJob } from "@/lib/jobs-public";
import { renderMarkdown } from "@/lib/markdown";
import { getJobBySlug, jobCandidates, jobFields, listPublicJobs, publishProblems } from "@/lib/server/jobs";
import { jobForPage } from "@/lib/server/public-jobs";
import { JobPublicView } from "@/components/jobs/public-job";
import { changeFormField, inviteToJob, saveJob, setApplicantsStatus, setJobSharing, applyFormTemplate, saveFormTemplate, saveApplicantNote } from "@/app/admin/jobs/actions";
import { requestMyDeletion, saveOnboarding, setMyConsent } from "@/app/(site)/me/actions";
import { GET as exportApplicants } from "@/app/api/jobs/[id]/applicants/route";
import { GET as exportMine } from "@/app/api/me/export/route";
import { GET as exportExperts } from "@/app/api/experts/export/route";
import { POST as apply } from "@/app/api/apply/[slug]/route";

let db: DB;
let client: PGlite;

const as = (role: Role) => {
  state.user = { email: `${role}@xocket.sh`, name: role, devBypass: false, role, partnerIds: [], roleSource: "team", blocked: false };
};
const asExpert = (email: string, name = "Expert") => {
  state.user = { kind: "expert", email, name, devPreview: false };
};
const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
async function landing(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof state.Redirect) return decodeURIComponent(e.url);
    throw e;
  }
  throw new Error("expected a redirect");
}
const bySlug = async (slug: string) => (await getJobBySlug(db, slug))!;
const get = (url: string) => new NextRequest(new URL(url, "http://localhost"));

beforeAll(async () => {
  ({ db, client } = await openLocalDbWithClient({ seed: true }));
  state.db = db;
});
afterAll(async () => {
  await client.close();
});
beforeEach(() => {
  state.user = null;
});

describe("public listing rules", () => {
  it("the board lists open, public jobs only (featured first); unlisted, draft, closed and past-date jobs stay off", async () => {
    const listed = await listPublicJobs(db);
    expect(listed.map((j) => j.slug)).toEqual(["scientific-coding-expert-mathematics", "finance-expert-financial-modelling"]);
    const all = await db.select().from(jobs);
    for (const j of all) expect(isListed(j)).toBe(listed.some((l) => l.id === j.id));
    const fin = await bySlug("finance-expert-financial-modelling");
    expect(isListed({ ...fin, closesOn: "2020-01-01" })).toBe(false);
    expect(publicState({ status: "open", visibility: "public", closesOn: "2020-01-01" })).toBe("closed");
    expect(publicState({ status: "paused", visibility: "unlisted", closesOn: null })).toBe("paused");
    expect(publicState({ status: "open", visibility: "internal", closesOn: null })).toBe("hidden");
    expect(publicState({ status: "draft", visibility: "public", closesOn: null })).toBe("hidden");
    expect((await listPublicJobs(db, { q: "rust" })).length).toBe(0);
    expect((await listPublicJobs(db, { domain: "Finance" })).map((j) => j.slug)).toEqual(["finance-expert-financial-modelling"]);
  });

  it("job pages: unlisted and closed open by link; draft and internal are 404 for the public, a preview for the team", async () => {
    expect(await jobForPage(db, "rust-systems-engineer", null)).toMatchObject({ state: "open", preview: false });
    expect(await jobForPage(db, "biology-reviewer", null)).toMatchObject({ state: "closed" });
    expect(await jobForPage(db, "physics-problem-writer", null)).toBeNull();
    expect(await jobForPage(db, "physics-problem-writer", { kind: "expert", email: "x@example.org", name: "X", devPreview: false })).toBeNull();
    const team = { kind: "team" as const, user: { email: "v@xocket.sh", name: "v", devBypass: false, role: "viewer" as Role, partnerIds: [], roleSource: "team" as const, blocked: false } };
    expect(await jobForPage(db, "physics-problem-writer", team)).toMatchObject({ state: "hidden", preview: true });
  });

  it("no pay and no client name anywhere in a job page's public HTML or Google Jobs data", async () => {
    const job = await bySlug("scientific-coding-expert-mathematics");
    const [partner] = await db.select().from(partners).where(eq(partners.id, job.partnerId!));
    expect(job.internalRateNote).toBeTruthy();
    const pub = toPublicJob(job);
    expect(Object.keys(pub)).not.toEqual(expect.arrayContaining(["partnerId"]));
    for (const k of ["partnerId", "requirementId", "internalRateNote", "createdBy"]) expect(pub).not.toHaveProperty(k);
    const html = renderToStaticMarkup(createElement(JobPublicView, { job: pub }));
    const ld = JSON.stringify(jobPostingJsonLd(pub, { url: "https://jobs.example.test/jobs/x", siteName: "FynoLabs", siteUrl: "https://jobs.example.test", logoUrl: "https://jobs.example.test/brand/fynolabs-mark.svg", descriptionHtml: renderMarkdown(job.description) }));
    expect(html).toContain("Scientific Coding Expert - Mathematics");
    expect(html).toContain("AI data partner (via FynoLabs)");
    for (const text of [html, ld]) {
      expect(text).not.toContain(partner.name);
      expect(text).not.toMatch(/acme/i);
      expect(text).not.toContain(job.internalRateNote!);
      expect(text).not.toMatch(/[$€£₹]\s?\d|per hour|per task|\/hr\b|salary|baseSalary/i);
    }
    expect(JSON.parse(ld)).toMatchObject({ "@type": "JobPosting", hiringOrganization: { name: "FynoLabs" }, directApply: true, jobLocationType: "TELECOMMUTE" });
  });

  it("can't open a job whose public text mentions pay or the partner", async () => {
    const job = await bySlug("physics-problem-writer");
    as("admin");
    await db.update(jobs).set({ description: "Paid per task, $30/hr." }).where(eq(jobs.id, job.id));
    expect(await landing(setJobSharing(form({ id: job.id, status: "open" })))).toMatch(/error=Can't open this job yet: The description mentions/);
    const [acme] = await db.select().from(partners).where(sql`${partners.name} like 'Acme%'`);
    await db.update(jobs).set({ description: "Work with Acme on maths.", partnerId: acme.id }).where(eq(jobs.id, job.id));
    expect((await publishProblems(db, (await bySlug("physics-problem-writer")))).join(" ")).toMatch(/names the partner/);
    await db.update(jobs).set({ description: "Write physics problems.", partnerId: null }).where(eq(jobs.id, job.id));
    expect(await publishProblems(db, await bySlug("physics-problem-writer"))).toEqual([]);
    // Saving the details refuses pay too.
    const res = await saveJob({}, form({ id: job.id, title: "Physics writer", summary: "Earn $40 per hour", openings: "1", visibility: "public", employmentType: "contract" }));
    expect(res.message).toMatch(/summary mentions an amount of money/);
  });
});

describe("create a job from a requirement", () => {
  it("prefills title, skills, fields, countries, minimum years and openings; rate note only for money roles", async () => {
    const [req] = await db.select().from(requirements).where(sql`${requirements.title} like 'Rust%'`);
    const v = jobPrefillFromRequirement(req, { withRateNote: false });
    expect(v).toMatchObject({ title: "Rust Systems Engineer", partnerId: req.partnerId, requirementId: req.id, skills: "rust, linux, docker, kubernetes", domains: ["Software"], countriesAllowed: "United States", countriesBlocked: "US-CA, US-CT, US-IL", minYears: "5", openings: "2", internalRateNote: "", publicCompanyLabel: "AI data partner (via FynoLabs)" });
    expect(jobPrefillFromRequirement(req, { withRateNote: true }).internalRateNote).toBe(req.rateNote);
    const [p] = await db.select().from(partners).where(eq(partners.id, req.partnerId));
    for (const t of [v.title, v.summary, v.description]) {
      expect(t).not.toContain(p.name.replace(/ \(demo\)/, ""));
      expect(t).not.toMatch(/\$|per hour|budget/i);
    }
  });

  it("a recruiter creates it: draft, standard form, linked internally; the rate note can't be set without money rights", async () => {
    const [req] = await db.select().from(requirements).where(sql`${requirements.title} like 'Biology%'`);
    as("recruiter");
    const v = jobPrefillFromRequirement(req, { withRateNote: false });
    const fd = form({ ...Object.fromEntries(Object.entries(v).filter(([, x]) => !Array.isArray(x))) as Record<string, string>, domains: v.domains, internalRateNote: "sneaky 99/hr" });
    const to = await landing(saveJob({}, fd));
    expect(to).toMatch(/^\/admin\/jobs\/[0-9a-f-]+\?tab=form&ok=Job created as a draft/);
    const id = to.split("/")[3].split("?")[0];
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(job).toMatchObject({ status: "draft", requirementId: req.id, partnerId: req.partnerId, internalRateNote: null, slug: "biology-reviewer-2", openings: 2 });
    expect((await jobFields(db, id)).length).toBe(16);
  });
});

describe("who may change jobs and applicants", () => {
  it("viewers, pod leads and finance read only; recruiters and admins manage", async () => {
    const job = await bySlug("scientific-coding-expert-mathematics");
    const [app] = await db.select().from(applications).where(eq(applications.jobId, job.id)).limit(1);
    for (const role of ["viewer", "pod_lead", "finance"] as Role[]) {
      as(role);
      expect((await saveJob({}, form({ title: "X", openings: "1" }))).message).toMatch(/can't create or change jobs/);
      expect(await landing(changeFormField(form({ jobId: job.id, op: "add", type: "short_text", label: "Q" })))).toMatch(/error=.*can't create or change jobs/);
      expect(await landing(setJobSharing(form({ id: job.id, status: "closed" })))).toMatch(/error=/);
      expect(await landing(setApplicantsStatus(form({ jobId: job.id, one: app.id, status: "rejected" })))).toMatch(/error=.*can't change applications/);
      expect(await landing(saveApplicantNote(form({ id: app.id, note: "x" })))).toMatch(/error=/);
      expect(await landing(inviteToJob(form({ jobId: job.id, expertId: app.expertId })))).toMatch(/error=/);
      expect((await exportApplicants(get(`/api/jobs/${job.id}/applicants`), { params: Promise.resolve({ id: job.id }) })).status).toBe(403);
    }
    expect((await db.select().from(jobs).where(eq(jobs.id, job.id)))[0].status).toBe("open");
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0].status).toBe(app.status);
    as("recruiter");
    expect(await landing(setApplicantsStatus(form({ jobId: job.id, ids: [app.id], status: "reviewing" })))).toMatch(/ok=/);
    expect(await landing(saveApplicantNote(form({ id: app.id, note: "Strong maths, call Tuesday", returnTo: `/admin/jobs/${job.id}?tab=applicants` })))).toMatch(/ok=Note saved/);
    const res = await exportApplicants(get(`/api/jobs/${job.id}/applicants`), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv.split("\r\n")[0]).toMatch(/^\uFEFF?Name,Email,Phone,Country,Status,CV consent,Applied,Updated,Source,Full name,Email,/);
    expect(csv).toContain("Which area are you strongest in?");
    expect(csv).not.toContain(job.internalRateNote!);
    expect(csv).not.toContain("call Tuesday");
  });

  it("the form builder: add, edit, move, duplicate, delete; the email question can't go", async () => {
    const job = await bySlug("rust-systems-engineer");
    as("recruiter");
    const before = await jobFields(db, job.id);
    const added = await landing(changeFormField(form({ jobId: job.id, op: "add", type: "single_select", label: "Which Rust area?" })));
    expect(added).toMatch(/ok=Question added/);
    let fields = await jobFields(db, job.id);
    const q = fields.find((f) => f.label === "Which Rust area?")!;
    expect(q.options).toEqual({ choices: ["Option 1", "Option 2"] });
    expect(await landing(changeFormField(form({ jobId: job.id, op: "update", fieldId: q.id, type: "single_select", label: "Strongest Rust area?", choices: "Async\nEmbedded\nCompilers", required: "yes" })))).toMatch(/ok=Saved/);
    expect(await landing(changeFormField(form({ jobId: job.id, op: "up", fieldId: q.id })))).toMatch(/ok=Moved/);
    expect(await landing(changeFormField(form({ jobId: job.id, op: "duplicate", fieldId: q.id })))).toMatch(/ok=Question duplicated/);
    fields = await jobFields(db, job.id);
    const qi = fields.findIndex((f) => f.id === q.id);
    expect(fields[qi]).toMatchObject({ label: "Strongest Rust area?", required: true, options: { choices: ["Async", "Embedded", "Compilers"] } });
    expect(qi).toBe(before.length - 1);
    expect(fields[qi + 1].label).toBe("Strongest Rust area? (copy)");
    expect(await landing(changeFormField(form({ jobId: job.id, op: "delete", fieldId: fields[qi + 1].id })))).toMatch(/ok=Question deleted/);
    const email = fields.find((f) => f.mapsTo === "email")!;
    expect(await landing(changeFormField(form({ jobId: job.id, op: "delete", fieldId: email.id })))).toMatch(/error=Every application needs a name and an email/);
    expect(await landing(changeFormField(form({ jobId: job.id, op: "update", fieldId: email.id, type: "email", label: "Email", mapsTo: "" })))).toMatch(/error=.*Keep the mapping/);
    const positions = rowsOf<{ position: number }>(await db.execute(sql`select position from hub.job_form_fields where job_id = ${job.id} order by position`)).map((r) => r.position);
    expect(positions).toEqual(positions.map((_, i) => i));
    // Templates: save this form, then start another job from it.
    expect(await landing(saveFormTemplate(form({ jobId: job.id, name: "Rust form", shared: "yes" })))).toMatch(/ok=Saved as a template/);
    const fin = await bySlug("finance-expert-financial-modelling");
    const tpl = rowsOf<{ id: string }>(await db.execute(sql`select id from hub.form_templates where name = 'Rust form'`))[0];
    expect(await landing(applyFormTemplate(form({ jobId: fin.id, templateId: tpl.id })))).toMatch(/ok=The form now follows the template/);
    expect((await jobFields(db, fin.id)).map((f) => f.label)).toContain("Strongest Rust area?");
    expect(await landing(applyFormTemplate(form({ jobId: fin.id, templateId: "default" })))).toMatch(/ok=/);
    expect((await jobFields(db, fin.id)).map((f) => f.label)).not.toContain("Strongest Rust area?");
  });

  it("matches: experts in the hub who fit (applicants and do-not-contact left out); invite is recorded, no email without Resend", async () => {
    const job = await bySlug("scientific-coding-expert-mathematics");
    const { ranked } = await jobCandidates(db, job);
    expect(ranked.length).toBeGreaterThan(0);
    const applied = new Set((await db.select({ id: applications.expertId }).from(applications).where(eq(applications.jobId, job.id))).map((r) => r.id));
    expect(ranked.some((m) => applied.has(m.expertId))).toBe(false);
    expect(ranked.some((m) => m.expert.status === "do_not_contact")).toBe(false);
    as("recruiter");
    const to = await landing(inviteToJob(form({ jobId: job.id, expertId: ranked[0].expertId })));
    expect(to).toMatch(/ok=Recorded as invited. Email isn't set up/);
    expect(await db.$count(jobInvites, and(eq(jobInvites.jobId, job.id), eq(jobInvites.expertId, ranked[0].expertId)))).toBe(1);
    expect((await jobCandidates(db, job)).ranked.find((m) => m.expertId === ranked[0].expertId)?.invited).toBeTruthy();
  });
});

describe("experts stay out of the admin and in their own data", () => {
  it("admin actions and admin APIs refuse an expert", async () => {
    const job = await bySlug("scientific-coding-expert-mathematics");
    asExpert("riya.other@example.org");
    await expect(saveJob({}, form({ title: "Hacked", openings: "1" }))).rejects.toThrow(/REDIRECT \/team-only/);
    expect(await landing(setJobSharing(form({ id: job.id, status: "closed" })))).toBe("/team-only");
    const denied = await exportApplicants(get(`/api/jobs/${job.id}/applicants`), { params: Promise.resolve({ id: job.id }) });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "This is for the FynoLabs team only." });
    expect((await exportExperts(get("/api/experts/export"))).status).toBe(403);
    expect((await db.select().from(jobs).where(eq(jobs.id, job.id)))[0].status).toBe("open");
  });

  it("portal actions only ever change the signed-in expert's record, whatever the form says", async () => {
    const [other] = await db.select().from(experts).where(eq(experts.email, "asha-example@example.com"));
    const otherBefore = { consent: other.cvConsent, skills: other.skills, name: other.fullName };
    asExpert("new.expert@example.org", "New Expert");
    expect(await landing(setMyConsent(form({ id: other.id, expertId: other.id, consent: "no" })))).toMatch(/^\/me\?ok=/);
    const res = await landing(saveOnboarding({}, form({ step: "expertise", id: other.id, expertId: other.id, skills: "Rust, Go", headline: "Systems person" })));
    expect(res).toBe("/me/onboarding?step=experience&saved=expertise");
    expect(await landing(requestMyDeletion(form({ expertId: other.id, note: "please" })))).toMatch(/ok=Request received/);
    const [mine] = await db.select().from(experts).where(eq(experts.email, "new.expert@example.org"));
    expect(mine).toMatchObject({ fullName: "New Expert", primarySource: "portal", cvConsent: "no", skills: ["rust", "go"], headline: "Systems person", onboardingDone: ["expertise"] });
    expect(mine.portalJoinedAt).toBeInstanceOf(Date);
    const [after] = await db.select().from(experts).where(eq(experts.id, other.id));
    expect({ consent: after.cvConsent, skills: after.skills, name: after.fullName }).toEqual(otherBefore);
    expect(await db.$count(dataRequests, eq(dataRequests.expertId, other.id))).toBe(0);
    expect(await db.$count(dataRequests, eq(dataRequests.expertId, mine.id))).toBe(1);
  });

  it("'Download my data' returns only their own record, without internal notes, status or rates", async () => {
    asExpert("demo.expert@example.com", "Riya Portaldemo");
    const res = await exportMine();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profile.email).toBe("demo.expert@example.com");
    for (const k of ["notes", "tags", "status", "rateExpectationUsd", "primarySource", "cvRef"]) expect(data.profile).not.toHaveProperty(k);
    expect(JSON.stringify(data)).not.toMatch(/Demo record\. Not a real person|asha-example@example\.com|noor\.formdemo/);
    expect(data.applications.map((a: { job: string }) => a.job)).toEqual(["Scientific Coding Expert - Mathematics"]);
    state.user = null;
    expect((await exportMine()).status).toBe(401);
    as("admin");
    expect((await exportMine()).status).toBe(403);
  });
});

describe("the public apply endpoint", () => {
  it("takes a guest's multipart form and answers JSON (with JavaScript) or a 303 (without)", async () => {
    const job = await bySlug("finance-expert-financial-modelling");
    const fields = await jobFields(db, job.id);
    const k = (m: string) => `f_${fields.find((f) => f.mapsTo === m)!.id}`;
    const fd = form({ [k("full_name")]: "Grace Guest", [k("email")]: "grace.guest@example.org", [k("country")]: "Kenya", [k("linkedin_url")]: "linkedin.com/in/grace-guest-x", [k("years_experience")]: "5", [k("skills")]: "Excel, valuation", [k("cv_consent")]: "yes", utm_source: "whatsapp", website: "" });
    fd.append(k("cv"), new File([new TextEncoder().encode("%PDF-1.4 grace")], "grace.pdf", { type: "application/pdf" }));
    const req = new NextRequest(new URL(`/api/apply/${job.slug}`, "http://localhost"), { method: "POST", body: fd, headers: { accept: "application/json", "x-forwarded-for": "192.0.2.44" } });
    const res = await apply(req, { params: Promise.resolve({ slug: job.slug }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: `/jobs/${job.slug}/applied` });
    const [e] = await db.select().from(experts).where(eq(experts.email, "grace.guest@example.org"));
    expect(e).toMatchObject({ primarySource: "job_form", cvConsent: "yes", country: "Kenya" });
    const [app] = await db.select().from(applications).where(eq(applications.expertId, e.id));
    expect(app.source).toEqual({ utm: { source: "whatsapp" } });
    expect(app.ipHash).toMatch(/^[0-9a-f]{64}$/);

    const bad = new NextRequest(new URL(`/api/apply/${job.slug}`, "http://localhost"), { method: "POST", body: form({ [k("email")]: "nope" }) });
    const r2 = await apply(bad, { params: Promise.resolve({ slug: job.slug }) });
    expect(r2.status).toBe(303);
    expect(r2.headers.get("location")).toMatch(new RegExp(`/jobs/${job.slug}\\?error=`));
    const draft = await apply(new NextRequest(new URL("/api/apply/physics-problem-writer", "http://localhost"), { method: "POST", body: form({}), headers: { accept: "application/json" } }), { params: Promise.resolve({ slug: "physics-problem-writer" }) });
    expect(draft.status).toBe(409);
    expect(await db.$count(jobFormFields)).toBeGreaterThan(0);
  });
});
