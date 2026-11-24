// TEST FIXTURES ONLY: fictional talent and outreach data on top of the demo data (demo-data.ts and
// demo-jobs.ts): platforms, a project with tracks and a fee rule, the talent-call job with a few
// applications, pipelines at every stage, templates, a campaign, groups, referrals, fees, radar
// roles, engagements and earnings, suppressed addresses, documents and timeline rows. Every name,
// address and company is made up (example.com / example.org).
import { asc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  applications,
  emailSendLog,
  emailTemplates,
  engagements,
  expertActivities,
  expertDocuments,
  experts,
  jobs,
  legacyMap,
  monthlyEarnings,
  partners,
  platforms,
  projectFeeRules,
  projects,
  projectTracks,
  radarListings,
  referralFees,
  referralGroupMembers,
  referralGroups,
  referrals,
  settings,
  suppressedEmails,
  teamMembers,
} from "@/db/schema";

const BY = "fixture@xocket.sh";

/** `alongside`: add to a database that already has other fixtures (the local smoke seed, after the CRM data). */
export async function seedTalentIfEmpty(db: DB, opts: { alongside?: boolean } = {}): Promise<{ projectId: string; trackIds: string[]; platformId: string; talentJobId: string; groupId: string } | null> {
  const [has] = await db.select({ id: platforms.id }).from(platforms).limit(1);
  if (has && !opts.alongside) return null;
  const day = 86_400_000;
  const now = Date.now();
  const iso = (d: number) => new Date(now - d * day).toISOString().slice(0, 10);

  const [partner] = await db.select({ id: partners.id }).from(partners).orderBy(asc(partners.name)).limit(1);
  const [plat, plat2] = await db
    .insert(platforms)
    .values([
      { name: "Examplework", kind: "both", domain: "examplework.example.com", websiteUrl: "https://examplework.example.com", referralUrl: "https://examplework.example.com/signup?ref=FYNO123", jobsUrl: "https://examplework.example.com/jobs", status: "active", updatedBy: BY },
      { name: "Samplehire", kind: "both", domain: "samplehire.example.org", websiteUrl: "https://samplehire.example.org", referralUrl: "https://samplehire.example.org/r/ABC", status: "active", updatedBy: BY },
    ])
    .returning({ id: platforms.id });

  const [owner] = await db.select({ id: teamMembers.id }).from(teamMembers).orderBy(asc(teamMembers.email)).limit(1);
  const [proj] = await db
    .insert(projects)
    .values({ code: opts.alongside ? "P201" : "P101", name: "Coding evaluation pilot", kind: "referral", status: "active", companyId: partner?.id ?? null, platformId: plat.id, referralUrl: "https://examplework.example.com/signup?ref=FYNO123", ownerTeamMemberId: owner?.id ?? null, targetCount: 40, updatedBy: BY })
    .returning({ id: projects.id });
  const tracks = await db
    .insert(projectTracks)
    .values([
      { projectId: proj.id, name: "Python", targetCount: 25, position: 0, updatedBy: BY },
      { projectId: proj.id, name: "Rust", targetCount: 15, position: 1, updatedBy: BY },
    ])
    .returning({ id: projectTracks.id });
  await db.insert(projectFeeRules).values({ projectId: proj.id, trackId: null, amount: 150, currency: "USD", earnedAtStage: "active", paymentTermsDays: 30, active: true, createdBy: BY, updatedBy: BY });

  // The demo jobs: the first two belong to the project.
  const demoJobs = await db.select({ id: jobs.id, title: jobs.title }).from(jobs).orderBy(asc(jobs.createdAt));
  for (const j of demoJobs.slice(0, 2)) await db.update(jobs).set({ projectId: proj.id }).where(eq(jobs.id, j.id));

  // The talent-call job, as the FynoLabs sync makes it.
  const [talent] = await db
    .insert(jobs)
    .values({ slug: "fynolabs-talent-call", title: "Talent call (FynoLabs)", summary: "Applications from the FynoLabs talent form (join the expert pool). Internal: never on the public board.", status: "closed", visibility: "internal", createdBy: "fynolabs sync" })
    .returning({ id: jobs.id });
  await db.insert(legacyMap).values({ sourceTable: "fynolabs.talent_call", sourceId: "job", hubTable: "jobs", hubId: talent.id, written: {} });

  const people = await db.select({ id: experts.id, name: experts.fullName, email: experts.email, status: experts.status }).from(experts).orderBy(asc(experts.fullName));
  const usable = people.filter((p) => p.status !== "do_not_contact");

  // Talent-call applications: three open, one handled.
  for (const [i, p] of usable.slice(0, 4).entries()) {
    await db.insert(applications).values({ jobId: talent.id, expertId: p.id, status: i === 3 ? "reviewing" : "new", stage: "new", channel: "applied", answers: {}, createdAt: new Date(now - (i + 1) * day), updatedAt: new Date(now - (i + 1) * day), handledAt: i === 3 ? new Date(now - day / 2) : null, handledBy: i === 3 ? BY : null }).onConflictDoNothing();
    await db.update(experts).set({ sourceChannel: "talent_call" }).where(eq(experts.id, p.id));
  }

  // Pipelines on the project's first job at every stage.
  const job = demoJobs[0];
  const stages = ["shortlisted", "referred", "selected", "documents", "signed", "active", "ended", "rejected"] as const;
  for (const [i, stage] of stages.entries()) {
    const p = usable[5 + i];
    if (!p || !job) break;
    await db
      .insert(applications)
      .values({ jobId: job.id, expertId: p.id, status: "new", stage, channel: i % 2 ? "sourced" : "applied", answers: {}, trackId: tracks[i % 2].id, ownerTeamMemberId: owner?.id ?? null, nextAction: i < 3 ? "Send the trial task" : null, nextActionDue: i < 3 ? iso(-i) : null, startedOn: stage === "active" || stage === "ended" ? iso(20) : null, endedOn: stage === "ended" ? iso(2) : null, rejectReason: stage === "rejected" ? "skills" : null, stageChangedAt: new Date(now - i * day), createdBy: BY })
      .onConflictDoNothing();
  }
  // Outreach fields on a few people.
  for (const [i, p] of usable.slice(5, 12).entries()) {
    await db
      .update(experts)
      .set({ ownerTeamMemberId: owner?.id ?? null, outreachStatus: (["contacted", "replied", "interested", "no_response", "not_contacted", "contacted", "applied"] as const)[i], nextAction: i % 2 ? "Follow up on LinkedIn" : null, nextActionDue: i % 2 ? iso(i - 3) : null, lastActivityAt: new Date(now - i * day), sourceChannel: i % 3 ? "sourced" : "referral" })
      .where(eq(experts.id, p.id));
  }
  // Opted out of bulk email, and an address on the suppressed list.
  if (usable[13]) await db.update(experts).set({ emailOptOut: true, emailOptOutAt: new Date(now - 3 * day) }).where(eq(experts.id, usable[13].id));
  if (usable[14]?.email) await db.insert(suppressedEmails).values({ email: usable[14].email, reason: "bounced", updatedBy: BY });

  // Timeline rows and a document.
  const lead = usable[5];
  if (lead) {
    await db.insert(expertActivities).values([
      { expertId: lead.id, kind: "note", summary: "Call: strong Python, wants 20 h/week", detail: "Trial task next week.", happenedAt: new Date(now - 2 * day), createdBy: BY, updatedBy: BY },
      { expertId: lead.id, kind: "email", summary: "Email sent: Your trial task", happenedAt: new Date(now - 3 * day), createdBy: BY, updatedBy: BY },
      { expertId: lead.id, kind: "application", summary: `Applied for ${job?.title ?? "a job"}`, happenedAt: new Date(now - 6 * day), createdBy: BY, updatedBy: BY },
    ]);
    await db.insert(expertDocuments).values([
      { expertId: lead.id, kind: "nda", title: "NDA", status: "signed", sentAt: new Date(now - 5 * day), signedAt: new Date(now - 4 * day), createdBy: BY, updatedBy: BY },
      { expertId: lead.id, kind: "agreement", title: "Expert agreement", status: "sent", sentAt: new Date(now - 2 * day), createdBy: BY, updatedBy: BY },
    ]);
    const [eng] = await db.insert(engagements).values({ expertId: lead.id, platform: "Examplework", project: "P101", status: "active", commissionPercent: 10, startedOn: iso(60), updatedBy: BY }).returning({ id: engagements.id });
    await db.insert(monthlyEarnings).values([
      { engagementId: eng.id, expertId: lead.id, month: `${iso(40).slice(0, 7)}-01`, grossInr: 82000, commissionInr: 8200, commissionPercent: 10, updatedBy: BY },
      { engagementId: eng.id, expertId: lead.id, month: `${iso(10).slice(0, 7)}-01`, grossInr: 91000, commissionInr: 9100, commissionPercent: 10, updatedBy: BY },
    ]).onConflictDoNothing();
  }

  // Templates, a group, referrals, fees, radar roles, the email log.
  await db.insert(emailTemplates).values([
    { name: "Outreach: coding evaluators", kind: "outreach", projectId: proj.id, subject: "A paid evaluation project for {{first_name}}", body: "Hi {{first_name}},\n\nWe're staffing {{project}} and think you'd fit {{job_title}}.\n\nApply here: {{invite_link}}\n\nThe FynoLabs team", createdBy: BY, updatedBy: BY },
    { name: "Referral link", kind: "referral", subject: "Your referral link", body: "Hi {{first_name}},\n\nSign up with this link so we can support your application: {{referral_link}}", createdBy: BY, updatedBy: BY },
  ]);
  const [group] = await db.insert(referralGroups).values({ name: "US Python bench", status: "active", updatedBy: BY }).returning({ id: referralGroups.id });
  await db.insert(referralGroups).values({ name: "Old physics list", status: "inactive", updatedBy: BY });
  const members = usable.slice(0, 5).filter((p) => p.email);
  if (members.length) await db.insert(referralGroupMembers).values([...members.map((p) => ({ groupId: group.id, email: p.email as string, name: p.name, expertId: p.id, updatedBy: BY })), { groupId: group.id, email: "outside.person@example.org", name: "Outside Person", updatedBy: BY }]);
  for (const [i, p] of usable.slice(2, 8).entries()) {
    if (!p.email) continue;
    await db.insert(referrals).values({ expertId: p.id, platformId: plat.id, platform: "Examplework", projectId: proj.id, referralUrl: "https://examplework.example.com/signup?ref=FYNO123", recipientEmail: p.email, recipientName: p.name, method: (["email", "link", "profile_share", "agency_form", "link", "intro"] as const)[i], outcome: (["sent", "in_review", "signed_up", "qualified", "active", "rejected"] as const)[i], status: "sent", sentAt: new Date(now - (i + 2) * day), openCount: i, clickCount: i > 1 ? 1 : 0, submittedBy: BY, updatedBy: BY });
  }
  const active = await db.select({ id: applications.id, expertId: applications.expertId }).from(applications).where(eq(applications.stage, "active")).limit(1);
  const feeRows: (typeof referralFees.$inferInsert)[] = [
    { projectId: proj.id, companyId: partner?.id ?? null, personName: usable[10]?.name ?? "A person", applicationId: active[0]?.id ?? null, expertId: active[0]?.expertId ?? null, jobId: job?.id ?? null, amount: 150, currency: "USD", status: "expected", earnedOn: iso(5), createdBy: BY, updatedBy: BY },
    { projectId: proj.id, companyId: partner?.id ?? null, personName: usable[11]?.name ?? "A person", amount: 150, currency: "USD", status: "invoiced", earnedOn: iso(50), invoiceNumber: "FL/2026-27/007", invoicedOn: iso(45), dueOn: iso(15), createdBy: BY, updatedBy: BY },
    { projectId: proj.id, companyId: partner?.id ?? null, personName: usable[12]?.name ?? "A person", amount: 150, currency: "USD", status: "paid", earnedOn: iso(70), invoiceNumber: "FL/2026-27/003", invoicedOn: iso(65), dueOn: iso(35), paidOn: iso(30), paidAmount: 150, createdBy: BY, updatedBy: BY },
    { projectId: proj.id, companyId: partner?.id ?? null, personName: usable[13]?.name ?? "A person", amount: 12000, currency: "INR", status: "void", earnedOn: iso(20), voidReason: "Already on the partner's platform", createdBy: BY, updatedBy: BY },
  ];
  await db.insert(referralFees).values(feeRows);
  await db.insert(radarListings).values([
    { platform: "Examplework", platformId: plat.id, externalId: "ew-1", title: "AI Trainer - Python", company: "Examplework", location: "Remote", url: "https://examplework.example.com/jobs/ai-trainer-python", payMin: 30, payMax: 45, payPeriod: "hour", postedAt: new Date(now - day), status: "new", matchedKeywords: ["ai trainer", "python"], updatedBy: BY },
    { platform: "Examplework", platformId: plat.id, externalId: "ew-2", title: "Evaluation Specialist - Rust", company: "Examplework", location: "Remote (US)", url: "https://examplework.example.com/jobs/eval-rust", postedAt: new Date(now - 3 * day), status: "approved", matchedKeywords: ["evaluation"], updatedBy: BY },
    { platform: "Samplehire", platformId: plat2.id, externalId: "sh-1", title: "Annotation Reviewer", company: "Sample Data Co", location: "India", url: "https://samplehire.example.org/jobs/1", postedAt: new Date(now - 9 * day), status: "discarded", matchedKeywords: ["annotation"], updatedBy: BY },
  ]);
  await db.insert(settings).values({ key: "job_radar", value: { keywords: ["ai trainer", "evaluation", "annotation"], min_pay: 25 }, updatedBy: "fynolabs sync" }).onConflictDoNothing();
  await db.insert(emailSendLog).values([
    { templateName: "operational-update", recipientEmail: "someone@example.com", status: "sent", createdAt: new Date(now - day) },
    { templateName: "system", recipientEmail: usable[14]?.email ?? "x@example.com", status: "bounced", errorMessage: "Permanent bounce — email address is invalid or rejected", createdAt: new Date(now - 2 * day) },
  ]);
  await db.execute(sql`select 1`);
  return { projectId: proj.id, trackIds: tracks.map((t) => t.id), platformId: plat.id, talentJobId: talent.id, groupId: group.id };
}
