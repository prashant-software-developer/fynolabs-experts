// The talent and outreach server actions, called the way Next.js calls them, as each role (the
// session is mocked; the database is PGlite with fictional data): viewers are read-only, money is
// admins and finance only, per-section access is enforced, and the writes record who.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, desc, eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";

const state = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(public url: string) {
      super(`REDIRECT ${url}`);
    }
  }
  return { user: null as unknown, db: null as unknown, Redirect };
});

vi.mock("@/lib/auth/session", () => ({
  getAccount: async () => (state.user ? { kind: "team", user: state.user } : null),
  getCurrentUser: async () => state.user,
  requireUser: async () => {
    if (!state.user) throw new state.Redirect("/signin");
    return state.user;
  },
}));
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
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import { openTestDb } from "./fixtures/db";
import { seedTalentIfEmpty } from "./fixtures/talent-data";
import type { DB } from "@/db/client";
import { applications, emailCampaigns, expertActivities, experts, jobs, radarListings, referralFees, referralGroups, referrals } from "@/db/schema";
import type { Role } from "@/lib/auth/permissions";
import { markHandled } from "@/app/admin/applications/actions";
import { prepareCampaignAction, sendCampaignAction, approveCampaignAction } from "@/app/admin/campaigns/actions";
import { bulkExperts, movePipelineStage, saveOutreach } from "@/app/admin/experts/talent-actions";
import { markFeesAction } from "@/app/admin/fees/actions";
import { newGroup, removeGroup } from "@/app/admin/groups/actions";
import { publishRadarAction } from "@/app/admin/jobs/radar/actions";
import { saveJobPosting } from "@/app/admin/jobs/posting-actions";
import { changeReferralOutcome, recordReferralsAction } from "@/app/admin/send-referrals/actions";

let db: DB;
let client: PGlite;
let seeded: NonNullable<Awaited<ReturnType<typeof seedTalentIfEmpty>>>;

const as = (role: Role, sections: string[] = []) => {
  state.user = { accountId: "00000000-0000-4000-8000-000000000001", email: `${role}@xocket.sh`, name: role, role, partnerIds: [], roleSource: "team", blocked: false, mustChangePassword: false, sections };
};
const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
/** Runs an action and returns where it redirected to. */
async function run(fn: (fd: FormData) => Promise<void>, fd: FormData): Promise<string> {
  try {
    await fn(fd);
  } catch (e) {
    if (e instanceof state.Redirect) return decodeURIComponent(e.url);
    throw e;
  }
  return "(no redirect)";
}

beforeAll(async () => {
  ({ db, client } = await openTestDb({ demo: true }));
  state.db = db;
  seeded = (await seedTalentIfEmpty(db))!;
});
afterAll(async () => {
  await client.close();
});
beforeEach(() => {
  state.user = null;
});

describe("viewers are read-only", () => {
  it("can't move a pipeline, mark handled, prepare a campaign, refer, make a group or publish a radar role", async () => {
    as("viewer");
    const [p] = await db.select().from(applications).where(eq(applications.stage, "shortlisted")).limit(1);
    const e = (await db.select().from(experts).where(eq(experts.status, "bench")).limit(1))[0];
    const refused = /error=.*Viewer access can't/;
    expect(await run(movePipelineStage, form({ id: p.id, stage: "referred", returnTo: "/admin/experts" }))).toMatch(refused);
    expect(await run(markHandled, form({ ids: p.id, returnTo: "/admin/applications" }))).toMatch(refused);
    expect(await run(prepareCampaignAction, form({ source: "experts", expertIds: e.id, subject: "x", body: "y" }))).toMatch(refused);
    expect(await run(recordReferralsAction, form({ ids: e.id, platformId: seeded.platformId, method: "link", referralUrl: "https://examplework.example.com/signup?ref=FYNO123" }))).toMatch(refused);
    expect(await run(newGroup, form({ name: "Viewer group" }))).toMatch(refused);
    const [r] = await db.select().from(radarListings).where(eq(radarListings.status, "new")).limit(1);
    expect(await run(publishRadarAction, form({ id: r.id }))).toMatch(refused);
    expect(await run(saveOutreach, form({ id: e.id, outreachStatus: "contacted" }))).toMatch(refused);
    // Nothing changed.
    expect((await db.select().from(applications).where(eq(applications.id, p.id)))[0].stage).toBe("shortlisted");
    expect(await db.$count(referralGroups, eq(referralGroups.name, "Viewer group"))).toBe(0);
  });
});

describe("recruiters", () => {
  it("move pipelines (reject needs a reason) and the timeline records who", async () => {
    as("recruiter");
    const [p] = await db.select().from(applications).where(eq(applications.stage, "shortlisted")).limit(1);
    expect(await run(movePipelineStage, form({ id: p.id, stage: "rejected", returnTo: "/admin/experts" }))).toMatch(/error=Pick why they were rejected/);
    expect(await run(movePipelineStage, form({ id: p.id, stage: "referred", returnTo: "/admin/experts" }))).toMatch(/ok=.*Proposed to client/);
    const [row] = await db.select().from(applications).where(eq(applications.id, p.id));
    expect(row).toMatchObject({ stage: "referred", status: "submitted_to_partner" });
    const [t] = await db.select().from(expertActivities).where(and(eq(expertActivities.applicationId, p.id), eq(expertActivities.kind, "stage")));
    expect(t.createdBy).toBe("recruiter@xocket.sh");
  });

  it("can't touch fees (money), even by calling the action", async () => {
    as("recruiter");
    const [f] = await db.select().from(referralFees).where(eq(referralFees.status, "expected")).limit(1);
    expect(await run(markFeesAction, form({ ids: f.id, to: "void", voidReason: "x" }))).toMatch(/error=.*can't change fees/);
    expect((await db.select().from(referralFees).where(eq(referralFees.id, f.id)))[0].status).toBe("expected");
  });

  it("bulk: Email them makes a draft campaign without sending; Refer them opens Send referrals", async () => {
    as("recruiter");
    const picked = (await db.select().from(experts).where(eq(experts.status, "bench")).orderBy(asc(experts.fullName)).limit(3)).map((e) => e.id);
    const to = await run(bulkExperts, form({ op: "email", ids: picked, returnTo: "/admin/experts" }));
    expect(to).toMatch(/^\/admin\/campaigns\/[0-9a-f-]+\?ok=Draft ready/);
    const id = to.split("/")[3].split("?")[0];
    const [c] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id));
    expect(c).toMatchObject({ status: "draft", createdBy: "recruiter@xocket.sh" });
    // Approving needs the wording first; sending is off until email is set up.
    expect(await run(approveCampaignAction, form({ id }))).toMatch(/error=Write the subject and the message first/);
    expect(await run(bulkExperts, form({ op: "refer", ids: picked, returnTo: "/admin/experts" }))).toBe(`/admin/send-referrals?ids=${picked.join(",")}`);
  });

  it("record a referral and change its outcome", async () => {
    as("recruiter");
    const e = (await db.select().from(experts).where(eq(experts.cvConsent, "yes")).orderBy(asc(experts.fullName)).limit(1))[0];
    const to = await run(recordReferralsAction, form({ ids: e.id, platformId: seeded.platformId, method: "profile_share", allowRepeat: "yes" }));
    expect(to).toMatch(/^\/admin\/referrals\?ok=1 referral recorded/);
    const [r] = await db.select().from(referrals).where(eq(referrals.expertId, e.id)).orderBy(desc(referrals.createdAt)).limit(1);
    expect(r.submittedBy).toBe("recruiter@xocket.sh");
    expect(await run(changeReferralOutcome, form({ ids: r.id, outcome: "signed_up" }))).toMatch(/ok=Outcome changed for 1/);
    expect((await db.select().from(referrals).where(eq(referrals.id, r.id)))[0]).toMatchObject({ outcome: "signed_up", updatedBy: "recruiter@xocket.sh" });
  });

  it("publish a radar role: an internal draft job; the posting fields save", async () => {
    as("recruiter");
    const [r] = await db.select().from(radarListings).where(eq(radarListings.status, "new")).limit(1);
    const to = await run(publishRadarAction, form({ id: r.id }));
    expect(to).toMatch(/^\/admin\/jobs\/[0-9a-f-]+\?tab=details&ok=Job created as an internal draft/);
    const jobId = to.split("/")[3].split("?")[0];
    expect((await db.select().from(jobs).where(eq(jobs.id, jobId)))[0]).toMatchObject({ status: "draft", visibility: "internal" });
    expect(await run(saveJobPosting, form({ id: jobId, badge: "New role", companyName: "Examplework", applyUrl: "https://examplework.example.com/x", projectId: seeded.projectId, trackId: seeded.trackIds[0], requireGithub: "yes", payUnit: "hour" }))).toMatch(/ok=Posting details saved/);
    const [j] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    expect(j).toMatchObject({ badge: "New role", projectId: seeded.projectId, trackId: seeded.trackIds[0], requireGithub: true, payUnit: null });
  });

  it("can't delete a group (admins only)", async () => {
    as("recruiter");
    const [g] = await db.select().from(referralGroups).limit(1);
    expect(await run(removeGroup, form({ id: g.id }))).toMatch(/error=.*can't delete groups/);
  });
});

describe("per-section access", () => {
  it("a member without the module is refused on the server too", async () => {
    as("recruiter", ["contact", "profiles"]);
    const e = (await db.select().from(experts).where(eq(experts.status, "bench")).limit(1))[0];
    expect(await run(recordReferralsAction, form({ ids: e.id, platformId: seeded.platformId, method: "link", referralUrl: "https://examplework.example.com/signup?ref=FYNO123", returnTo: "/admin/send-referrals" }))).toMatch(/error=You don't have access to Send referrals/);
    const [r] = await db.select().from(radarListings).limit(1);
    expect(await run(publishRadarAction, form({ id: r.id }))).toMatch(/error=You don't have access to Job radar/);
    // Experts is in their list.
    expect(await run(saveOutreach, form({ id: e.id, outreachStatus: "replied" }))).toMatch(/ok=Saved/);
  });
});

describe("finance and admins", () => {
  it("finance marks fees; sending a campaign says email isn't set up", async () => {
    as("finance");
    const [f] = await db.select().from(referralFees).where(eq(referralFees.status, "expected")).limit(1);
    expect(await run(markFeesAction, form({ ids: f.id, to: "invoiced", invoiceNumber: "FL/2026-27/011", returnTo: "/admin/fees" }))).toMatch(/ok=1 marked invoiced/);
    expect((await db.select().from(referralFees).where(eq(referralFees.id, f.id)))[0]).toMatchObject({ status: "invoiced", updatedBy: "finance@xocket.sh" });
    as("admin");
    const picked = (await db.select().from(experts).where(eq(experts.status, "bench")).orderBy(asc(experts.fullName)).limit(2)).map((e) => e.id);
    const to = await run(prepareCampaignAction, form({ source: "experts", expertIds: picked.join(","), name: "Hello", kind: "update", subject: "News", body: "Hi {{first_name}}" }));
    const id = to.split("/")[3].split("?")[0];
    expect(await run(approveCampaignAction, form({ id }))).toMatch(/ok=Approved/);
    expect(await run(sendCampaignAction, form({ id }))).toMatch(/error=Email isn't set up yet/);
  });
});
