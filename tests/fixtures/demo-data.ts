// TEST FIXTURES ONLY (never in the app). Every person, company and address here is made up:
// emails use example.com / example.org (reserved for examples), phones use the fictional 555-01xx range.
import { count, sql } from "drizzle-orm";
import { rowsOf, type DB } from "@/db/client";
import { activity, experts, partners, placements, requirements, savedViews, submissions, teamMembers } from "@/db/schema";

const FIRST = ["Asha", "Marco", "Lena", "Omar", "Mei", "Tomás", "Priya", "Jonas", "Amara", "Kenji", "Sofia", "Ravi", "Elena", "Kwame", "Hana", "Lucas", "Nadia", "Arjun", "Ines", "Felix", "Zara", "Diego", "Yuki", "Noah", "Leila", "Mateo", "Ada", "Ibrahim", "Clara", "Sanjay", "Freya", "Tariq", "Maya", "Viktor", "Rosa", "Dev"];
const LAST = ["Example", "Sample", "Demo", "Testwell", "Mockford", "Placeholder", "Fixture", "Stubbs", "Prototype", "Specimen", "Dummyson", "Mockridge"];

type SeedExpert = Omit<typeof experts.$inferInsert, "fullName"> & { fullName?: string };

const PROFILES: SeedExpert[] = [
  { domain: "Mathematics", headline: "PhD mathematician, numerical analysis", skills: ["python", "numerical methods", "linear algebra", "latex"], highestDegree: "PhD", fieldOfStudy: "Applied Mathematics", yearsExperience: 7, country: "United States", region: "TX", city: "Austin" },
  { domain: "Mathematics", headline: "Maths and STEM evaluator", skills: ["mathematical proofs", "latex", "probability"], highestDegree: "Master's", fieldOfStudy: "Mathematics", yearsExperience: 4, country: "India", city: "Pune" },
  { domain: "Mathematics", headline: "Scientific computing researcher", skills: ["python", "numerical methods", "c++", "scientific computing"], highestDegree: "PhD", fieldOfStudy: "Mathematics", yearsExperience: 5, country: "Germany", city: "Berlin" },
  { domain: "Software", headline: "Senior Rust engineer, distributed systems", skills: ["rust", "c++", "linux", "docker", "kubernetes"], highestDegree: "Bachelor's", fieldOfStudy: "Computer Science", yearsExperience: 9, country: "United States", region: "WA", city: "Seattle" },
  { domain: "Software", headline: "Backend engineer (Go, TypeScript), coding-agent evals", skills: ["go", "typescript", "code review", "postgresql"], highestDegree: "Bachelor's", fieldOfStudy: "Computer Engineering", yearsExperience: 6, country: "United States", region: "CA", city: "San Jose" },
  { domain: "Software", headline: "Full-stack developer, AI training tasks", skills: ["javascript", "react", "node.js", "python"], highestDegree: "Bachelor's", fieldOfStudy: "Information Technology", yearsExperience: 3, country: "India", city: "Bengaluru" },
  { domain: "Software", headline: "Terminal and CLI task author", skills: ["bash", "linux", "python", "command line", "docker"], highestDegree: "Master's", fieldOfStudy: "Computer Science", yearsExperience: 8, country: "United States", region: "NY", city: "New York" },
  { domain: "Software", headline: "Systems programmer, Rust and C", skills: ["rust", "c", "linux"], highestDegree: "Master's", fieldOfStudy: "Computer Science", yearsExperience: 5, country: "Canada", city: "Toronto" },
  { domain: "Physics", headline: "Computational physicist", skills: ["python", "numerical methods", "fortran", "quantum mechanics"], highestDegree: "PhD", fieldOfStudy: "Physics", yearsExperience: 6, country: "United Kingdom", city: "Manchester" },
  { domain: "Physics", headline: "Physics tutor and reviewer", skills: ["thermodynamics", "electromagnetism", "latex"], highestDegree: "Master's", fieldOfStudy: "Physics", yearsExperience: 3, country: "Nigeria", city: "Lagos" },
  { domain: "Biology", headline: "Life-sciences PhD, domain evals", skills: ["molecular biology", "genomics", "python"], highestDegree: "PhD", fieldOfStudy: "Molecular Biology", yearsExperience: 6, country: "United States", region: "MA", city: "Boston" },
  { domain: "Biology", headline: "Bioinformatician", skills: ["bioinformatics", "python", "r", "statistics"], highestDegree: "Master's", fieldOfStudy: "Bioinformatics", yearsExperience: 4, country: "Spain", city: "Barcelona" },
  { domain: "Chemistry", headline: "Organic chemist, lab and review", skills: ["organic chemistry", "computational chemistry"], highestDegree: "PhD", fieldOfStudy: "Chemistry", yearsExperience: 8, country: "India", city: "Hyderabad" },
  { domain: "Medicine", headline: "Physician, clinical reviewer", skills: ["clinical research", "pharmacology"], highestDegree: "MD", fieldOfStudy: "Medicine", yearsExperience: 10, country: "United States", region: "IL", city: "Chicago" },
  { domain: "Finance", headline: "Financial analyst, modelling", skills: ["financial modeling", "excel", "valuation"], highestDegree: "MBA", fieldOfStudy: "Finance", yearsExperience: 7, country: "United Kingdom", city: "London" },
  { domain: "Finance", headline: "Chartered accountant", skills: ["accounting", "excel", "compliance"], highestDegree: "Bachelor's", fieldOfStudy: "Commerce", yearsExperience: 5, country: "India", city: "Mumbai" },
  { domain: "Law", headline: "Contract lawyer", skills: ["contract law", "legal research"], highestDegree: "JD", fieldOfStudy: "Law", yearsExperience: 6, country: "United States", region: "CT", city: "Hartford" },
  { domain: "Languages", headline: "English and Indonesian transcriber", skills: ["transcription", "translation"], languages: ["English", "Indonesian"], highestDegree: "Bachelor's", fieldOfStudy: "Linguistics", yearsExperience: 2, country: "Indonesia", city: "Jakarta" },
  { domain: "Security", headline: "AI security engineer", skills: ["penetration testing", "python", "application security"], highestDegree: "Master's", fieldOfStudy: "Cybersecurity", yearsExperience: 5, country: "United States", region: "VA", city: "Arlington" },
  { domain: "Security", headline: "Network security analyst (junior)", skills: ["network security", "linux"], highestDegree: "Bachelor's", fieldOfStudy: "Information Technology", yearsExperience: 1, country: "Pakistan", city: "Lahore" },
  { domain: "Data science", headline: "ML engineer, model evaluation", skills: ["python", "pytorch", "machine learning", "model evaluation"], highestDegree: "Master's", fieldOfStudy: "Data Science", yearsExperience: 4, country: "Netherlands", city: "Amsterdam" },
  { domain: "Data science", headline: "Data scientist, statistics", skills: ["python", "statistics", "sql", "pandas"], highestDegree: "PhD", fieldOfStudy: "Statistics", yearsExperience: 6, country: "Brazil", city: "São Paulo" },
  { domain: "Mathematics", headline: "Number theory postdoc", skills: ["number theory", "lean", "mathematical proofs"], highestDegree: "PhD", fieldOfStudy: "Pure Mathematics", yearsExperience: 3, country: "France", city: "Lyon" },
  { domain: "Software", headline: "Python developer", skills: ["python", "django", "postgresql"], highestDegree: "Bachelor's", fieldOfStudy: "Software Engineering", yearsExperience: 2, country: "Kenya", city: "Nairobi" },
  { domain: "Software", headline: "Coding evaluator, golden responses", skills: ["python", "java", "code review"], highestDegree: "Master's", fieldOfStudy: "Computer Science", yearsExperience: 4, country: "United States", region: "CO", city: "Denver" },
  { domain: "Mathematics", headline: "Operations research analyst", skills: ["optimization", "python", "linear algebra"], highestDegree: "Master's", fieldOfStudy: "Operations Research", yearsExperience: 5, country: "United States", city: "Remote" },
  { domain: "Other", headline: "Generalist rater", skills: ["data annotation"], highestDegree: "High school", yearsExperience: 1, country: "Philippines", city: "Cebu" },
  { domain: "Software", headline: "iOS engineer", skills: ["swift", "git"], highestDegree: "Bachelor's", fieldOfStudy: "Computer Science", yearsExperience: 6, country: "Poland", city: "Kraków" },
];

const STATUS_CYCLE = ["bench", "bench", "applicant", "screening", "bench", "placed", "applicant", "bench", "submitted", "inactive", "bench", "do_not_contact"] as const;
const AVAIL_CYCLE = ["available", "available", "limited", "available", "busy", "available", "unavailable"] as const;
const CONSENT_CYCLE = ["yes", "yes", "unknown", "yes", "no", "unknown"] as const;
const SOURCE_CYCLE = ["manual", "register", "admin_crm", "manual", "partner"] as const;

// A few fixed values so the demo submissions below follow the app's own rules.
const OVERRIDES: Record<number, Partial<typeof experts.$inferInsert>> = {
  0: { status: "placed", cvConsent: "yes" },
  1: { status: "screening", cvConsent: "unknown" },
  2: { status: "submitted", cvConsent: "yes" },
  3: { status: "bench", cvConsent: "yes" },
};

export function demoExperts(): (typeof experts.$inferInsert)[] {
  return PROFILES.map((p, i) => {
    const first = FIRST[i % FIRST.length];
    const last = LAST[i % LAST.length];
    const slug = `${first}-${last}`.toLowerCase().normalize("NFKD").replace(/[^\w-]/g, "");
    const consent = CONSENT_CYCLE[i % CONSENT_CYCLE.length];
    return {
      ...p,
      fullName: `${first} ${last}`,
      email: `${slug}@example.com`,
      phone: `+1 555 01${String(i).padStart(2, "0")}`,
      linkedinUrl: `https://www.linkedin.com/in/demo-${slug}-example`,
      languages: p.languages ?? ["English"],
      hoursPerWeek: [10, 20, 30, 40][i % 4],
      availability: AVAIL_CYCLE[i % AVAIL_CYCLE.length],
      rateExpectationUsd: 25 + (i % 6) * 10,
      status: STATUS_CYCLE[i % STATUS_CYCLE.length],
      cvConsent: consent,
      cvConsentAt: consent === "unknown" ? null : new Date(Date.UTC(2026, 9, 1 + i)),
      primarySource: SOURCE_CYCLE[i % SOURCE_CYCLE.length],
      tags: ["demo"],
      university: ["Example State University", "Sample Institute of Technology", "Demo University"][i % 3],
      notes: i % 5 === 0 ? "Demo record. Not a real person." : null,
      ...OVERRIDES[i],
      ...(OVERRIDES[i]?.cvConsent === "unknown" ? { cvConsentAt: null } : {}),
    };
  });
}

/** Fake jobs-site users so the jobs-site import can be tried locally. Writes to the LOCAL stub only. */
async function seedJobsStub(db: DB) {
  const [{ n }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from public.xdl_jobs_users`));
  if (Number(n) > 0) return;
  await db.execute(sql`
    insert into public.xdl_jobs_jobs (slug, title, domain) values
      ('demo-math-coding', 'Scientific Coding Expert (demo)', 'Mathematics'),
      ('demo-rust', 'Rust Engineer (demo)', 'Software')`);
  await db.execute(sql`
    insert into public.xdl_jobs_users (email, name, country, city, state, linkedin_url, headline, domain, years_experience, highest_degree, field_of_study, university, hours_per_week, phone, skills, languages) values
      ('jobs.applicant1@example.org', 'Rina Jobsdemo', 'India', 'Chennai', null, 'https://www.linkedin.com/in/demo-rina-jobsdemo', 'Applied maths graduate', 'Mathematics', 2, 'Master''s', 'Mathematics', 'Demo University', 20, '+91 555 0101', 'Python, NumPy, Numerical analysis', 'English, Tamil'),
      ('jobs.applicant2@example.org', 'Carl Jobsdemo', 'United States', 'Portland', 'OR', null, 'Rust and Go developer', 'Software', 6, 'Bachelor''s', 'Computer Science', 'Sample Institute of Technology', 30, '+1 555 0150', 'Rust, Go, Docker, Linux', 'English'),
      ('jobs.applicant3@example.org', 'Ana Jobsdemo', 'Mexico', 'Guadalajara', null, null, 'Biology researcher', 'Biology', 4, 'PhD', 'Biology', 'Example State University', 15, null, 'Genomics, R', 'Spanish, English'),
      ('asha-example@example.com', 'Asha Example', 'United States', 'Austin', 'TX', null, 'Mathematician', 'Mathematics', 7, 'PhD', 'Applied Mathematics', 'Example State University', 20, null, 'Python, LaTeX, Lean', 'English')`);
  await db.execute(sql`
    insert into public.xdl_jobs_files (user_id, kind, filename, mime, size, data)
    select id, 'resume', replace(name, ' ', '_') || '_CV.pdf', 'application/pdf', 40,
           convert_to('%PDF-1.4 demo CV for ' || name || ' (not a real person)', 'UTF8')
    from public.xdl_jobs_users where email like 'jobs.applicant%'`);
  await db.execute(sql`
    insert into public.xdl_jobs_applications (job_id, user_id, status, why, rate_expectation)
    select j.id, u.id, case when u.email = 'jobs.applicant2@example.org' then 'accepted' else 'submitted' end, 'Demo application', 40
    from public.xdl_jobs_users u
    join public.xdl_jobs_jobs j on (j.slug = 'demo-rust') = (u.domain = 'Software')
    where u.email like 'jobs.applicant%'`);
}

export async function seedIfEmpty(db: DB) {
  // Belt and braces: demo data (and the fake jobs-site rows) only ever go into the local database.
  if (process.env.DATABASE_URL) throw new Error("Demo data is for the local database only (DATABASE_URL is set).");
  await seedJobsStub(db);
  const [{ n }] = await db.select({ n: count() }).from(experts);
  if (Number(n) > 0) return false;
  const actor = "seed@example.com";

  const partnerRows = await db
    .insert(partners)
    .values([
      { name: "Acme AI Data (demo)", kind: "data_partner", website: "https://example.com", notes: "Demo partner." },
      { name: "Northwind Labs (demo)", kind: "frontier_lab", website: "https://example.org", notes: "Demo partner." },
      { name: "Globex Experts (demo)", kind: "expert_platform", notes: "Demo partner." },
    ])
    .returning({ id: partners.id, name: partners.name });
  const [acme, northwind, globex] = partnerRows;

  const people = await db.insert(experts).values(demoExperts()).returning({ id: experts.id, fullName: experts.fullName, status: experts.status, cvConsent: experts.cvConsent });

  const reqs = await db
    .insert(requirements)
    .values([
      {
        partnerId: acme.id,
        title: "Scientific Coding Expert - Mathematics",
        externalRef: "SOW 100001",
        description: "Scientific Coding Expert - Mathematics. Pilot: up to 3 people. Strong Python, numerical methods, PhD or Master's in Mathematics, 3+ years.",
        mustSkills: ["python", "numerical methods"],
        domains: ["Mathematics"],
        degrees: ["masters", "phd"],
        minYears: 3,
        slots: 3,
        status: "filling",
        createdBy: actor,
      },
      {
        partnerId: northwind.id,
        title: "Rust Systems Engineer",
        externalRef: "REQ 2001",
        description: "Rust Systems Engineer. US-based, not CA, CT, IL. 5+ years of Rust. Linux and Docker. Nice to have: Kubernetes.",
        mustSkills: ["rust", "linux", "docker"],
        niceSkills: ["kubernetes"],
        domains: ["Software"],
        countriesAllowed: ["United States"],
        countriesBlocked: ["US-CA", "US-CT", "US-IL"],
        minYears: 5,
        slots: 2,
        status: "open",
        rateNote: "Partner budget mentioned on call (demo).",
        createdBy: actor,
      },
      {
        partnerId: globex.id,
        title: "Biology Reviewer",
        description: "2 Biology reviewers. PhD preferred. Excluding India.",
        mustSkills: ["molecular biology"],
        niceSkills: ["genomics"],
        domains: ["Biology"],
        degrees: ["phd"],
        countriesBlocked: ["India"],
        minYears: 2,
        slots: 2,
        status: "open",
        createdBy: actor,
      },
    ])
    .returning({ id: requirements.id });

  const byName = new Map(people.map((p) => [p.fullName, p]));
  const pick = (name: string) => byName.get(name)!;
  const subs = await db
    .insert(submissions)
    .values([
      { requirementId: reqs[0].id, expertId: pick("Asha Example").id, status: "approved", score: 98, submittedAt: new Date(Date.UTC(2026, 10, 10)), partnerNote: "Available 20 h/week.", createdBy: actor },
      { requirementId: reqs[0].id, expertId: pick("Lena Demo").id, status: "partner_review", score: 90, submittedAt: new Date(Date.UTC(2026, 10, 14)), createdBy: actor },
      { requirementId: reqs[0].id, expertId: pick("Marco Sample").id, status: "consent_requested", score: 74, internalNote: "Asked for CV consent on 15 Nov.", createdBy: actor },
      { requirementId: reqs[1].id, expertId: pick("Omar Testwell").id, status: "shortlisted", score: 92, createdBy: actor },
    ])
    .returning({ id: submissions.id });

  await db.insert(placements).values({
    expertId: pick("Asha Example").id,
    partnerId: acme.id,
    submissionId: subs[0].id,
    projectName: "Scientific Coding Expert - Mathematics",
    startDate: "2026-11-17",
    basis: "hourly",
    rateToExpert: 40,
    rateFromPartner: 55,
    currency: "USD",
    hoursApproved: 32,
    earnedByExpert: 1280,
    revenue: 1760,
    status: "active",
    createdBy: actor,
  });

  // A demo team (fictional addresses, so nobody can sign in as them) and two shared views.
  await db.insert(teamMembers).values([
    { email: "rhea.recruiter@example.com", name: "Rhea Demo", role: "recruiter", createdBy: actor },
    { email: "pavel.podlead@example.com", name: "Pavel Sample", role: "pod_lead", partnerIds: [acme.id], createdBy: actor },
    { email: "farah.finance@example.com", name: "Farah Fixture", role: "finance", createdBy: actor },
    { email: "victor.viewer@example.com", name: "Victor Mock", role: "viewer", active: false, createdBy: actor },
  ]);
  await db.insert(savedViews).values([
    { ownerEmail: actor, name: "Maths bench", shared: true, config: { filters: { domain: "Mathematics", status: "bench" }, sort: null, columns: ["skills", "country", "years", "availability", "consent", "updated"], layout: "table" } },
    { ownerEmail: actor, name: "Software board", shared: true, config: { filters: { domain: "Software" }, sort: null, columns: ["domain", "skills", "country", "years", "status", "availability", "consent", "updated"], layout: "board" } },
  ]);

  await db.insert(activity).values({ entityType: "import", entityId: "seed", actorEmail: actor, action: "test_data_loaded", detail: { experts: people.length } });
  return true;
}
