// Runs the real migrations on an in-memory PGlite database with a copy of the jobs site's tables,
// then exercises the jobs import, matching, submissions, roster, CSV import and delete-on-request.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { openLocalDbWithClient } from "@/db/local/open";
import { rowsOf, type DB } from "@/db/client";
import { expertFiles, expertSources, experts, partners, requirements } from "@/db/schema";
import { applyCsv, previewCsv } from "@/lib/server/csv-import";
import { deleteExpertOnRequest, getExpert, listExperts } from "@/lib/server/experts";
import { getFileRow, readCv } from "@/lib/server/cv";
import { syncJobsSite, jobsApplicationsFor } from "@/lib/server/jobs-sync";
import { candidatesFor } from "@/lib/server/requirements";
import { rosterFor } from "@/lib/server/roster";
import { addToRequirement, moveSubmission } from "@/lib/server/submissions";
import { parseExpertFilters } from "@/lib/filters";
import { rosterCsv } from "@/lib/roster";

let db: DB;
let client: PGlite;
const ACTOR = "test@xocket.sh";

async function publicFingerprint() {
  const res = await client.query<{ t: string; n: number; h: string }>(`
    select 'users' as t, count(*)::int as n, md5(coalesce(string_agg(u::text, ',' order by id), '')) as h from public.xdl_jobs_users u
    union all select 'files', count(*)::int, md5(coalesce(string_agg(f::text, ',' order by id), '')) from public.xdl_jobs_files f
    union all select 'apps', count(*)::int, md5(coalesce(string_agg(a::text, ',' order by id), '')) from public.xdl_jobs_applications a
    union all select 'jobs', count(*)::int, md5(coalesce(string_agg(j::text, ',' order by id), '')) from public.xdl_jobs_jobs j`);
  return res.rows;
}

beforeAll(async () => {
  ({ db, client } = await openLocalDbWithClient({ seed: false }));
  // Fake jobs-site data (fictional people).
  await client.exec(`
    insert into public.xdl_jobs_jobs (id, slug, title, domain) values (1, 'math', 'Scientific Coding (test)', 'Mathematics'), (2, 'rust', 'Rust (test)', 'Software');
    insert into public.xdl_jobs_users (id, email, name, is_admin, country, city, state, linkedin_url, headline, domain, years_experience, highest_degree, field_of_study, university, hours_per_week, phone, skills, languages) values
      (101, 'Ada.Tester@Example.org', 'Ada Tester', false, 'United States', 'Austin', 'TX', 'https://www.linkedin.com/in/ada-tester-example', 'Numerical analyst', 'Mathematics', 6, 'PhD', 'Applied Mathematics', 'Demo University', 20, '+1 555 0111', 'Python, Numerical analysis, LaTeX', 'English'),
      (102, 'bo.tester@example.org', 'Bo Tester', false, 'United States', 'San Jose', 'CA', null, 'Rust developer', 'Software', 7, 'Bachelor''s', 'CS', null, 30, null, 'Rust, Linux, Docker, Python', 'English'),
      (103, 'cy.tester@example.org', 'Cy Tester', false, 'India', 'Pune', null, null, 'Maths tutor', 'Mathematics', 2, 'Master''s', 'Mathematics', null, 10, null, 'Python', 'English, Hindi'),
      (104, 'staff@example.org', 'Staff Admin', true, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    insert into public.xdl_jobs_files (id, user_id, kind, filename, mime, size, data, created_at) values
      (501, 101, 'resume', 'old_cv.pdf', 'application/pdf', 7, convert_to('old cv', 'UTF8'), now() - interval '10 days'),
      (502, 101, 'resume', 'Ada_Tester_CV.pdf', 'application/pdf', 12, convert_to('%PDF-1.4 ada', 'UTF8'), now()),
      (503, 102, 'resume', 'bo.pdf', 'application/pdf', 11, convert_to('%PDF-1.4 bo', 'UTF8'), now());
    insert into public.xdl_jobs_applications (job_id, user_id, status, why, rate_expectation) values
      (1, 101, 'accepted', 'x', 45), (2, 102, 'reviewing', 'x', 60), (1, 103, 'submitted', 'x', null);
  `);
});

afterAll(async () => {
  await client.close();
});

describe("database setup", () => {
  it("creates every app table in the hub schema and nothing in public", async () => {
    const res = await client.query<{ table_schema: string; table_name: string }>(
      `select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') order by 1, 2`,
    );
    const outside = res.rows.filter((r) => r.table_schema !== "hub" && !(r.table_schema === "public" && r.table_name.startsWith("xdl_jobs_")));
    expect(outside).toEqual([]);
    const hubTables = res.rows.filter((r) => r.table_schema === "hub").map((r) => r.table_name);
    expect(hubTables).toEqual(expect.arrayContaining(["experts", "expert_sources", "expert_files", "partners", "requirements", "submissions", "placements", "activity", "erasures", "__drizzle_migrations"]));
  });

  it("keeps the search vector up to date", async () => {
    const [e] = await db.insert(experts).values({ fullName: "Search Probe", skills: ["haskell"], headline: "Category theory" }).returning({ id: experts.id });
    const r = await listExperts(db, parseExpertFilters({ q: "haskel" }), { limit: 5, offset: 0 });
    expect(r.rows.map((x) => x.id)).toContain(e.id);
    await db.delete(experts).where(eq(experts.id, e.id));
  });
});

describe("jobs-site import", () => {
  let before: Awaited<ReturnType<typeof publicFingerprint>>;

  it("dry run changes nothing", async () => {
    before = await publicFingerprint();
    const res = await syncJobsSite(db, ACTOR, { dryRun: true });
    expect(res).toMatchObject({ ok: true, dryRun: true, users: 3, created: 3 });
    const [{ n }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from hub.experts`));
    expect(n).toBe(0);
  });

  it("creates experts, links the newest CV and never writes to the jobs tables", async () => {
    const res = await syncJobsSite(db, ACTOR);
    expect(res).toMatchObject({ ok: true, users: 3, created: 3, updated: 0, cvsLinked: 2 });
    expect(await publicFingerprint()).toEqual(before);

    const [ada] = await db.select().from(experts).where(eq(experts.email, "ada.tester@example.org"));
    expect(ada.fullName).toBe("Ada Tester");
    expect(ada.status).toBe("bench");
    expect(ada.region).toBe("TX");
    expect(ada.skills).toEqual(["python", "numerical methods", "latex"]);
    expect(ada.rateExpectationUsd).toBe(45);
    expect(ada.primarySource).toBe("jobs_site");
    expect(ada.cvRef).toBe("jobs:file:502");
    const src = await db.select().from(expertSources).where(eq(expertSources.expertId, ada.id));
    expect(src).toMatchObject([{ source: "jobs_site", externalId: "101" }]);
    expect(src[0].lastSyncedAt).toBeInstanceOf(Date);
    const apps = await jobsApplicationsFor(db, ada.id);
    expect(apps.map((a) => a.title)).toEqual(["Scientific Coding (test)"]);
  });

  it("streams the CV from the jobs table on download", async () => {
    const [ada] = await db.select().from(experts).where(eq(experts.email, "ada.tester@example.org"));
    const [file] = await db.select({ id: expertFiles.id }).from(expertFiles).where(eq(expertFiles.expertId, ada.id));
    const row = await getFileRow(db, file.id);
    const cv = await readCv(db, row!);
    expect(cv?.filename).toBe("Ada_Tester_CV.pdf");
    expect(Buffer.from(cv!.bytes).toString()).toBe("%PDF-1.4 ada");
  });

  it("re-running is idempotent and keeps manual edits", async () => {
    const [ada] = await db.select().from(experts).where(eq(experts.email, "ada.tester@example.org"));
    await db.update(experts).set({ headline: "Edited by the team", phone: null }).where(eq(experts.id, ada.id));
    const res = await syncJobsSite(db, ACTOR);
    expect(res).toMatchObject({ ok: true, created: 0, updated: 1, unchanged: 2 });
    const [after] = await db.select().from(experts).where(eq(experts.id, ada.id));
    expect(after.headline).toBe("Edited by the team");
    expect(after.phone).toBe("+1 555 0111");
    const [{ n }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from hub.experts`));
    expect(n).toBe(3);
    expect(await publicFingerprint()).toEqual(before);
  });
});

describe("matching, submissions and roster", () => {
  let reqId: string;

  it("ranks candidates with SQL pre-filter + TS scoring and location exclusions", async () => {
    const [p] = await db.insert(partners).values({ name: "Test Partner" }).returning({ id: partners.id });
    const [r] = await db
      .insert(requirements)
      .values({ partnerId: p.id, title: "Scientific Coding Expert - Mathematics", mustSkills: ["python", "numerical methods"], domains: ["Mathematics"], degrees: ["masters", "phd"], minYears: 3, slots: 2, countriesAllowed: ["United States", "India"], countriesBlocked: ["US-CA"] })
      .returning();
    reqId = r.id;
    const c = await candidatesFor(db, r);
    expect(c.ranked[0].expert.fullName).toBe("Ada Tester");
    expect(c.ranked.map((x) => x.expert.fullName)).toContain("Cy Tester");
    expect(c.excluded.map((x) => x.expert.fullName)).toEqual(["Bo Tester"]);
    expect(c.excluded[0].excludedBecause[0]).toContain("California");
  });

  it("shortlists, blocks submitting without consent, then allows it", async () => {
    const people = await db.select({ id: experts.id, email: experts.email }).from(experts);
    const ada = people.find((x) => x.email === "ada.tester@example.org")!;
    const res = await addToRequirement(db, reqId, people.map((x) => x.id), ACTOR);
    expect(res.added).toBe(3);
    const again = await addToRequirement(db, reqId, [ada.id], ACTOR);
    expect(again.already).toBe(1);
    const [sub] = rowsOf<{ id: string }>(await db.execute(sql`select id from hub.submissions where expert_id = ${ada.id}`));

    const blocked = await moveSubmission(db, { id: sub.id, to: "submitted", actor: ACTOR });
    expect(blocked.ok).toBe(false);

    await db.update(experts).set({ cvConsent: "yes" }).where(eq(experts.id, ada.id));
    const ok = await moveSubmission(db, { id: sub.id, to: "submitted", partnerNote: "20 h/week", actor: ACTOR });
    expect(ok).toEqual({ ok: true, changed: true });
    expect((await getExpert(db, ada.id))!.status).toBe("submitted");
    const [req] = await db.select().from(requirements).where(eq(requirements.id, reqId));
    expect(req.status).toBe("filling");
    const log = rowsOf<{ action: string }>(await db.execute(sql`select action from hub.activity where entity_id = ${sub.id} order by created_at`));
    expect(log.map((l) => l.action)).toEqual(["shortlisted", "status_changed"]);
  });

  it("exports a roster with only consenting experts and their CV file names", async () => {
    const { plan, fileByExpert } = await rosterFor(db, reqId);
    expect(plan.included.map((l) => l.expert.fullName)).toEqual(["Ada Tester"]);
    expect(plan.skipped.map((s) => s.name).sort()).toEqual(["Bo Tester", "Cy Tester"]);
    const csv = rosterCsv(plan.included);
    expect(csv).toContain("Ada Tester,ada.tester@example.org,United States,Austin,+1 555 0111,6,https://www.linkedin.com/in/ada-tester-example,Ada Tester - CV.pdf,20 h/week");
    expect(fileByExpert.get(plan.included[0].expert.id)?.filename).toBe("Ada_Tester_CV.pdf");
  });
});

describe("CSV import", () => {
  const register = [
    "Name,Role,Location,Line,Folder,CV file,Status,Best fit,Consent to share CV,Source,Added,Notes",
    "Dee Register,Physics reviewer,\"Lyon, France\",AI Training,Bench,—,Bench,Physics evals,Yes,Network,2026-11-01,",
    "Cy Tester,Maths tutor,Pune,AI Training,—,—,Awaiting reply,,Ask,Inbound,2026-11-02,",
  ].join("\n");

  it("previews, then applies the same plan", async () => {
    const preview = await previewCsv(db, register, "auto", "review");
    expect(preview.ok && preview.kind).toBe("register");
    if (!preview.ok) return;
    expect(preview.counts).toMatchObject({ create: 1, duplicate: 1 });
    const res = await applyCsv(db, register, "auto", "review", ACTOR);
    expect(res).toMatchObject({ ok: true, created: 1, duplicates: 1 });
    const again = await applyCsv(db, register, "auto", "review", ACTOR);
    expect(again).toMatchObject({ ok: true, created: 0, unchanged: 1, duplicates: 1 });
    const [dee] = await db.select().from(experts).where(eq(experts.fullName, "Dee Register"));
    expect(dee).toMatchObject({ country: "France", city: "Lyon", status: "bench", cvConsent: "yes", primarySource: "register" });
  });
});

describe("delete on request", () => {
  it("removes the person and stops the jobs import from adding them back", async () => {
    const [cy] = await db.select().from(experts).where(eq(experts.email, "cy.tester@example.org"));
    expect(await deleteExpertOnRequest(db, cy.id, ACTOR)).toBe(true);
    expect(await getExpert(db, cy.id)).toBeNull();
    const leftovers = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from hub.submissions where expert_id = ${cy.id}`));
    expect(leftovers[0].n).toBe(0);
    const erasure = rowsOf<{ email_sha256: string | null }>(await db.execute(sql`select email_sha256 from hub.erasures`));
    expect(erasure.some((e) => e.email_sha256 && e.email_sha256.length === 64 && !e.email_sha256.includes("@"))).toBe(true);
    const res = await syncJobsSite(db, ACTOR);
    expect(res).toMatchObject({ ok: true, created: 0, skipped: 1 });
    const [{ n }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from hub.experts where email = 'cy.tester@example.org'`));
    expect(n).toBe(0);
  });
});
