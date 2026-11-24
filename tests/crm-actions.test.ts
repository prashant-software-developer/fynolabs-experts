// The CRM and operations screens' server actions and reads, called the way Next.js calls them, as
// each role: companies (stage changes log activity), contacts, the calendar (mark done logs on the
// company), platforms, projects (tracks, team, money-only fee rules), messages (handled, drafts,
// replies without email), analytics, my work, settings, per-section access and viewer masking.
// The session is mocked; the database is an in-memory PGlite with the fictional test data.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
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
      return u ? { kind: "team", user: u } : null;
    },
    getCurrentUser: async () => state.user,
    requireUser: async () => {
      const u = state.user as U;
      if (!u) throw new state.Redirect("/signin");
      if (u.blocked) throw new state.Redirect("/no-access");
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
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import { openTestDb } from "./fixtures/db";
import { seedCrm } from "./fixtures/crm-data";
import type { DB } from "@/db/client";
import { activity, calendarEvents, companyActivities, contacts, experts, expertActivities, jobs, messageReplies, messages, partners, platforms, projectFeeRules, projectMembers, projectTracks, projects, replyDrafts, settings } from "@/db/schema";
import type { Role } from "@/lib/auth/permissions";
import { addDays, todayIST } from "@/lib/crm/dates";
import { createAccount, logAccountActivity, removeAccount, saveAccount, setAccountStage } from "@/app/admin/accounts/actions";
import { removeLead, saveLead } from "@/app/admin/leads/actions";
import { markCalendarEventDone, removeCalendarEvent, saveCalendarEvent } from "@/app/admin/calendar/actions";
import { removePlatform, savePlatformForm } from "@/app/admin/platforms/actions";
import { createProjectForm, linkRolesForm, saveFeesForm, saveTeamForm, saveTracksForm } from "@/app/admin/projects/actions";
import { removeMessage, replyToMessage, setMessageHandled } from "@/app/admin/messages/actions";
import { saveEmailReplySettings } from "@/app/admin/settings/actions";
import { markProspectContacted } from "@/app/admin/my-work/actions";
import PartnersPage from "@/app/admin/partners/page";
import { getCompany } from "@/lib/server/companies";
import { allContacts, visibleContact } from "@/lib/server/contacts";
import { timeline } from "@/lib/server/calendar";
import { platformLinks } from "@/lib/server/platforms";
import { funnelFor, projectParts } from "@/lib/server/projects";
import { getMessage, listMessages } from "@/lib/server/messages";
import { visitorAnalytics } from "@/lib/server/analytics";
import { myWork } from "@/lib/server/my-work";
import { crmDashboard } from "@/lib/server/crm-dashboard";
import { replySettings } from "@/lib/server/reply-settings";

let db: DB;
let client: PGlite;
let fx: Awaited<ReturnType<typeof seedCrm>>;
const today = todayIST();

const as = (role: Role, extra: Record<string, unknown> = {}) => {
  state.user = { accountId: "00000000-0000-4000-8000-000000000001", email: `${role}@xocket.sh`, name: role, role, partnerIds: [], roleSource: "team", blocked: false, mustChangePassword: false, sections: [], ...extra };
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

beforeAll(async () => {
  ({ db, client } = await openTestDb({ demo: true }));
  state.db = db;
  fx = await seedCrm(db, today);
});
afterAll(async () => {
  await client.close();
});
beforeEach(() => {
  state.user = null;
});

describe("accounts", () => {
  it("recruiters add accounts (who and when recorded); viewers and finance can't; names are unique", async () => {
    for (const role of ["viewer", "finance", "pod_lead"] as Role[]) {
      as(role);
      expect(await landing(createAccount(form({ name: "Blocked Co (demo)" })))).toMatch(/error=.*can't change accounts/);
    }
    as("recruiter");
    const to = await landing(createAccount(form({ name: "New Partner (demo)", kind: "agency", stage: "contacted", website: "www.example.net/x", returnTo: "/admin/accounts" })));
    expect(to).toMatch(/^\/admin\/accounts\/[0-9a-f-]{36}\?ok=Account added/);
    const [row] = await db.select().from(partners).where(eq(partners.name, "New Partner (demo)"));
    expect(row).toMatchObject({ kind: "agency", stage: "contacted", createdBy: "recruiter@xocket.sh", updatedBy: "recruiter@xocket.sh", domain: "example.net", website: "https://www.example.net/x" });
    expect(await landing(createAccount(form({ name: "new partner (DEMO)", returnTo: "/admin/accounts" })))).toMatch(/error=new partner \(DEMO\) is already an account/);
    expect(await db.select().from(activity).where(and(eq(activity.entityType, "partner"), eq(activity.entityId, row.id)))).toHaveLength(1);
  });

  it("a stage change logs a 'stage' activity (Talking → Pilot), moves stage_changed_at and last activity, and sets updated_by", async () => {
    as("recruiter");
    const before = await getCompany(db, fx.northwind.id);
    expect(before!.stage).toBe("talking");
    const to = await landing(saveAccount(form({ id: fx.northwind.id, stage: "pilot", nextStep: "Sign the pilot", nextStepDue: addDays(today, 2), owner: "other", ownerName: "Nitin (no login)", returnTo: `/admin/accounts/${fx.northwind.id}` })));
    expect(to).toMatch(/ok=Account saved\. Stage change logged/);
    const after = (await getCompany(db, fx.northwind.id))!;
    expect(after).toMatchObject({ stage: "pilot", nextStep: "Sign the pilot", ownerTeamMemberId: null, ownerName: "Nitin (no login)", updatedBy: "recruiter@xocket.sh" });
    expect(after.stageChangedAt.getTime()).toBeGreaterThan(before!.stageChangedAt.getTime());
    expect(after.lastActivityAt!.getTime()).toBeGreaterThan(before!.lastActivityAt!.getTime());
    const log = await db.select().from(companyActivities).where(and(eq(companyActivities.companyId, fx.northwind.id), eq(companyActivities.kind, "stage")));
    expect(log.map((l) => l.summary)).toContain("Talking → Pilot");
    expect(log.find((l) => l.summary === "Talking → Pilot")!.createdBy).toBe("recruiter@xocket.sh");
    // Saving without a stage change logs no stage activity.
    await landing(saveAccount(form({ id: fx.northwind.id, bestRoute: "A new route", returnTo: "/admin/accounts" })));
    expect(await db.select().from(companyActivities).where(and(eq(companyActivities.companyId, fx.northwind.id), eq(companyActivities.kind, "stage")))).toHaveLength(log.length);
  });

  it("the board's stage select and the activity log", async () => {
    as("admin");
    expect(await landing(setAccountStage(form({ id: fx.umbrella.id, stage: "drafted", returnTo: "/admin/accounts?layout=board" })))).toMatch(/layout=board.*ok=Umbrella Staffing \(demo\): Drafted/);
    expect(await landing(setAccountStage(form({ id: fx.umbrella.id, stage: "nope" })))).toMatch(/error=Pick a stage/);
    const old = new Date(Date.now() - 30 * 86_400_000);
    await db.update(partners).set({ lastActivityAt: null }).where(eq(partners.id, fx.umbrella.id));
    expect(await landing(logAccountActivity(form({ companyId: fx.umbrella.id, kind: "email", summary: "  ", returnTo: `/admin/accounts/${fx.umbrella.id}?tab=activity` })))).toMatch(/error=Write what happened/);
    expect(await landing(logAccountActivity(form({ companyId: fx.umbrella.id, kind: "call", summary: "Intro call", detail: "Good fit", date: old.toISOString().slice(0, 10), time: "10:00" })))).toMatch(/ok=Logged/);
    const [a] = await db.select().from(companyActivities).where(and(eq(companyActivities.companyId, fx.umbrella.id), eq(companyActivities.summary, "Intro call")));
    expect(a).toMatchObject({ kind: "call", detail: "Good fit", createdBy: "admin@xocket.sh" });
    expect((await getCompany(db, fx.umbrella.id))!.lastActivityAt!.getTime()).toBe(a.happenedAt.getTime());
    // A contact from another company can't be attached.
    expect(await landing(logAccountActivity(form({ companyId: fx.umbrella.id, kind: "note", summary: "x", contactId: fx.people[0].id })))).toMatch(/error=That person isn't at this account/);
  });

  it("delete is admin only, and refused while requirements point at the company", async () => {
    as("recruiter");
    expect(await landing(removeAccount(form({ id: fx.hooli.id })))).toMatch(/error=.*can't delete records/);
    as("admin");
    expect(await landing(removeAccount(form({ id: fx.acme.id })))).toMatch(/error=.*has requirements or placements/);
    expect(await landing(removeAccount(form({ id: fx.hooli.id })))).toMatch(/^\/admin\/accounts\?ok=Hooli Talent \(demo\) deleted/);
    // Its people stay, without an account.
    const [hana] = await db.select().from(contacts).where(eq(contacts.name, "Hana Stubbs"));
    expect(hana.companyId).toBeNull();
  });

  it("per-section access: a member limited to Messages can't change accounts; FynoLabs 'leads' opens them", async () => {
    as("recruiter", { sections: ["contact"] });
    expect(await landing(createAccount(form({ name: "Section Co (demo)" })))).toMatch(/error=You don't have access to Accounts/);
    as("recruiter", { sections: ["leads"] });
    expect(await landing(createAccount(form({ name: "Section Co (demo)" })))).toMatch(/ok=Account added/);
  });

  it("the old Partners page sends people to Accounts", async () => {
    expect(await landing(PartnersPage({ searchParams: Promise.resolve({}) }))).toBe("/admin/accounts");
    expect(await landing(PartnersPage({ searchParams: Promise.resolve({ edit: fx.acme.id }) }))).toBe(`/admin/accounts?view=${fx.acme.id}`);
  });
});

describe("leads (contacts)", () => {
  it("create, edit and link to an account (the company text follows); viewers can't; delete is admin only", async () => {
    as("viewer");
    expect(await landing(saveLead(form({ name: "Nope" })))).toMatch(/error=.*can't change accounts/);
    as("recruiter");
    expect(await landing(saveLead(form({ name: "", returnTo: "/admin/leads?new=1" })))).toMatch(/error=Add a name/);
    expect(await landing(saveLead(form({ name: "Bad Email", email: "not-an-email" })))).toMatch(/error=That email address doesn't look right/);
    const to = await landing(saveLead(form({ name: "Quinn Example", email: "Quinn@Example.com", stage: "contacted", kind: "partner", source: "event", nextFollowUp: addDays(today, 1), returnTo: "/admin/leads?new=1" })));
    expect(to).toMatch(/view=[0-9a-f-]{36}.*ok=Lead added/);
    expect(to).not.toMatch(/new=1/);
    const [q] = await db.select().from(contacts).where(eq(contacts.name, "Quinn Example"));
    expect(q).toMatchObject({ email: "quinn@example.com", stage: "contacted", kind: "partner", source: "event", companyId: null, createdBy: "recruiter@xocket.sh" });
    await landing(saveLead(form({ id: q.id, companyId: fx.vandelay.id, stage: "call" })));
    const [linked] = await db.select().from(contacts).where(eq(contacts.id, q.id));
    expect(linked).toMatchObject({ companyId: fx.vandelay.id, company: fx.vandelay.name, stage: "call", updatedBy: "recruiter@xocket.sh" });
    expect(await landing(removeLead(form({ id: q.id })))).toMatch(/error=.*can't delete records/);
    as("admin");
    expect(await landing(removeLead(form({ id: q.id, returnTo: `/admin/leads?view=${q.id}` })))).toMatch(/^\/admin\/leads\?ok=Quinn Example deleted/);
  });

  it("viewers get emails masked", async () => {
    const all = await allContacts(db);
    const withEmail = all.find((c) => c.email)!;
    expect(visibleContact("viewer", withEmail).email).toMatch(/^.•••@/);
    expect(visibleContact("recruiter", withEmail).email).toBe(withEmail.email);
  });
});

describe("calendar", () => {
  it("adds an event in India time; refuses an end before the start; someone new joins Leads at Call booked", async () => {
    as("recruiter");
    expect(await landing(saveCalendarEvent(form({ title: "Bad", kind: "call", status: "planned", eventDate: today, startTime: "15:00", endTime: "14:00" })))).toMatch(/error=The end time is before the start/);
    expect(await landing(saveCalendarEvent(form({ title: "", kind: "call", status: "planned" })))).toMatch(/error=Add a title/);
    const to = await landing(
      saveCalendarEvent(form({ title: "Demo call with Initech", kind: "call", status: "planned", eventDate: addDays(today, 2), startTime: "16:00", endTime: "16:30", companyId: fx.initech.id, contactIds: [fx.people[2].id], newName: "Rae Newperson", newEmail: "rae@example.org", meetingUrl: "meet.example.com/abc", returnTo: "/admin/calendar?new=1" })),
    );
    expect(to).toMatch(/event=[0-9a-f-]{36}.*ok=Event added/);
    const [e] = await db.select().from(calendarEvents).where(eq(calendarEvents.title, "Demo call with Initech"));
    expect(e).toMatchObject({ timezone: "Asia/Kolkata", startTime: "16:00:00", endTime: "16:30:00", meetingUrl: "https://meet.example.com/abc", createdBy: "recruiter@xocket.sh" });
    const [rae] = await db.select().from(contacts).where(eq(contacts.name, "Rae Newperson"));
    expect(rae).toMatchObject({ stage: "call", source: "other", companyId: fx.initech.id, kind: "partner" });
    expect(e.contactIds).toEqual([fx.people[2].id, rae.id]);
    // Times without a date are dropped (an event waiting for a slot).
    await landing(saveCalendarEvent(form({ id: e.id, title: e.title, kind: "call", status: "waiting", eventDate: "", startTime: "10:00", companyId: fx.initech.id })));
    const [undated] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, e.id));
    expect(undated).toMatchObject({ eventDate: null, startTime: null, status: "waiting" });
  });

  it("marking a call with a company done logs it on the company, at the event's India time", async () => {
    const [call] = await db.select().from(calendarEvents).where(eq(calendarEvents.title, "Weekly sync with Acme"));
    as("viewer");
    expect(await landing(markCalendarEventDone(form({ id: call.id })))).toMatch(/error=.*can't change accounts/);
    as("recruiter");
    expect(await landing(markCalendarEventDone(form({ id: call.id, returnTo: "/admin/calendar" })))).toMatch(/ok=Marked done\. Logged on the account too/);
    const [logged] = await db.select().from(companyActivities).where(and(eq(companyActivities.companyId, fx.acme.id), eq(companyActivities.summary, "Weekly sync with Acme")));
    expect(logged).toMatchObject({ kind: "call", contactId: fx.people[0].id, createdBy: "recruiter@xocket.sh" });
    expect(logged.happenedAt.toISOString()).toBe(new Date(`${today}T15:00:00+05:30`).toISOString());
    // Done twice logs once.
    await landing(markCalendarEventDone(form({ id: call.id })));
    expect(await db.select().from(companyActivities).where(eq(companyActivities.summary, "Weekly sync with Acme"))).toHaveLength(1);
    // A task (not a call or meeting) logs nothing.
    const [task] = await db.select().from(calendarEvents).where(eq(calendarEvents.title, "Send the referral agreement"));
    expect(await landing(markCalendarEventDone(form({ id: task.id })))).toMatch(/ok=Marked done\.$/);
  });

  it("the timeline adds next steps, follow-ups and job closing dates, read only; undated events on request", async () => {
    const items = await timeline(db, { from: today, to: addDays(today, 40), today, undated: true });
    const sources = new Set(items.map((i) => i.source));
    expect(sources).toEqual(new Set(["calendar", "company", "contact", "job"]));
    expect(items.some((i) => i.source === "company" && i.title === "Proposal call")).toBe(true);
    expect(items.some((i) => i.source === "contact" && i.title === "Follow up Gus Placeholder")).toBe(true);
    expect(items.some((i) => i.source === "job" && i.title.endsWith("closes"))).toBe(true);
    expect(items.filter((i) => !i.date).length).toBeGreaterThan(0);
    expect(items.at(-1)!.date).toBeNull();
    const kinds = await timeline(db, { from: today, to: addDays(today, 40), today, kind: "deadlines" });
    expect(kinds.every((i) => i.kind === "deadline")).toBe(true);
    // A company with an event that day doesn't show its next step twice.
    const overdue = await timeline(db, { from: today, to: today, today, overdue: true });
    expect(overdue.some((i) => i.date! < today && i.status === "planned")).toBe(true);
    expect(overdue.every((i) => !i.date || i.date >= today || (i.status !== "done" && i.status !== "cancelled"))).toBe(true);
  });

  it("delete is admin only", async () => {
    const [e] = await db.select().from(calendarEvents).where(eq(calendarEvents.title, "Follow up Vandelay proposal"));
    as("recruiter");
    expect(await landing(removeCalendarEvent(form({ id: e.id })))).toMatch(/error=.*can't delete records/);
    as("admin");
    expect(await landing(removeCalendarEvent(form({ id: e.id })))).toMatch(/ok=Event deleted/);
  });
});

describe("platforms", () => {
  it("recruiters save platforms with reference links; viewers can't; delete is admin only", async () => {
    as("viewer");
    expect(await landing(savePlatformForm(form({ name: "X" })))).toMatch(/error=.*can't add or edit platforms/);
    as("recruiter");
    expect(await landing(savePlatformForm(form({ name: "", kind: "platform", status: "active" })))).toMatch(/error=Give this platform a name first/);
    const to = await landing(
      savePlatformForm(form({ name: "Newhub (demo)", kind: "both", status: "paused", domain: "www.example.net", referralUrl: "example.net/r/abc", refLabel: ["Docs", "", "Blank"], refUrl: ["example.net/docs", "https://example.net/pay", ""], notes: "Weekly pay" })),
    );
    expect(to).toMatch(/^\/admin\/platforms\/[0-9a-f-]{36}\?ok=Saved/);
    const [p] = await db.select().from(platforms).where(eq(platforms.name, "Newhub (demo)"));
    expect(p).toMatchObject({ kind: "both", status: "paused", domain: "example.net", websiteUrl: "https://example.net", referralUrl: "https://example.net/r/abc", updatedBy: "recruiter@xocket.sh" });
    expect(p.referenceLinks).toEqual([
      { label: "Docs", url: "https://example.net/docs" },
      { label: "example.net", url: "https://example.net/pay" },
    ]);
    expect(await landing(removePlatform(form({ id: p.id })))).toMatch(/error=.*can't delete records/);
    as("admin");
    expect(await landing(removePlatform(form({ id: p.id })))).toMatch(/^\/admin\/platforms\?ok=Platform deleted/);
  });

  it("referrals through a platform: counts by outcome and people (emails masked for viewers)", async () => {
    const links = await platformLinks(db, fx.gridwork, "viewer");
    expect(Object.values(links.outcomes).reduce((n, v) => n + v, 0)).toBe(5);
    expect(links.outcomes.active).toBe(1);
    expect(links.people).toHaveLength(5);
    expect(links.people.every((r) => !r.email || r.email.includes("•••"))).toBe(true);
    expect(links.companies.map((c) => c.id)).toContain(fx.globex.id);
    expect(links.projects.map((x) => x.code)).toContain("P101");
  });
});

describe("projects", () => {
  it("create (code normalised, unique), tracks, team (no one twice), linked roles", async () => {
    as("viewer");
    expect(await landing(createProjectForm(form({ code: "P900", name: "X" })))).toMatch(/error=.*can't add or edit projects/);
    as("recruiter");
    expect(await landing(createProjectForm(form({ code: "p101", name: "Dup" })))).toMatch(/error=The code P101 is taken/);
    const to = await landing(createProjectForm(form({ code: " p-900 ", name: "New project (demo)", kind: "bench", companyId: fx.acme.id, targetCount: "7", countries: "us, gb, Germany" })));
    expect(to).toMatch(/^\/admin\/projects\?view=[0-9a-f-]{36}.*ok=Project added/);
    const [p] = await db.select().from(projects).where(eq(projects.code, "P-900"));
    expect(p).toMatchObject({ status: "planned", kind: "bench", targetCount: 7, countries: ["US", "GB"], createdBy: "recruiter@xocket.sh" });

    expect(await landing(saveTracksForm(form({ projectId: p.id, rowId: ["", ""], name: ["Coding", "Maths"], targetCount: ["5", ""] })))).toMatch(/ok=Tracks saved/);
    const tracks = await db.select().from(projectTracks).where(eq(projectTracks.projectId, p.id));
    expect(tracks.map((t) => [t.name, t.targetCount, t.position]).sort()).toEqual([
      ["Coding", 5, 0],
      ["Maths", null, 1],
    ]);
    const coding = tracks.find((t) => t.name === "Coding")!;
    const maths = tracks.find((t) => t.name === "Maths")!;
    await landing(saveTracksForm(form({ projectId: p.id, rowId: [coding.id, maths.id, ""], name: ["Coding", "Maths", ""], targetCount: ["6", "", ""], remove: [maths.id] })));
    expect((await db.select().from(projectTracks).where(eq(projectTracks.projectId, p.id))).map((t) => [t.name, t.targetCount])).toEqual([["Coding", 6]]);

    expect(await landing(saveTeamForm(form({ projectId: p.id, rowId: ["", ""], teamMemberId: [fx.rhea.id, fx.rhea.id], role: ["lead", "recruiter"], capacity: ["", ""], active: ["active", "active"] })))).toMatch(/error=Someone is on the team twice/);
    expect(await landing(saveTeamForm(form({ projectId: p.id, rowId: ["", ""], teamMemberId: [fx.rhea.id, ""], role: ["lead", "recruiter"], capacity: ["8", ""], active: ["paused", "active"] })))).toMatch(/ok=Team saved/);
    expect(await db.select({ role: projectMembers.role, capacity: projectMembers.capacity, active: projectMembers.active }).from(projectMembers).where(eq(projectMembers.projectId, p.id))).toEqual([{ role: "lead", capacity: 8, active: false }]);

    const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.slug, "rust-systems-engineer"));
    expect(await landing(linkRolesForm(form({ projectId: p.id, jobIds: [job.id] })))).toMatch(/ok=1 role linked to P-900/);
    expect((await db.select({ projectId: jobs.projectId }).from(jobs).where(eq(jobs.id, job.id)))[0].projectId).toBe(p.id);
  });

  it("fee rules are money: only admins and finance see or change them", async () => {
    const rules = { projectId: fx.p101.id, rowId: [""], trackId: [""], amount: ["120"], currency: ["usd"], earnedAtStage: ["signed"], paymentTermsDays: ["45"], active: ["on"], notes: [""] };
    for (const role of ["recruiter", "viewer", "pod_lead"] as Role[]) {
      as(role);
      expect(await landing(saveFeesForm(form(rules)))).toMatch(/error=.*can't change fee rules/);
      expect((await projectParts(db, fx.p101.id, role)).feeRules).toEqual([]);
    }
    as("finance");
    expect(await landing(saveFeesForm(form(rules)))).toMatch(/ok=Fee rules saved/);
    const all = await db.select().from(projectFeeRules).where(eq(projectFeeRules.projectId, fx.p101.id));
    expect(all.map((r) => [r.amount, r.currency, r.earnedAtStage, r.paymentTermsDays]).sort()).toEqual([
      [120, "USD", "signed", 45],
      [250, "USD", "active", 30],
    ]);
    expect((await projectParts(db, fx.p101.id, "finance")).feeRules).toHaveLength(2);
    expect(await landing(saveFeesForm(form({ ...rules, currency: ["dollars"] })))).toMatch(/error=Currency is three letters/);
  });

  it("the funnel counts the project's pipelines", async () => {
    const parts = await projectParts(db, fx.p101.id, "admin");
    const f = await funnelFor(db, fx.p101, parts.tracks);
    expect(f.people).toBeGreaterThan(0);
    expect(f.stages.active).toBeGreaterThanOrEqual(1);
    expect(f.achieved).toBeGreaterThanOrEqual(1);
    expect(parts.roles.length).toBe(1);
  });
});

describe("messages", () => {
  it("lists with tab counts; viewers see masked emails and can't act", async () => {
    const v = await listMessages(db, "viewer", { tab: "open", q: "" });
    expect(v.counts).toEqual({ all: 4, open: 2, handled: 2 });
    expect(v.rows.every((m) => m.email.includes("•••"))).toBe(true);
    const m = (await getMessage(db, fx.msgs[0].id, "viewer"))!;
    expect(m.rawEmail).toBeNull();
    as("viewer");
    expect(await landing(setMessageHandled(form({ id: fx.msgs[0].id, handled: "yes" })))).toMatch(/error=.*can't handle or answer messages/);
  });

  it("mark handled and open again: who and when", async () => {
    as("recruiter");
    expect(await landing(setMessageHandled(form({ id: fx.msgs[0].id, handled: "yes", returnTo: `/admin/messages?view=${fx.msgs[0].id}` })))).toMatch(/view=.*ok=Marked as handled/);
    let [m] = await db.select().from(messages).where(eq(messages.id, fx.msgs[0].id));
    expect(m.handledBy).toBe("recruiter@xocket.sh");
    expect(m.handledAt).not.toBeNull();
    await landing(setMessageHandled(form({ id: fx.msgs[0].id, handled: "no" })));
    [m] = await db.select().from(messages).where(eq(messages.id, fx.msgs[0].id));
    expect(m.handledAt).toBeNull();
  });

  it("replying saves a draft; sending is off without email (it says so); 'I sent it' records the reply and clears the draft", async () => {
    as("recruiter");
    const id = fx.msgs[0].id;
    expect(await landing(replyToMessage(form({ id, intent: "draft", subject: "", body: "" })))).toMatch(/error=Write a subject or a message first/);
    expect(await landing(replyToMessage(form({ id, intent: "draft", subject: "Re: AI training", body: "Hi Kira,\n\nApply here." })))).toMatch(/ok=Draft saved/);
    const [d] = await db.select().from(replyDrafts).where(and(eq(replyDrafts.sourceType, "contact"), eq(replyDrafts.sourceId, id)));
    expect(d).toMatchObject({ subject: "Re: AI training", updatedBy: "recruiter@xocket.sh" });
    expect(await landing(replyToMessage(form({ id, intent: "send", subject: "Re: AI training", body: "Hi" })))).toMatch(/error=Email isn't set up yet/);
    expect(await db.select().from(messageReplies).where(eq(messageReplies.sourceId, id))).toHaveLength(0);
    expect(await landing(replyToMessage(form({ id, intent: "logged", subject: "Re: AI training", body: "Hi Kira" })))).toMatch(/ok=Reply recorded/);
    const replies = await db.select().from(messageReplies).where(eq(messageReplies.sourceId, id));
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ sourceType: "contact", recipientEmail: "kira.example@example.com", status: "sent", sentBy: "recruiter@xocket.sh" });
    expect(await db.select().from(replyDrafts).where(eq(replyDrafts.sourceId, id))).toHaveLength(0);
  });

  it("delete is admin only", async () => {
    as("recruiter");
    expect(await landing(removeMessage(form({ id: fx.msgs[3].id })))).toMatch(/error=.*can't delete records/);
    as("admin");
    expect(await landing(removeMessage(form({ id: fx.msgs[3].id })))).toMatch(/ok=Deleted message/);
  });
});

describe("analytics, dashboard, my work, settings", () => {
  it("analytics adds up the daily totals and the page views in the range", async () => {
    const a = await visitorAnalytics(db, { start: addDays(today, -6), end: today });
    expect(a.days).toHaveLength(7);
    expect(a.visitors).toBe(a.days.reduce((n, d) => n + Number(d.linkedin) + Number(d.google) + Number(d.direct) + Number(d.other), 0));
    expect(a.visitors).toBeGreaterThan(0);
    expect(a.landing.length).toBeGreaterThan(0);
    expect(a.referrers.every((r) => r.host)).toBe(true);
    expect(a.messages).toBeGreaterThanOrEqual(1);
  });

  it("the dashboard's numbers", async () => {
    const d = await crmDashboard(db, today);
    const total = Object.values(d.companiesByStage).reduce((n, v) => n + v, 0);
    expect(total).toBe((await db.select().from(partners)).length);
    expect(d.nextStepsDue.every((c) => c.due! <= today)).toBe(true);
    expect(d.applicationsPerDay).toHaveLength(30);
    expect(d.visitors30).toBeGreaterThan(0);
  });

  it("my work: a person's follow-ups, calendar, prospects; 'Contacted' sets a follow-up in 3 days", async () => {
    const w = await myWork(db, { id: fx.rhea.id, email: fx.rhea.email }, today);
    const follow = w.tabs.follow_ups.map((i) => i.key);
    expect(follow).toContain(`company:${fx.acme.id}`);
    expect(follow).toContain(`contact:${fx.people[2].id}`); // Fay: her company is Rhea's, due today
    expect(follow).not.toContain(`company:${fx.vandelay.id}`); // due in 2 days
    expect(w.tabs.follow_ups.some((i) => i.type === "expert")).toBe(true);
    expect(w.tabs.follow_ups.some((i) => i.type === "pipeline")).toBe(true);
    expect(w.tabs.calendar.some((i) => i.title === "Post the maths job on LinkedIn")).toBe(true);
    expect(w.tabs.no_reply).toHaveLength(1);
    const prospect = w.tabs.prospects[0];
    expect(prospect.expertId).toBeTruthy();
    const everyone = await myWork(db, null, today);
    expect(everyone.tabs.follow_ups.length).toBeGreaterThanOrEqual(w.tabs.follow_ups.length);
    as("viewer");
    expect(await landing(markProspectContacted(form({ expertId: prospect.expertId! })))).toMatch(/error=.*can't edit experts/);
    as("recruiter");
    expect(await landing(markProspectContacted(form({ expertId: prospect.expertId!, name: prospect.title, returnTo: "/admin/my-work?tab=prospects" })))).toMatch(/ok=.*contacted\. A follow-up is set for 3 days/);
    const [e] = await db.select().from(experts).where(eq(experts.id, prospect.expertId!));
    expect(e).toMatchObject({ outreachStatus: "contacted", nextAction: "Follow up if they haven't replied", nextActionDue: addDays(today, 3), nextActionAuto: true });
    expect(await db.select().from(expertActivities).where(and(eq(expertActivities.expertId, e.id), eq(expertActivities.summary, "Outreach: contacted")))).toHaveLength(1);
  });

  it("settings → email replies: admins only; only changed keys are written", async () => {
    as("recruiter");
    expect(await landing(saveEmailReplySettings(form({ reply_signoff: "X" })))).toMatch(/error=.*can't change settings/);
    as("admin");
    const before = await replySettings(db);
    expect(before.saved.reply_signoff).toBe(false);
    expect(await landing(saveEmailReplySettings(form({ reply_signoff: "Rhea\nFynoLabs", reply_context: before.values.reply_context })))).toMatch(/ok=Settings saved/);
    const rows = await db.select().from(settings);
    expect(rows.map((r) => r.key)).toEqual(["reply_signoff"]);
    expect(rows[0]).toMatchObject({ value: "Rhea\nFynoLabs", updatedBy: "admin@xocket.sh" });
    expect(await landing(saveEmailReplySettings(form({ reply_signoff: "Rhea\nFynoLabs" })))).toMatch(/ok=Nothing changed/);
  });
});
