// npm run copy:engine: every expert record from Engine into the hub's database, safely and re-runnably.
// Two PGlite databases stand in for Engine (the real jobs-site schema, tests/fixtures) and expert-hub.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS, openLocalDbWithClient } from "@/db/local/open";
import { JOBS_STUB_SQL } from "@/db/local/jobs-stub";
import { rowsOf, type DB } from "@/db/client";
import { applications, expertDetails, expertFiles, expertPayout, experts, jobFormFields, jobs, legacyMap } from "@/db/schema";
import { can, fileDownloadAction, visibleFiles } from "@/lib/auth/permissions";
import { isPlainSelect, ReadOnlySource, SourceWriteRefused, type SqlRunner } from "@/lib/import/engine/source";
import { copyFromEngine, type CopyResult } from "@/lib/import/engine/copy";
import { describeDb, directUrl, parseArgs, parseDbUrl, parseEnvText, preflight, resolveSourceUrl, sameDatabase } from "@/lib/import/engine/env";
import { canonical, fileBatches, threeWay } from "@/lib/import/engine/hub";
import { LOGIN_SECRETS } from "@/lib/import/engine/tables";
import { applicationStatusFrom, cleanSlug, combinedStatus, legacyAnswers, mapJobsJob, screeningText, slugFor, statusFromCrmStage } from "@/lib/import/jobs";
import { applicantColumns, applicationMoney, getApplicant, listApplicants } from "@/lib/server/applications";
import { getFileRow, readCv } from "@/lib/server/cv";
import { deleteExpertOnRequest, detailsFor, filesFor, payoutFor } from "@/lib/server/experts";
import { listPublicJobs } from "@/lib/server/jobs";
import { jobForPage } from "@/lib/server/public-jobs";
import { rosterFor } from "@/lib/server/roster";
import { ENGINE_DATA_SQL } from "./fixtures/engine-data";
import { ENGINE_OTHER_SQL, ENGINE_SCHEMA_SQL } from "./fixtures/engine-schema";

const ACTOR = { email: "cli:test", role: "admin" };

async function newEngine(dir?: string): Promise<PGlite> {
  const c = dir ? new PGlite(dir) : new PGlite();
  await c.waitReady;
  await c.exec(ENGINE_SCHEMA_SQL);
  await c.exec(ENGINE_OTHER_SQL);
  await c.exec(ENGINE_DATA_SQL);
  return c;
}

/** md5 of every row of every Engine table: proves the copy never writes there. */
async function fingerprint(c: PGlite): Promise<string> {
  const { rows } = await c.query<{ t: string }>(`select table_schema || '.' || table_name as t from information_schema.tables where table_schema in ('public', 'neon_auth') and table_type = 'BASE TABLE' order by 1`);
  const parts: string[] = [];
  for (const { t } of rows) {
    const [schema, name] = t.split(".");
    const r = await c.query<{ h: string }>(`select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from "${schema}"."${name}" x`);
    parts.push(`${t}:${r.rows[0].h}`);
  }
  return parts.join(",");
}

let engine: PGlite;
let hubClient: PGlite;
let hub: DB;
let migrations = 0;

function run(dryRun: boolean): Promise<CopyResult> {
  return copyFromEngine({
    source: engine as unknown as SqlRunner,
    target: { db: hub, raw: hubClient as unknown as SqlRunner },
    dryRun,
    actor: ACTOR,
    migrate: async () => {
      migrations++;
      await migrate(drizzle({ client: hubClient }), MIGRATIONS);
    },
    describe: { source: "test@engine/neondb", target: "test@hub/neondb" },
  });
}

const q = async <T = Record<string, unknown>>(text: string) => (await hubClient.query<T>(text)).rows;
const count = async (text: string) => Number((await q<{ n: number }>(`select count(*)::int as n from ${text}`))[0].n);
const expertByEmail = async (email: string) => (await hub.select().from(experts).where(eq(experts.email, email)))[0];

beforeAll(async () => {
  engine = await newEngine();
  ({ db: hub, client: hubClient } = await openLocalDbWithClient({ seed: false, jobsStub: false }));
});
afterAll(async () => {
  await engine.close();
  await hubClient.close();
});

// ---------------------------------------------------------------- pure parts

describe("connection strings and guards", () => {
  const ENGINE = "postgresql://ro_user:s3cret-pw@ep-sweet-band-b5mvykjt-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
  const HUB = "postgresql://owner:other-pw@ep-quiet-lake-a1b2c3d4-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require";

  it("reads .env files with quotes, export and comments", () => {
    const env = parseEnvText(`# jobs site\nexport JOBS_DATABASE_URL="postgresql://a:b@h/db?x=1" \nOTHER='single quoted'\nPLAIN=value # comment\n\nBROKEN line\n`);
    expect(env.get("JOBS_DATABASE_URL")).toBe("postgresql://a:b@h/db?x=1");
    expect(env.get("OTHER")).toBe("single quoted");
    expect(env.get("PLAIN")).toBe("value");
    expect(env.has("BROKEN")).toBe(false);
  });

  it("takes ENGINE_DATABASE_URL first, else the key from --source-env", () => {
    const file = `JOBS_DATABASE_URL=${ENGINE}\n`;
    expect(resolveSourceUrl({ ENGINE_DATABASE_URL: HUB }, { sourceEnv: "x.env", sourceKey: "JOBS_DATABASE_URL" }, () => file)).toMatchObject({ ok: true, url: HUB, from: "ENGINE_DATABASE_URL" });
    expect(resolveSourceUrl({}, { sourceEnv: "../Jobs/.env", sourceKey: "JOBS_DATABASE_URL" }, () => file)).toMatchObject({ ok: true, url: ENGINE, from: "JOBS_DATABASE_URL in .env" });
    expect(resolveSourceUrl({}, { sourceEnv: "x.env", sourceKey: "NOPE" }, () => file)).toMatchObject({ ok: false });
    expect(resolveSourceUrl({}, { sourceEnv: null, sourceKey: null })).toMatchObject({ ok: false, message: expect.stringMatching(/ENGINE_DATABASE_URL/) });
    expect(resolveSourceUrl({}, { sourceEnv: "missing.env", sourceKey: null }, () => { throw new Error("ENOENT"); })).toMatchObject({ ok: false });
    expect(parseArgs(["--dry-run", "--source-env", "..\\Jobs - FynoLabs\\.env", "--source-key=JOBS_DATABASE_URL", "--local-test"])).toMatchObject({ dryRun: true, localTest: true, sourceEnv: "..\\Jobs - FynoLabs\\.env", sourceKey: "JOBS_DATABASE_URL", unknown: [] });
  });

  it("shows user@host/db only, never the password; prefers the direct host", () => {
    expect(describeDb(ENGINE)).toBe("ro_user@ep-sweet-band-b5mvykjt-pooler.ap-southeast-1.aws.neon.tech/neondb");
    expect(describeDb(ENGINE)).not.toContain("s3cret");
    expect(directUrl(ENGINE)).toContain("@ep-sweet-band-b5mvykjt.ap-southeast-1.aws.neon.tech/");
    expect(directUrl(HUB.replace("-pooler", ""))).toBe(HUB.replace("-pooler", ""));
    expect(parseDbUrl(ENGINE)).toMatchObject({ kind: "postgres", endpoint: "ep-sweet-band-b5mvykjt", db: "neondb" });
  });

  it("knows when two addresses are the same database", () => {
    expect(sameDatabase(ENGINE, directUrl(ENGINE).replace("ro_user:s3cret-pw", "owner:x"))).toBe(true);
    expect(sameDatabase(ENGINE, "postgresql://u:p@other-host.example/neondb?options=endpoint%3Dep-sweet-band-b5mvykjt")).toBe(true);
    expect(sameDatabase(ENGINE, HUB)).toBe(false);
    expect(sameDatabase("postgresql://a@db.example:5432/one", "postgresql://b@db.example:5432/one")).toBe(true);
    expect(sameDatabase("postgresql://a@db.example/one", "postgresql://a@db.example/two")).toBe(false);
  });

  it("refuses: same endpoint, no CONFIRM_DB, empty DATABASE_URL, pglite outside --local-test", () => {
    const ok = { sourceUrl: ENGINE, targetUrl: HUB, confirm: "yes", dryRun: false, localTest: false };
    expect(preflight(ok)).toEqual([]);
    expect(preflight({ ...ok, targetUrl: directUrl(ENGINE) }).join(" ")).toMatch(/same database/);
    expect(preflight({ ...ok, confirm: undefined }).join(" ")).toMatch(/CONFIRM_DB=yes/);
    expect(preflight({ ...ok, confirm: undefined, dryRun: true })).toEqual([]);
    expect(preflight({ ...ok, targetUrl: "" }).join(" ")).toMatch(/DATABASE_URL is empty/);
    expect(preflight({ ...ok, targetUrl: "", localTest: true })).toEqual([]);
    expect(preflight({ ...ok, targetUrl: "pglite:.data/x" }).join(" ")).toMatch(/local-test/);
    expect(preflight({ ...ok, sourceUrl: "pglite:.data/a", targetUrl: "pglite:.data/a", localTest: true }).join(" ")).toMatch(/same database/);
  });

  it("maps statuses, slugs, pay and answers", () => {
    expect(statusFromCrmStage("vetted")).toBe("bench");
    expect(statusFromCrmStage("new")).toBeNull();
    expect(combinedStatus("do_not_contact", "bench")).toBe("do_not_contact");
    expect(combinedStatus("screening", "bench")).toBe("bench");
    expect(combinedStatus(null, "screening")).toBe("screening");
    expect(applicationStatusFrom("client_interview")).toBe("submitted_to_partner");
    expect(applicationStatusFrom("accepted")).toBe("hired");
    expect(applicationStatusFrom("submitted")).toBe("new");
    expect(cleanSlug("My--Old_Slug-")).toBe("my-old-slug");
    expect(slugFor("rust-dev", new Set(["rust-dev", "rust-dev-2"]))).toBe("rust-dev-3");
    const j = mapJobsJob({ id: 1, slug: "x", title: "T", domain: "STEM", employment: "Part-time", location: "Remote", regions: "India", pay_min: 30, pay_max: 50, pay_unit: "hour", pay_currency: "USD", hours: "10 h", summary: "S", description: "D", requirements: "R", status: "paused", created_at: null });
    expect(j).toMatchObject({ employmentType: "part_time", status: "paused", internalRateNote: "Jobs site pay: 30–50 USD per hour.", location: "Remote · India" });
    expect(`${j.title} ${j.summary} ${j.description}`).not.toMatch(/30|50|USD/);
    expect(screeningText([{ q: "Why?", a: "Because" }, { q: "How?", a: "Well" }])).toBe("1. Why?\nBecause\n\n2. How?\nWell");
    expect(legacyAnswers({ why: "f1", hours: "f2", screening1: "f3" }, { name: null, email: null, why: " Fit ", hours_per_week: 12, start_when: null, cv: null, screening1: [{ q: "Q", a: "A" }], screening2: null })).toEqual({ f1: "Fit", f2: 12, f3: "1. Q\nA" });
  });

  it("batches files by count and size, and merges three ways", () => {
    const sizes = [5, 5, 5, 30, 1].map((mb) => ({ size: mb * 1024 * 1024 }));
    expect(fileBatches(sizes).map((b) => b.length)).toEqual([3, 1, 1]);
    expect(fileBatches(Array.from({ length: 60 }, () => ({ size: 10 }))).map((b) => b.length)).toEqual([25, 25, 10]);
    // title edited in the hub (kept); summary untouched in the hub (updated from the jobs site).
    const r = threeWay({ title: "Team title", summary: "Old" }, { title: "Old title", summary: "Old" }, { title: "New title", summary: "New" }, ["title", "summary"]);
    expect(r.patch).toEqual({ summary: "New" });
    expect(canonical({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canonical({ a: [{ c: 2, d: 1 }], b: 1 }));
  });
});

describe("Engine is only read", () => {
  it("allows single SELECTs only", () => {
    expect(isPlainSelect("select 1")).toBe(true);
    expect(isPlainSelect("  select a from t where b = ';'")).toBe(true);
    expect(isPlainSelect("select 1; delete from t")).toBe(false);
    expect(isPlainSelect("insert into t values (1)")).toBe(false);
    expect(isPlainSelect("with x as (delete from t returning *) select * from x")).toBe(false);
    expect(isPlainSelect("select * into newtable from t")).toBe(false);
    expect(isPlainSelect("select * from t for update")).toBe(false);
  });

  it("runs every read in one READ ONLY snapshot; a write inside it fails", async () => {
    const before = await fingerprint(engine);
    const src = await ReadOnlySource.begin(engine as unknown as SqlRunner);
    const [row] = await src.select<{ ro: string; iso: string }>("select current_setting('transaction_read_only') as ro, current_setting('transaction_isolation') as iso");
    expect(row).toEqual({ ro: "on", iso: "repeatable read" });
    await expect(src.select("update public.xdl_jobs_users set name = 'x'")).rejects.toBeInstanceOf(SourceWriteRefused);
    // Even straight on the connection, the database itself refuses a write inside the snapshot.
    await expect(engine.query("update public.xdl_jobs_users set name = 'x' where id = 101")).rejects.toThrow(/read-only transaction/);
    await src.end();
    await expect(src.select("select 1")).rejects.toThrow(/closed/);
    // The session stays read only after the snapshot too (default_transaction_read_only).
    await expect(engine.query("delete from public.xdl_jobs_saved")).rejects.toThrow(/read-only transaction/);
    await engine.query("set default_transaction_read_only = off");
    expect(await fingerprint(engine)).toBe(before);
  });
});

// ---------------------------------------------------------------- the copy, step by step

describe("copy from Engine", () => {
  let engineBefore: string;
  let first: CopyResult;

  it("refuses a target that has the jobs site's own tables (Engine or a copy of it)", async () => {
    const looksLikeEngine = new PGlite();
    await looksLikeEngine.waitReady;
    await looksLikeEngine.exec(JOBS_STUB_SQL);
    let migrated = false;
    const res = await copyFromEngine({
      source: engine as unknown as SqlRunner,
      target: { db: drizzle({ client: looksLikeEngine }) as unknown as DB, raw: looksLikeEngine as unknown as SqlRunner },
      dryRun: false,
      actor: ACTOR,
      migrate: async () => {
        migrated = true;
      },
      describe: { source: "s", target: "t" },
    });
    expect(res.refused).toMatch(/public\.xdl_jobs_users/);
    expect(migrated).toBe(false);
    expect((await looksLikeEngine.query(`select to_regclass('engine_copy.users') as r`)).rows[0]).toEqual({ r: null });
    await looksLikeEngine.close();
  });

  it("dry run: reads everything, writes nothing", async () => {
    engineBefore = await fingerprint(engine);
    const res = await run(true);
    expect(res.ok).toBe(true);
    expect(migrations).toBe(0);
    expect(await q(`select to_regclass('engine_copy.users') as r`)).toEqual([{ r: null }]);
    expect(await count("hub.experts")).toBe(0);
    expect(await count("hub.legacy_map")).toBe(0);
    expect(res.tables.find((t) => t.name === "users")).toMatchObject({ engineRows: 6, inserted: 6 });
    expect(res.people).toMatchObject({ engineUsers: 6, staff: 1, create: 3, held: 1, mergedByEmail: 1 });
    expect(res.files).toMatchObject({ toCopy: 4, notMapped: 2 });
    expect(res.jobs).toMatchObject({ created: 2 });
    expect(res.applications).toMatchObject({ created: 3, merged: 1, personNotMapped: 2 });
    expect(res.report).toMatch(/^DRY RUN/);
    expect(await fingerprint(engine)).toBe(engineBefore);
  });

  it("first run: an exact replica of the expert tables, without login secrets or other apps' tables", async () => {
    // A hub job already uses the slug "rust-dev": the copied one gets a suffix.
    await migrate(drizzle({ client: hubClient }), MIGRATIONS);
    await hub.insert(jobs).values({ slug: "rust-dev", title: "Hub's own Rust job", status: "draft" });
    first = await run(false);
    expect(first.problems).toEqual([]);
    expect(first.ok).toBe(true);
    expect(migrations).toBe(1);
    expect(await fingerprint(engine)).toBe(engineBefore);

    for (const [t, n] of Object.entries({ users: 6, applications: 6, screenings: 3, files: 6, jobs: 2, saved: 2, notifications: 1, payouts: 0, earnings: 0, commissions: 0, interviews: 0, assessments: 0, assessment_attempts: 0, projects: 0, project_members: 0, timesheets: 0 })) {
      expect(await count(`engine_copy.${t}`), t).toBe(n);
    }
    const tables = (await q<{ t: string }>(`select table_name::text as t from information_schema.tables where table_schema = 'engine_copy' order by 1`)).map((r) => r.t);
    expect(tables).not.toContain("settings");
    expect(tables).not.toContain("admin_invites");
    expect(tables.some((t) => t.startsWith("bundle") || t.startsWith("crm"))).toBe(false);
    expect(await q(`select to_regclass('neon_auth.session') as r`)).toEqual([{ r: null }]);

    // Same columns and types as Engine, minus the login secrets.
    const cols = async (c: PGlite, schema: string, table: string) =>
      (await c.query<{ name: string; type: string; nn: boolean }>(`select a.attname::text as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as nn from pg_attribute a where a.attrelid = '${schema}.${table}'::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum`)).rows;
    const engineUsers = (await cols(engine, "public", "xdl_jobs_users")).filter((c) => !(LOGIN_SECRETS as readonly string[]).includes(c.name));
    expect(await cols(hubClient, "engine_copy", "users")).toEqual(engineUsers);
    const replicaCols = (await cols(hubClient, "engine_copy", "users")).map((c) => c.name);
    for (const s of LOGIN_SECRETS) expect(replicaCols).not.toContain(s);
    const dump = JSON.stringify(await q(`select * from engine_copy.users`));
    expect(dump).not.toMatch(/pbkdf2|otp-code-hash/);
    expect((await cols(hubClient, "engine_copy", "files")).map((c) => c.name)).toEqual(["id", "user_id", "kind", "filename", "mime", "size", "created_at", "hub_file_id"]);
    expect(await q(`select primary key_cols from (select string_agg(a.attname, ',' order by k.ord) as key_cols from pg_index i cross join lateral unnest(i.indkey::int2[]) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum where i.indrelid = 'engine_copy.screenings'::regclass and i.indisprimary) x`.replace("primary key_cols", "key_cols"))).toEqual([{ key_cols: "application_id,stage" }]);

    // Values are the same, to the microsecond and the JSON.
    const e = (await engine.query(`select created_at::text as c, experience::text as x, crm_tags::text as t from public.xdl_jobs_users where id = 101`)).rows[0];
    expect((await q(`select created_at::text as c, experience::text as x, crm_tags::text as t from engine_copy.users where id = 101`))[0]).toEqual(e);
  });

  it("first run: experts with every profile field (team-only extras, money-only payout)", async () => {
    expect(await count("hub.experts")).toBe(3); // Asha (with her second account), Ben, Dev; not staff, not Cara (held)
    const asha = await expertByEmail("asha@example.org");
    expect(asha).toMatchObject({
      fullName: "Asha Testperson",
      country: "India",
      region: "Maharashtra",
      city: "Pune",
      linkedinUrl: "https://www.linkedin.com/in/asha-test",
      headline: "Maths PhD",
      yearsExperience: 6,
      highestDegree: "PhD",
      university: "IIT Example",
      hoursPerWeek: 20,
      phone: "+91 98765 43210",
      status: "bench",
      primarySource: "jobs_site",
      rateExpectationUsd: 35, // from her newest application (money: admins and finance only)
      cvConsent: "unknown",
    });
    expect(asha.skills.length).toBeGreaterThan(1);
    expect(asha.languages).toEqual(["English", "Hindi"]);
    expect(asha.tags).toEqual(expect.arrayContaining(["jobs-site", "python", "top-expert"]));
    expect(asha.notes).toBe("Jobs site note: Great at proofs");
    expect(asha.createdAt.toISOString()).toBe("2026-02-01T00:00:00.000Z"); // the earlier of her two accounts
    const sources = rowsOf<{ external_id: string }>(await hub.execute(sql`select external_id from hub.expert_sources where expert_id = ${asha.id} order by 1`)).map((r) => r.external_id);
    expect(sources).toEqual(["101", "104"]);

    const ben = await expertByEmail("ben@example.org");
    expect(ben.status).toBe("do_not_contact");
    expect(await expertByEmail("staff@xocket.sh")).toBeUndefined();
    expect(await expertByEmail("cara@example.org")).toBeUndefined();
    expect(first.people).toMatchObject({ staff: 1, held: 1, heldIds: [105], mergedByEmail: 1, experts: 3 });

    const details = await detailsFor(hub, asha.id, "admin");
    expect(details).toMatchObject({ addressLine1: "12 Test Road", addressLine2: "Flat 4", postalCode: "411001", workAuthorized: true, referralCode: "ASHA1", noExperience: false, updatedBy: "jobs-site import" });
    expect(details!.experience[0]).toMatchObject({ title: "Lecturer", company: "Example College", current: true });
    expect(details!.education[0]).toMatchObject({ school: "IIT Example", degree: "PhD" });
    expect(details!.lastLoginAt?.toISOString()).toBe("2026-11-20T10:00:00.000Z");
    // Address lines are contact details: masked for viewers.
    expect(await detailsFor(hub, asha.id, "viewer")).toMatchObject({ addressLine1: null, postalCode: null, referralCode: "ASHA1" });
    const benDetails = await detailsFor(hub, ben.id, "recruiter");
    expect(benDetails).toMatchObject({ referredByExpertId: asha.id, referredByName: "Asha Testperson", noExperience: true });

    // Money-only: admins and finance; nobody else even gets the row.
    expect(await payoutFor(hub, asha.id, "finance")).toMatchObject({ payoutMethod: "paypal", payoutHandle: "asha.pay@example.org", taxFormType: "W-8BEN" });
    for (const role of ["recruiter", "pod_lead", "viewer"] as const) expect(await payoutFor(hub, asha.id, role)).toBeNull();
    expect(await hub.$count(expertPayout)).toBe(1);
    expect(Object.keys(asha)).not.toContain("payoutHandle");
  });

  it("first run: file bytes stored once (in hub), linked from the replica; newest CV current; tax forms money-only", async () => {
    const asha = await expertByEmail("asha@example.org");
    const files = await filesFor(hub, asha.id);
    expect(files.map((f) => [f.kind, f.filename]).sort()).toEqual([["cv", "asha_new.pdf"], ["cv", "asha_old.pdf"], ["tax", "w8ben.pdf"]]);
    expect(await count("hub.expert_files where data is not null")).toBe(4);
    expect(await count("hub.expert_files")).toBe(4);
    // The replica has no bytes, only the hub file id each one was stored as.
    const linked = await q<{ id: number; hub_file_id: string | null }>(`select id, hub_file_id::text from engine_copy.files order by id`);
    expect(linked.filter((r) => r.hub_file_id).map((r) => r.id)).toEqual([901, 902, 903, 904]);
    const m = await q<{ hub_id: string }>(`select hub_id::text from hub.legacy_map where source_table = 'files' and source_id = '902'`);
    expect(linked.find((r) => r.id === 902)!.hub_file_id).toBe(m[0].hub_id);
    expect(asha.cvRef).toBe(`upload:${m[0].hub_id}`);
    const row = await getFileRow(hub, m[0].hub_id);
    expect(Buffer.from((await readCv(hub, row!))!.bytes).toString()).toBe("%PDF-1.4 newer");
    expect(first.files).toMatchObject({ copied: 4, notMapped: 2, cvsSet: 2 });

    // Tax forms: listed and downloadable only for money roles.
    expect(visibleFiles("finance", files).some((f) => f.kind === "tax")).toBe(true);
    expect(visibleFiles("recruiter", files).some((f) => f.kind === "tax")).toBe(false);
    expect(visibleFiles("viewer", files).some((f) => f.kind === "tax")).toBe(false);
    expect(fileDownloadAction("tax")).toBe("money.read");
    expect(can("finance", fileDownloadAction("tax"))).toBe(true);
    expect(can("recruiter", fileDownloadAction("tax"))).toBe(false);
    expect(can("pod_lead", fileDownloadAction("tax"))).toBe(false);
    expect(can("recruiter", fileDownloadAction("cv"))).toBe(true);
  });

  it("a tax form never goes to a partner, even when no CV is current", async () => {
    const asha = await expertByEmail("asha@example.org");
    await hubClient.exec(`insert into hub.partners (id, name) values ('00000000-0000-4000-8000-0000000000a1', 'Test Partner')`);
    await hubClient.exec(`insert into hub.requirements (id, partner_id, title) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'Maths')`);
    await hubClient.query(`insert into hub.submissions (requirement_id, expert_id, status) values ('00000000-0000-4000-8000-0000000000b1', $1, 'submitted')`, [asha.id]);
    // Make the tax form the newest file and point cv_ref nowhere.
    await hubClient.query(`update hub.expert_files set created_at = now() where expert_id = $1 and kind = 'tax'`, [asha.id]);
    await hubClient.query(`update hub.experts set cv_ref = null where id = $1`, [asha.id]);
    const { fileByExpert } = await rosterFor(hub, "00000000-0000-4000-8000-0000000000b1");
    expect(fileByExpert.get(asha.id)?.kind).toBe("cv");
    // Put things back as the copy left them.
    await hubClient.query(`update hub.expert_files set created_at = '2026-05-01' where expert_id = $1 and kind = 'tax'`, [asha.id]);
    await hubClient.query(`delete from hub.submissions`);
    await hubClient.query(`update hub.experts e set cv_ref = 'upload:' || m.hub_id from hub.legacy_map m where m.source_table = 'files' and m.source_id = '902' and e.id = $1`, [asha.id]);
  });

  it("first run: the old jobs are internal hub jobs, never on the public board", async () => {
    const copied = await hub.select().from(jobs).where(eq(jobs.createdBy, "jobs-site import"));
    expect(copied.map((j) => j.slug).sort()).toEqual(["maths-reviewer", "rust-dev-2"]);
    for (const j of copied) expect(j).toMatchObject({ visibility: "internal", featured: false });
    const maths = copied.find((j) => j.slug === "maths-reviewer")!;
    expect(maths).toMatchObject({ title: "Maths Reviewer", status: "open", employmentType: "contract", internalRateNote: "Jobs site pay: 30–50 USD per hour.", location: "Remote · India, Kenya", domains: [expect.any(String)] });
    expect(maths.description).toContain("PhD in maths");
    expect(`${maths.title} ${maths.summary} ${maths.description}`).not.toMatch(/USD|\$|per hour/);
    expect((await listPublicJobs(hub)).filter((j) => j.createdBy === "jobs-site import")).toEqual([]);
    // Its public page is a 404 for visitors and experts; the team sees a preview.
    expect(await jobForPage(hub, "maths-reviewer", null)).toBeNull();
    expect(await jobForPage(hub, "maths-reviewer", { kind: "expert", email: "x@example.org", name: "X", devPreview: false })).toBeNull();
    const fields = await hub.select().from(jobFormFields).where(eq(jobFormFields.jobId, maths.id));
    expect(fields.map((f) => f.label)).toContain("Why are you a good fit?");
    const m = await q(`select source_id from hub.legacy_map where source_table = 'jobs' order by 1`);
    expect(m).toEqual([{ source_id: "1" }, { source_id: "2" }]);
  });

  it("first run: applications with every answer, both screenings, the CV and a money-only rate", async () => {
    const asha = await expertByEmail("asha@example.org");
    const [maths] = await hub.select().from(jobs).where(eq(jobs.slug, "maths-reviewer"));
    expect(await count("hub.applications")).toBe(3);
    const [a] = await hub.select().from(applications).where(and(eq(applications.jobId, maths.id), eq(applications.expertId, asha.id)));
    expect(a).toMatchObject({ status: "reviewing", internalNote: "Strong maths", rateExpectationUsd: 40, source: { ref: "jobs-site", jobsSite: { applicationId: 501, status: "reviewing" } } });
    expect(a.createdAt.toISOString()).toBe("2026-03-02T00:00:00.000Z");
    const text = Object.values(a.answers).map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join("\n");
    expect(text).toContain("I have taught calculus");
    expect(text).toContain("1. Why AI training?\nI like teaching machines.");
    expect(text).toContain("1. Show a proof\nLet n be even...");
    expect(text).toContain("Immediately");
    const cvFile = await q<{ hub_id: string }>(`select hub_id::text from hub.legacy_map where source_table = 'files' and source_id = '901'`);
    expect(Object.values(a.answers)).toContainEqual({ fileId: cvFile[0].hub_id, filename: "asha_old.pdf", size: 14 });
    // Her second account's application to the same job is the same hub application.
    expect((await q(`select count(distinct hub_id)::int as n from hub.legacy_map where source_table = 'applications' and source_id in ('501', '504')`))[0]).toEqual({ n: 1 });
    expect(first.applications).toMatchObject({ created: 3, merged: 1, personNotMapped: 2, screeningsFolded: 3 });
    // The rate is money: the applicant list never carries it; applicationMoney (admins, finance) does.
    const list = await listApplicants(hub, maths.id);
    expect(list.length).toBe(2);
    expect(Object.keys(list[0].app)).not.toContain("rateExpectationUsd");
    expect(Object.keys(applicantColumns.app)).not.toContain("rateExpectationUsd");
    expect(Object.keys((await getApplicant(hub, a.id))!.app)).not.toContain("rateExpectationUsd");
    expect(await applicationMoney(hub, a.id)).toEqual({ rateExpectationUsd: 40 });
    const [ben] = await hub.select().from(applications).where(eq(applications.expertId, (await expertByEmail("ben@example.org")).id));
    expect(ben.status).toBe("new");
  });

  it("report: one table of counts, no names or emails, check OK", async () => {
    expect(first.report).toMatch(/CHECK OK/);
    expect(first.report).toMatch(/users -> experts\s+6\s+6\s+3/);
    expect(first.report).toMatch(/applications\s+6\s+6\s+3/);
    expect(first.report).not.toMatch(/@example|Asha|Ben |Testperson|asha_|pbkdf2/);
    expect(first.hub).toMatchObject({ experts: 3, files: 4, filesByKind: { cv: 3, tax: 1 }, jobs: 2, applications: 3 });
  });

  it("second run: nothing new, nothing copied twice", async () => {
    const before = { experts: await count("hub.experts"), files: await count("hub.expert_files"), jobs: await count("hub.jobs"), apps: await count("hub.applications"), map: await count("hub.legacy_map") };
    const res = await run(false);
    expect(res.problems).toEqual([]);
    for (const t of res.tables) expect([t.name, t.inserted, t.updated]).toEqual([t.name, 0, 0]);
    expect(res.people).toMatchObject({ create: 0, update: 0, unchanged: 3 });
    expect(res.files).toMatchObject({ copied: 0, already: 4 });
    expect(res.jobs).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
    expect(res.applications).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
    expect({ experts: await count("hub.experts"), files: await count("hub.expert_files"), jobs: await count("hub.jobs"), apps: await count("hub.applications"), map: await count("hub.legacy_map") }).toEqual(before);
    expect(await fingerprint(engine)).toBe(engineBefore);
  });

  it("re-run after changes: new rows added, changed rows updated, team edits kept, nothing deleted", async () => {
    const asha = await expertByEmail("asha@example.org");
    const dev = await expertByEmail("dev.person@example.org");
    const [maths] = await hub.select().from(jobs).where(eq(jobs.slug, "maths-reviewer"));
    const [rust] = await hub.select().from(jobs).where(eq(jobs.slug, "rust-dev-2"));
    // The team edits in the hub.
    await hub.update(experts).set({ headline: "Edited by the team" }).where(eq(experts.id, asha.id));
    await hub.update(jobs).set({ title: "Team's maths title" }).where(eq(jobs.id, maths.id));
    const [ashaApp] = await hub.select().from(applications).where(and(eq(applications.jobId, maths.id), eq(applications.expertId, asha.id)));
    await hub.update(applications).set({ status: "shortlisted", internalNote: "Team note" }).where(eq(applications.id, ashaApp.id));
    // Meanwhile on the jobs site (Engine; the jobs site has its own, writable connection).
    await engine.exec("set default_transaction_read_only = off");
    await engine.exec(`
      update public.xdl_jobs_users set headline = 'New headline on the jobs site' where id = 101;
      update public.xdl_jobs_users set city = 'Recife' where id = 106;
      update public.xdl_jobs_users set experience = '[{"title":"Researcher","company":"Lab","start":"2024-01","current":true}]' where id = 106;
      update public.xdl_jobs_jobs set title = 'Maths Reviewer (v2)', summary = 'New summary' where id = 1;
      update public.xdl_jobs_jobs set summary = 'Rust, updated', status = 'open' where id = 2;
      update public.xdl_jobs_applications set status = 'client_interview', admin_note = 'Moved on' where id = 501;
      update public.xdl_jobs_applications set status = 'reviewing' where id = 503;
      insert into public.xdl_jobs_screenings (application_id, stage, answers) values (503, 2, '[{"q":"Show a proof","a":"Ben proof"}]');
      insert into public.xdl_jobs_users (id, email, name, country, skills, created_at) values (107, 'eve@example.org', 'Eve Newperson', 'Chile', 'Rust', now());
      insert into public.xdl_jobs_files (id, user_id, kind, filename, mime, size, data) values (907, 107, 'resume', 'eve.pdf', 'application/pdf', 7, convert_to('%PDF eve', 'UTF8'));
      insert into public.xdl_jobs_applications (id, job_id, user_id, status, why, resume_file_id) values (507, 2, 107, 'submitted', 'New applicant who writes Rust every day.', 907);
      delete from public.xdl_jobs_saved where user_id = 102;
      alter table public.xdl_jobs_users add column if not exists timezone text;
      update public.xdl_jobs_users set timezone = 'Asia/Kolkata' where id = 101;
    `);
    const engineNow = await fingerprint(engine);
    const res = await run(false);
    expect(res.problems).toEqual([]);
    expect(await fingerprint(engine)).toBe(engineNow);
    const t = (n: string) => res.tables.find((x) => x.name === n)!;
    expect(t("users")).toMatchObject({ inserted: 1, updated: 2, gone: 0 });
    expect(t("users").change?.added).toEqual(["timezone"]);
    expect((await q(`select timezone from engine_copy.users where id = 101`))[0]).toEqual({ timezone: "Asia/Kolkata" });
    expect(t("screenings")).toMatchObject({ inserted: 1 });
    expect(t("saved")).toMatchObject({ gone: 1, replicaRows: 2 }); // deleted in Engine, kept here
    expect(await count("engine_copy.saved")).toBe(2);

    // Experts: team edit kept (fill-empty rule), empty field filled, new person added with their CV.
    expect((await expertByEmail("asha@example.org")).headline).toBe("Edited by the team");
    expect((await expertByEmail("dev.person@example.org")).city).toBe("Recife");
    expect((await detailsFor(hub, dev.id, "admin"))!.experience[0]).toMatchObject({ title: "Researcher" });
    const eve = await expertByEmail("eve@example.org");
    expect(eve).toMatchObject({ fullName: "Eve Newperson", country: "Chile" });
    expect(eve.cvRef).toMatch(/^upload:/);
    expect(res.files).toMatchObject({ copied: 1, already: 4 });

    // Jobs: the team's title stays; fields nobody touched follow the jobs site.
    const [maths2] = await hub.select().from(jobs).where(eq(jobs.id, maths.id));
    expect(maths2).toMatchObject({ title: "Team's maths title", summary: "New summary" });
    const [rust2] = await hub.select().from(jobs).where(eq(jobs.id, rust.id));
    expect(rust2).toMatchObject({ summary: "Rust, updated", status: "open", visibility: "internal" });

    // Applications: the team's status and note stay; untouched ones follow; new answers come in.
    const [ashaApp2] = await hub.select().from(applications).where(eq(applications.id, ashaApp.id));
    expect(ashaApp2).toMatchObject({ status: "shortlisted", internalNote: "Team note" });
    const [benApp] = await hub.select().from(applications).where(eq(applications.expertId, (await expertByEmail("ben@example.org")).id));
    expect(benApp.status).toBe("reviewing");
    expect(Object.values(benApp.answers).join("\n")).toContain("Ben proof");
    const [eveApp] = await hub.select().from(applications).where(eq(applications.expertId, eve.id));
    expect(eveApp).toMatchObject({ jobId: rust.id, status: "new" });
    expect(res.applications).toMatchObject({ created: 1, updated: 2 });
  });

  it("delete on request: their copied records go too, and later runs skip them", async () => {
    const ben = await expertByEmail("ben@example.org");
    expect(await deleteExpertOnRequest(hub, ben.id, ACTOR)).toBe(true);
    // Meanwhile Dev deletes their own jobs-site account: the copy keeps what it has (never deletes).
    await engine.exec("set default_transaction_read_only = off");
    await engine.exec("delete from public.xdl_jobs_users where id = 106");
    for (const [t, where] of [["users", "id = 102"], ["applications", "user_id = 102"], ["files", "user_id = 102"], ["saved", "user_id = 102"], ["screenings", "application_id = 503"]] as const) {
      expect(await count(`engine_copy.${t} where ${where}`), t).toBe(0);
    }
    expect(await count(`hub.legacy_map where source_table = 'users' and source_id = '102'`)).toBe(0);
    const res = await run(false);
    expect(res.problems).toEqual([]);
    expect(await expertByEmail("ben@example.org")).toBeUndefined();
    expect(res.tables.find((t) => t.name === "users")).toMatchObject({ leftOut: 1, inserted: 0, gone: 1 });
    expect(await count(`engine_copy.users where id = 106`)).toBe(1);
    expect(await expertByEmail("dev.person@example.org")).toBeDefined();
    expect(res.tables.find((t) => t.name === "applications")).toMatchObject({ leftOut: 1, inserted: 0 });
    expect(await count(`engine_copy.users where id = 102`)).toBe(0);
    expect(res.report).toMatch(/CHECK OK/);
    expect(await expertByEmail("asha@example.org")).toBeDefined();
  });
});

// ---------------------------------------------------------------- the command line, end to end

describe("npm run copy:engine (the script)", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "copy-engine-"));
  const cli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const exec = (args: string[], env: Record<string, string>) => {
    const r = spawnSync(process.execPath, [cli, "scripts/copy-from-engine.ts", ...args], {
      cwd: process.cwd(),
      // Only these variables: never the real .env.local values (loadEnv never overrides what is set here).
      env: { PATH: process.env.PATH ?? "", HOME: tmp, COPY_LOG_DIR: path.join(tmp, "logs"), DATABASE_URL: "", ENGINE_DATABASE_URL: "", CONFIRM_DB: "", ...env } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 120_000,
    });
    return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
  };
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("refuses before connecting: no CONFIRM_DB, empty DATABASE_URL, same database; never prints a password", () => {
    const neonA = "postgresql://ro:Pa55word-A@ep-sweet-band-b5mvykjt-pooler.ap-southeast-1.aws.neon.tech/neondb";
    const neonB = "postgresql://owner:Pa55word-B@ep-sweet-band-b5mvykjt.ap-southeast-1.aws.neon.tech/neondb";
    const same = exec([], { ENGINE_DATABASE_URL: neonA, DATABASE_URL: neonB, CONFIRM_DB: "yes" });
    expect(same.code).toBe(1);
    expect(same.out).toMatch(/same database/);
    const empty = exec([], { ENGINE_DATABASE_URL: neonA, CONFIRM_DB: "yes" });
    expect(empty.code).toBe(1);
    expect(empty.out).toMatch(/DATABASE_URL is empty/);
    const unconfirmed = exec([], { ENGINE_DATABASE_URL: neonA, DATABASE_URL: "postgresql://o:Pa55word-C@ep-other-x1.ap-south-1.aws.neon.tech/neondb" });
    expect(unconfirmed.code).toBe(1);
    expect(unconfirmed.out).toMatch(/CONFIRM_DB=yes/);
    for (const r of [same, empty, unconfirmed]) expect(r.out).not.toMatch(/Pa55word/);
    const noSource = exec([], { DATABASE_URL: "pglite:x", CONFIRM_DB: "yes" });
    expect(noSource.out).toMatch(/ENGINE_DATABASE_URL/);
  });

  it("an unreachable Engine stops the copy cleanly, without printing the password", () => {
    // .invalid never resolves (RFC 6761): no real database is contacted.
    const r = exec(["--local-test"], { ENGINE_DATABASE_URL: "postgresql://ro:Pa55word-E@ep-no-such-endpoint-pooler.invalid/neondb?sslmode=require", DATABASE_URL: `pglite:${path.join(tmp, "unreachable")}`, CONFIRM_DB: "yes" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/The copy stopped/);
    expect(r.out).toMatch(/ro@ep-no-such-endpoint\.invalid\/neondb/); // shown as user@host/db, direct host
    expect(r.out).not.toMatch(/Pa55word/);
  });

  it("--local-test: dry run, copy, and copy again against local databases", async () => {
    const engineDir = path.join(tmp, "engine");
    const e = await newEngine(engineDir);
    await e.close();
    const env = { ENGINE_DATABASE_URL: `pglite:${engineDir}`, DATABASE_URL: `pglite:${path.join(tmp, "target")}` };
    const dry = exec(["--local-test", "--dry-run"], env);
    expect(dry.out).toMatch(/DRY RUN/);
    expect(dry.code).toBe(0);
    const real = exec(["--local-test"], { ...env, CONFIRM_DB: "yes" });
    expect(real.out).toMatch(/CHECK OK/);
    expect(real.code).toBe(0);
    const again = exec(["--local-test"], { ...env, CONFIRM_DB: "yes" });
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/experts: 0 new/);
    const logs = readdirSync(path.join(tmp, "logs"));
    expect(logs.some((f) => /^copy-engine-\d{4}-\d\d-\d\d-\d{4}\.txt$/.test(f))).toBe(true);
    expect(logs.some((f) => f.endsWith("-dry-run.txt"))).toBe(true);
    const report = readFileSync(path.join(tmp, "logs", logs.find((f) => !f.includes("dry"))!), "utf8");
    expect(report).not.toMatch(/@example|Testperson/);
    const target = new PGlite(path.join(tmp, "target"));
    expect((await target.query<{ n: number }>(`select count(*)::int as n from hub.experts`)).rows[0].n).toBe(3);
    expect((await target.query<{ n: number }>(`select count(*)::int as n from engine_copy.users`)).rows[0].n).toBe(6);
    await target.close();
  });
});
