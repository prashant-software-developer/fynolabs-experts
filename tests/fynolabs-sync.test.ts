// The FynoLabs admin folded into the hub (src/lib/import/fynolabs): a fake FynoLabs (the real column
// lists, tests/fixtures/fynolabs-schema.ts) copied by the real edge-function logic into fynolabs_copy,
// a small Engine copied by the real Engine copy, then the mapping, twice.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { MIGRATIONS } from "@/db/local/open";
import { experts, jobs } from "@/db/schema";
import { emailHash } from "@/lib/normalize";
import { PIPELINE_STAGES, stageForStatus, statusForStage } from "@/lib/constants";
import { isMoneyTable, rowsWithoutMoney, withoutMoney } from "@/lib/auth/permissions";
import type { SqlRunner } from "@/lib/import/engine/source";
import { copyFromEngine } from "@/lib/import/engine/copy";
import { syncFynolabsIntoHub, type MapResult } from "@/lib/import/fynolabs/map";
import { decide, mergeFields } from "@/lib/import/fynolabs/merge";
import { companyKind } from "@/lib/import/fynolabs/work";
import { statusFromFynolabs } from "@/lib/import/fynolabs/people";
import { getFileRow, readCv } from "@/lib/server/cv";
import { deleteExpertOnRequest } from "@/lib/server/experts";
import { listViews } from "@/lib/server/views";
import { setApplicationStatus } from "@/lib/server/applications";
import { openTestDb } from "./fixtures/db";
import { copyEverything, newFynoLabs } from "./fixtures/fynolabs-edge";
import { C, CAMP, J, JA, L, P, PLAT, PR, TA, U } from "./fixtures/fynolabs-data";
import { ENGINE_OTHER_SQL, ENGINE_SCHEMA_SQL } from "./fixtures/engine-schema";
import { ENGINE_PEOPLE_SQL } from "./fixtures/fynolabs-engine";

let src: PGlite;
let hubClient: PGlite;
let hub: DB;
let first: MapResult;
const raw = () => hubClient as unknown as SqlRunner;
const q = async <T = Record<string, unknown>>(text: string, p: unknown[] = []) => (await hubClient.query<T>(text, p)).rows;
const n = async (text: string, p: unknown[] = []) => Number((await q<{ n: number }>(text, p))[0].n);
const expertBy = async (where: string, p: unknown[] = []) => (await q<Record<string, unknown>>(`select * from hub.experts where ${where}`, p));
const hubIdOf = async (source: string, id: string) => (await q<{ id: string }>(`select hub_id::text as id from hub.legacy_map where source_table = $1 and source_id = $2`, [`fynolabs.${source}`, id]))[0]?.id;
const sync = () => syncFynolabsIntoHub(raw(), { actorEmail: "cli:test" });
const counts = (r: MapResult, source: string) => r.tables.find((t) => t.source === source)!;

beforeAll(async () => {
  ({ db: hub, client: hubClient } = await openTestDb({ jobsStub: false }));
  // Engine first (as on Prashant's PC): Asha and Chen are already experts when FynoLabs comes in.
  const engine = new PGlite();
  await engine.exec(ENGINE_SCHEMA_SQL);
  await engine.exec(ENGINE_OTHER_SQL);
  await engine.exec(ENGINE_PEOPLE_SQL);
  const r = await copyFromEngine({ source: engine as unknown as SqlRunner, target: { db: hub, raw: raw() }, dryRun: false, actor: { email: "cli:test", role: "admin" }, migrate: async () => void (await migrate(drizzle({ client: hubClient }), MIGRATIONS)), describe: { source: "e", target: "h" } });
  expect(r.ok, r.report).toBe(true);
  await engine.close();
  // The hub already knows a few things: Eve was deleted on request; the team added "ACME data" and a requirement for it; Prashant is the admin.
  await hubClient.query(`insert into hub.erasures (email_sha256, actor_email) values ($1, 'test')`, [emailHash("eve@example.com")]);
  await hubClient.query(`insert into hub.partners (name, kind) values ('ACME data', 'data_partner')`);
  await hubClient.query(`insert into hub.requirements (partner_id, title) select id, 'Rust experts' from hub.partners where name = 'ACME data'`);
  await hubClient.query(`insert into hub.team_members (email, name, role) values ('prashant@xocket.sh', 'Prashant', 'admin')`);
  src = await newFynoLabs();
  await copyEverything(src, hubClient);
  first = await sync();
});
afterAll(async () => {
  await src.close();
  await hubClient.close();
});

describe("merge rules (pure)", () => {
  it("FynoLabs never blanks a field, fills empty ones, wins over Engine, and never over a hub edit", () => {
    expect(decide({ hub: "x", incoming: null, hasWritten: false })).toBe("skip");
    expect(decide({ hub: null, incoming: "a", hasWritten: false })).toBe("set");
    expect(decide({ hub: "a", incoming: "a", hasWritten: false })).toBe("own");
    expect(decide({ hub: "engine", incoming: "fyno", hasWritten: false, engine: "engine" })).toBe("set");
    expect(decide({ hub: "team", incoming: "fyno", hasWritten: false, engine: "engine" })).toBe("keep");
    expect(decide({ hub: "old", incoming: "new", hasWritten: true, written: "old" })).toBe("set");
    expect(decide({ hub: "team edit", incoming: "new", hasWritten: true, written: "old" })).toBe("keep");
    expect(decide({ hub: "applicant", incoming: "bench", hasWritten: false, blank: ["applicant"] })).toBe("set");
    const m = mergeFields({ skills: ["Go"], city: "Pune" }, { skills: ["Rust", "go"], city: "Delhi" }, null, { lists: ["skills"] });
    expect(m.patch).toEqual({ skills: ["Go", "Rust"] });
    expect(m.kept).toEqual(["skills", "city"]);
  });

  it("maps FynoLabs lists: statuses, company kinds, pipeline stages <-> statuses", () => {
    expect(statusFromFynolabs("bench", false)).toBe("bench");
    expect(statusFromFynolabs("active", false)).toBe("placed");
    expect(statusFromFynolabs("prospect", false)).toBe("applicant");
    expect(statusFromFynolabs("bench", true)).toBe("do_not_contact");
    expect([companyKind("partner"), companyKind("marketplace"), companyKind("staffing"), companyKind("weird")]).toEqual(["data_partner", "expert_platform", "staffing", "other"]);
    expect(PIPELINE_STAGES).toEqual(["new", "shortlisted", "referred", "selected", "documents", "signed", "active", "ended", "rejected"]);
    expect(PIPELINE_STAGES.map(statusForStage)).toEqual(["new", "shortlisted", "submitted_to_partner", "hired", "hired", "hired", "hired", "hired", "rejected"]);
    expect(stageForStatus("withdrawn")).toBe("rejected");
    expect(stageForStatus("reviewing")).toBe("new");
  });
});

describe("one record per person", () => {
  it("Asha (FynoLabs and Engine, emails in different capitals) is one expert with both sources", async () => {
    const rows = await expertBy(`email = 'asha.rao@example.com'`);
    expect(rows).toHaveLength(1);
    const srcs = await q<{ source: string }>(`select source from hub.expert_sources where expert_id = $1 order by source`, [rows[0].id]);
    expect(srcs.map((s) => s.source)).toEqual(["admin_crm", "jobs_site"]);
    expect(await hubIdOf("talent_profiles", P.asha)).toBe(rows[0].id);
  });

  it("FynoLabs values win over Engine's, Engine-only values stay, FynoLabs-only fields arrive", async () => {
    const [a] = await expertBy(`email = 'asha.rao@example.com'`);
    expect(a).toMatchObject({ full_name: "Asha Rao", headline: "Senior ML engineer", city: "Bengaluru", country: "India", years_experience: 7, hours_per_week: 20, status: "bench", cv_consent: "yes" });
    expect(a.skills).toEqual(["python", "pytorch", "rust"].map((s) => expect.stringMatching(new RegExp(s, "i"))));
    expect(a).toMatchObject({ location: "Bengaluru, India", timezone: "Asia/Kolkata", seniority: "senior", outreach_status: "interested", next_action: "Send P101 brief", source_channel: "talent_call", email_opt_out: false });
    expect(a.attributes).toEqual({ github_stars: 120 });
    expect(String(a.notes)).toContain("FynoLabs note: Strong on evals");
    expect((a.tags as string[]).sort()).toEqual(expect.arrayContaining(["fynolabs", "jobs-site", "rust", "evals"]));
    // Owner: Nitin, who is a team member in the hub now (added with access off).
    const [owner] = await q<{ email: string; active: boolean; role: string }>(`select t.email, t.active, t.role from hub.team_members t where t.id = $1`, [a.owner_team_member_id]);
    expect(owner).toEqual({ email: "nitin@example.com", active: false, role: "viewer" });
    // Company that sent them (source account) and the money-only default commission.
    expect(a.source_company_id).toBe(await hubIdOf("accounts", C.beta));
    expect((await q(`select default_commission_percent::text as p from hub.expert_payout where expert_id = $1`, [a.id]))[0]).toEqual({ p: "15.00" });
    // "Added": the earliest of the two.
    expect(new Date(String(a.created_at)).toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });

  it("Chen (no email in FynoLabs) is matched by LinkedIn: Engine's email stays, FynoLabs' headline wins", async () => {
    const rows = await expertBy(`lower(linkedin_url) = 'https://www.linkedin.com/in/chen-wei'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "chen.wei@example.com", headline: "Physicist", outreach_status: "contacted" });
  });

  it("Ben is new from FynoLabs; referred by Asha; his CV is a FynoLabs file whose bytes come from fynolabs_copy", async () => {
    const [b] = await expertBy(`email = 'ben.okafor@example.com'`);
    expect(b).toMatchObject({ primary_source: "admin_crm", status: "placed", email_opt_out: true, country: "Nigeria" });
    const [d] = await q<{ ref: string }>(`select referred_by_expert_id::text as ref from hub.expert_details where expert_id = $1`, [b.id]);
    expect(d.ref).toBe(await hubIdOf("talent_profiles", P.asha));
    const cv = await getFileRow(hub, String(b.cv_ref).replace("upload:", ""));
    expect(cv).toMatchObject({ storage: "fynolabs", kind: "cv" });
    const bytes = await readCv(hub, cv!);
    expect(Buffer.from(bytes!.bytes).toString()).toBe("%PDF-1.4 Ben's CV");
  });

  it("applicants without a FynoLabs profile become experts (Dana by job form, Farid by the talent form)", async () => {
    expect(await expertBy(`email = 'dana.cruz@example.com'`)).toHaveLength(1);
    expect((await expertBy(`email = 'farid@example.com'`))[0]).toMatchObject({ source_channel: "talent_call", primary_source: "admin_crm" });
  });

  it("people deleted on request never come back, from either side", async () => {
    expect(await n(`select count(*)::int as n from hub.experts where email = 'eve@example.com'`)).toBe(0);
    expect(await n(`select count(*)::int as n from hub.expert_activities where summary like 'Eve%'`)).toBe(0);
    expect(await n(`select count(*)::int as n from hub.referrals where recipient_email = 'eve@example.com'`)).toBe(0);
    // The FynoLabs admin's own erasure (privacy_log keeps an MD5) is in hub.erasures too.
    expect(await n(`select count(*)::int as n from hub.erasures where email_md5 = md5('gone@example.com')`)).toBe(1);
  });
});

describe("pipelines", () => {
  it("each FynoLabs application is a pipeline on the job, with FynoLabs' stage and its own status", async () => {
    const jobId = await hubIdOf("posted_jobs", J.rust);
    const apps = await q<{ email: string; stage: string; status: string; reject_reason: string | null; channel: string; next_action: string | null; track: string | null }>(
      `select e.email, a.stage, a.status, a.reject_reason, a.channel, a.next_action, a.track_id::text as track from hub.applications a join hub.experts e on e.id = a.expert_id where a.job_id = $1 order by e.email`,
      [jobId],
    );
    expect(apps).toEqual([
      { email: "asha.rao@example.com", stage: "rejected", status: "rejected", reject_reason: "location", channel: "sourced", next_action: null, track: null },
      { email: "ben.okafor@example.com", stage: "selected", status: "hired", reject_reason: null, channel: "applied", next_action: "Send NDA", track: PR.track },
      { email: "dana.cruz@example.com", stage: "new", status: "new", reject_reason: null, channel: "applied", next_action: null, track: null },
    ]);
    // Answers keyed by the copied job's own form, with the CV as a file answer.
    const [ben] = await q<{ answers: Record<string, unknown> }>(`select answers from hub.applications where id = $1`, [await hubIdOf("job_applications", JA.ben)]);
    expect(Object.values(ben.answers)).toEqual(expect.arrayContaining(["Ben Okafor", "https://github.com/benok", "Happy to start Monday", expect.objectContaining({ filename: `${JA.ben}.pdf` })]));
  });

  it("talent-call applications sit on one internal job, never public", async () => {
    const [job] = await q<{ id: string; visibility: string; status: string }>(`select id::text as id, visibility, status from hub.jobs where title = 'Talent call (FynoLabs)'`);
    expect(job).toMatchObject({ visibility: "internal", status: "closed" });
    const apps = await q<{ email: string; stage: string; status: string }>(`select e.email, a.stage, a.status from hub.applications a join hub.experts e on e.id = a.expert_id where a.job_id = $1 order by e.email`, [job.id]);
    expect(apps).toEqual([
      { email: "asha.rao@example.com", stage: "new", status: "reviewing" },
      { email: "farid@example.com", stage: "new", status: "new" },
    ]);
    expect(await hubIdOf("talent_applications", TA.asha)).toBeTruthy();
  });

  it("FynoLabs posted jobs are internal in the hub (their FynoLabs visibility is kept as source_visibility); pay is money-only", async () => {
    const [j] = await hub.select().from(jobs).where(eq(jobs.id, (await hubIdOf("posted_jobs", J.rust))!));
    expect(j).toMatchObject({ visibility: "internal", status: "open", sourceVisibility: "public", employmentType: "contract", internalRateNote: "FynoLabs pay: $50/hour", payUnit: "hour", companyName: "Acme Data", requireGithub: true });
    expect(j.projectId).toBe(PR.p101);
    expect(j.description).toContain("Requirements");
    expect(withoutMoney("recruiter", "jobs", j as unknown as Record<string, unknown>)).toMatchObject({ internalRateNote: null, payUnit: null, title: "Rust engineer" });
  });

  it("the Engine copy's applications have stages too, and status and stage move together", async () => {
    const [eng] = await q<{ id: string; stage: string; status: string }>(`select a.id::text as id, a.stage, a.status from hub.applications a join hub.legacy_map m on m.hub_id = a.id and m.source_table = 'applications'`);
    expect(eng).toMatchObject({ stage: "new", status: "reviewing" });
    await hubClient.query(`update hub.applications set status = 'submitted_to_partner' where id = $1`, [eng.id]);
    expect((await q(`select stage from hub.applications where id = $1`, [eng.id]))[0]).toEqual({ stage: "referred" });
    await hubClient.query(`update hub.applications set stage = 'signed' where id = $1`, [eng.id]);
    expect((await q(`select status from hub.applications where id = $1`, [eng.id]))[0]).toEqual({ status: "hired" });
    await hubClient.query(`update hub.applications set status = 'reviewing', stage = 'new' where id = $1`, [eng.id]);
  });
});

describe("companies, contacts, calendar and the rest", () => {
  it("Acme joins the hub's existing partner (one company), with FynoLabs' CRM fields; its requirement still points at it", async () => {
    const rows = await q<Record<string, unknown>>(`select * from hub.partners where lower(name) = 'acme data'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "ACME data", stage: "talking", priority: "high", next_step: "Send the pilot plan", next_step_due: expect.anything(), best_route: "Email Lena", website: "https://acme.example", platform_id: PLAT, location: "San Francisco" });
    expect(rows[0].owner_team_member_id).toBe(await hubIdOf("team_members", U.nitin));
    expect(await hubIdOf("accounts", C.acme)).toBe(rows[0].id);
    expect(await n(`select count(*)::int as n from hub.requirements where partner_id = $1`, [rows[0].id])).toBe(1);
    expect((await q(`select kind, owner_name, updated_by from hub.partners where name = 'Beta Agency'`))[0]).toEqual({ kind: "expert_platform", owner_name: "Common (team)", updated_by: "fynolabs sync" });
  });

  it("contacts, company activity and the calendar keep their links (India time)", async () => {
    const acme = await hubIdOf("accounts", C.acme);
    expect((await q(`select company_id::text as c, email, stage, created_by from hub.contacts where id = $1`, [L.lena]))[0]).toEqual({ c: acme, email: "lena@acme.example", stage: "call", created_by: "nitin@example.com" });
    expect(await n(`select count(*)::int as n from hub.company_activities where company_id = $1`, [acme])).toBe(2);
    const [ev] = await q<Record<string, unknown>>(`select company_id::text as c, contact_id::text as l, contact_ids, team_member_ids, timezone, start_time::text as t from hub.calendar_events`);
    expect(ev).toMatchObject({ c: acme, l: L.lena, contact_ids: [L.lena], team_member_ids: [await hubIdOf("team_members", U.nitin)], timezone: "Asia/Kolkata", t: "18:30:00" });
  });

  it("projects, referrals, documents, timeline, campaigns, messages, settings and analytics all arrive", async () => {
    const want: Record<string, number> = {
      "hub.projects": 1, "hub.project_tracks": 1, "hub.project_members": 1, "hub.project_documents": 1, "hub.project_fee_rules": 1, "hub.partner_reports": 1,
      "hub.platforms": 1, "hub.radar_listings": 2, "hub.referrals": 2, "hub.referral_fees": 1, "hub.referral_groups": 1, "hub.referral_group_members": 2,
      "hub.engagements": 1, "hub.monthly_earnings": 1, "hub.tracked_links": 1, "hub.tracked_link_clicks": 2, "hub.expert_activities": 4, "hub.expert_documents": 1,
      "hub.job_invites": 1, "hub.email_templates": 1, "hub.email_campaigns": 1, "hub.email_campaign_recipients": 2, "hub.email_send_log": 2, "hub.suppressed_emails": 1,
      "hub.unsubscribe_tokens": 1, "hub.messages": 1, "hub.message_replies": 2, "hub.reply_drafts": 1, "hub.import_batches": 1, "hub.contacts": 2, "hub.company_activities": 2,
      "hub.calendar_events": 1, "hub.visitor_pageviews": 5, "hub.visitor_source_daily": 2, "hub.visitor_source_sessions": 3,
    };
    for (const [t, v] of Object.entries(want)) expect(await n(`select count(*)::int as n from ${t}`), t).toBe(v);
    expect((await q(`select key, value from hub.settings order by key`)).map((r) => r.key)).toEqual(["digest_recipients", "email_send_state", "job_radar", "radar_enabled"]);
    // The NDA points at both files; the referral at the pipeline it came from.
    const [doc] = await q<{ f: string | null; sf: string | null; status: string }>(`select file_id::text as f, signed_file_id::text as sf, status from hub.expert_documents`);
    expect(doc.status).toBe("signed");
    expect(doc.f && doc.sf && doc.f !== doc.sf).toBeTruthy();
    expect((await q(`select application_id::text as a from hub.referrals where method = 'email'`))[0]).toEqual({ a: await hubIdOf("job_applications", JA.ben) });
    const [rep] = await q<{ source_id: string }>(`select source_id::text as source_id from hub.message_replies where source_type = 'job'`);
    expect(rep.source_id).toBe(await hubIdOf("job_applications", JA.ben));
    expect((await q(`select expert_id is not null as linked from hub.email_campaign_recipients where campaign_id = $1 order by email`, [CAMP])).map((r) => r.linked)).toEqual([true, true]);
  });

  it("the audit log keeps who, when and which fields, never the values", async () => {
    const rows = await q<{ entity_type: string; detail: Record<string, unknown>; actor_email: string }>(`select entity_type, detail, actor_email from hub.activity where action like 'fynolabs_%' order by created_at`);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ entity_type: "partner", actor_email: "prashant@xocket.sh", detail: { source: "fynolabs", table: "accounts", fields: ["stage"] } });
    expect(JSON.stringify(rows)).not.toContain("talking");
  });

  it("saved views come over apart from the hub's own Experts tabs", async () => {
    expect((await q(`select collection, owner_email, shared from hub.saved_views`))[0]).toEqual({ collection: "fynolabs_experts", owner_email: "prashant@xocket.sh", shared: true });
    expect(await listViews(hub, { email: "prashant@xocket.sh", role: "admin", partnerIds: [] })).toHaveLength(0);
  });

  it("the team: existing members keep their role, new ones get access off", async () => {
    expect((await q(`select role, active, sections from hub.team_members where email = 'prashant@xocket.sh'`))[0]).toEqual({ role: "admin", active: true, sections: ["contact", "talent", "profiles", "leads"] });
    expect(counts(first, "team_members")).toMatchObject({ copyRows: 2, hubRows: 2, inserted: 1 });
  });

  it("every copied row is in the hub or explained", () => {
    for (const t of first.tables) {
      if (t.source === "storage_objects") continue;
      expect(t.copyRows - t.hubRows - t.skipped - t.removedInHub, t.source).toBe(0);
    }
    expect(counts(first, "talent_profiles")).toMatchObject({ copyRows: 3, hubRows: 3, inserted: 1, updated: 2 });
    expect(counts(first, "audit_log")).toMatchObject({ copyRows: 3, hubRows: 2, skipped: 1 });
    expect(first.copiedOnly).toEqual([]);
  });
});

describe("money", () => {
  it("money-only tables and columns are hidden from roles without money rights", async () => {
    expect(["project_fee_rules", "referral_fees", "monthly_earnings", "expert_payout"].every(isMoneyTable)).toBe(true);
    const fees = await q<Record<string, unknown>>(`select * from hub.referral_fees`);
    expect(rowsWithoutMoney("recruiter", "referral_fees", fees)).toEqual([]);
    expect(rowsWithoutMoney("finance", "referral_fees", fees)).toHaveLength(1);
    const [eng] = await q<Record<string, unknown>>(`select * from hub.engagements`);
    expect(withoutMoney("viewer", "engagements", eng)).toMatchObject({ commission_percent: null, platform: "Acme Platform" });
    expect(withoutMoney("admin", "engagements", eng)).toMatchObject({ commission_percent: "10.00" });
    const [listing] = await q<Record<string, unknown>>(`select * from hub.radar_listings where external_id = 'A-1'`);
    expect(withoutMoney("pod_lead", "radar_listings", listing)).toMatchObject({ pay_min: null, pay_max: null, title: "Rust reviewer" });
  });
});

describe("again: idempotent, and hub edits are kept", () => {
  let second: MapResult;
  beforeAll(async () => {
    // The team edits Asha's headline and Acme's next step in the hub, and moves Ben's pipeline.
    const asha = (await expertBy(`email = 'asha.rao@example.com'`))[0].id;
    await hub.update(experts).set({ headline: "Lead ML engineer (edited in the hub)" }).where(eq(experts.id, String(asha)));
    await hubClient.query(`update hub.partners set next_step = 'Call Lena on Friday' where lower(name) = 'acme data'`);
    await hubClient.query(`update hub.contacts set notes = 'Edited in the hub', updated_by = 'team@xocket.sh' where id = $1`, [L.lena]);
    const ben = await hubIdOf("job_applications", JA.ben);
    const jobId = await hubIdOf("posted_jobs", J.rust);
    await setApplicationStatus(hub, { email: "team@xocket.sh", role: "admin" }, jobId!, [ben!], "shortlisted");
    // Meanwhile in FynoLabs: new headline and city for Asha, a new next step, Lena's notes, Ben's stage, a new applicant who was erased in FynoLabs.
    await src.query(`update public.talent_profiles set headline = 'Principal ML engineer', city = 'Mysuru', updated_at = now() where id = '${P.asha}'`);
    await src.query(`update public.accounts set next_step = 'Sign the pilot', stage = 'pilot' where id = '${C.acme}'`);
    await src.query(`update public.leads set notes = 'Changed in FynoLabs', role = 'COO' where id = '${L.lena}'`);
    await src.query(`update public.job_applications set status = 'documents', updated_at = now() where id = '${JA.ben}'`);
    await src.query(`insert into public.job_applications (job_id, name, email, status) values ('${J.rust}', 'Gone Person', 'gone@example.com', 'new')`);
    await copyEverything(src, hubClient);
    second = await sync();
  });

  it("nothing is duplicated", async () => {
    expect(await n(`select count(*)::int as n from hub.experts where email = 'asha.rao@example.com'`)).toBe(1);
    expect(await n(`select count(*)::int as n from hub.applications`)).toBe(1 + 3 + 2);
    expect(await n(`select count(*)::int as n from hub.jobs where title = 'Talent call (FynoLabs)'`)).toBe(1);
    expect(await n(`select count(*)::int as n from hub.visitor_pageviews`)).toBe(5);
    expect(await n(`select count(*)::int as n from hub.expert_files where storage = 'fynolabs'`)).toBe(first.files.linked);
    for (const t of second.tables) expect(t.copyRows - t.hubRows - t.skipped - t.removedInHub, t.source).toBe(0);
  });

  it("FynoLabs changes come across where the hub didn't change the field; hub edits stay", async () => {
    const [a] = await expertBy(`email = 'asha.rao@example.com'`);
    expect(a).toMatchObject({ headline: "Lead ML engineer (edited in the hub)", city: "Mysuru" });
    expect((await q(`select next_step, stage from hub.partners where lower(name) = 'acme data'`))[0]).toEqual({ next_step: "Call Lena on Friday", stage: "pilot" });
    expect((await q(`select notes, role from hub.contacts where id = $1`, [L.lena]))[0]).toEqual({ notes: "Edited in the hub", role: "Head of Ops" });
    expect(counts(second, "leads").kept).toBe(1);
    // Ben's pipeline was moved in the hub (Shortlisted): FynoLabs' Documents sent doesn't overwrite it.
    expect((await q(`select stage, status from hub.applications where id = $1`, [await hubIdOf("job_applications", JA.ben)]))[0]).toEqual({ stage: "shortlisted", status: "shortlisted" });
    // The person FynoLabs erased (privacy_log) isn't created from their application.
    expect(await n(`select count(*)::int as n from hub.experts where email = 'gone@example.com'`)).toBe(0);
    expect(counts(second, "job_applications").skipped).toBe(1);
  });

  it("the status change in the hub went on Ben's timeline", async () => {
    const ben = (await expertBy(`email = 'ben.okafor@example.com'`))[0].id;
    expect((await q(`select summary from hub.expert_activities where expert_id = $1 and kind = 'stage' order by happened_at desc limit 1`, [ben]))[0]).toEqual({ summary: "Stage: Selected -> Shortlisted" });
  });

  it("a third run with nothing new changes nothing", async () => {
    const third = await sync();
    const changed = third.tables.filter((t) => t.inserted || t.updated);
    expect(changed.map((t) => t.source)).toEqual([]);
  });

  it("delete on request removes the person from the hub and from fynolabs_copy, and the next sync leaves them out", async () => {
    const ben = String((await expertBy(`email = 'ben.okafor@example.com'`))[0].id);
    expect(await deleteExpertOnRequest(hub, ben, { email: "admin@xocket.sh", role: "admin" })).toBe(true);
    expect(await n(`select count(*)::int as n from fynolabs_copy.talent_profiles where id = '${P.ben}'`)).toBe(0);
    expect(await n(`select count(*)::int as n from fynolabs_copy.job_applications where email = 'ben.okafor@example.com'`)).toBe(0);
    expect(await n(`select count(*)::int as n from fynolabs_copy.storage_objects where name like '${P.ben}/%'`)).toBe(0);
    expect(await n(`select count(*)::int as n from hub.referral_fees where person_name is not null`)).toBe(0);
    await copyEverything(src, hubClient);
    await sync();
    expect(await n(`select count(*)::int as n from hub.experts where email = 'ben.okafor@example.com'`)).toBe(0);
    expect(await n(`select count(*)::int as n from fynolabs_copy.talent_profiles where id = '${P.ben}'`)).toBe(0);
    expect(await n(`select count(*)::int as n from hub.referral_group_members where email = 'ben.okafor@example.com'`)).toBe(0);
  });
});
