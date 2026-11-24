// The talent and outreach screens' database work on PGlite with fictional data: pipelines (stage
// changes, reject reasons, the trigger, the timeline, the expert's status, fees), inbound
// applications, campaign recipients, referrals (consent, do not contact, outcomes), groups, fees
// (money-only, transitions) and job radar (publish as an internal draft).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import { seedTalentIfEmpty } from "./fixtures/talent-data";
import type { DB } from "@/db/client";
import { activity, applications, emailCampaignRecipients, emailCampaigns, expertActivities, experts, jobs, projectFeeRules, radarListings, referralFees, referralGroupMembers, referrals, suppressedEmails } from "@/db/schema";
import { listExperts } from "@/lib/server/experts";
import { parseExpertFilters } from "@/lib/filters";
import { can, rowsWithoutMoney, withoutMoney } from "@/lib/auth/permissions";
import { addToJob, getPipeline, pipelineBoard, setPipelineStage, updatePipeline } from "@/lib/server/pipelines";
import { inboundCounts, listInbound, setHandled, talentCallJobId } from "@/lib/server/inbound";
import { approveCampaign, cancelCampaign, expertIdsFor, prepareCampaign, recipientCounts, saveEmailTemplate, sendCampaignBatch } from "@/lib/server/campaigns";
import { listGroups, addGroupMembers, createGroup, deleteGroup, groupExpertIds, groupMembers, recordReferrals, removeGroupMembers, setReferralOutcome } from "@/lib/server/referrals";
import { feeSummary, feeTotals, listFees, markFees, saveFeeRule } from "@/lib/server/fees";
import { listRadar, publishAsJob, scanInfo, setRadarStatus } from "@/lib/server/radar";
import { earningsOf, engagementsOf, mergedTimeline, setDoNotContact, updateOutreach } from "@/lib/server/expert-records";

let db: DB;
let client: PGlite;
let seeded: NonNullable<Awaited<ReturnType<typeof seedTalentIfEmpty>>>;
const admin = { email: "admin@xocket.sh", role: "admin" as const, partnerIds: [] };

const person = async (i: number) => {
  const rows = await db.select().from(experts).where(eq(experts.status, "bench")).orderBy(asc(experts.fullName));
  return rows[i];
};
const timeline = (expertId: string) => db.select().from(expertActivities).where(eq(expertActivities.expertId, expertId));

beforeAll(async () => {
  ({ db, client } = await openTestDb({ demo: true }));
  const s = await seedTalentIfEmpty(db);
  if (!s) throw new Error("talent fixtures not loaded");
  seeded = s;
});
afterAll(async () => {
  await client.close();
});

describe("pipelines", () => {
  it("a stage change writes the timeline, keeps status in step and needs a reason to reject", async () => {
    const [job] = await db.select().from(jobs).where(eq(jobs.projectId, seeded.projectId)).orderBy(asc(jobs.createdAt)).limit(1);
    const onJob = new Set((await db.select({ e: applications.expertId }).from(applications).where(eq(applications.jobId, job.id))).map((r) => r.e));
    const e = (await db.select().from(experts).where(eq(experts.status, "bench")).orderBy(asc(experts.fullName))).find((x) => !onJob.has(x.id))!;
    const added = await addToJob(db, admin, { expertIds: [e.id], jobId: job.id });
    expect(added).toMatchObject({ ok: true, added: 1 });
    const [app] = await db.select().from(applications).where(and(eq(applications.jobId, job.id), eq(applications.expertId, e.id)));
    expect(app).toMatchObject({ stage: "new", status: "new", channel: "manual", createdBy: admin.email });

    const short = await setPipelineStage(db, admin, app.id, { stage: "shortlisted" });
    expect(short).toMatchObject({ ok: true, changed: true });
    let row = await getPipeline(db, app.id);
    expect(row).toMatchObject({ stage: "shortlisted", status: "shortlisted" });

    const refused = await setPipelineStage(db, admin, app.id, { stage: "rejected" });
    expect(refused).toEqual({ ok: false, reason: "Pick why they were rejected." });
    expect((await getPipeline(db, app.id))?.stage).toBe("shortlisted");

    const rej = await setPipelineStage(db, admin, app.id, { stage: "rejected", rejectReason: "no_response" });
    expect(rej).toMatchObject({ ok: true, summary: `${job.title}: Rejected (no response)` });
    row = await getPipeline(db, app.id);
    expect(row).toMatchObject({ stage: "rejected", status: "rejected", rejectReason: "no_response" });

    // Leaving Rejected clears the reason; Active sets the contract start and makes them placed.
    await setPipelineStage(db, admin, app.id, { stage: "active" });
    row = await getPipeline(db, app.id);
    expect(row).toMatchObject({ stage: "active", status: "hired", rejectReason: null });
    expect(row?.startedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await db.select({ s: experts.status }).from(experts).where(eq(experts.id, e.id)))[0].s).toBe("placed");

    const lines = (await timeline(e.id)).filter((t) => t.applicationId === app.id).map((t) => `${t.kind}:${t.summary}`);
    expect(lines).toEqual(expect.arrayContaining([`application:Added to ${job.title}`, `stage:${job.title}: Shortlisted`, `stage:${job.title}: Rejected (no response)`, `stage:${job.title}: Active`]));
    const logged = await db.select().from(activity).where(and(eq(activity.entityType, "application"), eq(activity.entityId, app.id)));
    expect(logged.map((l) => l.action)).toEqual(expect.arrayContaining(["created", "stage_changed"]));
    expect(logged.every((l) => l.actorEmail === admin.email)).toBe(true);

    // The project's fee rule (Active, USD 150) added one expected fee, once.
    const fees = await db.select().from(referralFees).where(eq(referralFees.applicationId, app.id));
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({ status: "expected", amount: 150, currency: "USD", personName: e.fullName });
    await setPipelineStage(db, admin, app.id, { stage: "ended" });
    await setPipelineStage(db, admin, app.id, { stage: "active" });
    expect(await db.$count(referralFees, eq(referralFees.applicationId, app.id))).toBe(1);
  });

  it("the contract can't end before it starts; owner, next action and track are saved", async () => {
    const [p] = await db.select().from(applications).where(eq(applications.stage, "selected")).limit(1);
    expect(await setPipelineStage(db, admin, p.id, { stage: "active", startedOn: "2026-11-10", endedOn: "2026-11-01" })).toEqual({ ok: false, reason: "The contract can't end before it starts." });
    const res = await updatePipeline(db, admin, p.id, { nextAction: "Send the agreement", nextActionDue: "2026-12-01", trackId: seeded.trackIds[1] });
    expect(res).toMatchObject({ ok: true });
    expect(await getPipeline(db, p.id)).toMatchObject({ nextAction: "Send the agreement", nextActionDue: "2026-12-01", trackId: seeded.trackIds[1], trackName: "Rust" });
    expect(await updatePipeline(db, admin, p.id, { trackId: "00000000-0000-4000-8000-000000000000" })).toMatchObject({ ok: false });
  });

  it("never adds someone marked do not contact; the board has a column per stage", async () => {
    const [dnc] = await db.select().from(experts).where(eq(experts.status, "do_not_contact")).limit(1);
    const [job] = await db.select().from(jobs).limit(1);
    expect(await addToJob(db, admin, { expertIds: [dnc.id], jobId: job.id })).toMatchObject({ ok: true, added: 0, skipped: 1 });
    const board = await pipelineBoard(db, { projectId: seeded.projectId }, { perColumn: 5 });
    expect(board.map((c) => c.stage)).toEqual(["new", "shortlisted", "referred", "selected", "documents", "signed", "active", "ended", "rejected"]);
    expect(board.find((c) => c.stage === "referred")?.total).toBeGreaterThan(0);
    expect(board.find((c) => c.stage === "new")?.label).toBe("Applied");
    const [signed] = await db.select().from(applications).where(eq(applications.stage, "signed")).limit(1);
    const listed = await listExperts(db, parseExpertFilters({ stage: "signed" }), { limit: 50, offset: 0 });
    expect(listed.rows.find((r) => r.id === signed.expertId)?.leadingStage).toBe("signed");
  });
});

describe("expert records", () => {
  it("outreach changes write the timeline; do not contact on and off", async () => {
    const e = await person(2);
    expect(await updateOutreach(db, admin, [e.id], { outreachStatus: "contacted", nextAction: "Call back", nextActionDue: "2026-12-02" })).toEqual({ ok: true, updated: 1 });
    const [row] = await db.select().from(experts).where(eq(experts.id, e.id));
    expect(row).toMatchObject({ outreachStatus: "contacted", nextAction: "Call back", nextActionDue: "2026-12-02" });
    expect(row.lastContactedAt).toBeInstanceOf(Date);
    expect((await timeline(e.id)).map((t) => t.summary)).toContain("Outreach: contacted");
    await setDoNotContact(db, admin, [e.id], true, "Asked to stop, by email");
    expect((await db.select({ s: experts.status, r: experts.dncReason }).from(experts).where(eq(experts.id, e.id)))[0]).toEqual({ s: "do_not_contact", r: "Asked to stop, by email" });
    await setDoNotContact(db, admin, [e.id], false);
    const summaries = (await timeline(e.id)).map((t) => t.summary);
    expect(summaries).toEqual(expect.arrayContaining(["Marked do not contact: Asked to stop, by email", "Do not contact removed"]));
    const merged = await mergedTimeline(db, e.id);
    expect(merged.some((m) => m.source === "audit")).toBe(true);
    expect(merged.some((m) => m.source === "timeline")).toBe(true);
  });

  it("engagement commission and earnings are money-only", async () => {
    const [eng] = await db.select({ expertId: experts.id }).from(experts).innerJoin(referralFees, eq(referralFees.expertId, experts.id)).limit(1);
    const lead = (await db.select({ e: expertActivities.expertId }).from(expertActivities).where(eq(expertActivities.summary, "Call: strong Python, wants 20 h/week")))[0].e;
    expect((await engagementsOf(db, lead, "admin"))[0].commissionPercent).toBe(10);
    expect((await engagementsOf(db, lead, "recruiter"))[0].commissionPercent).toBeNull();
    expect((await earningsOf(db, lead, "finance")).length).toBe(2);
    expect(await earningsOf(db, lead, "recruiter")).toEqual([]);
    expect(await earningsOf(db, lead, "viewer")).toEqual([]);
    expect(eng === undefined || typeof eng.expertId === "string").toBe(true);
  });
});

describe("inbound applications", () => {
  it("lists talent-call applications as open or handled, and marks them", async () => {
    expect(await talentCallJobId(db)).toBe(seeded.talentJobId);
    const counts = await inboundCounts(db, "talent");
    expect(counts).toEqual({ open: 3, handled: 1, all: 4 });
    const open = await listInbound(db, { kind: "talent", state: "open", limit: 50, offset: 0 });
    expect(open.rows).toHaveLength(3);
    expect(open.rows.every((r) => r.isTalentCall)).toBe(true);
    await setHandled(db, admin, [open.rows[0].id], true);
    const [h] = await db.select().from(applications).where(eq(applications.id, open.rows[0].id));
    expect(h.handledBy).toBe(admin.email);
    expect(await inboundCounts(db, "talent")).toEqual({ open: 2, handled: 2, all: 4 });
    await setHandled(db, admin, [open.rows[0].id], false);
    expect((await inboundCounts(db, "talent")).open).toBe(3);
    // Job applications past Applied count as handled.
    const jobsSide = await inboundCounts(db, "jobs");
    expect(jobsSide.handled).toBeGreaterThan(0);
  });
});

describe("campaigns", () => {
  it("recipients leave out no email, do not contact, unsubscribed and suppressed addresses", async () => {
    const all = await db.select().from(experts).orderBy(asc(experts.fullName));
    const dnc = all.find((e) => e.status === "do_not_contact")!;
    const optedOut = all.find((e) => e.emailOptOut)!;
    const [sup] = await db.select().from(suppressedEmails);
    const suppressed = all.find((e) => e.email === sup.email)!;
    const fine = all.filter((e) => e.status !== "do_not_contact" && !e.emailOptOut && e.email !== sup.email).slice(0, 3);
    const noEmail = fine[2];
    await db.update(experts).set({ email: null }).where(eq(experts.id, noEmail.id));
    // An address a do-not-contact record also uses blocks that other record too.
    const shared = fine[1];
    await db.update(experts).set({ attributes: { other_emails: [shared.email] } }).where(eq(experts.id, dnc.id));

    const res = await prepareCampaign(db, admin, { name: "Round 1", kind: "outreach", subject: "Hello {{first_name}}", body: "A project for you.", expertIds: [dnc.id, optedOut.id, suppressed.id, ...fine.map((f) => f.id)], followUp: true, followUpBody: "Just checking in.", followUpAfterDays: 4 });
    expect(res).toMatchObject({ ok: true, toSend: 1, skipped: 5 });
    if (!res.ok) return;
    const recips = await db.select().from(emailCampaignRecipients).where(eq(emailCampaignRecipients.campaignId, res.id));
    const why = Object.fromEntries(recips.map((r) => [r.expertId, `${r.status}:${r.reason ?? ""}`]));
    expect(why[dnc.id]).toBe("skipped:do not contact");
    expect(why[shared.id]).toBe("skipped:do not contact");
    expect(why[optedOut.id]).toBe("skipped:unsubscribed");
    expect(why[suppressed.id]).toBe("skipped:suppressed (bounced)");
    expect(why[noEmail.id]).toBe("skipped:no email");
    expect(why[fine[0].id]).toBe("pending:");
    const [camp] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, res.id));
    expect(camp).toMatchObject({ status: "draft", recipientCount: 1, followUpAfterDays: 4, createdBy: admin.email });

    // Someone opts out after the draft: approving re-checks and skips them.
    await db.update(experts).set({ emailOptOut: true }).where(eq(experts.id, fine[0].id));
    expect(await approveCampaign(db, admin, res.id)).toEqual({ ok: false, reason: "No one left to send to." });
    await db.update(experts).set({ emailOptOut: false, attributes: {} }).where(inArray(experts.id, [fine[0].id, dnc.id]));
    await db.update(experts).set({ email: noEmail.email }).where(eq(experts.id, noEmail.id));
  });

  it("approve, send (off until email is set up) and cancel", async () => {
    const fine = (await db.select().from(experts).where(eq(experts.status, "bench")).orderBy(asc(experts.fullName))).filter((e) => !e.emailOptOut).slice(0, 4);
    const res = await prepareCampaign(db, admin, { name: "Update", kind: "update", subject: "News", body: "Hello {{name}}", expertIds: fine.map((f) => f.id) });
    if (!res.ok) throw new Error(res.reason);
    expect(await approveCampaign(db, admin, res.id)).toMatchObject({ ok: true });
    const [camp] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, res.id));
    expect(camp).toMatchObject({ status: "approved", approvedBy: admin.email });
    expect(camp.approvedAt).toBeInstanceOf(Date);
    expect(await approveCampaign(db, admin, res.id)).toMatchObject({ ok: false });
    const sent = await sendCampaignBatch(db, admin, res.id);
    expect(sent.reason).toMatch(/^Email isn't set up yet/);
    expect((await recipientCounts(db, res.id)).sent ?? 0).toBe(0);
    await cancelCampaign(db, admin, res.id);
    const counts = await recipientCounts(db, res.id);
    expect(counts.pending ?? 0).toBe(0);
    expect(counts.stopped).toBeGreaterThan(0);
  });

  it("recipients from a job, a project and a group; templates are unique by name", async () => {
    const [job] = await db.select().from(jobs).where(eq(jobs.projectId, seeded.projectId)).limit(1);
    expect((await expertIdsFor(db, { kind: "job", jobId: job.id })).length).toBeGreaterThan(0);
    expect((await expertIdsFor(db, { kind: "project", projectId: seeded.projectId, stage: "active" })).length).toBeGreaterThan(0);
    expect((await expertIdsFor(db, { kind: "group", groupId: seeded.groupId })).length).toBe(5);
    expect((await expertIdsFor(db, { kind: "filters", params: "status=bench", viewerEmail: admin.email })).length).toBeGreaterThan(0);
    expect(await saveEmailTemplate(db, admin, { name: "referral LINK", kind: "referral", subject: "x", body: "y" })).toEqual({ ok: false, reason: "A template has that name." });
    expect(await saveEmailTemplate(db, admin, { name: "New one", kind: "outreach", subject: "", body: "y" })).toEqual({ ok: false, reason: "Add a name, subject and message." });
  });
});

describe("referrals", () => {
  it("profile shares need consent on record (or a confirmation, which records it)", async () => {
    const people = (await db.select().from(experts).orderBy(asc(experts.fullName))).filter((e) => e.status !== "do_not_contact" && e.email);
    const noConsent = people.find((p) => p.cvConsent === "unknown")!;
    const withConsent = people.find((p) => p.cvConsent === "yes")!;
    const refused = await recordReferrals(db, admin, { expertIds: [noConsent.id, withConsent.id], platformId: seeded.platformId, method: "profile_share" });
    expect(refused.ok).toBe(true);
    if (!refused.ok) return;
    expect(refused.items.find((i) => i.expertId === noConsent.id)).toMatchObject({ result: "failed", why: "Needs their consent on record first" });
    expect(refused.items.find((i) => i.expertId === withConsent.id)).toMatchObject({ result: "recorded" });

    const confirmed = await recordReferrals(db, admin, { expertIds: [noConsent.id], platformId: seeded.platformId, method: "profile_share", consentConfirmed: true });
    expect(confirmed).toMatchObject({ ok: true, recorded: 1 });
    const [after] = await db.select().from(experts).where(eq(experts.id, noConsent.id));
    expect(after).toMatchObject({ cvConsent: "yes", consentSource: "recorded" });
    const lines = (await timeline(noConsent.id)).map((t) => t.summary);
    expect(lines).toEqual(expect.arrayContaining(["Consent recorded: agreed to have their profile shared", "Profile shared with Examplework"]));

    // The same person, method and place within 30 days is skipped unless repeated on purpose.
    const again = await recordReferrals(db, admin, { expertIds: [noConsent.id], platformId: seeded.platformId, method: "profile_share" });
    expect(again.ok && again.items[0]).toMatchObject({ result: "skipped" });
  });

  it("refuses do not contact, a missing link, and referral emails while email isn't set up", async () => {
    const [dnc] = await db.select().from(experts).where(eq(experts.status, "do_not_contact")).limit(1);
    const res = await recordReferrals(db, admin, { expertIds: [dnc.id], platformId: seeded.platformId, method: "link", referralUrl: "https://examplework.example.com/signup?ref=FYNO123" });
    expect(res.ok && res.items[0]).toMatchObject({ result: "skipped", why: "Do not contact" });
    expect(await recordReferrals(db, admin, { expertIds: [dnc.id], platformId: seeded.platformId, method: "link" })).toEqual({ ok: false, reason: "This method needs the referral link." });
    expect((await recordReferrals(db, admin, { expertIds: [dnc.id], platformId: seeded.platformId, method: "email", referralUrl: "https://x.example.com" })).ok).toBe(false);
  });

  it("outcome changes are logged and move the linked pipeline forward", async () => {
    const [p] = await db.select().from(applications).where(eq(applications.stage, "shortlisted")).limit(1);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, p.jobId));
    expect(job.projectId).toBe(seeded.projectId);
    const rec = await recordReferrals(db, admin, { expertIds: [p.expertId], projectId: seeded.projectId, method: "agency_form", allowRepeat: true });
    if (!rec.ok) throw new Error(rec.reason);
    const id = rec.items[0].referralId!;
    const [r] = await db.select().from(referrals).where(eq(referrals.id, id));
    expect(r).toMatchObject({ applicationId: p.id, platform: "Examplework", outcome: "sent", submittedBy: admin.email });
    await setReferralOutcome(db, admin, [id], "in_review");
    expect((await getPipeline(db, p.id))?.stage).toBe("referred");
    await setReferralOutcome(db, admin, [id], "already_member");
    const after = await getPipeline(db, p.id);
    expect(after).toMatchObject({ stage: "rejected", rejectReason: "already_on_platform" });
    const [r2] = await db.select().from(referrals).where(eq(referrals.id, id));
    expect(r2.respondedAt).toBeInstanceOf(Date);
    expect((await timeline(p.expertId)).map((t) => t.summary)).toEqual(expect.arrayContaining(["Examplework: in review", "Examplework: already a member"]));
  });
});

describe("groups", () => {
  it("adds members by email (linked to the expert with that email) and from experts, removes them", async () => {
    const g = await createGroup(db, admin, "Shortlist");
    const [a, b] = (await db.select().from(experts).orderBy(asc(experts.fullName))).filter((e) => e.email);
    const res = await addGroupMembers(db, admin, g.id, { emailsText: `${a.email!.toUpperCase()}, Newbie <new.person@example.org>`, expertIds: [b.id] });
    expect(res).toMatchObject({ ok: true, added: 3 });
    const members = await groupMembers(db, g.id);
    expect(members.find((m) => m.email === a.email)?.expertId).toBe(a.id);
    expect(members.find((m) => m.email === "new.person@example.org")?.expertId).toBeNull();
    expect(await addGroupMembers(db, admin, g.id, { emailsText: a.email! })).toMatchObject({ added: 0, already: 1 });
    expect((await groupExpertIds(db, g.id)).sort()).toEqual([a.id, b.id].sort());
    expect((await listGroups(db)).find((x) => x.id === g.id)).toMatchObject({ members: 3, linked: 2 });
    await removeGroupMembers(db, admin, g.id, [members.find((m) => m.email === a.email)!.id]);
    expect(await db.$count(referralGroupMembers, eq(referralGroupMembers.groupId, g.id))).toBe(2);
    await deleteGroup(db, admin, g.id);
    expect(await db.$count(referralGroupMembers, eq(referralGroupMembers.groupId, g.id))).toBe(0);
  });
});

describe("fees", () => {
  it("are money-only: no rows for roles without money rights", async () => {
    const rows = await listFees(db, { tab: "all" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rowsWithoutMoney("recruiter", "referral_fees", rows)).toEqual([]);
    expect(rowsWithoutMoney("viewer", "referral_fees", rows)).toEqual([]);
    expect(rowsWithoutMoney("finance", "referral_fees", rows)).toHaveLength(rows.length);
    expect(withoutMoney("pod_lead", "monthly_earnings", { a: 1 })).toBeNull();
    expect(can("finance", "fees.manage") && can("admin", "fees.manage")).toBe(true);
    expect(["recruiter", "pod_lead", "viewer"].some((r) => can(r as "viewer", "fees.manage") || can(r as "viewer", "money.read"))).toBe(false);
  });

  it("move expected -> invoiced -> paid, never back; void needs a reason", async () => {
    const [exp] = await listFees(db, { tab: "expected" });
    expect(await markFees(db, admin, [exp.id], { to: "invoiced" })).toEqual({ ok: false, reason: "Add the invoice number." });
    expect(await markFees(db, admin, [exp.id], { to: "invoiced", invoiceNumber: "FL/2026-27/010", invoicedOn: "2026-11-01" })).toMatchObject({ ok: true, changed: 1 });
    const [inv] = await db.select().from(referralFees).where(eq(referralFees.id, exp.id));
    expect(inv).toMatchObject({ status: "invoiced", invoiceNumber: "FL/2026-27/010", invoicedOn: "2026-11-01", dueOn: "2026-12-01", updatedBy: admin.email });
    expect(await markFees(db, admin, [exp.id], { to: "paid", paidOn: "2026-11-20", paidAmount: "140" })).toMatchObject({ ok: true, changed: 1 });
    const [paid] = await db.select().from(referralFees).where(eq(referralFees.id, exp.id));
    expect(paid).toMatchObject({ status: "paid", paidAmount: 140, paidOn: "2026-11-20" });
    expect(await markFees(db, admin, [exp.id], { to: "void", voidReason: "x" })).toMatchObject({ ok: true, changed: 0, skipped: ["already paid"] });
    expect(await markFees(db, admin, [exp.id], { to: "void" })).toEqual({ ok: false, reason: "Say why." });
    const s = await feeSummary(db);
    expect(s.paid.get("USD")).toBeGreaterThan(0);
    const t = await feeTotals(db);
    expect(t.byProject.some((x) => x.label.startsWith("P101"))).toBe(true);
    expect(t.byMonth.length).toBeGreaterThan(0);
    expect(t.byCompany.every((x) => x.currency.length === 3)).toBe(true);
  });

  it("one rule per project and track", async () => {
    expect(await saveFeeRule(db, admin, { projectId: seeded.projectId, amount: 100, currency: "USD", earnedAtStage: "active", paymentTermsDays: 30, active: true })).toEqual({ ok: false, reason: "That project or track already has a rule; edit it instead." });
    const track = await saveFeeRule(db, admin, { projectId: seeded.projectId, trackId: seeded.trackIds[1], amount: 200, currency: "usd", earnedAtStage: "selected", paymentTermsDays: 15, active: true });
    expect(track).toMatchObject({ ok: true });
    expect(await db.$count(projectFeeRules, eq(projectFeeRules.projectId, seeded.projectId))).toBe(2);
  });
});

describe("job radar", () => {
  it("pay is money; publish makes an internal draft job, once", async () => {
    const shown = await listRadar(db, { tab: "new", money: false });
    expect(shown[0]).toMatchObject({ title: "AI Trainer - Python", payMin: null, payMax: null });
    expect(shown[0].applyUrl).toBe("https://examplework.example.com/jobs/ai-trainer-python?ref=FYNO123");
    const res = await publishAsJob(db, admin, shown[0].id);
    expect(res).toMatchObject({ ok: true, created: true, status: "draft", visibility: "internal" });
    if (!res.ok) return;
    const [job] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(job).toMatchObject({ status: "draft", visibility: "internal", radarListingId: shown[0].id, applyUrl: "https://examplework.example.com/jobs/ai-trainer-python?ref=FYNO123", companyName: "Examplework", requireGithub: true });
    expect(job.internalRateNote).toContain("30–45/hr");
    expect(job.publishedAt).toBeNull();
    expect((await db.select().from(radarListings).where(eq(radarListings.id, shown[0].id)))[0].status).toBe("approved");
    expect(await publishAsJob(db, admin, shown[0].id)).toMatchObject({ ok: true, created: false, id: res.id });
    const pub = await listRadar(db, { tab: "published", money: true });
    expect(pub.map((p) => p.publishedJobId)).toContain(res.id);
    expect(await setRadarStatus(db, admin, [pub[0].id], "discarded")).toMatchObject({ ok: true, changed: 1 });
    const info = await scanInfo(db, false);
    expect(info.keywords).toEqual(["ai trainer", "evaluation", "annotation"]);
    expect(info.minPay).toBeNull();
    expect((await scanInfo(db, true)).minPay).toBe(25);
  });
});
