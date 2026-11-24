// The calendar (hub.calendar_events), in India time, and the timeline it sits on: calls, meetings,
// follow-ups, deadlines, tasks and posts, plus (read only) companies' next-step due dates, contacts'
// follow-ups and job closing dates. Marking a call or meeting done logs it on the company.
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { calendarEvents, companyActivities, contacts, jobs, partners, teamMembers } from "@/db/schema";
import { CALENDAR_KINDS, CALENDAR_STATUSES, isOneOf } from "@/lib/constants";
import { hhmm, isIsoDate, isTime, istInstant } from "@/lib/crm/dates";
import { cleanLongText, cleanText, normalizeEmail } from "@/lib/normalize";
import { actorEmail, logActivity, type Actor } from "./activity";
import type { Result } from "./companies";
import { isUuid } from "./experts";

export type EventRow = typeof calendarEvents.$inferSelect & { companyName: string | null; companyKind: string | null };

const eventCols = {
  id: calendarEvents.id,
  title: calendarEvents.title,
  kind: calendarEvents.kind,
  status: calendarEvents.status,
  eventDate: calendarEvents.eventDate,
  startTime: calendarEvents.startTime,
  endTime: calendarEvents.endTime,
  timezone: calendarEvents.timezone,
  companyId: calendarEvents.companyId,
  contactId: calendarEvents.contactId,
  contactIds: calendarEvents.contactIds,
  teamMemberIds: calendarEvents.teamMemberIds,
  meetingUrl: calendarEvents.meetingUrl,
  notes: calendarEvents.notes,
  createdBy: calendarEvents.createdBy,
  createdAt: calendarEvents.createdAt,
  updatedAt: calendarEvents.updatedAt,
  updatedBy: calendarEvents.updatedBy,
  companyName: partners.name,
  companyKind: partners.kind,
};

export async function getEvent(db: DB, id: string): Promise<EventRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select(eventCols).from(calendarEvents).leftJoin(partners, eq(partners.id, calendarEvents.companyId)).where(eq(calendarEvents.id, id)).limit(1);
  return row ?? null;
}

// ---------- The timeline ----------

export type TimelineSource = "calendar" | "company" | "contact" | "job";
export const SOURCE_LABELS: Record<TimelineSource, string> = { calendar: "Calendar", company: "Account next step", contact: "Lead follow-up", job: "Job closes" };

export type TimelineItem = {
  key: string;
  source: TimelineSource;
  id: string;
  title: string;
  kind: string;
  status: string;
  date: string | null;
  start: string | null;
  end: string | null;
  companyId: string | null;
  companyName: string | null;
  contactIds: string[];
  teamMemberIds: string[];
  meetingUrl: string | null;
  notes: string | null;
  /** Where an overlay item opens (its record). */
  href: string | null;
  ownerTeamMemberId?: string | null;
  createdBy?: string | null;
};

export const KIND_FILTERS = {
  "": { label: "Everything", kinds: null },
  calls: { label: "Calls & meetings", kinds: ["call", "meeting"] },
  follow_ups: { label: "Follow-ups", kinds: ["follow_up"] },
  deadlines: { label: "Deadlines", kinds: ["deadline"] },
  tasks: { label: "Tasks & posts", kinds: ["task", "post"] },
} as const;
export type KindFilter = keyof typeof KIND_FILTERS;

const isOpen = (i: TimelineItem) => i.status !== "done" && i.status !== "cancelled";

/** By date, timed items by start time, then all-day ones, then the title; undated last. */
export function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort(
    (a, b) =>
      (a.date ?? "9999-99-99").localeCompare(b.date ?? "9999-99-99") ||
      (a.start ? 0 : 1) - (b.start ? 0 : 1) ||
      (a.start ?? "").localeCompare(b.start ?? "") ||
      a.title.localeCompare(b.title),
  );
}

export type TimelineQuery = {
  from: string;
  to: string;
  today: string;
  /** Also every open item before `from` (the Overdue list). */
  overdue?: boolean;
  /** Also every event without a date (Unscheduled). */
  undated?: boolean;
  kind?: KindFilter;
  /** Only this team member's items (events they're on or created, companies they own). */
  member?: { id: string | null; email: string } | null;
};

/** Events and the read-only overlays between two dates (inclusive), merged and sorted. */
export async function timeline(db: DB, q: TimelineQuery): Promise<TimelineItem[]> {
  const lower = q.overdue ? "0001-01-01" : q.from;
  const dateWindow = and(gte(calendarEvents.eventDate, lower), lte(calendarEvents.eventDate, q.to));
  const eventRows = await db
    .select(eventCols)
    .from(calendarEvents)
    .leftJoin(partners, eq(partners.id, calendarEvents.companyId))
    .where(and(ne(calendarEvents.status, "cancelled"), q.undated ? or(dateWindow, isNull(calendarEvents.eventDate)) : dateWindow))
    .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.startTime));
  const events: TimelineItem[] = eventRows
    .filter((e) => !q.overdue || !e.eventDate || e.eventDate >= q.from || (e.status !== "done" && e.status !== "cancelled"))
    .map((e) => ({
      key: `calendar:${e.id}`,
      source: "calendar" as const,
      id: e.id,
      title: e.title,
      kind: e.kind,
      status: e.status,
      date: e.eventDate,
      start: hhmm(e.startTime),
      end: hhmm(e.endTime),
      companyId: e.companyId,
      companyName: e.companyName,
      contactIds: e.contactIds.length ? e.contactIds : e.contactId ? [e.contactId] : [],
      teamMemberIds: e.teamMemberIds,
      meetingUrl: e.meetingUrl,
      notes: e.notes,
      href: null,
      createdBy: e.createdBy,
    }));

  const [companyRows, contactRows, jobRows] = await Promise.all([
    db
      .select({ id: partners.id, name: partners.name, nextStep: partners.nextStep, due: partners.nextStepDue, owner: partners.ownerTeamMemberId })
      .from(partners)
      .where(and(isNotNull(partners.nextStepDue), ne(partners.stage, "dropped"), gte(partners.nextStepDue, lower), lte(partners.nextStepDue, q.to))),
    db
      .select({ id: contacts.id, name: contacts.name, due: contacts.nextFollowUp, companyId: contacts.companyId, companyName: partners.name, owner: partners.ownerTeamMemberId, createdBy: contacts.createdBy })
      .from(contacts)
      .leftJoin(partners, eq(partners.id, contacts.companyId))
      .where(and(isNotNull(contacts.nextFollowUp), notInArray(contacts.stage, ["won", "lost"]), gte(contacts.nextFollowUp, lower), lte(contacts.nextFollowUp, q.to))),
    db
      .select({ id: jobs.id, title: jobs.title, closesOn: jobs.closesOn })
      .from(jobs)
      .where(and(eq(jobs.status, "open"), isNotNull(jobs.closesOn), gte(jobs.closesOn, q.from), lte(jobs.closesOn, q.to))),
  ]);
  // A company with an event that day doesn't get its next step twice.
  const eventDays = new Set(events.filter((e) => e.companyId && e.date).map((e) => `${e.companyId}:${e.date}`));
  const overlays: TimelineItem[] = [
    ...companyRows
      .filter((c) => !eventDays.has(`${c.id}:${c.due}`))
      .map((c) => ({
        key: `company:${c.id}`,
        source: "company" as const,
        id: c.id,
        title: c.nextStep?.trim() || `Next step for ${c.name}`,
        kind: "follow_up",
        status: "planned",
        date: c.due,
        start: null,
        end: null,
        companyId: c.id,
        companyName: c.name,
        contactIds: [],
        teamMemberIds: [],
        meetingUrl: null,
        notes: null,
        href: `/admin/accounts/${c.id}`,
        ownerTeamMemberId: c.owner,
      })),
    ...contactRows.map((c) => ({
      key: `contact:${c.id}`,
      source: "contact" as const,
      id: c.id,
      title: `Follow up ${c.name}`,
      kind: "follow_up",
      status: "planned",
      date: c.due,
      start: null,
      end: null,
      companyId: c.companyId,
      companyName: c.companyName,
      contactIds: [c.id],
      teamMemberIds: [],
      meetingUrl: null,
      notes: null,
      href: `/admin/leads?view=${c.id}`,
      ownerTeamMemberId: c.owner,
      createdBy: c.createdBy,
    })),
    ...jobRows.map((j) => ({
      key: `job:${j.id}`,
      source: "job" as const,
      id: j.id,
      title: `${j.title} closes`,
      kind: "deadline",
      status: "planned",
      date: j.closesOn,
      start: null,
      end: null,
      companyId: null,
      companyName: null,
      contactIds: [],
      teamMemberIds: [],
      meetingUrl: null,
      notes: null,
      href: `/admin/jobs/${j.id}`,
    })),
  ];
  let all = [...events, ...overlays];
  if (q.overdue) all = all.filter((i) => !i.date || i.date >= q.from || isOpen(i));
  const kinds = q.kind ? KIND_FILTERS[q.kind]?.kinds : null;
  if (kinds) all = all.filter((i) => (kinds as readonly string[]).includes(i.kind));
  if (q.member) {
    const m = q.member;
    all = all.filter((i) =>
      i.source === "calendar"
        ? (m.id ? i.teamMemberIds.includes(m.id) : false) || i.createdBy === m.email
        : i.source === "job"
          ? false
          : (m.id ? i.ownerTeamMemberId === m.id : false) || (i.source === "contact" && !i.ownerTeamMemberId && i.createdBy === m.email),
    );
  }
  return sortTimeline(all);
}

export type CalendarStats = { today: number; next7: number; calls10: number; overdue: number };

/** The tiles: open items only (not done or cancelled). */
export function calendarStats(items: TimelineItem[], today: string, addDays: (d: string, n: number) => string): CalendarStats {
  const open = items.filter(isOpen);
  const in7 = addDays(today, 6);
  const in10 = addDays(today, 9);
  return {
    today: open.filter((i) => i.date === today).length,
    next7: open.filter((i) => i.date && i.date >= today && i.date <= in7).length,
    calls10: open.filter((i) => i.source === "calendar" && (i.kind === "call" || i.kind === "meeting") && i.date && i.date >= today && i.date <= in10).length,
    overdue: open.filter((i) => i.date && i.date < today).length,
  };
}

// ---------- Writes ----------

export type EventInput = {
  title: string;
  kind: string;
  status: string;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  companyId: string | null;
  contactIds: string[];
  teamMemberIds: string[];
  meetingUrl: string | null;
  notes: string | null;
  /** Someone new on their side: added to contacts (stage "Call booked"). */
  newPerson?: { name: string | null; email: string | null } | null;
};

async function eventValues(db: DB, input: EventInput, actor: Actor): Promise<Result<{ values: Omit<typeof calendarEvents.$inferInsert, "id"> }>> {
  const title = cleanText(input.title, 300);
  if (!title) return { ok: false, reason: "Add a title." };
  if (!isOneOf(CALENDAR_KINDS, input.kind)) return { ok: false, reason: "Pick a type." };
  if (!isOneOf(CALENDAR_STATUSES, input.status)) return { ok: false, reason: "Pick a status." };
  const date = input.eventDate ? input.eventDate.trim() : "";
  if (date && !isIsoDate(date)) return { ok: false, reason: "The date isn't a date." };
  const start = date && input.startTime ? input.startTime.trim() : "";
  const end = date && input.endTime ? input.endTime.trim() : "";
  if ((start && !isTime(start)) || (end && !isTime(end))) return { ok: false, reason: "Times are HH:MM, India time." };
  if (start && end && end < start) return { ok: false, reason: "The end time is before the start." };
  let companyId: string | null = null;
  let companyName: string | null = null;
  let companyKind: string | null = null;
  if (input.companyId) {
    if (!isUuid(input.companyId)) return { ok: false, reason: "Pick an account from the list." };
    const [c] = await db.select({ id: partners.id, name: partners.name, kind: partners.kind }).from(partners).where(eq(partners.id, input.companyId)).limit(1);
    if (!c) return { ok: false, reason: "That account no longer exists." };
    ({ id: companyId, name: companyName, kind: companyKind } = c);
  }
  const ids = [...new Set(input.contactIds.filter(isUuid))];
  const found = ids.length ? await db.select({ id: contacts.id }).from(contacts).where(inArray(contacts.id, ids)) : [];
  const contactIds = ids.filter((id) => found.some((f) => f.id === id));
  const newName = cleanText(input.newPerson?.name, 160);
  const newEmailRaw = cleanText(input.newPerson?.email, 254);
  const newEmail = newEmailRaw ? normalizeEmail(newEmailRaw) : null;
  if (newEmailRaw && !newEmail) return { ok: false, reason: "The new person's email doesn't look right." };
  if (newEmail && !newName) return { ok: false, reason: "Add the new person's name too." };
  if (newName) {
    const email = actorEmail(actor);
    const [c] = await db
      .insert(contacts)
      .values({ name: newName, email: newEmail, companyId, company: companyName, kind: companyKind === "client" ? "client" : "partner", stage: "call", source: "other", createdBy: email, updatedBy: email })
      .returning({ id: contacts.id });
    await logActivity(db, { entityType: "contact", entityId: c.id, actor, action: "created", detail: { via: "calendar" } });
    contactIds.push(c.id);
  }
  const tIds = [...new Set(input.teamMemberIds.filter(isUuid))];
  const team = tIds.length ? await db.select({ id: teamMembers.id }).from(teamMembers).where(inArray(teamMembers.id, tIds)) : [];
  const teamMemberIds = tIds.filter((id) => team.some((t) => t.id === id));
  const meeting = cleanText(input.meetingUrl, 500);
  const meetingUrl = meeting && !/^(javascript|data|vbscript):/i.test(meeting) ? (/^https?:\/\//i.test(meeting) ? meeting : `https://${meeting}`) : null;
  return {
    ok: true,
    values: {
      title,
      kind: input.kind,
      status: input.status,
      eventDate: date || null,
      startTime: start ? `${start.slice(0, 5)}:00` : null,
      endTime: end ? `${end.slice(0, 5)}:00` : null,
      timezone: "Asia/Kolkata",
      companyId,
      contactId: contactIds[0] ?? null,
      contactIds,
      teamMemberIds,
      meetingUrl,
      notes: cleanLongText(input.notes, 8000),
    },
  };
}

/**
 * A call or meeting with a company that becomes done is logged on the company: its kind, the
 * event's title, the person, at the event's date and start time in India (12:00 when none).
 */
async function logDoneOnCompany(db: DB, e: { id: string; title: string; kind: string; companyId: string | null; contactId: string | null; eventDate: string | null; startTime: string | null }, actor: Actor): Promise<boolean> {
  if (!e.companyId || (e.kind !== "call" && e.kind !== "meeting")) return false;
  const happenedAt = e.eventDate ? istInstant(e.eventDate, e.startTime) : new Date();
  const email = actorEmail(actor);
  await db.insert(companyActivities).values({ companyId: e.companyId, contactId: e.contactId, kind: e.kind, summary: e.title.slice(0, 500), happenedAt, createdBy: email, updatedBy: email });
  await db
    .update(partners)
    .set({ lastActivityAt: sql`greatest(coalesce(${partners.lastActivityAt}, ${happenedAt.toISOString()}::timestamptz), ${happenedAt.toISOString()}::timestamptz)` })
    .where(eq(partners.id, e.companyId));
  return true;
}

export async function saveEvent(db: DB, id: string | null, input: EventInput, actor: Actor): Promise<Result<{ id: string; logged: boolean }>> {
  const before = id ? await getEvent(db, id) : null;
  if (id && !before) return { ok: false, reason: "That event no longer exists." };
  const checked = await eventValues(db, input, actor);
  if (!checked.ok) return checked;
  const email = actorEmail(actor);
  const now = new Date();
  let eventId: string;
  if (before) {
    await db.update(calendarEvents).set({ ...checked.values, updatedAt: now, updatedBy: email }).where(eq(calendarEvents.id, before.id));
    eventId = before.id;
  } else {
    const [row] = await db.insert(calendarEvents).values({ ...checked.values, createdBy: email, updatedBy: email }).returning({ id: calendarEvents.id });
    eventId = row.id;
  }
  const becameDone = checked.values.status === "done" && before?.status !== "done";
  const v = checked.values;
  const logged = becameDone
    ? await logDoneOnCompany(db, { id: eventId, title: v.title, kind: v.kind ?? "call", companyId: v.companyId ?? null, contactId: v.contactId ?? null, eventDate: v.eventDate ?? null, startTime: v.startTime ?? null }, actor)
    : false;
  await logActivity(db, { entityType: "calendar_event", entityId: eventId, actor, action: before ? (becameDone ? "marked_done" : "updated") : "created", detail: { kind: checked.values.kind } });
  return { ok: true, id: eventId, logged };
}

export async function markEventDone(db: DB, id: string, actor: Actor): Promise<Result<{ id: string; logged: boolean }>> {
  const e = await getEvent(db, id);
  if (!e) return { ok: false, reason: "That event no longer exists." };
  if (e.status === "done") return { ok: true, id, logged: false };
  await db.update(calendarEvents).set({ status: "done", updatedAt: new Date(), updatedBy: actorEmail(actor) }).where(eq(calendarEvents.id, id));
  const logged = await logDoneOnCompany(db, e, actor);
  await logActivity(db, { entityType: "calendar_event", entityId: id, actor, action: "marked_done", detail: { kind: e.kind, logged } });
  return { ok: true, id, logged };
}

export async function deleteEvent(db: DB, id: string, actor: Actor): Promise<Result> {
  const e = await getEvent(db, id);
  if (!e) return { ok: false, reason: "That event no longer exists." };
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  await logActivity(db, { entityType: "calendar_event", entityId: id, actor, action: "deleted" });
  return { ok: true, id };
}

/** Names for the ids on events (their side and ours), for display. */
export async function namesFor(db: DB, items: { contactIds: string[]; teamMemberIds: string[] }[]) {
  const cIds = [...new Set(items.flatMap((i) => i.contactIds))];
  const tIds = [...new Set(items.flatMap((i) => i.teamMemberIds))];
  const [cs, ts] = await Promise.all([
    cIds.length ? db.select({ id: contacts.id, name: contacts.name }).from(contacts).where(inArray(contacts.id, cIds)) : Promise.resolve([]),
    tIds.length ? db.select({ id: teamMembers.id, name: teamMembers.name, email: teamMembers.email }).from(teamMembers).where(inArray(teamMembers.id, tIds)) : Promise.resolve([]),
  ]);
  return {
    contacts: new Map(cs.map((c) => [c.id, c.name])),
    team: new Map(ts.map((t) => [t.id, (t.name ?? t.email.split("@")[0]).split(" ")[0]])),
  };
}
