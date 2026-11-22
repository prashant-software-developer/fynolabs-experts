// Server actions and API routes, called the way Next.js calls them, as each role. The session is
// mocked (no Google), the database is a real in-memory PGlite with the demo data.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
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

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => state.user,
  requireUser: async () => {
    const u = state.user as { blocked?: boolean } | null;
    if (!u) throw new state.Redirect("/signin");
    if (u.blocked) throw new state.Redirect("/no-access");
    return u;
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

import { openLocalDbWithClient } from "@/db/local/open";
import { rowsOf, type DB } from "@/db/client";
import { experts, partners, placements, requirements, submissions, teamMembers } from "@/db/schema";
import type { Role } from "@/lib/auth/permissions";
import { deleteExpert, recordConsent, saveExpert, setExpertStatus } from "@/app/(app)/experts/actions";
import { previewCsvImport, runJobsSync } from "@/app/(app)/import/actions";
import { savePlacement, savePlacementProgress } from "@/app/(app)/placements/actions";
import { savePartner } from "@/app/(app)/partners/actions";
import { saveRequirement, shortlist, updateSubmission } from "@/app/(app)/requirements/actions";
import { addTeamMember } from "@/app/(app)/settings/team/actions";
import { GET as exportExperts } from "@/app/api/experts/export/route";
import { GET as downloadFile } from "@/app/api/files/[id]/route";
import { GET as exportPlacements } from "@/app/api/placements/export/route";
import { GET as exportRoster } from "@/app/api/requirements/[id]/roster/route";

let db: DB;
let client: PGlite;
let acme: string;
let northwind: string;

const as = (role: Role, partnerIds: string[] = []) => {
  state.user = { email: `${role}@xocket.sh`, name: role, devBypass: false, role, partnerIds, roleSource: "team", blocked: false };
};
const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
/** Runs a redirecting action and returns where it sent the person. */
async function landing(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof state.Redirect) return decodeURIComponent(e.url);
    throw e;
  }
  throw new Error("expected a redirect");
}
const anExpert = async () => (await db.select().from(experts).limit(1))[0];

beforeAll(async () => {
  ({ db, client } = await openLocalDbWithClient({ seed: true }));
  state.db = db;
  const ps = await db.select().from(partners);
  acme = ps.find((p) => p.name.startsWith("Acme"))!.id;
  northwind = ps.find((p) => p.name.startsWith("Northwind"))!.id;
});
afterAll(async () => {
  await client.close();
});
beforeEach(() => {
  state.user = null;
});

describe("server actions refuse forbidden roles", () => {
  it("delete on request: admin only; the expert stays otherwise", async () => {
    const e = await anExpert();
    for (const role of ["viewer", "recruiter", "pod_lead", "finance"] as Role[]) {
      as(role);
      const to = await landing(deleteExpert(form({ id: e.id, confirm: "DELETE" })));
      expect(to).toMatch(/error=.*can't delete experts/);
    }
    expect(await db.select({ id: experts.id }).from(experts).where(eq(experts.id, e.id))).toHaveLength(1);
    as("admin");
    expect(await landing(deleteExpert(form({ id: e.id, confirm: "DELETE" })))).toMatch(/^\/experts\?ok=Expert deleted/);
    expect(await db.select({ id: experts.id }).from(experts).where(eq(experts.id, e.id))).toHaveLength(0);
  });

  it("viewers and finance can't add or edit experts (form shows the reason)", async () => {
    as("viewer");
    const before = await db.$count(experts);
    expect(await saveExpert({}, form({ fullName: "New Person" }))).toMatchObject({ message: "Viewer access can't add experts. Ask an admin if you need this." });
    as("finance");
    const e = await anExpert();
    expect((await saveExpert({}, form({ id: e.id, fullName: "Renamed" }))).message).toMatch(/can't edit experts/);
    expect(await db.$count(experts)).toBe(before);
  });

  it("recruiters edit experts but never change the rate expectation (money)", async () => {
    const e = await anExpert();
    await db.update(experts).set({ rateExpectationUsd: 40 }).where(eq(experts.id, e.id));
    as("recruiter");
    const to = await landing(saveExpert({}, form({ id: e.id, fullName: `${e.fullName} Jr`, email: e.email ?? "", rateExpectationUsd: "999", availability: e.availability, status: e.status, cvConsent: e.cvConsent })));
    expect(to).toMatch(/ok=Saved/);
    const [after] = await db.select().from(experts).where(eq(experts.id, e.id));
    expect(after.fullName).toBe(`${e.fullName} Jr`);
    expect(after.rateExpectationUsd).toBe(40);
  });

  it("CV consent and board status changes: editors only, and logged with the actor's role", async () => {
    const e = await anExpert();
    as("pod_lead", [acme]);
    expect(await landing(recordConsent(form({ id: e.id, consent: "no" })))).toMatch(/error=.*can't edit experts/);
    expect(await landing(setExpertStatus(form({ id: e.id, status: "inactive", returnTo: "/experts?layout=board" })))).toMatch(/^\/experts\?layout=board&error=/);
    as("recruiter");
    const next = e.cvConsent === "no" ? "yes" : "no";
    expect(await landing(recordConsent(form({ id: e.id, consent: next })))).toMatch(/ok=CV consent recorded/);
    const [after] = await db.select().from(experts).where(eq(experts.id, e.id));
    expect(after.cvConsent).toBe(next);
    expect(after.cvConsentAt).toBeInstanceOf(Date);
    const [log] = rowsOf<{ actor_role: string; action: string }>(
      await db.execute(sql`select actor_role, action from hub.activity where entity_id = ${e.id} order by created_at desc limit 1`),
    );
    expect(log).toEqual({ actor_role: "recruiter", action: "cv_consent_recorded" });
  });

  it("imports: CSV for recruiters and admins, jobs sync for admins", async () => {
    as("recruiter");
    expect(await runJobsSync(true)).toEqual({ ok: false, message: "Recruiter access can't run the jobs-site sync. Ask an admin if you need this." });
    expect((await previewCsvImport("auto", "Name\nX", "review")).ok).not.toBe(undefined);
    as("finance");
    expect(await previewCsvImport("auto", "Name\nX", "review")).toMatchObject({ ok: false, message: expect.stringMatching(/can't import/) });
    as("admin");
    expect(await runJobsSync(true)).toMatchObject({ ok: true, dryRun: true });
  });

  it("partners and new partners typed into a requirement: admins only", async () => {
    as("recruiter");
    expect(await landing(savePartner(form({ name: "Sneaky Co", kind: "agency" })))).toMatch(/error=.*can't add or edit partners/);
    const res = await saveRequirement({}, form({ partnerId: "new", newPartner: "Sneaky Co", title: "Anything", slots: "1", status: "open" }));
    expect(res.message).toMatch(/can't add or edit partners/);
    expect(await db.select().from(partners).where(eq(partners.name, "Sneaky Co"))).toHaveLength(0);
  });

  it("shortlisting: recruiters and admins, not pod leads or viewers", async () => {
    const [req] = await db.select().from(requirements).limit(1);
    const e = await anExpert();
    as("viewer");
    expect(await landing(shortlist(form({ requirementId: req.id, one: e.id })))).toMatch(/error=.*can't shortlist/);
    as("pod_lead", [req.partnerId]);
    expect(await landing(shortlist(form({ requirementId: req.id, one: e.id })))).toMatch(/error=.*can't shortlist/);
  });

  it("team & access: admins only", async () => {
    as("recruiter");
    expect(await landing(addTeamMember(form({ email: "new@xocket.sh", role: "admin" })))).toMatch(/error=.*can't manage team/);
    expect(await db.select().from(teamMembers).where(eq(teamMembers.email, "new@xocket.sh"))).toHaveLength(0);
    as("admin");
    expect(await landing(addTeamMember(form({ email: "new@xocket.sh", role: "recruiter" })))).toMatch(/ok=Team member added/);
  });
});

describe("pod-lead partner scoping", () => {
  it("submission status: only for their partners", async () => {
    const rows = await db
      .select({ id: submissions.id, status: submissions.status, partnerId: requirements.partnerId })
      .from(submissions)
      .innerJoin(requirements, eq(requirements.id, submissions.requirementId));
    const acmeSub = rows.find((r) => r.partnerId === acme && r.status === "partner_review")!;
    const nwSub = rows.find((r) => r.partnerId === northwind)!;
    as("pod_lead", [acme]);
    expect(await landing(updateSubmission(form({ id: nwSub.id, to: "withdrawn", returnTo: "/submissions" })))).toMatch(/error=.*outside your pods/);
    expect((await db.select().from(submissions).where(eq(submissions.id, nwSub.id)))[0].status).toBe(nwSub.status);
    expect(await landing(updateSubmission(form({ id: acmeSub.id, to: "rejected", returnTo: "/submissions" })))).toMatch(/ok=Submission updated/);
    expect((await db.select().from(submissions).where(eq(submissions.id, acmeSub.id)))[0].status).toBe("rejected");
  });

  it("placements: progress (hours, tasks, status) in scope; money and full edits never", async () => {
    const [p] = await db.select().from(placements).where(eq(placements.partnerId, acme));
    as("pod_lead", [northwind]);
    expect(await landing(savePlacementProgress(form({ id: p.id, hoursApproved: "50", tasksAccepted: "", status: "active" })))).toMatch(/error=.*outside your pods/);
    as("pod_lead", [acme]);
    expect(await landing(savePlacementProgress(form({ id: p.id, hoursApproved: "50", tasksAccepted: "", status: "active" })))).toMatch(/ok=Saved/);
    const [after] = await db.select().from(placements).where(eq(placements.id, p.id));
    expect(after.hoursApproved).toBe(50);
    expect(after.rateToExpert).toBe(p.rateToExpert);
    expect(after.earnedByExpert).toBe(50 * p.rateToExpert!); // recomputed from the new hours
    const full = await savePlacement({}, form({ id: p.id, partnerId: acme, projectName: "X", basis: "hourly", rateToExpert: "1", currency: "USD", status: "active" }));
    expect(full.message).toMatch(/can't edit placements/);
    expect(await landing(savePlacementProgress(form({ id: p.id, hoursApproved: "-3", status: "active" })))).toMatch(/error=Hours approved/);
  });
});

describe("API routes refuse forbidden roles", () => {
  const get = (url: string) => new NextRequest(new URL(url, "http://localhost"));

  it("experts CSV: recruiters (no rate column) and admins (with it); viewers 403; signed out 401", async () => {
    expect((await exportExperts(get("/api/experts/export"))).status).toBe(401);
    as("viewer");
    const denied = await exportExperts(get("/api/experts/export"));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "Viewer access can't export experts. Ask an admin if you need this." });
    as("pod_lead", [acme]);
    expect((await exportExperts(get("/api/experts/export"))).status).toBe(403);
    as("recruiter");
    const rec = await exportExperts(get("/api/experts/export"));
    expect(rec.status).toBe(200);
    expect((await rec.text()).split("\n")[0]).not.toMatch(/Rate expectation/);
    as("admin");
    expect((await (await exportExperts(get("/api/experts/export"))).text()).split("\n")[0]).toMatch(/Rate expectation/);
  });

  it("CV download: viewers and finance 403", async () => {
    const [f] = rowsOf<{ id: string }>(await db.execute(sql`select id from hub.expert_files limit 1`));
    const id = f?.id ?? "00000000-0000-0000-0000-000000000000";
    for (const role of ["viewer", "finance"] as Role[]) {
      as(role);
      expect((await downloadFile(get(`/api/files/${id}`), { params: Promise.resolve({ id }) })).status).toBe(403);
    }
    as("recruiter");
    expect((await downloadFile(get(`/api/files/${id}`), { params: Promise.resolve({ id }) })).status).not.toBe(403);
  });

  it("roster export: recruiters and admins only", async () => {
    const [req] = await db.select().from(requirements).limit(1);
    const ctx = { params: Promise.resolve({ id: req.id }) };
    for (const role of ["viewer", "finance", "pod_lead"] as Role[]) {
      as(role, [req.partnerId]);
      expect((await exportRoster(get(`/api/requirements/${req.id}/roster`), ctx)).status).toBe(403);
    }
    as("recruiter");
    expect((await exportRoster(get(`/api/requirements/${req.id}/roster`), { params: Promise.resolve({ id: req.id }) })).status).toBe(200);
  });

  it("placements CSV: finance and admins only", async () => {
    for (const role of ["viewer", "recruiter", "pod_lead"] as Role[]) {
      as(role, [acme]);
      expect((await exportPlacements(get("/api/placements/export"))).status).toBe(403);
    }
    as("finance");
    const res = await exportPlacements(get("/api/placements/export"));
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^Expert,Project,Partner,Status.*Earned by expert,Revenue,Margin/);
  });
});

describe("inactive members", () => {
  it("are sent to the no-access page by every guarded action", async () => {
    state.user = { email: "gone@xocket.sh", name: "Gone", devBypass: false, role: "viewer", partnerIds: [], roleSource: "team", blocked: true };
    const e = await anExpert();
    expect(await landing(recordConsent(form({ id: e.id, consent: "yes" })))).toBe("/no-access");
    expect((await exportExperts(new NextRequest("http://localhost/api/experts/export"))).status).toBe(403);
  });
});
