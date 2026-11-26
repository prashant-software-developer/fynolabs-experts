import Link from "next/link";
import { ArrowUpRight, CheckSquare, ChevronLeft, ChevronRight, CornerUpRight, Flag, Megaphone, Phone, Plus, Users, Video, type LucideIcon } from "lucide-react";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { CALENDAR_KINDS, CALENDAR_STATUSES, CALENDAR_TIMEZONE } from "@/lib/constants";
import { addDays, addMonths, hhmm, isIsoDate, longDay, monthGrid, monthStart, monthTitle, relativeDay, shortDay, todayIST, weekStart } from "@/lib/crm/dates";
import { crmLabel } from "@/lib/crm/labels";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { KIND_FILTERS, SOURCE_LABELS, calendarStats, getEvent, namesFor, timeline, type KindFilter, type TimelineItem } from "@/lib/server/calendar";
import { companyChoices, myTeamMemberId, teamOptions } from "@/lib/server/companies";
import { contactChoices } from "@/lib/server/contacts";
import { Facts, StatusChip } from "@/components/crm/chips";
import { OrgLogo } from "@/components/crm/org-logo";
import { Segments } from "@/components/crm/segments";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { cn } from "@/components/ui/cn";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { FilterSelect } from "@/components/ui/toolbar";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader, Section, Stack, Stat, StatGrid } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { markCalendarEventDone, removeCalendarEvent, saveCalendarEvent } from "./actions";

export const metadata = { title: "Calendar" };

type View = "agenda" | "week" | "month";
const AGENDA_DAYS = 14;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("calendar");
  if (!allowed)
    return (
      <>
        <PageHeader title="Calendar" />
        <Section>
          <NoAccess what="Calendar" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const today = todayIST();
  const viewRaw = one(sp.view);
  const view: View = viewRaw === "week" || viewRaw === "month" ? viewRaw : "agenda";
  const anchor = isIsoDate(one(sp.date)) ? one(sp.date) : today;
  const kindRaw = one(sp.kind);
  const kind = (kindRaw in KIND_FILTERS ? kindRaw : "") as KindFilter;
  const mine = one(sp.mine) === "1";
  const meId = await myTeamMemberId(db, user.email);
  const member = mine ? { id: meId, email: user.email } : null;
  const edit = can(user.role, "crm.edit");

  const range =
    view === "month"
      ? { from: monthGrid(anchor)[0][0], to: monthGrid(anchor).at(-1)![6] }
      : view === "week"
        ? { from: weekStart(anchor), to: addDays(weekStart(anchor), 6) }
        : { from: anchor, to: addDays(anchor, AGENDA_DAYS - 1) };
  const [items, statItems] = await Promise.all([
    timeline(db, { ...range, today, overdue: view === "agenda" && anchor === today, undated: true, kind, member }),
    timeline(db, { from: today, to: addDays(today, 9), today, overdue: true, member }),
  ]);
  const stats = calendarStats(statItems, today, addDays);
  const names = await namesFor(db, items);
  const undated = items.filter((i) => !i.date);
  const overdue = items.filter((i) => i.date && i.date < range.from);
  const inRange = items.filter((i) => i.date && i.date >= range.from && i.date <= range.to);
  const byDay = new Map<string, TimelineItem[]>();
  for (const i of inRange) byDay.set(i.date!, [...(byDay.get(i.date!) ?? []), i]);

  const base = hrefWith("/admin/calendar", sp, { event: null, edit: null, new: null, ok: null, error: null });
  const here = hrefWith("/admin/calendar", sp, { ok: null, error: null });
  const nav = (date: string | null, v: View = view) => hrefWith("/admin/calendar", sp, { date, view: v === "agenda" ? null : v, event: null, edit: null, new: null, ok: null, error: null });
  const step = view === "month" ? (n: number) => addMonths(anchor, n) : view === "week" ? (n: number) => addDays(anchor, 7 * n) : (n: number) => addDays(anchor, AGENDA_DAYS * n);
  const title = view === "month" ? monthTitle(anchor) : view === "week" ? `${shortDay(range.from, today)} – ${shortDay(range.to, today)}` : anchor === today ? `Today and the next ${AGENDA_DAYS - 1} days` : `${shortDay(range.from, today)} – ${shortDay(range.to, today)}`;

  const eventId = one(sp.event) || one(sp.edit);
  const opened = eventId ? await getEvent(db, eventId) : null;
  const editing = edit && (one(sp.edit) || one(sp.new));
  const prefillCompany = one(sp.company);
  const [companies, team, contactList] = editing ? await Promise.all([companyChoices(db), teamOptions(db), contactChoices(db, opened?.companyId ?? prefillCompany)]) : [[], [], []];
  const openedNames = opened ? await namesFor(db, [{ contactIds: opened.contactIds.length ? opened.contactIds : opened.contactId ? [opened.contactId] : [], teamMemberIds: opened.teamMemberIds }]) : null;
  const itemHref = (i: TimelineItem) => (i.source === "calendar" ? hrefWith("/admin/calendar", sp, { event: i.id, edit: null, new: null, ok: null, error: null }) : (i.href ?? "#"));
  const now = new Date().toLocaleTimeString("en-GB", { timeZone: CALENDAR_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
  const entry = (i: TimelineItem, showDate = false) => <TimelineEntry key={i.key} i={i} today={today} showDate={showDate} href={itemHref(i)} names={names} edit={edit} returnTo={here} />;
  const dayList = (day: string, list: TimelineItem[]) => <DayTimeline list={list} now={day === today ? now : null} entry={entry} />;

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Calls, meetings, follow-ups, deadlines, tasks and posts. Times are India time (IST)."
        actions={
          edit ? (
            <ButtonLink href={hrefWith("/admin/calendar", sp, { new: "1", event: null, edit: null, ok: null, error: null, eventDate: anchor })} variant="primary">
              <Plus className="h-4 w-4" aria-hidden /> New event
            </ButtonLink>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        <StatGrid>
          <Stat label="Today" value={stats.today} href={nav(null, "agenda")} />
          <Stat label="Next 7 days" value={stats.next7} />
          <Stat label="Calls, 10 days" value={stats.calls10} hint="Calls and meetings" />
          <Stat label="Overdue" value={stats.overdue} />
        </StatGrid>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card sm:px-5">
          <Segments
            label="View"
            items={[
              { href: nav(anchor === today ? null : anchor, "agenda"), label: "Agenda", active: view === "agenda" },
              { href: nav(anchor === today ? null : anchor, "week"), label: "Week", active: view === "week" },
              { href: nav(anchor === today ? null : anchor, "month"), label: "Month", active: view === "month" },
            ]}
          />
          <div className="flex items-center gap-1">
            <Link href={nav(step(-1))} className={buttonClass("ghost", "sm")} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
            <Link href={nav(null)} className={buttonClass("secondary", "sm")}>
              Today
            </Link>
            <Link href={nav(step(1))} className={buttonClass("ghost", "sm")} aria-label="Next">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          <form method="get" className="ml-auto flex flex-wrap items-center gap-3">
            {view !== "agenda" ? <input type="hidden" name="view" value={view} /> : null}
            {one(sp.date) ? <input type="hidden" name="date" value={anchor} /> : null}
            {mine ? <input type="hidden" name="mine" value="1" /> : null}
            <FilterSelect name="kind" defaultValue={kind} options={Object.entries(KIND_FILTERS).filter(([k]) => k).map(([k, v]) => ({ value: k, label: v.label }))} placeholder="Everything" label="Show" />
            <Segments
              label="Whose"
              items={[
                { href: hrefWith("/admin/calendar", sp, { mine: null, event: null, edit: null, new: null, ok: null, error: null }), label: "Everyone", active: !mine },
                { href: hrefWith("/admin/calendar", sp, { mine: "1", event: null, edit: null, new: null, ok: null, error: null }), label: "Mine", active: mine },
              ]}
            />
          </form>
        </div>

        {view === "agenda" || view === "week" ? (
          (() => {
            const days = view === "week" ? Array.from({ length: 7 }, (_, k) => addDays(range.from, k)) : [...byDay.keys()];
            const addFor = (day: string) => (edit ? hrefWith("/admin/calendar", sp, { new: "1", eventDate: day, event: null, edit: null, ok: null, error: null }) : null);
            if (view === "agenda" && !days.length && !overdue.length)
              return (
                <Section>
                  <EmptyState
                    size="page"
                    title={anchor === today ? "Nothing planned for the next two weeks." : "Nothing planned for these days."}
                    description={kind || mine ? "Try showing everything." : "Add a call, meeting, follow-up or task."}
                    action={edit ? <ButtonLink href={hrefWith("/admin/calendar", sp, { new: "1", eventDate: anchor })} variant="primary">Add to {anchor === today ? "today" : "this day"}</ButtonLink> : undefined}
                  />
                </Section>
              );
            return (
              <Section flush>
                {view === "agenda" && overdue.length ? (
                  <details className="group/over border-b border-border">
                    <summary className="flex h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm text-danger hover:bg-canvas sm:px-6 [&::-webkit-details-marker]:hidden">
                      <Flag className="h-4 w-4" aria-hidden />
                      <span className="font-medium">{overdue.length} overdue</span>
                      <span className="text-danger/70">from earlier days</span>
                      <ChevronRight className="ml-auto h-4 w-4 transition-transform group-open/over:rotate-90" aria-hidden />
                    </summary>
                    <ul className="divide-y divide-border">{overdue.map((i) => entry(i, true))}</ul>
                  </details>
                ) : null}
                {days.map((day) => {
                  const list = byDay.get(day) ?? [];
                  return (
                    <DaySection key={day} day={day} today={today} count={list.length} addHref={addFor(day)}>
                      {list.length ? dayList(day, list) : <p className="px-4 py-3 text-[13px] text-muted-foreground sm:px-6">Nothing planned.</p>}
                    </DaySection>
                  );
                })}
              </Section>
            );
          })()
        ) : null}

        {view === "month" ? (
          <Section flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <th key={d} className="h-10 bg-canvas px-3 text-left text-[13px] font-medium text-muted-foreground">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthGrid(anchor).map((week) => (
                    <tr key={week[0]} className="border-b border-border last:border-b-0">
                      {week.map((day) => {
                        const list = byDay.get(day) ?? [];
                        const out = day.slice(0, 7) !== monthStart(anchor).slice(0, 7);
                        return (
                          <td key={day} className={cn("h-32 border-r border-border p-2 align-top last:border-r-0", out && "bg-canvas")}>
                            <Link href={nav(day, "agenda")} className={cn("mb-1.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[13px]", day === today ? "bg-primary font-medium text-primary-foreground" : out ? "text-muted-foreground/60" : "text-foreground/80 hover:bg-accent")}>
                              {Number(day.slice(8))}
                            </Link>
                            <ul className="space-y-0.5">
                              {list.slice(0, 3).map((i) => (
                                <li key={i.key}>
                                  <Link href={itemHref(i)} scroll={false} title={`${i.start ? `${i.start} ` : ""}${i.title}`} className={cn("block truncate rounded-md px-1.5 py-1 text-[13px] hover:bg-accent", dotTone(i), i.status === "done" && "line-through opacity-60")}>
                                    <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle", kindMeta(i.kind).dot)} aria-hidden />
                                    {i.start ? <span className="tabular text-muted-foreground">{i.start} </span> : null}
                                    {i.title}
                                  </Link>
                                </li>
                              ))}
                              {list.length > 3 ? (
                                <li>
                                  <Link href={nav(day, "agenda")} className="px-1 text-[13px] text-muted-foreground hover:text-foreground">
                                    +{list.length - 3} more
                                  </Link>
                                </li>
                              ) : null}
                            </ul>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        ) : null}

        <Section title={`Unscheduled (${undated.length})`} description="Events without a date yet, such as a call while the other side picks a slot." flush>
          {undated.length ? <ul className="divide-y divide-border">{undated.map((i) => entry(i, true))}</ul> : <EmptyState title="Nothing waiting for a date." />}
        </Section>
      </Stack>

      {opened && !one(sp.edit) ? (
        <SlideOver
          title={crmLabel(opened.kind, "calendar")}
          closeHref={base}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {edit && opened.status !== "done" ? (
                <form action={markCalendarEventDone}>
                  <input type="hidden" name="id" value={opened.id} />
                  <input type="hidden" name="returnTo" value={here} />
                  <SubmitButton size="sm" pendingText="Saving…">
                    Mark done
                  </SubmitButton>
                </form>
              ) : null}
              {edit ? (
                <ButtonLink href={hrefWith("/admin/calendar", sp, { edit: opened.id, event: null, ok: null, error: null })} size="sm">
                  Edit event
                </ButtonLink>
              ) : null}
              {can(user.role, "crm.delete") ? (
                <form action={removeCalendarEvent} className="ml-auto">
                  <input type="hidden" name="id" value={opened.id} />
                  <input type="hidden" name="returnTo" value={base} />
                  <SubmitButton size="sm" variant="ghost" className="text-danger" confirm="Delete this event?">
                    Delete
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          }
        >
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              {opened.companyName ? <OrgLogo name={opened.companyName} size={36} /> : null}
              <div className="min-w-0 flex-1">
                <p className={cn("text-lg text-foreground", opened.status === "done" && "line-through opacity-70")}>{opened.title}</p>
                <p className="text-small text-muted-foreground">{opened.companyName ?? "Calendar"}</p>
              </div>
              {opened.eventDate && opened.eventDate < today && opened.status !== "done" && opened.status !== "cancelled" ? <Badge tone="danger" pill dot>Overdue</Badge> : <StatusChip value={opened.status} />}
            </div>
            <Facts
              items={[
                { label: "When", value: whenText(opened.eventDate, opened.startTime, opened.endTime) },
                { label: "Type", value: `${crmLabel(opened.kind, "calendar")} · Calendar` },
                { label: "Account", value: opened.companyId ? <Link href={`/admin/accounts/${opened.companyId}`} className="text-primary hover:underline">{opened.companyName}</Link> : null },
                { label: "Their side", value: openedNames ? [...openedNames.contacts.values()].join(", ") || null : null },
                { label: "From our side", value: openedNames ? [...openedNames.team.values()].join(", ") || null : null },
                { label: "Meeting link", value: opened.meetingUrl ? <a href={opened.meetingUrl} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">Join</a> : null },
              ]}
            />
            {opened.notes ? (
              <div>
                <p className="eyebrow mb-1.5 text-muted-foreground">Notes</p>
                <p className="text-sm whitespace-pre-line text-foreground/85">{opened.notes}</p>
              </div>
            ) : null}
            {opened.companyId && (opened.kind === "call" || opened.kind === "meeting") && opened.status !== "done" ? (
              <p className="text-[13px] text-muted-foreground">Marking it done logs the {crmLabel(opened.kind, "calendar").toLowerCase()} on {opened.companyName}&apos;s activity.</p>
            ) : null}
          </div>
        </SlideOver>
      ) : null}

      {editing ? (
        <SlideOver title={opened ? "Edit event" : "New event"} closeHref={base}>
          <EventForm
            e={opened}
            companies={companies}
            team={team}
            contacts={contactList}
            defaults={{ date: one(sp.eventDate) || (opened ? null : anchor), companyId: prefillCompany || null, meId }}
            returnTo={base}
          />
        </SlideOver>
      ) : null}
    </>
  );
}

function whenText(date: string | null, start: string | null, end: string | null): string {
  if (!date) return "No date yet";
  const d = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  if (!start) return `${d}, all day`;
  return `${d}, ${hhmm(start)}${end ? ` – ${hhmm(end)}` : ""} (India time)`;
}

const dotTone = (i: TimelineItem) => (i.kind === "deadline" ? "text-danger" : i.kind === "call" || i.kind === "meeting" ? "text-primary" : "text-foreground/80");

/** Event types, in the main FynoLabs admin's quiet style: blue only for calls and meetings, red only for
    deadlines, grey for the rest (month dots). Labels stay grey text. */
const KIND_META: Record<string, { icon: LucideIcon; node: string; text: string; dot: string }> = {
  call: { icon: Phone, node: "", text: "text-muted-foreground", dot: "bg-primary" },
  meeting: { icon: Users, node: "", text: "text-muted-foreground", dot: "bg-primary" },
  follow_up: { icon: CornerUpRight, node: "", text: "text-muted-foreground", dot: "bg-foreground/35" },
  deadline: { icon: Flag, node: "", text: "text-danger", dot: "bg-danger" },
  task: { icon: CheckSquare, node: "", text: "text-muted-foreground", dot: "bg-foreground/35" },
  post: { icon: Megaphone, node: "", text: "text-muted-foreground", dot: "bg-foreground/35" },
};
const kindMeta = (k: string) => KIND_META[k] ?? KIND_META.task;

/** One day in the schedule: a slim header row (date, Today, count, Add), then its items as rows. */
function DaySection({ day, today, count, addHref, children }: { day: string; today: string; count: number; addHref: string | null; children: React.ReactNode }) {
  const rel = relativeDay(day, today);
  const isToday = day === today;
  const d = new Date(`${day}T00:00:00Z`);
  return (
    <section className="border-b border-border last:border-b-0">
      <header className="flex h-10 items-center gap-3 border-b border-border bg-canvas px-4 sm:px-6">
        <span className="tabular w-6 text-[15px] text-foreground">{d.getUTCDate()}</span>
        <h2 className="text-[13px] font-medium text-foreground">
          {d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}
          <span className="ml-1.5 font-normal text-muted-foreground">{d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}</span>
          {rel ? <span className={cn("ml-2 text-xs font-normal tracking-wide uppercase", isToday ? "text-primary" : "text-muted-foreground")}>{rel}</span> : null}
        </h2>
        <span className="text-xs text-muted-foreground">{count ? `· ${count}` : ""}</span>
        {addHref ? (
          <Link href={addHref} scroll={false} className="ml-auto inline-flex h-7 items-center gap-1 rounded px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** A day's items: all-day ones first, then by time, with a thin red "now" line on today. */
function DayTimeline({ list, now, entry }: { list: TimelineItem[]; now: string | null; entry: (i: TimelineItem) => React.ReactNode }) {
  const allDay = list.filter((i) => !i.start);
  const timed = list.filter((i) => i.start);
  const nowAt = now ? timed.findIndex((i) => (i.start ?? "") > now) : -1;
  const marker = now ? (
    <li key="now" className="relative flex h-0 items-center px-4 sm:px-6" aria-label={`Now, ${now}`}>
      <span className="absolute left-4 h-2 w-2 -translate-x-1/2 rounded-full bg-danger sm:left-6" />
      <span className="h-px flex-1 bg-danger/60" />
    </li>
  ) : null;
  return (
    <ul className="divide-y divide-border">
      {allDay.map((i) => entry(i))}
      {timed.map((i, k) => (
        <ConditionalMarker key={i.key} show={k === nowAt} marker={marker}>
          {entry(i)}
        </ConditionalMarker>
      ))}
      {now && timed.length && nowAt === -1 ? marker : null}
    </ul>
  );
}

function ConditionalMarker({ show, marker, children }: { show: boolean; marker: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {show ? marker : null}
      {children}
    </>
  );
}

/** One row, as in the main FynoLabs calendar: the time, then the title with the type, account and people under it; Join and Mark done as quiet links. */
function TimelineEntry({ i, today, showDate, href, names, edit, returnTo }: { i: TimelineItem; today: string; showDate: boolean; href: string; names: Awaited<ReturnType<typeof namesFor>>; edit: boolean; returnTo: string }) {
  const late = Boolean(i.date && i.date < today && i.status !== "done" && i.status !== "cancelled");
  const done = i.status === "done";
  const meta = kindMeta(i.kind);
  const theirs = i.source === "calendar" ? i.contactIds.map((id) => names.contacts.get(id)).filter(Boolean) : [];
  const ours = i.teamMemberIds.map((id) => names.team.get(id)).filter(Boolean);
  return (
    <li className="group/row relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 px-4 py-3.5 hover:bg-canvas sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:gap-x-6 sm:px-6">
      <div className={cn("tabular pt-px text-[13px]", late ? "text-danger" : "text-muted-foreground")}>
        {showDate ? (
          i.date ? shortDay(i.date, today) : "No date"
        ) : i.start ? (
          <span className="text-foreground">
            {i.start}
            {i.end ? <span className="block text-muted-foreground">{i.end}</span> : null}
          </span>
        ) : (
          "All day"
        )}
      </div>
      <div className="min-w-0">
        <Link href={href} scroll={false} className={cn("block text-sm leading-snug text-foreground after:absolute after:inset-0 hover:underline hover:underline-offset-4", done && "text-muted-foreground line-through")}>
          {i.title}
        </Link>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          <span className={meta.text}>{crmLabel(i.kind, "calendar")}</span>
          {i.companyName ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <OrgLogo name={i.companyName} size={16} /> <span className="truncate">{i.companyName}</span>
            </span>
          ) : null}
          {theirs.length ? <span>{theirs.join(", ")}</span> : null}
          {ours.length ? <span>Ours: {ours.join(", ")}</span> : null}
          {i.source !== "calendar" ? <span>{SOURCE_LABELS[i.source]}</span> : null}
          {i.status !== "planned" && i.source === "calendar" ? <span>{crmLabel(i.status)}</span> : null}
        </p>
      </div>
      {i.meetingUrl || (edit && i.source === "calendar" && !done) ? (
        <div className="relative z-10 col-start-2 mt-2 flex items-center gap-5 sm:col-start-3 sm:mt-0">
          {i.meetingUrl ? (
            <a href={i.meetingUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[13px] text-primary underline-offset-4 hover:underline">
              Join <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
          {edit && i.source === "calendar" && !done ? (
            <form action={markCalendarEventDone}>
              <input type="hidden" name="id" value={i.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button type="submit" className="text-[13px] text-muted-foreground hover:text-foreground">
                Mark done
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function EventForm({
  e,
  companies,
  team,
  contacts,
  defaults,
  returnTo,
}: {
  e: Awaited<ReturnType<typeof getEvent>>;
  companies: { id: string; name: string }[];
  team: { id: string; name: string | null; email: string; active: boolean }[];
  contacts: { id: string; name: string; companyId: string | null; company: string | null }[];
  defaults: { date: string | null; companyId: string | null; meId: string | null };
  returnTo: string;
}) {
  const companyId = e?.companyId ?? defaults.companyId ?? "";
  const picked = new Set(e ? (e.contactIds.length ? e.contactIds : e.contactId ? [e.contactId] : []) : []);
  const ourSide = new Set(e ? e.teamMemberIds : defaults.meId ? [defaults.meId] : []);
  return (
    <form action={saveCalendarEvent} className="space-y-4">
      {e ? <input type="hidden" name="id" value={e.id} /> : null}
      <input type="hidden" name="returnTo" value={returnTo} />
      <p className="text-small text-muted-foreground">Times are India time. Leave the date empty while the other side picks a slot.</p>
      <Field label="Title" htmlFor="ev-title">
        <Input id="ev-title" name="title" required defaultValue={e?.title ?? ""} maxLength={300} placeholder="Intro call with …" />
      </Field>
      <FieldRow>
        <Field label="Type" htmlFor="ev-kind">
          <Select id="ev-kind" name="kind" defaultValue={e?.kind ?? "call"} options={CALENDAR_KINDS.map((k) => ({ value: k, label: crmLabel(k, "calendar") }))} />
        </Field>
        <Field label="Status" htmlFor="ev-status" hint="Done on a call or meeting with an account logs it there.">
          <Select id="ev-status" name="status" defaultValue={e?.status ?? "planned"} options={CALENDAR_STATUSES.map((k) => ({ value: k, label: crmLabel(k) }))} />
        </Field>
      </FieldRow>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="ev-date">
          <Input id="ev-date" name="eventDate" type="date" defaultValue={e ? (e.eventDate ?? "") : (defaults.date ?? "")} />
        </Field>
        <Field label="Starts" htmlFor="ev-start">
          <Input id="ev-start" name="startTime" type="time" defaultValue={hhmm(e?.startTime) ?? ""} />
        </Field>
        <Field label="Ends" htmlFor="ev-end">
          <Input id="ev-end" name="endTime" type="time" defaultValue={hhmm(e?.endTime) ?? ""} />
        </Field>
      </div>
      <Field label="Account" htmlFor="ev-company">
        <Select id="ev-company" name="companyId" defaultValue={companyId} options={companies.map((c) => ({ value: c.id, label: c.name }))} placeholder="No account" />
      </Field>
      <Field label="Their side" htmlFor="ev-contacts" hint="Everyone you're meeting, from Leads (hold Ctrl or ⌘ to pick several). Someone new: add them below and they're added to Leads.">
        <select id="ev-contacts" name="contactIds" multiple defaultValue={[...picked]} className="control h-32">
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company ? `${c.name} · ${c.company}` : c.name}
            </option>
          ))}
        </select>
      </Field>
      <FieldRow>
        <Field label="Someone new: name" htmlFor="ev-newName">
          <Input id="ev-newName" name="newName" />
        </Field>
        <Field label="Their email" htmlFor="ev-newEmail">
          <Input id="ev-newEmail" name="newEmail" type="email" />
        </Field>
      </FieldRow>
      {team.length ? (
        <fieldset className="space-y-2">
          <legend className="eyebrow text-muted-foreground">From our side</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {team
              .filter((t) => t.active || ourSide.has(t.id))
              .map((t) => (
                <Checkbox key={t.id} name="teamMemberIds" value={t.id} defaultChecked={ourSide.has(t.id)} label={t.name || t.email.split("@")[0]} />
              ))}
          </div>
          <p className="text-[13px] text-muted-foreground">Everyone joining from the team. They see it on My work.</p>
        </fieldset>
      ) : null}
      <Field label="Meeting link" htmlFor="ev-url">
        <Input id="ev-url" name="meetingUrl" defaultValue={e?.meetingUrl ?? ""} placeholder="meet.google.com/…" />
      </Field>
      <Field label="Notes" htmlFor="ev-notes">
        <Textarea id="ev-notes" name="notes" rows={4} defaultValue={e?.notes ?? ""} />
      </Field>
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">{e ? "Save" : "Add event"}</SubmitButton>
        <ButtonLink href={returnTo}>Cancel</ButtonLink>
      </div>
    </form>
  );
}
