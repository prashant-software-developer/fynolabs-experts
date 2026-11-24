// TEST FIXTURES ONLY (never in the app). The CRM and operations side of the fictional test data:
// companies with stages, owners and next steps, their people, activity, calendar, platforms,
// projects (tracks, team, documents, fee rules, a partner report), referrals, contact messages and
// visitor analytics. Every name and address is made up (example.com / example.org). Dates are
// relative to `today` (India time), so screens look current.
import { eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  applications,
  calendarEvents,
  companyActivities,
  contacts,
  experts,
  jobs,
  messageReplies,
  messages,
  partnerReports,
  partners,
  platforms,
  projectDocuments,
  projectFeeRules,
  projectMembers,
  projectTracks,
  projects,
  referrals,
  replyDrafts,
  teamMembers,
  visitorPageviews,
  visitorSourceDaily,
} from "@/db/schema";
import { addDays, istInstant, todayIST } from "@/lib/crm/dates";

const SYNC = "fynolabs sync";

export async function seedCrm(db: DB, today: string = todayIST()) {
  if (process.env.DATABASE_URL) throw new Error("Test data is for the local database only (DATABASE_URL is set).");
  const d = (n: number) => addDays(today, n);
  const team = await db.select().from(teamMembers);
  const rhea = team.find((t) => t.email.startsWith("rhea"))!;
  const pavel = team.find((t) => t.email.startsWith("pavel"))!;
  const farah = team.find((t) => t.email.startsWith("farah"))!;

  // ---- Platforms ----
  const [gridwork, taskhive, agency9] = await db
    .insert(platforms)
    .values([
      { name: "Gridwork (demo)", kind: "platform", domain: "example.com", websiteUrl: "https://example.com/gridwork", referralUrl: "https://example.com/gridwork/invite/fynolabs-demo", jobsUrl: "https://example.com/gridwork/jobs", status: "active", notes: "Pays weekly. Demo platform.", referenceLinks: [{ label: "Payout dashboard", url: "https://example.com/gridwork/payouts" }], updatedBy: "seed@example.com" },
      { name: "TaskHive (demo)", kind: "both", domain: "example.org", websiteUrl: "https://example.org/taskhive", referralUrl: null, status: "paused", notes: "Paused onboarding for November.", updatedBy: SYNC },
      { name: "Agency Nine (demo)", kind: "agency", domain: null, websiteUrl: null, referralUrl: "https://example.org/agency-nine/refer", status: "inactive", updatedBy: SYNC },
    ])
    .returning();

  // ---- Companies: the three demo partners get CRM fields, plus more accounts ----
  const ps = await db.select().from(partners);
  const acme = ps.find((p) => p.name.startsWith("Acme"))!;
  const northwind = ps.find((p) => p.name.startsWith("Northwind"))!;
  const globex = ps.find((p) => p.name.startsWith("Globex"))!;
  await db.update(partners).set({ stage: "active", priority: "high", ownerTeamMemberId: rhea.id, nextStep: "Send the December roster and the CV pack", nextStepDue: d(0), bestRoute: "Shared Slack channel", tags: ["coding", "maths"], domain: "example.com", location: "Remote", updatedBy: SYNC }).where(eq(partners.id, acme.id));
  await db.update(partners).set({ stage: "talking", ownerTeamMemberId: pavel.id, nextStep: "Follow up on the Rust pilot terms", nextStepDue: d(-2), bestRoute: "Email thread with their talent lead", tags: ["rust"], updatedBy: SYNC }).where(eq(partners.id, northwind.id));
  await db.update(partners).set({ stage: "pilot", ownerName: "Common (team)", nextStep: "Check the biology reviewers' first week", nextStepDue: d(3), platformId: gridwork.id, updatedBy: SYNC }).where(eq(partners.id, globex.id));
  const more = await db
    .insert(partners)
    .values([
      { name: "Initech Data (demo)", kind: "data_partner", stage: "contacted", ownerTeamMemberId: rhea.id, nextStep: "Second email if no reply", nextStepDue: d(1), bestRoute: "Contact form", tags: ["boardy"], website: "https://example.org/initech", domain: "example.org", updatedBy: SYNC },
      { name: "Umbrella Staffing (demo)", kind: "staffing", stage: "researched", ownerName: "Common (team)", nextStep: "Draft the intro", nextStepDue: d(6), businessLine: "both", updatedBy: SYNC },
      { name: "Hooli Talent (demo)", kind: "talent_source", stage: "drafted", ownerTeamMemberId: farah.id, nextStep: "Send the referral agreement", nextStepDue: d(-5), updatedBy: SYNC },
      { name: "Vandelay Studio (demo)", kind: "client", businessLine: "product", stage: "talking", priority: "high", ownerTeamMemberId: rhea.id, nextStep: "Proposal call", nextStepDue: d(2), bestRoute: "Intro through a founder", updatedBy: SYNC },
      { name: "Stark Evaluators (demo)", kind: "agency", stage: "on_hold", nextStep: "Revisit in January", nextStepDue: d(40), updatedBy: SYNC },
      { name: "Wonka Gigs (demo)", kind: "trainer_gig", stage: "dropped", nextStep: null, updatedBy: SYNC },
      { name: "Soylent Research (demo)", kind: "frontier_lab", stage: "researching", priority: "low", tags: ["research"], updatedBy: SYNC },
    ])
    .returning();
  const [initech, umbrella, hooli, vandelay] = more;

  // ---- Contacts ----
  const people = await db
    .insert(contacts)
    .values([
      { name: "Dana Fixture", companyId: acme.id, company: acme.name, role: "Talent lead", kind: "partner", stage: "won", source: "referral", email: "dana.fixture@example.com", profileUrl: "https://www.linkedin.com/in/dana-fixture-example", nextFollowUp: null, createdBy: "seed@example.com" },
      { name: "Eli Sample", companyId: northwind.id, company: northwind.name, role: "Ops manager", kind: "partner", stage: "call", source: "linkedin", email: "eli.sample@example.com", nextFollowUp: d(-1), createdBy: "seed@example.com" },
      { name: "Fay Mockridge", companyId: initech.id, company: initech.name, role: "Head of data", kind: "partner", stage: "contacted", source: "email", email: "fay.mockridge@example.org", nextFollowUp: d(0), createdBy: rhea.email },
      { name: "Gus Placeholder", companyId: vandelay.id, company: vandelay.name, role: "Founder", kind: "client", stage: "proposal", source: "website", email: "gus@example.org", nextFollowUp: d(2), createdBy: rhea.email },
      { name: "Hana Stubbs", companyId: hooli.id, company: hooli.name, role: "Partnerships", kind: "talent", stage: "replied", source: "event", email: null, profileUrl: "https://example.org/hana", nextFollowUp: d(-4), createdBy: farah.email },
      { name: "Ivo Demo", companyId: null, company: "Unlisted Labs (demo)", role: "CTO", kind: "client", stage: "new", source: "linkedin", email: "ivo.demo@example.com", createdBy: "seed@example.com" },
      { name: "Jun Specimen", companyId: umbrella.id, company: umbrella.name, role: "Recruiter", kind: "partner", stage: "lost", source: "other", email: "jun@example.com", createdBy: "seed@example.com" },
    ])
    .returning();
  const [dana, eli, fay] = people;

  // ---- Company activity ----
  const at = (days: number, hm = "11:00") => istInstant(d(days), hm);
  await db.insert(companyActivities).values([
    { companyId: acme.id, contactId: dana.id, kind: "call", summary: "Weekly sync: 3 more maths experts needed", happenedAt: at(-1, "16:30"), createdBy: rhea.email },
    { companyId: acme.id, kind: "email", summary: "Sent the November roster", detail: "Roster with 4 people, CVs attached.", happenedAt: at(-3), createdBy: rhea.email },
    { companyId: acme.id, kind: "stage", summary: "Pilot → Active", happenedAt: at(-12), createdBy: "seed@example.com" },
    { companyId: northwind.id, contactId: eli.id, kind: "meeting", summary: "Pilot scoping call", happenedAt: at(-2, "18:00"), createdBy: pavel.email },
    { companyId: initech.id, contactId: fay.id, kind: "linkedin", summary: "Connected and sent a note", happenedAt: at(-4), createdBy: rhea.email },
    { companyId: vandelay.id, kind: "note", summary: "Wants a design sprint in January", happenedAt: at(-6), createdBy: rhea.email },
  ]);
  await db.update(partners).set({ lastActivityAt: at(-1, "16:30") }).where(eq(partners.id, acme.id));
  await db.update(partners).set({ lastActivityAt: at(-2, "18:00") }).where(eq(partners.id, northwind.id));

  // ---- Calendar ----
  const events = await db
    .insert(calendarEvents)
    .values([
      { title: "Weekly sync with Acme", kind: "call", status: "planned", eventDate: d(0), startTime: "15:00:00", endTime: "15:30:00", companyId: acme.id, contactId: dana.id, contactIds: [dana.id], teamMemberIds: [rhea.id], meetingUrl: "https://meet.example.com/acme-weekly", notes: "Bring the December roster.", createdBy: rhea.email },
      { title: "Rust pilot terms", kind: "meeting", status: "planned", eventDate: d(1), startTime: "19:30:00", endTime: "20:15:00", companyId: northwind.id, contactId: eli.id, contactIds: [eli.id], teamMemberIds: [pavel.id, rhea.id], createdBy: pavel.email },
      { title: "Post the maths job on LinkedIn", kind: "post", status: "planned", eventDate: d(0), createdBy: rhea.email, teamMemberIds: [rhea.id] },
      { title: "Send the referral agreement", kind: "task", status: "planned", eventDate: d(-3), companyId: hooli.id, teamMemberIds: [farah.id], createdBy: farah.email },
      { title: "Biology batch deadline", kind: "deadline", status: "planned", eventDate: d(5), companyId: globex.id, createdBy: "seed@example.com" },
      { title: "Intro call with Initech", kind: "call", status: "waiting", eventDate: null, companyId: initech.id, contactId: fay.id, contactIds: [fay.id], teamMemberIds: [rhea.id], notes: "They're picking a slot.", createdBy: rhea.email },
      { title: "Kick-off with Acme", kind: "meeting", status: "done", eventDate: d(-8), startTime: "14:00:00", companyId: acme.id, createdBy: rhea.email },
      { title: "Follow up Vandelay proposal", kind: "follow_up", status: "planned", eventDate: d(9), companyId: vandelay.id, createdBy: rhea.email },
    ])
    .returning({ id: calendarEvents.id, title: calendarEvents.title });

  // ---- Projects ----
  const [p101, p102] = await db
    .insert(projects)
    .values([
      { code: "P101", name: "Maths evaluators (demo)", kind: "managed", status: "active", companyId: acme.id, platformId: gridwork.id, ownerTeamMemberId: rhea.id, targetCount: 12, startsOn: d(-40), countries: ["US", "GB", "IN"], rules: { github_required: false, min_years: 3 }, discord: "P101 · Maths evaluation", description: "Mathematicians who check and write hard problems.", referralUrl: "https://example.com/gridwork/invite/p101", createdBy: "seed@example.com" },
      { code: "P102", name: "Rust referrals (demo)", kind: "referral", status: "planned", companyId: northwind.id, targetCount: 5, countries: ["US"], createdBy: "seed@example.com" },
      { code: "P103", name: "Old biology pilot (demo)", kind: "agency", status: "closed", companyId: globex.id, createdBy: "seed@example.com" },
    ])
    .returning();
  const tracks = await db
    .insert(projectTracks)
    .values([
      { projectId: p101.id, name: "Numerical analysis", targetCount: 8, position: 0 },
      { projectId: p101.id, name: "Probability", targetCount: 4, position: 1 },
    ])
    .returning();
  await db.insert(projectMembers).values([
    { projectId: p101.id, teamMemberId: rhea.id, role: "lead", capacity: 10 },
    { projectId: p101.id, teamMemberId: pavel.id, role: "screener", capacity: 5, active: false },
  ]);
  await db.insert(projectDocuments).values([
    { projectId: p101.id, kind: "nda", title: "Mutual NDA", requiredStage: "selected", position: 0 },
    { projectId: p101.id, kind: "agreement", title: "Contractor agreement", requiredStage: "documents", expiresAfterDays: 365, position: 1 },
  ]);
  await db.insert(projectFeeRules).values({ projectId: p101.id, trackId: tracks[0].id, amount: 250, currency: "USD", earnedAtStage: "active", paymentTermsDays: 30, createdBy: "seed@example.com" });
  await db.insert(partnerReports).values({ projectId: p101.id, companyId: acme.id, label: "October report (demo)", periodStart: d(-55), periodEnd: d(-25), signups: 9, qualified: 5, active: 3, rowsTotal: 9, matched: 7, unmatchedCount: 2 });
  // The maths job belongs to P101; its applications are the funnel.
  const [mathJob] = await db.select({ id: jobs.id }).from(jobs).where(sql`${jobs.slug} like 'scientific-coding%'`).limit(1);
  if (mathJob) {
    await db.update(jobs).set({ projectId: p101.id, trackId: tracks[0].id }).where(eq(jobs.id, mathJob.id));
    const apps = await db.select({ id: applications.id }).from(applications).where(eq(applications.jobId, mathJob.id));
    const stages = ["active", "signed", "selected", "shortlisted", "new", "rejected"];
    for (const [i, a] of apps.entries())
      await db
        .update(applications)
        .set({ stage: stages[i % stages.length], stageChangedAt: new Date(Date.now() - (i + 1) * 5 * 86_400_000), ...(i === 1 ? { ownerTeamMemberId: rhea.id, nextAction: "Send the contractor agreement", nextActionDue: d(0) } : {}) })
        .where(eq(applications.id, a.id));
  }

  // ---- Experts the team owns (My work) ----
  const someone = await db.select({ id: experts.id, fullName: experts.fullName }).from(experts).where(inArray(experts.status, ["applicant", "bench"])).limit(4);
  if (someone[0]) await db.update(experts).set({ ownerTeamMemberId: rhea.id, nextAction: "Ask for CV consent", nextActionDue: d(-1) }).where(eq(experts.id, someone[0].id));
  if (someone[1]) await db.update(experts).set({ ownerTeamMemberId: rhea.id, status: "applicant", outreachStatus: "not_contacted" }).where(eq(experts.id, someone[1].id));
  if (someone[2]) await db.update(experts).set({ ownerTeamMemberId: rhea.id, outreachStatus: "contacted", lastContactedAt: new Date(Date.now() - 5 * 86_400_000) }).where(eq(experts.id, someone[2].id));

  // ---- Referrals through the platforms ----
  const refPeople = await db.select({ id: experts.id, email: experts.email, fullName: experts.fullName }).from(experts).limit(5);
  const outcomes = ["active", "signed_up", "sent", "in_review", "rejected"];
  await db.insert(referrals).values(
    refPeople.map((e, i) => ({
      expertId: e.id,
      platformId: gridwork.id,
      platform: gridwork.name,
      companyId: globex.id,
      projectId: i < 2 ? p102.id : null,
      recipientEmail: e.email ?? `person${i}@example.com`,
      recipientName: e.fullName,
      method: i % 2 ? "link" : "email",
      outcome: outcomes[i],
      outcomeAt: i === 0 ? new Date(Date.now() - 9 * 86_400_000) : null,
      sentAt: new Date(Date.now() - (i + 4) * 86_400_000),
      submittedBy: rhea.email,
    })),
  );

  // ---- Contact messages ----
  const msgs = await db
    .insert(messages)
    .values([
      { name: "Kira Example", email: "kira.example@example.com", message: "Hi, I'm a physics PhD and would like to work on AI training projects. How do I apply?", createdAt: new Date(Date.now() - 3 * 3_600_000) },
      { name: "Leo Testwell", email: "leo.testwell@example.org", message: "We're a seed-stage startup looking for help with our product design. Do you have availability in January?", createdAt: new Date(Date.now() - 26 * 3_600_000) },
      { name: "Mira Sample", email: "mira.sample@example.com", message: "Do you hire Rust engineers in Canada?", createdAt: new Date(Date.now() - 4 * 86_400_000), handledAt: new Date(Date.now() - 3 * 86_400_000), handledBy: rhea.email },
      { name: "Nico Demo", email: "nico.demo@example.org", message: "Thanks for the quick reply last week!", createdAt: new Date(Date.now() - 9 * 86_400_000), handledAt: new Date(Date.now() - 8 * 86_400_000), handledBy: rhea.email },
    ])
    .returning();
  await db.insert(messageReplies).values({ sourceType: "contact", sourceId: msgs[2].id, recipientEmail: msgs[2].email, subject: "Re: your message to FynoLabs", body: "Hi Mira,\n\nYes: open roles are on the jobs page.\n\nPrashant", status: "sent", sentBy: rhea.email, createdAt: new Date(Date.now() - 3 * 86_400_000) });
  await db.insert(replyDrafts).values({ sourceType: "contact", sourceId: msgs[1].id, subject: "Re: product design in January", body: "Hi Leo,\n\nThanks for reaching out.", updatedBy: rhea.email });

  // ---- Visitor analytics: 90 days of daily totals, and page views for the last 30 days ----
  const daily: (typeof visitorSourceDaily.$inferInsert)[] = [];
  for (let i = 0; i < 90; i++) {
    const day = d(-i);
    const wave = 1 + ((i * 7) % 5);
    daily.push(
      { visitDate: day, source: "linkedin", visitors: 8 + wave * 3, pageViews: 20 + wave * 6 },
      { visitDate: day, source: "google", visitors: 4 + (i % 4), pageViews: 9 + (i % 6) },
      { visitDate: day, source: "direct", visitors: 3 + (i % 3), pageViews: 6 + (i % 5) },
      { visitDate: day, source: "other", visitors: i % 2, pageViews: i % 3 },
    );
  }
  await db.insert(visitorSourceDaily).values(daily);
  const paths = ["/", "/jobs", "/ai-training", "/talent-call", "/work", "/jobs/scientific-coding-expert-mathematics"];
  const hosts = ["www.linkedin.com", "www.google.com", "t.co", null];
  const views: (typeof visitorPageviews.$inferInsert)[] = [];
  for (let i = 0; i < 120; i++) {
    const session = `00000000-0000-4000-8000-${String(1000 + Math.floor(i / 3)).padStart(12, "0")}`;
    const host = hosts[i % hosts.length];
    views.push({ sessionId: session, source: host?.includes("linkedin") ? "linkedin" : host?.includes("google") ? "google" : host ? "other" : "direct", referrerHost: host, landingPath: paths[Math.floor(i / 3) % paths.length], pagePath: paths[i % paths.length], createdAt: new Date(Date.now() - (i % 28) * 86_400_000 - 3_600_000) });
  }
  await db.insert(visitorPageviews).values(views);

  return { acme, northwind, globex, initech, umbrella, hooli, vandelay, gridwork, taskhive, agency9, p101, p102, tracks, events, people, msgs, rhea, pavel, farah, mathJobId: mathJob?.id ?? null };
}
