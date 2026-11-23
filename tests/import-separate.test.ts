// The app's own Neon project: the old jobs site's tables live in another database
// (JOBS_DATABASE_URL). The import reads them there (read only), writes hub.* in DATABASE_URL, and
// copies CVs across so the app never needs the old database afterwards.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { openTestDb } from "./fixtures/db";
import { JOBS_STUB_SQL } from "@/db/local/jobs-stub";
import { rowsOf, type DB } from "@/db/client";
import { expertFiles, experts } from "@/db/schema";
import { getFileRow, readCv } from "@/lib/server/cv";
import { jobsSourceConfig, openJobsSource } from "@/lib/server/jobs-source";
import { jobsTablesExist, syncJobsSite } from "@/lib/server/jobs-sync";

let hub: DB;
let hubClient: PGlite;
let engine: DB;
let engineClient: PGlite;
const ACTOR = "cli:test";

async function engineFingerprint() {
  const res = await engineClient.query<{ t: string; h: string }>(`
    select 'users' as t, md5(coalesce(string_agg(u::text, ',' order by id), '')) as h from public.xdl_jobs_users u
    union all select 'files', md5(coalesce(string_agg(f::text, ',' order by id), '')) from public.xdl_jobs_files f
    union all select 'apps', md5(coalesce(string_agg(a::text, ',' order by id), '')) from public.xdl_jobs_applications a`);
  return res.rows;
}

beforeAll(async () => {
  ({ db: hub, client: hubClient } = await openTestDb({ jobsStub: false }));
  engineClient = new PGlite();
  await engineClient.waitReady;
  await engineClient.exec(JOBS_STUB_SQL);
  await engineClient.exec(`
    insert into public.xdl_jobs_jobs (id, slug, title, domain) values (1, 'math', 'Maths (old site)', 'Mathematics');
    insert into public.xdl_jobs_users (id, email, name, country, linkedin_url, headline, domain, years_experience, skills, languages) values
      (201, 'Old.Applicant@Example.org', 'Old Applicant', 'India', 'https://www.linkedin.com/in/old-applicant-example', 'Maths tutor', 'Mathematics', 4, 'Python, LaTeX', 'English'),
      (202, 'second@example.org', 'Second Person', 'Kenya', null, 'Analyst', 'Finance', 3, 'Excel', 'English');
    insert into public.xdl_jobs_files (id, user_id, kind, filename, mime, size, data, created_at) values
      (901, 201, 'resume', 'old_applicant.pdf', 'application/pdf', 14, convert_to('%PDF-1.4 older', 'UTF8'), now() - interval '5 days'),
      (902, 201, 'resume', 'old_applicant_v2.pdf', 'application/pdf', 14, convert_to('%PDF-1.4 newer', 'UTF8'), now());
    insert into public.xdl_jobs_applications (job_id, user_id, status, rate_expectation) values (1, 201, 'reviewing', 30);
  `);
  engine = drizzle({ client: engineClient }) as unknown as DB;
});
afterAll(async () => {
  await hubClient.close();
  await engineClient.close();
});

describe("JOBS_DATABASE_URL", () => {
  it("is optional: unset means the same database, set means a separate one", async () => {
    expect(jobsSourceConfig({})).toEqual({ mode: "same" });
    expect(jobsSourceConfig({ JOBS_DATABASE_URL: "  " })).toEqual({ mode: "same" });
    expect(jobsSourceConfig({ JOBS_DATABASE_URL: "postgresql://ro@engine/db" })).toEqual({ mode: "separate", url: "postgresql://ro@engine/db" });
    expect(await openJobsSource(hub, {})).toEqual({ source: hub, separate: false });
    expect((await openJobsSource(hub, { JOBS_DATABASE_URL: "postgresql://x@y/z", DATABASE_URL: "postgresql://x@y/z" })).separate).toBe(false);
  });

  it("the app's own database has no jobs-site tables; the import says to set JOBS_DATABASE_URL", async () => {
    expect(await jobsTablesExist(hub)).toBe(false);
    const res = await syncJobsSite(hub, ACTOR);
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/JOBS_DATABASE_URL/) });
  });

  it("reads the old database, writes the new one, copies the newest CV, and never writes the old one", async () => {
    const before = await engineFingerprint();
    const dry = await syncJobsSite(hub, ACTOR, { source: engine, dryRun: true });
    expect(dry).toMatchObject({ ok: true, dryRun: true, users: 2, created: 2 });
    expect(await hub.$count(experts)).toBe(0);
    const res = await syncJobsSite(hub, ACTOR, { source: engine });
    expect(res).toMatchObject({ ok: true, users: 2, created: 2, cvsLinked: 1 });
    expect(await engineFingerprint()).toEqual(before);
    const [old] = await hub.select().from(experts).where(eq(experts.email, "old.applicant@example.org"));
    expect(old).toMatchObject({ fullName: "Old Applicant", primarySource: "jobs_site", status: "screening", rateExpectationUsd: 30 });
    expect(old.cvRef).toMatch(/^upload:/);
    const file = await getFileRow(hub, old.cvRef!.slice(7));
    expect(file).toMatchObject({ storage: "upload", filename: "old_applicant_v2.pdf" });
    expect(Buffer.from((await readCv(hub, file!))!.bytes).toString()).toBe("%PDF-1.4 newer");
  });

  it("running it again copies nothing twice and keeps a CV someone uploaded in the hub", async () => {
    const [old] = await hub.select().from(experts).where(eq(experts.email, "old.applicant@example.org"));
    const again = await syncJobsSite(hub, ACTOR, { source: engine });
    expect(again).toMatchObject({ ok: true, created: 0, cvsLinked: 0 });
    expect(await hub.$count(expertFiles, eq(expertFiles.expertId, old.id))).toBe(1);
    const [mine] = await hub.insert(expertFiles).values({ expertId: old.id, kind: "cv", filename: "uploaded-here.pdf", mime: "application/pdf", size: 3, storage: "upload", data: new Uint8Array([1, 2, 3]), createdBy: "rec@xocket.sh" }).returning({ id: expertFiles.id });
    await hub.update(experts).set({ cvRef: `upload:${mine.id}` }).where(eq(experts.id, old.id));
    await engineClient.exec(`insert into public.xdl_jobs_files (id, user_id, kind, filename, mime, size, data) values (903, 201, 'resume', 'v3.pdf', 'application/pdf', 3, convert_to('v3', 'UTF8'))`);
    await syncJobsSite(hub, ACTOR, { source: engine });
    const [after] = await hub.select().from(experts).where(eq(experts.id, old.id));
    expect(after.cvRef).toBe(`upload:${mine.id}`);
    const log = rowsOf<{ detail: { separateDatabase?: boolean } }>(await hub.execute(sql`select detail from hub.activity where action = 'jobs_site_sync' order by created_at desc limit 1`));
    expect(log[0].detail.separateDatabase).toBe(true);
  });
});
