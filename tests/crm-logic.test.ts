// The CRM's pure rules: India-time dates, due states, stage order and lanes, filters, the project
// funnel, analytics series, per-section access, reply helpers.
import { describe, expect, it } from "vitest";
import { addDays, addMonths, istInstant, monthGrid, todayIST, weekStart } from "@/lib/crm/dates";
import { COMPANY_LANES, crmLabel, domainOf, dueState, isDueNow, stageGroup, webUrl } from "@/lib/crm/labels";
import { canOpenSection, openSections } from "@/lib/auth/sections";
import { cleanTags, companyView, ownerOptions, parseCompanyFilters, sortCompanies, stageSummary, type CompanyRow } from "@/lib/server/companies";
import { contactView, parseContactFilters, type ContactRow } from "@/lib/server/contacts";
import { calendarStats, sortTimeline, type TimelineItem } from "@/lib/server/calendar";
import { cleanCountries, normalizeCode, projectFunnel, projectView, type ProjectRow } from "@/lib/server/projects";
import { cleanReferenceLinks, platformView, referenceLinksOf, type PlatformRow } from "@/lib/server/platforms";
import { countByDay, rangeFor, seriesByDay } from "@/lib/server/analytics";
import { mailtoLink } from "@/lib/server/messages";
import { replyStarter, signOffLines, signOffTooLong } from "@/lib/server/reply-settings";

const company = (o: Partial<CompanyRow>): CompanyRow => ({
  id: o.id ?? crypto.randomUUID(),
  name: "Co",
  kind: "data_partner",
  website: null,
  domain: null,
  notes: null,
  businessLine: "ai_training",
  stage: "researching",
  priority: "normal",
  ownerTeamMemberId: null,
  ownerName: null,
  ownerMemberName: null,
  ownerMemberEmail: null,
  nextStep: null,
  nextStepDue: null,
  bestRoute: null,
  location: null,
  platformId: null,
  platformName: null,
  tags: [],
  stageChangedAt: new Date(),
  lastActivityAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  updatedBy: null,
  people: 0,
  ...o,
});

describe("India-time dates", () => {
  it("today is the date in Asia/Kolkata, not UTC", () => {
    // 20:00 UTC on 24 Nov is 01:30 on 25 Nov in India.
    expect(todayIST(new Date("2026-11-24T20:00:00Z"))).toBe("2026-11-25");
    expect(todayIST(new Date("2026-11-24T18:00:00Z"))).toBe("2026-11-24");
  });
  it("an event's instant is its date and time in India (12:00 without a time)", () => {
    expect(istInstant("2026-11-24", "15:00:00").toISOString()).toBe("2026-11-24T09:30:00.000Z");
    expect(istInstant("2026-11-24", null).toISOString()).toBe("2026-11-24T06:30:00.000Z");
  });
  it("weeks start on Monday; month grids cover whole weeks", () => {
    expect(weekStart("2026-11-24")).toBe("2026-11-23");
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
    const g = monthGrid("2026-11-10");
    expect(g[0][0]).toBe("2026-10-26");
    expect(g.at(-1)![6]).toBe("2026-12-06");
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("due dates and stages", () => {
  const today = "2026-11-24";
  it("overdue, today, soon (3 days), later; none for dropped companies", () => {
    expect(dueState("2026-11-23", today)).toBe("overdue");
    expect(dueState(today, today)).toBe("today");
    expect(dueState("2026-11-27", today)).toBe("soon");
    expect(dueState("2026-11-28", today)).toBe("later");
    expect(dueState("2026-11-01", today, "dropped")).toBeNull();
    expect(dueState(null, today)).toBeNull();
    expect(isDueNow("2026-11-20", today, "on_hold")).toBe(true);
  });
  it("labels use the FynoLabs words", () => {
    expect(crmLabel("on_hold")).toBe("On hold");
    expect(crmLabel("call", "contact")).toBe("Call booked");
    expect(crmLabel("proposal", "contact")).toBe("Proposal sent");
    expect(crmLabel("follow_up", "calendar")).toBe("Follow-up");
    expect(crmLabel("inactive", "platform_status")).toBe("Not working with");
    expect(stageSummary("talking", "pilot")).toBe("Talking → Pilot");
    expect(stageGroup("pilot")).toBe("won");
    expect(COMPANY_LANES.map((l) => l.label)).toEqual(["Not contacted", "Contacted", "Talking", "Pilot & active", "Parked"]);
  });
  it("websites and domains", () => {
    expect(domainOf("www.Example.com/about")).toBe("example.com");
    expect(webUrl("example.com")).toBe("https://example.com");
    expect(webUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("the Accounts view", () => {
  const today = "2026-11-24";
  const me = "11111111-1111-4111-8111-111111111111";
  const rows = [
    company({ name: "Zeta", stage: "talking", nextStepDue: "2026-11-30" }),
    company({ name: "Alpha", stage: "talking", nextStepDue: "2026-11-20", ownerTeamMemberId: me, priority: "high" }),
    company({ name: "Beta", stage: "active", nextStepDue: today, tags: ["coding"] }),
    company({ name: "Gamma", stage: "dropped", nextStepDue: "2026-11-01" }),
    company({ name: "Delta", stage: "researching", ownerName: "Common (team)", businessLine: "product" }),
    company({ name: "Eta", stage: "pilot", businessLine: "both" }),
  ];
  it("sorts by stage (talks first), then due date (none last), then name", () => {
    expect(sortCompanies(rows).map((r) => r.name)).toEqual(["Alpha", "Zeta", "Eta", "Delta", "Beta", "Gamma"]);
  });
  it("tabs, tiles and lanes", () => {
    const v = companyView(rows, parseCompanyFilters({}), today, me);
    expect(v.counts).toEqual({ pipeline: 5, due: 2, parked: 1, all: 6 });
    expect(v.stats).toEqual({ pipeline: 5, inTalks: 2, dueNow: 2, won: 2 });
    expect(v.lanes.map((l) => l.lane.key)).toEqual(["not_contacted", "contacted", "talking", "won"]);
    expect(v.lanes.find((l) => l.lane.key === "talking")!.rows.map((r) => r.name)).toEqual(["Alpha", "Zeta"]);
    expect(v.lanes.find((l) => l.lane.key === "talking")!.due).toBe(1);
    expect(companyView(rows, parseCompanyFilters({ tab: "parked" }), today, me).lanes.map((l) => l.lane.key)).toEqual(["parked"]);
  });
  it("filters: owner (mine, a typed name, none), line (both counts for either), tag, search", () => {
    const names = (sp: Record<string, string>) => companyView(rows, parseCompanyFilters({ tab: "all", ...sp }), today, me).rows.map((r) => r.name).sort();
    expect(names({ owner: "me" })).toEqual(["Alpha"]);
    expect(names({ owner: "name:common (team)" })).toEqual(["Delta"]);
    expect(names({ owner: "none" })).toEqual(["Beta", "Eta", "Gamma", "Zeta"]);
    expect(names({ line: "product" })).toEqual(["Delta", "Eta"]);
    expect(names({ tag: "coding" })).toEqual(["Beta"]);
    expect(names({ q: "zet" })).toEqual(["Zeta"]);
    expect(parseCompanyFilters({ stage: "nope", kind: "x", tab: "bad" })).toMatchObject({ stage: "", kind: "", tab: "pipeline" });
  });
  it("owner choices: Everyone, Mine, teammates, typed names, No owner", () => {
    const opts = ownerOptions(rows, [{ id: me, name: "Me", email: "me@example.com" }, { id: "t2", name: null, email: "nitin@example.com" }], me).map((o) => o.label);
    expect(opts).toEqual(["Everyone", "Mine", "nitin", "Common (team)", "No owner"]);
  });
  it("tags are trimmed, lower case, unique, at most 20", () => {
    expect(cleanTags(" Boardy, coding ,boardy,, India ")).toEqual(["boardy", "coding", "india"]);
    expect(cleanTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(20);
  });
});

describe("the Leads view", () => {
  const today = "2026-11-24";
  const c = (o: Partial<ContactRow>): ContactRow => ({ id: crypto.randomUUID(), name: "P", companyId: null, companyName: null, companyKind: null, company: null, role: null, kind: "client", stage: "new", source: "linkedin", sourceUrl: null, profileUrl: null, email: null, nextFollowUp: null, notes: null, createdBy: null, createdAt: new Date(), updatedAt: new Date(`${today}T05:00:00Z`), ...o });
  const all = [c({ name: "A", stage: "call", nextFollowUp: "2026-11-20" }), c({ name: "B", stage: "won" }), c({ name: "C", stage: "lost", nextFollowUp: "2026-11-01" }), c({ name: "D", email: "d@example.com" })];
  it("tabs and tiles; follow-ups due only count open leads", () => {
    const v = contactView(all, parseContactFilters({}), today, { searchEmail: true });
    expect(v.counts).toEqual({ open: 2, won: 1, lost: 1, all: 4 });
    expect(v.stats).toEqual({ open: 2, calls: 1, wonThisMonth: 1, followUpsDue: 1 });
    expect(contactView(all, parseContactFilters({ followUp: "due", tab: "all" }), today, { searchEmail: true }).rows.map((r) => r.name)).toEqual(["A"]);
  });
  it("only people who may see emails can search them", () => {
    expect(contactView(all, parseContactFilters({ q: "d@example" }), today, { searchEmail: true }).rows).toHaveLength(1);
    expect(contactView(all, parseContactFilters({ q: "d@example" }), today, { searchEmail: false }).rows).toHaveLength(0);
  });
});

describe("calendar timeline", () => {
  const item = (o: Partial<TimelineItem>): TimelineItem => ({ key: crypto.randomUUID(), source: "calendar", id: "x", title: "T", kind: "call", status: "planned", date: null, start: null, end: null, companyId: null, companyName: null, contactIds: [], teamMemberIds: [], meetingUrl: null, notes: null, href: null, ...o });
  it("sorts by date, timed before all-day, then title; undated last", () => {
    const s = sortTimeline([item({ title: "undated" }), item({ title: "b all day", date: "2026-11-24" }), item({ title: "a 15:00", date: "2026-11-24", start: "15:00" }), item({ title: "9:00", date: "2026-11-24", start: "09:00" }), item({ title: "yesterday", date: "2026-11-23" })]);
    expect(s.map((i) => i.title)).toEqual(["yesterday", "9:00", "a 15:00", "b all day", "undated"]);
  });
  it("tiles count open items only", () => {
    const st = calendarStats([item({ date: "2026-11-24" }), item({ date: "2026-11-24", status: "done" }), item({ date: "2026-11-20" }), item({ date: "2026-11-30", kind: "meeting" }), item({ date: "2026-12-10", kind: "call" })], "2026-11-24", addDays);
    expect(st).toEqual({ today: 1, next7: 2, calls10: 2, overdue: 1 }); // the open call today and the meeting in 6 days
  });
});

describe("projects", () => {
  it("codes and countries", () => {
    expect(normalizeCode(" t-500 ")).toBe("T-500");
    expect(normalizeCode("x")).toBeNull();
    expect(cleanCountries("us, GB india;ca")).toEqual(["US", "GB", "CA"]);
  });
  it("the funnel: people, stages, achieved once per person, weekly, pace and the projected date", () => {
    const now = new Date("2026-11-25T06:00:00Z"); // Wednesday in India
    const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
    const f = projectFunnel(
      {
        kind: "managed",
        targetCount: 10,
        tracks: [{ id: "t1", name: "Track 1", targetCount: 5 }],
        pipelines: [
          { expertId: "e1", stage: "active", createdAt: ago(30), stageChangedAt: ago(10), trackId: "t1" },
          { expertId: "e1", stage: "ended", createdAt: ago(60), stageChangedAt: ago(20), trackId: null },
          { expertId: "e2", stage: "active", createdAt: ago(20), stageChangedAt: ago(9), trackId: "t1" },
          { expertId: "e3", stage: "new", createdAt: ago(1), stageChangedAt: ago(1), trackId: "t1" },
          { expertId: "e4", stage: "rejected", createdAt: ago(5), stageChangedAt: ago(4), trackId: null },
        ],
        referrals: [{ personKey: "m:x@example.com", outcome: "active", sentAt: ago(3), outcomeAt: ago(2) }],
      },
      now,
    );
    expect(f.people).toBe(5);
    expect(f.rejected).toBe(1);
    expect(f.stages.active).toBe(2);
    expect(f.achieved).toBe(2); // e1 once (its earliest), e2; referrals don't count for managed projects
    expect(f.weekly).toHaveLength(12);
    expect(f.weekly.reduce((n, w) => n + w.achieved, 0)).toBe(2);
    expect(f.pace).toBeCloseTo(0.5);
    expect(f.projected).toBe(addDays("2026-11-25", 112)); // 8 left at 0.5 a week
    expect(f.tracks[0]).toMatchObject({ achieved: 1, inPipeline: 3 });
    const r = projectFunnel({ kind: "referral", targetCount: 1, tracks: [], pipelines: [], referrals: [{ personKey: "m:x@example.com", outcome: "active", sentAt: ago(3), outcomeAt: ago(2) }] }, now);
    expect(r.achieved).toBe(1);
    expect(r.projected).toBeNull();
  });
  it("tabs", () => {
    const p = (status: string, targetCount: number | null, roles = 0) => ({ id: crypto.randomUUID(), code: status.toUpperCase(), name: status, status, targetCount, roles, companyName: null }) as unknown as ProjectRow;
    const v = projectView([p("active", 10, 2), p("active", null, 1), p("planned", 5), p("paused", 3), p("closed", 1)], "active", "");
    expect(v.counts).toEqual({ active: 2, planned: 1, paused_closed: 2, all: 5 });
    expect(v.stats).toEqual({ active: 2, planned: 1, roles: 3, target: 10 });
  });
});

describe("platforms", () => {
  it("tabs: platforms and agencies both include 'both'; no referral link", () => {
    const p = (kind: string, referralUrl: string | null) => ({ id: crypto.randomUUID(), name: kind, kind, referralUrl, domain: null, notes: null, referred: 0 }) as unknown as PlatformRow;
    const v = platformView([p("platform", "x"), p("agency", null), p("both", "y")], "all", "");
    expect(v.counts).toEqual({ all: 3, platforms: 2, agencies: 2, no_link: 1 });
  });
  it("reference links keep label + URL pairs with a URL", () => {
    expect(cleanReferenceLinks([{ label: "Payouts", url: "example.com/pay" }, { label: "Empty", url: "" }, { label: "", url: "https://example.org/docs" }])).toEqual([
      { label: "Payouts", url: "https://example.com/pay" },
      { label: "example.org", url: "https://example.org/docs" },
    ]);
    expect(referenceLinksOf([{ url: "https://a.example" }, "junk", null])).toEqual([{ label: "https://a.example", url: "https://a.example" }]);
  });
});

describe("analytics", () => {
  it("one point per day, zeros for missing days, totals and shares per source", () => {
    const s = seriesByDay(
      [
        { visitDate: "2026-11-23", source: "linkedin", visitors: 6, pageViews: 10 },
        { visitDate: "2026-11-24", source: "google", visitors: 2, pageViews: 3 },
        { visitDate: "2026-11-24", source: "linkedin", visitors: 2, pageViews: 2 },
        { visitDate: "2026-11-24", source: "bogus", visitors: 99, pageViews: 99 },
        { visitDate: "2026-10-01", source: "direct", visitors: 50, pageViews: 50 },
      ],
      "2026-11-22",
      "2026-11-24",
    );
    expect(s.days.map((d) => [d.day, d.linkedin, d.google])).toEqual([
      ["2026-11-22", 0, 0],
      ["2026-11-23", 6, 0],
      ["2026-11-24", 2, 2],
    ]);
    expect(s.visitors).toBe(10);
    expect(s.pageViews).toBe(15);
    expect(s.sources[0]).toMatchObject({ source: "linkedin", visitors: 8, share: 80 });
  });
  it("counts per day and ranges", () => {
    expect(countByDay([new Date("2026-11-24T10:00:00Z"), new Date("2026-11-24T23:00:00Z"), new Date("2026-11-20T00:00:00Z")], "2026-11-23", "2026-11-24")).toEqual([
      { day: "2026-11-23", n: 0 },
      { day: "2026-11-24", n: 2 },
    ]);
    expect(rangeFor(7, "2026-11-24")).toEqual({ start: "2026-11-18", end: "2026-11-24", days: 7 });
    expect(rangeFor(30, "2026-11-24", "2026-11-01", "2026-11-10")).toEqual({ start: "2026-11-01", end: "2026-11-10", days: 10 });
    expect(rangeFor(30, "2026-11-24", "2026-11-10", "2026-11-01").days).toBe(30);
  });
});

describe("per-section access", () => {
  it("admins open everything; an empty list leaves it to the role", () => {
    expect(canOpenSection({ role: "admin", sections: ["contact"] }, "accounts")).toBe(true);
    expect(canOpenSection({ role: "recruiter", sections: [] }, "projects")).toBe(true);
    expect(canOpenSection({ role: "recruiter" }, "messages")).toBe(true);
  });
  it("a filled list limits the sections; FynoLabs keys count (leads opens accounts, leads, calendar)", () => {
    const u = { role: "recruiter" as const, sections: ["leads"] };
    expect(canOpenSection(u, "accounts")).toBe(true);
    expect(canOpenSection(u, "calendar")).toBe(true);
    expect(canOpenSection(u, "projects")).toBe(true);
    expect(canOpenSection(u, "messages")).toBe(false);
    expect(canOpenSection(u, "platforms")).toBe(false);
    expect(canOpenSection(u, "my-work")).toBe(true);
    expect(canOpenSection({ role: "viewer", sections: ["contact"] }, "messages")).toBe(true);
    expect(canOpenSection({ role: "viewer", sections: ["dashboard"] }, "analytics")).toBe(true);
    expect(openSections({ role: "finance", sections: ["platforms"] })).toMatchObject({ platforms: true, accounts: false, "my-work": true, dashboard: false });
    expect(canOpenSection({ role: "admin", blocked: true }, "dashboard")).toBe(false);
  });
});

describe("replies", () => {
  it("sign-off: lines before the first blank line, at most four", () => {
    expect(signOffLines("Prashant\nFounder\n\nignored")).toEqual(["Prashant", "Founder"]);
    expect(signOffTooLong("a\nb\nc\nd\ne")).toBe(true);
    expect(signOffTooLong("a\nb")).toBe(false);
    expect(replyStarter("Asha Example", "Prashant\nFounder, FynoLabs")).toBe("Hi Asha,\n\n\n\nPrashant\nFounder, FynoLabs");
  });
  it("mailto links stay under ~2,000 characters", () => {
    const href = mailtoLink("a@example.com", "Re: hello", "word ".repeat(2000));
    expect(href.startsWith("mailto:a%40example.com?subject=Re%3A%20hello&body=")).toBe(true);
    expect(href.length).toBeLessThanOrEqual(2000);
  });
});
