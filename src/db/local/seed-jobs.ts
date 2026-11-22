// LOCAL DEMO DATA ONLY: five jobs (featured, unlisted, closed, draft and one more open), their
// forms, a demo expert for the portal, and a handful of applications sent through the real
// application code. Every person and company is made up (example.com / example.org addresses).
import { count, eq, sql } from "drizzle-orm";
import type { DB } from "../client";
import { applications, experts, jobFormFields, jobs, partners, requirements } from "../schema";
import { DEV_EXPERT } from "@/lib/auth/allow";
import { answerInputFrom, defaultTemplate, inputName, type FieldDef, type TemplateField, type UploadedFile } from "@/lib/forms/job-fields";
import { submitApplication } from "@/lib/server/applications";
import { jobFields } from "@/lib/server/jobs";

const SEED_ACTOR = "seed@example.com";
const day = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const MATH_DESC = `## About the work
Write challenging mathematics problems with worked solutions, then check how AI models solve them. Most tasks combine a clear proof or derivation with a short Python check.

## What we look for
- A Master's or PhD in mathematics or a close field
- Strong Python, including numerical methods
- 3+ years of research, teaching or industry work
- Clear written English

## How it works
Apply with the form below. If your profile fits, we invite you to a short screening task and then to onboarding. You choose your hours.`;

const RUST_DESC = `## About the work
Design and review systems-programming tasks in Rust for AI coding evaluations: build tooling, concurrency and Linux internals.

## What we look for
- 5+ years of professional Rust
- Comfortable with Linux, Docker and debugging production systems
- Based in the United States`;

const BIO_DESC = `## About the work
Review biology answers written by AI models for accuracy and reasoning, and explain the right answer.

## What we look for
- PhD in molecular biology, genetics or a close field
- 2+ years of research experience`;

const PHYS_DESC = `## About the work
Write physics problems (mechanics, electromagnetism, quantum) with step-by-step solutions that test how well AI models reason.

## What we look for
- Master's or PhD in physics
- Experience teaching or tutoring is a plus`;

const FIN_DESC = `## About the work
Build and review financial-modelling tasks: valuation, three-statement models and the reasoning behind each number.

## What we look for
- 4+ years in corporate finance, banking or equity research
- Excellent Excel and a clear explanation of your assumptions
- CFA, CA or an MBA is a plus`;

function withExtra(extra: TemplateField[], afterLabel = "Skills"): TemplateField[] {
  const base = defaultTemplate();
  const at = base.findIndex((f) => f.label === afterLabel) + 1;
  base.splice(at, 0, ...extra);
  return base;
}

async function insertJob(db: DB, v: typeof jobs.$inferInsert, fields: TemplateField[]) {
  const [row] = await db.insert(jobs).values(v).returning();
  await db.insert(jobFormFields).values(fields.map((f, i) => ({ jobId: row.id, position: i, type: f.type, label: f.label, helpText: f.helpText, required: f.required, options: f.options, mapsTo: f.mapsTo })));
  return row;
}

const pdf = (name: string): UploadedFile => {
  const bytes = new TextEncoder().encode(`%PDF-1.4\n% Demo CV for ${name} (fictional, not a real person)\n`);
  return { name: `${name.replace(/\s+/g, "_")}_CV.pdf`, type: "application/pdf", size: bytes.byteLength, bytes };
};

type Person = { name: string; email: string; country: string; city?: string; linkedin: string; years: number; degree?: string; field?: string; university?: string; skills: string; hours?: number; availability?: string; why?: string; extra?: Record<string, string | string[]> };

function answersFor(fields: FieldDef[], p: Person) {
  const by = (k: string) => fields.find((f) => f.mapsTo === k);
  const vals: Record<string, string | string[] | UploadedFile> = {};
  const put = (k: string, v: string | undefined) => {
    const f = by(k);
    if (f && v != null) vals[inputName(f.id)] = v;
  };
  put("full_name", p.name);
  put("email", p.email);
  put("country", p.country);
  put("city", p.city);
  put("linkedin_url", p.linkedin);
  put("years_experience", String(p.years));
  put("highest_degree", p.degree);
  put("field_of_study", p.field);
  put("university", p.university);
  put("skills", p.skills);
  put("hours_per_week", p.hours != null ? String(p.hours) : undefined);
  put("availability", p.availability ?? "Available now");
  put("cv_consent", "yes");
  const cv = by("cv");
  if (cv) vals[inputName(cv.id)] = pdf(p.name);
  const why = fields.find((f) => f.type === "long_text" && !f.mapsTo);
  if (why && p.why) vals[inputName(why.id)] = p.why;
  for (const [label, v] of Object.entries(p.extra ?? {})) {
    const f = fields.find((x) => x.label === label);
    if (f) vals[inputName(f.id)] = v;
  }
  return answerInputFrom(vals);
}

export async function seedJobsIfEmpty(db: DB): Promise<boolean> {
  if (process.env.DATABASE_URL) throw new Error("Demo data is for the local database only (DATABASE_URL is set).");
  const [{ n }] = await db.select({ n: count() }).from(jobs);
  if (Number(n) > 0) return false;
  const now = Date.now();
  const reqs = await db.select({ id: requirements.id, title: requirements.title, partnerId: requirements.partnerId }).from(requirements);
  const req = (t: string) => reqs.find((r) => r.title.startsWith(t)) ?? null;
  const [anyPartner] = await db.select({ id: partners.id }).from(partners).limit(1);

  // The demo expert used by "Preview as -> Expert (portal)": part-way through onboarding.
  const [demo] = await db.select({ id: experts.id }).from(experts).where(eq(experts.email, DEV_EXPERT.email)).limit(1);
  if (!demo) {
    await db.insert(experts).values({
      fullName: DEV_EXPERT.name,
      email: DEV_EXPERT.email,
      country: "India",
      city: "Bengaluru",
      phone: "+91 555 0199",
      linkedinUrl: "https://www.linkedin.com/in/demo-riya-portaldemo-example",
      headline: "Applied mathematician, optimisation",
      domain: "Mathematics",
      skills: ["python", "optimization", "linear algebra"],
      languages: ["English", "Hindi"],
      primarySource: "portal",
      status: "applicant",
      portalJoinedAt: new Date(now - 6 * day),
      onboardingDone: ["basics", "expertise"],
      tags: ["portal", "demo"],
      notes: "Demo record. Not a real person.",
    });
  }

  const math = req("Scientific Coding");
  const rust = req("Rust Systems");
  const bio = req("Biology");
  const j1 = await insertJob(
    db,
    {
      slug: "scientific-coding-expert-mathematics",
      title: "Scientific Coding Expert - Mathematics",
      partnerId: math?.partnerId ?? anyPartner?.id ?? null,
      requirementId: math?.id ?? null,
      summary: "Remote work for mathematicians who code: write and check hard problems that train frontier AI models.",
      description: MATH_DESC,
      location: "Remote",
      employmentType: "contract",
      domains: ["Mathematics"],
      skills: ["python", "numerical methods", "linear algebra", "latex"],
      countriesAllowed: ["United States", "India", "Germany", "United Kingdom"],
      minYears: 3,
      openings: 3,
      status: "open",
      visibility: "public",
      featured: true,
      closesOn: iso(new Date(now + 30 * day)),
      internalRateNote: "Demo note: partner budget discussed on the call.",
      publishedAt: new Date(now - 5 * day),
      createdBy: SEED_ACTOR,
      createdAt: new Date(now - 6 * day),
      updatedAt: new Date(now - 2 * day),
    },
    withExtra([
      { type: "single_select", label: "Which area are you strongest in?", helpText: null, required: true, options: { choices: ["Numerical analysis", "Linear algebra", "Probability and statistics", "Optimisation", "Number theory"] }, mapsTo: null },
      { type: "yes_no", label: "Have you written proofs in LaTeX before?", helpText: null, required: false, options: null, mapsTo: null },
    ]),
  );
  const j2 = await insertJob(
    db,
    {
      slug: "rust-systems-engineer",
      title: "Rust Systems Engineer",
      partnerId: rust?.partnerId ?? null,
      requirementId: rust?.id ?? null,
      summary: "Senior Rust engineers to design and review systems-programming tasks for AI coding evaluations.",
      description: RUST_DESC,
      location: "Remote (United States)",
      employmentType: "contract",
      domains: ["Software"],
      skills: ["rust", "linux", "docker", "kubernetes"],
      countriesAllowed: ["United States"],
      countriesBlocked: ["US-CA", "US-CT", "US-IL"],
      minYears: 5,
      openings: 2,
      status: "open",
      visibility: "unlisted",
      publishedAt: new Date(now - 3 * day),
      createdBy: SEED_ACTOR,
      createdAt: new Date(now - 3 * day),
      updatedAt: new Date(now - 3 * day),
    },
    defaultTemplate(),
  );
  const j3 = await insertJob(
    db,
    {
      slug: "biology-reviewer",
      title: "Biology Reviewer",
      partnerId: bio?.partnerId ?? null,
      requirementId: bio?.id ?? null,
      summary: "PhD biologists to review AI answers in molecular biology and genetics.",
      description: BIO_DESC,
      location: "Remote",
      employmentType: "part_time",
      domains: ["Biology"],
      skills: ["molecular biology", "genomics"],
      countriesBlocked: ["India"],
      minYears: 2,
      openings: 2,
      status: "open",
      visibility: "public",
      publishedAt: new Date(now - 20 * day),
      createdBy: SEED_ACTOR,
      createdAt: new Date(now - 21 * day),
      updatedAt: new Date(now - 4 * day),
    },
    defaultTemplate(),
  );
  await insertJob(
    db,
    {
      slug: "physics-problem-writer",
      title: "Physics Problem Writer",
      summary: "Write physics problems with step-by-step solutions that test how AI models reason.",
      description: PHYS_DESC,
      location: "Remote",
      employmentType: "freelance",
      domains: ["Physics"],
      skills: ["quantum mechanics", "electromagnetism", "latex"],
      minYears: 2,
      openings: 5,
      status: "draft",
      visibility: "public",
      createdBy: SEED_ACTOR,
      createdAt: new Date(now - 1 * day),
      updatedAt: new Date(now - 1 * day),
    },
    defaultTemplate(),
  );
  const j5 = await insertJob(
    db,
    {
      slug: "finance-expert-financial-modelling",
      title: "Finance Expert - Financial Modelling",
      summary: "Finance professionals to build and review valuation and modelling tasks for AI evaluations.",
      description: FIN_DESC,
      location: "Remote",
      employmentType: "contract",
      domains: ["Finance"],
      skills: ["financial modeling", "valuation", "excel"],
      minYears: 4,
      openings: 4,
      status: "open",
      visibility: "public",
      publishedAt: new Date(now - 2 * day),
      createdBy: SEED_ACTOR,
      createdAt: new Date(now - 2 * day),
      updatedAt: new Date(now - 2 * day),
    },
    defaultTemplate(),
  );

  // Applications, sent through the real application code (find-or-create, merge, CV, consent).
  const apply = async (job: typeof j1, p: Person, source: Record<string, string> = {}) => {
    const fields = await jobFields(db, job.id);
    const res = await submitApplication(db, { job, fields, answers: answersFor(fields, p), applicant: { kind: "guest" }, ip: null, source: { ...(source.utm ? { utm: { source: source.utm, medium: "social" } } : {}), ...(source.ref ? { ref: source.ref } : {}) } });
    if (!res.ok) throw new Error(`Demo application failed: ${res.message}`);
    return res.applicationId;
  };
  const strongest = "Which area are you strongest in?";
  const latex = "Have you written proofs in LaTeX before?";
  const a1 = await apply(j1, { name: "Asha Example", email: "asha-example@example.com", country: "United States", city: "Austin", linkedin: "https://www.linkedin.com/in/demo-asha-example-example", years: 7, degree: "PhD", field: "Applied Mathematics", university: "Example State University", skills: "Python, numerical methods, LaTeX", hours: 20, why: "Seven years of numerical analysis research; I write problem sets for my students every term.", extra: { [strongest]: "Numerical analysis", [latex]: "yes" } }, { utm: "linkedin" });
  const a2 = await apply(j1, { name: "Noor Formdemo", email: "noor.formdemo@example.org", country: "India", city: "Pune", linkedin: "https://www.linkedin.com/in/demo-noor-formdemo-example", years: 4, degree: "Master's", field: "Mathematics", university: "Demo University", skills: "Python, linear algebra, probability", hours: 25, availability: "Available now", why: "I tutor university maths and build small numerical tools in Python.", extra: { [strongest]: "Linear algebra", [latex]: "yes" } }, { utm: "whatsapp" });
  const a3 = await apply(j1, { name: "Elias Formdemo", email: "elias.formdemo@example.org", country: "Germany", city: "Munich", linkedin: "https://www.linkedin.com/in/demo-elias-formdemo-example", years: 3, degree: "PhD", field: "Pure Mathematics", university: "Sample Institute of Technology", skills: "LaTeX, number theory, Python", hours: 10, availability: "Limited (a few hours a week)", extra: { [strongest]: "Number theory", [latex]: "yes" } });
  // The demo expert applied before finishing her profile (no CV yet), so the portal shows a part-done
  // profile and onboarding to complete. Stored directly: the public form would ask for the CV.
  const [riya] = await db.select({ id: experts.id }).from(experts).where(eq(experts.email, DEV_EXPERT.email)).limit(1);
  const j1Fields = await jobFields(db, j1.id);
  const ans = (k: string, v: unknown) => {
    const f = j1Fields.find((x) => x.mapsTo === k || x.label === k);
    return f ? { [f.id]: v } : {};
  };
  const [a4row] = await db
    .insert(applications)
    .values({
      jobId: j1.id,
      expertId: riya.id,
      status: "new",
      answers: { ...ans("full_name", DEV_EXPERT.name), ...ans("email", DEV_EXPERT.email), ...ans("country", "India"), ...ans("linkedin_url", "https://www.linkedin.com/in/demo-riya-portaldemo-example"), ...ans("skills", ["python", "optimization"]), ...ans(strongest, "Optimisation"), ...ans(latex, "no") },
      source: { ref: "invite", invited: true },
    })
    .returning({ id: applications.id });
  const a4 = a4row.id;
  const a5 = await apply(j3, { name: "Ana Formdemo", email: "ana.formdemo@example.org", country: "Mexico", city: "Guadalajara", linkedin: "https://www.linkedin.com/in/demo-ana-formdemo-example", years: 4, degree: "PhD", field: "Biology", skills: "Molecular biology, genomics, R", hours: 15 });
  await apply(j5, { name: "Omar Formdemo", email: "omar.formdemo@example.org", country: "United Kingdom", city: "London", linkedin: "https://www.linkedin.com/in/demo-omar-formdemo-example", years: 6, degree: "Other", field: "Finance", skills: "Financial modeling, Excel, valuation", hours: 20, why: "Six years in equity research building three-statement models." });

  // Move a few along the pipeline, spread the dates, then close the biology job.
  const set = async (id: string, status: string, daysAgo: number) =>
    db.update(applications).set({ status, createdAt: new Date(now - daysAgo * day), updatedAt: new Date(now - Math.max(0, daysAgo - 1) * day) }).where(eq(applications.id, id));
  await set(a1, "shortlisted", 4);
  await set(a2, "reviewing", 3);
  await set(a3, "new", 1);
  await set(a4, "new", 2);
  await set(a5, "rejected", 12);
  await db.update(jobs).set({ status: "closed", updatedAt: new Date(now - 4 * day) }).where(eq(jobs.id, j3.id));
  await db.update(experts).set({ onboardingDone: ["basics", "expertise"] }).where(eq(experts.email, DEV_EXPERT.email));
  await db.execute(sql`select 1`);
  void j2;
  return true;
}
