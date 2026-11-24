// My work (FynoLabs MyWork): one person's list for the day. Follow-ups due (their companies' next
// steps, their contacts' follow-ups, their experts' and pipelines' next actions), calendar items,
// applicants to screen, prospects to contact, people who haven't replied, referral links without a
// sign-up and documents waiting for a signature. "Today" is India time. Admins can look at anyone's
// list, or everyone's.
import { and, asc, count, eq, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, calendarEvents, contacts, expertActivities, expertDocuments, experts, jobs, partners, projectMembers, projects, referrals, teamMembers } from "@/db/schema";
import { crmLabel } from "@/lib/crm/labels";
import { addDays } from "@/lib/crm/dates";
import { actorEmail, logActivity, type Actor } from "./activity";
import type { Result } from "./companies";
import { isUuid } from "./experts";

/** Whose list: a team member (id may be null for ADMIN_EMAILS without a row) or everyone. */
export type WorkFor = { id: string | null; email: string } | null;

export type WorkItem = {
  key: string;
  type: "company" | "contact" | "expert" | "pipeline" | "event" | "screen" | "prospect" | "no_reply" | "link" | "document";
  title: string;
  detail: string;
  due: string | null;
  late: boolean;
  href: string;
  owner?: string | null;
  /** For the "Contacted" button (prospects). */
  expertId?: string;
};

export const WORK_TABS = ["follow_ups", "calendar", "to_screen", "prospects", "no_reply", "links", "documents"] as const;
export type WorkTab = (typeof WORK_TABS)[number];
export const WORK_TAB_LABELS: Record<WorkTab, string> = {
  follow_ups: "Follow-ups",
  calendar: "Calendar",
  to_screen: "To screen",
  prospects: "Prospects",
  no_reply: "No reply",
  links: "Links",
  documents: "Documents",
};
export const WORK_EMPTY: Record<WorkTab, string> = {
  follow_ups: "No follow-ups due today.",
  calendar: "Nothing on the calendar for today.",
  to_screen: "No new applicants to screen.",
  prospects: "No prospects waiting to be contacted.",
  no_reply: "Everyone you contacted has answered, or it's been under 3 days.",
  links: "No referral links waiting for a sign-up.",
  documents: "No documents waiting for a signature or about to expire.",
};

const ownerName = (id: unknown) => sql<string | null>`(select coalesce(m.name, m.email) from ${teamMembers} m where m.id = ${id})`;
const mine = (col: SQL | typeof partners.ownerTeamMemberId, who: WorkFor): SQL | undefined => (who ? (who.id ? sql`${col} = ${who.id}` : sql`false`) : sql`${col} is not null`);

export async function myWork(db: DB, who: WorkFor, today: string, limit = 50) {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  const late = (d: string | null) => Boolean(d && d < today);

  const [companyRows, contactRows, expertRows, pipeRows, eventRows, screenRows, prospectRows, noReplyRows, linkRows, docRows, [open]] = await Promise.all([
    db
      .select({ id: partners.id, name: partners.name, nextStep: partners.nextStep, due: partners.nextStepDue, stage: partners.stage, owner: ownerName(partners.ownerTeamMemberId) })
      .from(partners)
      .where(and(mine(partners.ownerTeamMemberId, who), isNotNull(partners.nextStepDue), lte(partners.nextStepDue, today), ne(partners.stage, "dropped")))
      .orderBy(asc(partners.nextStepDue), asc(partners.name))
      .limit(limit),
    db
      .select({ id: contacts.id, name: contacts.name, company: sql<string | null>`coalesce(${partners.name}, ${contacts.company})`, due: contacts.nextFollowUp, owner: ownerName(partners.ownerTeamMemberId) })
      .from(contacts)
      .leftJoin(partners, eq(partners.id, contacts.companyId))
      .where(
        and(
          isNotNull(contacts.nextFollowUp),
          lte(contacts.nextFollowUp, today),
          notInArray(contacts.stage, ["won", "lost"]),
          who ? or(who.id ? eq(partners.ownerTeamMemberId, who.id) : sql`false`, and(isNull(partners.ownerTeamMemberId), eq(contacts.createdBy, who.email))) : undefined,
        ),
      )
      .orderBy(asc(contacts.nextFollowUp), asc(contacts.name))
      .limit(limit),
    db
      .select({ id: experts.id, name: experts.fullName, action: experts.nextAction, due: experts.nextActionDue, headline: experts.headline, owner: ownerName(experts.ownerTeamMemberId) })
      .from(experts)
      .where(and(mine(sql`${experts.ownerTeamMemberId}`, who), isNotNull(experts.nextActionDue), lte(experts.nextActionDue, today), ne(experts.status, "do_not_contact")))
      .orderBy(asc(experts.nextActionDue), asc(experts.fullName))
      .limit(limit),
    db
      .select({ id: applications.id, expertId: experts.id, name: experts.fullName, action: applications.nextAction, due: applications.nextActionDue, job: jobs.title, owner: ownerName(applications.ownerTeamMemberId) })
      .from(applications)
      .innerJoin(experts, eq(experts.id, applications.expertId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(mine(sql`${applications.ownerTeamMemberId}`, who), isNotNull(applications.nextActionDue), lte(applications.nextActionDue, today), notInArray(applications.stage, ["rejected", "ended"])))
      .orderBy(asc(applications.nextActionDue), asc(experts.fullName))
      .limit(limit),
    db
      .select({ id: calendarEvents.id, title: calendarEvents.title, kind: calendarEvents.kind, date: calendarEvents.eventDate, start: calendarEvents.startTime, company: partners.name })
      .from(calendarEvents)
      .leftJoin(partners, eq(partners.id, calendarEvents.companyId))
      .where(
        and(
          notInArray(calendarEvents.status, ["done", "cancelled"]),
          isNotNull(calendarEvents.eventDate),
          lte(calendarEvents.eventDate, today),
          who ? or(who.id ? sql`${who.id} = any(${calendarEvents.teamMemberIds})` : sql`false`, eq(calendarEvents.createdBy, who.email)) : undefined,
        ),
      )
      .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.startTime))
      .limit(limit),
    db
      .select({ id: applications.id, expertId: experts.id, name: experts.fullName, job: jobs.title, createdAt: applications.createdAt, owner: ownerName(applications.ownerTeamMemberId) })
      .from(applications)
      .innerJoin(experts, eq(experts.id, applications.expertId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          eq(applications.stage, "new"),
          ne(applications.channel, "sourced"),
          who
            ? or(
                who.id ? eq(applications.ownerTeamMemberId, who.id) : sql`false`,
                and(
                  isNull(applications.ownerTeamMemberId),
                  who.id
                    ? sql`${jobs.projectId} in (select ${projectMembers.projectId} from ${projectMembers} where ${projectMembers.teamMemberId} = ${who.id} and ${projectMembers.active} union select ${projects.id} from ${projects} where ${projects.ownerTeamMemberId} = ${who.id})`
                    : sql`false`,
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(applications.createdAt))
      .limit(limit),
    db
      .select({ id: experts.id, name: experts.fullName, headline: experts.headline, country: experts.country, owner: ownerName(experts.ownerTeamMemberId) })
      .from(experts)
      .where(and(mine(sql`${experts.ownerTeamMemberId}`, who), eq(experts.status, "applicant"), or(isNull(experts.outreachStatus), eq(experts.outreachStatus, "not_contacted"))))
      .orderBy(asc(experts.createdAt))
      .limit(limit),
    db
      .select({ id: experts.id, name: experts.fullName, at: experts.lastContactedAt, owner: ownerName(experts.ownerTeamMemberId) })
      .from(experts)
      .where(and(mine(sql`${experts.ownerTeamMemberId}`, who), eq(experts.outreachStatus, "contacted"), lte(experts.lastContactedAt, threeDaysAgo), ne(experts.status, "do_not_contact")))
      .orderBy(asc(experts.lastContactedAt))
      .limit(limit),
    db
      .select({ id: referrals.id, expertId: referrals.expertId, name: sql<string | null>`coalesce(${experts.fullName}, ${referrals.recipientName})`, platform: referrals.platform, sentAt: referrals.sentAt, by: referrals.submittedBy })
      .from(referrals)
      .leftJoin(experts, eq(experts.id, referrals.expertId))
      .where(and(who ? eq(referrals.submittedBy, who.email) : undefined, inArray(referrals.method, ["email", "link"]), eq(referrals.outcome, "sent"), lte(referrals.sentAt, threeDaysAgo)))
      .orderBy(asc(referrals.sentAt))
      .limit(limit),
    db
      .select({ id: expertDocuments.id, expertId: experts.id, name: experts.fullName, title: expertDocuments.title, status: expertDocuments.status, sentAt: expertDocuments.sentAt, expiresAt: expertDocuments.expiresAt, owner: ownerName(experts.ownerTeamMemberId) })
      .from(expertDocuments)
      .innerJoin(experts, eq(experts.id, expertDocuments.expertId))
      .where(
        and(
          or(and(eq(expertDocuments.status, "sent"), lte(expertDocuments.sentAt, twoDaysAgo)), and(eq(expertDocuments.status, "signed"), sql`${expertDocuments.expiresAt} between ${now.toISOString()}::timestamptz and ${in30.toISOString()}::timestamptz`)),
          who ? or(who.id ? eq(experts.ownerTeamMemberId, who.id) : sql`false`, eq(expertDocuments.createdBy, who.email)) : undefined,
        ),
      )
      .orderBy(asc(expertDocuments.sentAt))
      .limit(limit),
    db
      .select({ n: count() })
      .from(applications)
      .where(and(who ? (who.id ? eq(applications.ownerTeamMemberId, who.id) : sql`false`) : isNotNull(applications.ownerTeamMemberId), notInArray(applications.stage, ["rejected", "ended"]))),
  ]);

  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
  const followUps: WorkItem[] = [
    ...companyRows.map((r) => ({ key: `company:${r.id}`, type: "company" as const, title: r.name, detail: `${r.nextStep?.trim() || "Next step"} · ${crmLabel(r.stage)}`, due: r.due, late: late(r.due), href: `/admin/accounts?view=${r.id}`, owner: r.owner })),
    ...contactRows.map((r) => ({ key: `contact:${r.id}`, type: "contact" as const, title: r.name, detail: `Follow up${r.company ? ` · ${r.company}` : ""}`, due: r.due, late: late(r.due), href: `/admin/leads?view=${r.id}`, owner: r.owner })),
    ...expertRows.map((r) => ({ key: `expert:${r.id}`, type: "expert" as const, title: r.name, detail: `${r.action?.trim() || "Next step"}${r.headline ? ` · ${r.headline}` : ""}`, due: r.due, late: late(r.due), href: `/admin/experts?view=${r.id}`, owner: r.owner })),
    ...pipeRows.map((r) => ({ key: `pipeline:${r.id}`, type: "pipeline" as const, title: r.name, detail: `${r.action?.trim() || "Next step"} · ${r.job}`, due: r.due, late: late(r.due), href: `/admin/experts?view=${r.expertId}`, owner: r.owner })),
  ].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "") || a.title.localeCompare(b.title));
  const calendar: WorkItem[] = eventRows.map((r) => ({
    key: `event:${r.id}`,
    type: "event",
    title: r.title,
    detail: [crmLabel(r.kind, "calendar"), r.start ? r.start.slice(0, 5) : "All day", r.company].filter(Boolean).join(" · "),
    due: r.date,
    late: late(r.date),
    href: `/admin/calendar?event=${r.id}`,
  }));
  const toScreen: WorkItem[] = screenRows.map((r) => ({ key: `screen:${r.id}`, type: "screen", title: r.name, detail: `${r.job} · Applied ${d(r.createdAt)}`, due: null, late: false, href: `/admin/experts?view=${r.expertId}`, owner: r.owner }));
  const prospects: WorkItem[] = prospectRows.map((r) => ({ key: `prospect:${r.id}`, type: "prospect", title: r.name, detail: [r.headline, r.country].filter(Boolean).join(" · ") || "Prospect", due: null, late: false, href: `/admin/experts?view=${r.id}`, owner: r.owner, expertId: r.id }));
  const noReply: WorkItem[] = noReplyRows.map((r) => ({ key: `no_reply:${r.id}`, type: "no_reply", title: r.name, detail: `Contacted ${d(r.at)}`, due: null, late: false, href: `/admin/experts?view=${r.id}`, owner: r.owner }));
  const links: WorkItem[] = linkRows.map((r) => ({ key: `link:${r.id}`, type: "link", title: r.name ?? "Someone", detail: `${r.platform} · sent ${d(r.sentAt)}`, due: null, late: false, href: r.expertId ? `/admin/experts?view=${r.expertId}` : "/admin/platforms", owner: r.by }));
  const documents: WorkItem[] = docRows.map((r) => ({
    key: `document:${r.id}`,
    type: "document",
    title: r.name,
    detail: r.status === "sent" ? `${r.title} · waiting for a signature since ${d(r.sentAt)}` : `${r.title} · expires ${d(r.expiresAt)}`,
    due: null,
    late: false,
    href: `/admin/experts?view=${r.expertId}`,
    owner: r.owner,
  }));
  return {
    tabs: { follow_ups: followUps, calendar, to_screen: toScreen, prospects, no_reply: noReply, links, documents } as Record<WorkTab, WorkItem[]>,
    openPipelines: Number(open?.n ?? 0),
  };
}

/** "Contacted" on a prospect: outreach contacted now, a follow-up in 3 days, a timeline entry. */
export async function markContacted(db: DB, expertId: string, today: string, actor: Actor): Promise<Result> {
  if (!isUuid(expertId)) return { ok: false, reason: "That expert no longer exists." };
  const now = new Date();
  const rows = await db
    .update(experts)
    .set({ outreachStatus: "contacted", lastContactedAt: now, lastActivityAt: now, nextAction: "Follow up if they haven't replied", nextActionDue: addDays(today, 3), nextActionAuto: true, updatedAt: now })
    .where(eq(experts.id, expertId))
    .returning({ id: experts.id });
  if (!rows.length) return { ok: false, reason: "That expert no longer exists." };
  await db.insert(expertActivities).values({ expertId, kind: "outreach", summary: "Outreach: contacted", createdBy: actorEmail(actor), updatedBy: actorEmail(actor) });
  await logActivity(db, { entityType: "expert", entityId: expertId, actor, action: "updated", detail: { fields: ["outreachStatus", "nextAction", "nextActionDue"] } });
  return { ok: true, id: expertId };
}
