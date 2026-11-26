import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, CalendarDays, CalendarPlus, ClipboardList, ExternalLink, FolderKanban, Globe, Pencil, Plus, Shuffle, UserRound, type LucideIcon } from "@/components/icons";
import { getDb } from "@/db/client";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { label } from "@/lib/constants";
import { hhmm, shortDay, todayIST } from "@/lib/crm/dates";
import { crmLabel } from "@/lib/crm/labels";
import { one, type SearchParams } from "@/lib/filters";
import { ago, fmtDate } from "@/lib/format";
import { LOGGABLE_KINDS, companyActivityLog, companyLinks, getCompany, myTeamMemberId, ownerLabel, teamOptions, unlinkedContacts } from "@/lib/server/companies";
import { contactsAt, visibleContact } from "@/lib/server/contacts";
import { platformChoices } from "@/lib/server/platforms";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ContactStageChip, DueChip, Initials, PriorityDot, StageChip, StatusChip } from "@/components/crm/chips";
import { DetailFields, NextStepFields } from "@/components/crm/company-fields";
import { OrgLogo } from "@/components/crm/org-logo";
import { Person } from "@/components/ui/avatar";
import { Chips, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { PanelSection, SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { FieldGroup, FieldSearch } from "@/components/record/client";
import { Prop, RecordCenter, RecordFields, RecordIdentity, RecordLayout, SideBlock, SideCounts, SideItem, quickAction } from "@/components/record/panels";
import { addPerson, logAccountActivity, removeAccount, saveAccount, unlinkPerson } from "../actions";

export const metadata = { title: "Account" };

// The centre panel's tabs; Activity first. The old ?tab=overview opens it too (the account's
// fields now live in the left panel, edited in a side panel).
const TABS = ["activity", "people", "calendar", "linked"] as const;
type Tab = (typeof TABS)[number];

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user, allowed } = await requireSection("accounts");
  if (!allowed)
    return (
      <>
        <PageHeader title="Account" back={{ href: "/admin/accounts", label: "Accounts" }} />
        <Section>
          <NoAccess what="Accounts" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const c = await getCompany(db, id);
  if (!c) notFound();
  const today = todayIST();
  const tabRaw = one(sp.tab);
  const tab: Tab = (TABS as readonly string[]).includes(tabRaw) ? (tabRaw as Tab) : "activity";
  const edit = can(user.role, "crm.edit");
  const editing = edit && one(sp.edit) === "1";
  const [people, log, links, team, meId, platforms, unlinked] = await Promise.all([
    contactsAt(db, c.id),
    companyActivityLog(db, c.id, 200),
    companyLinks(db, c.id),
    teamOptions(db),
    myTeamMemberId(db, user.email),
    platformChoices(db),
    edit && (tab === "people" || one(sp.add)) ? unlinkedContacts(db, c.name) : Promise.resolve([]),
  ]);
  const shownPeople = people.map((p) => visibleContact(user.role, p));
  const self = `/admin/accounts/${c.id}`;
  const tabHref = (t: Tab) => (t === "activity" ? self : `${self}?tab=${t}`);
  const here = tabHref(tab);
  const withParam = (href: string, q: string) => `${href}${href.includes("?") ? "&" : "?"}${q}`;
  const referralTotal = Object.values(links.referrals).reduce((n, v) => n + v, 0);
  const website = c.website ? (c.website.startsWith("http") ? c.website : `https://${c.website}`) : null;
  const owner = ownerLabel(c);

  const left = (
    <>
      <RecordIdentity
        back={{ href: "/admin/accounts", label: "Accounts" }}
        media={<OrgLogo name={c.name} domain={c.domain} size={48} />}
        title={c.name}
        subtitle={`${label(c.kind)} · ${crmLabel(c.businessLine)}${c.location ? ` · ${c.location}` : ""}`}
        chips={
          <>
            <StageChip stage={c.stage} />
            <PriorityDot priority={c.priority} />
          </>
        }
        actions={
          <>
            {edit ? (
              <Link href={`${self}?log=1#log`} className={quickAction}>
                <Plus aria-hidden /> Log activity
              </Link>
            ) : null}
            {edit ? (
              <Link href={`${self}?tab=people&add=1`} className={quickAction}>
                <UserRound aria-hidden /> Add person
              </Link>
            ) : null}
            {website ? (
              <a href={website} target="_blank" rel="noreferrer noopener" className={quickAction}>
                <Globe aria-hidden /> Website
              </a>
            ) : null}
            {edit ? (
              <Link href={withParam(here, "edit=1")} scroll={false} className={quickAction}>
                <Pencil aria-hidden /> Edit
              </Link>
            ) : null}
          </>
        }
      />
      <RecordFields>
        <FieldSearch />
        <FieldGroup
          title="Next step"
          actions={
            edit ? (
              <Link href={withParam(here, "edit=1")} scroll={false} className="inline-flex h-7 items-center rounded-md px-2 text-xs text-primary hover:bg-accent">
                Edit
              </Link>
            ) : null
          }
        >
          <Prop label="Next step" stack>{c.nextStep ? <span className="whitespace-pre-line">{c.nextStep}</span> : null}</Prop>
          <Prop label="Stage">
            <StageChip stage={c.stage} />
          </Prop>
          <Prop label="Due">{c.nextStepDue ? <DueChip due={c.nextStepDue} today={today} stage={c.stage} /> : null}</Prop>
          <Prop label="Owner">
            {owner ? (
              <span className="inline-flex items-center gap-1.5">
                <Person name={owner} size="xs" />
                {c.ownerTeamMemberId && c.ownerTeamMemberId === meId ? <span className="text-muted-foreground">(you)</span> : null}
              </span>
            ) : null}
          </Prop>
          <Prop label="Best route">{c.bestRoute}</Prop>
          <Prop label="Last activity">{c.lastActivityAt ? `${fmtDate(c.lastActivityAt)} · ${ago(c.lastActivityAt)}` : null}</Prop>
        </FieldGroup>
        <FieldGroup title="Details">
          <Prop label="Type">{label(c.kind)}</Prop>
          <Prop label="Business line">{crmLabel(c.businessLine)}</Prop>
          <Prop label="Priority">{crmLabel(c.priority)}</Prop>
          <Prop label="Website">
            {website ? (
              <a href={website} target="_blank" rel="noreferrer noopener" className="break-all text-primary hover:underline">
                {c.domain ?? c.website}
              </a>
            ) : null}
          </Prop>
          <Prop label="Location">{c.location}</Prop>
          <Prop label="On Platforms">
            {c.platformId && c.platformName ? (
              <Link href={`/admin/platforms/${c.platformId}`} className="text-primary hover:underline">
                {c.platformName}
              </Link>
            ) : null}
          </Prop>
          <Prop label="Tags" stack>{c.tags.length ? <Chips items={c.tags} max={30} /> : null}</Prop>
          <Prop label="Updated">{`${ago(c.updatedAt)}${c.updatedBy ? ` by ${c.updatedBy}` : ""}`}</Prop>
        </FieldGroup>
        <FieldGroup title="Notes">
          {c.notes ? (
            <div data-field>
              <p className="max-h-80 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-line text-foreground/85">{c.notes}</p>
            </div>
          ) : (
            <p data-field className="text-[13px] text-muted-foreground">
              No notes.
            </p>
          )}
        </FieldGroup>
      </RecordFields>
    </>
  );

  // ---- right panel: what's next, the people, linked records, numbers
  type Next = { key: string; title: string; sub: string; due: string | null; href: string; icon: LucideIcon };
  const nexts: Next[] = [];
  if (c.nextStep || c.nextStepDue) nexts.push({ key: "account", title: c.nextStep?.split("\n")[0] ?? "Next step", sub: owner ? `Account · ${owner}` : "Account next step", due: c.nextStepDue ?? null, href: edit ? withParam(here, "edit=1") : here, icon: Shuffle });
  for (const e of links.events)
    if ((e.status === "planned" || e.status === "waiting") && (!e.eventDate || e.eventDate >= today))
      nexts.push({ key: e.id, title: e.title, sub: `${crmLabel(e.kind, "calendar")}${e.startTime ? ` · ${hhmm(e.startTime)}` : ""}${e.eventDate ? "" : " · no date yet"}`, due: e.eventDate ?? null, href: `/admin/calendar?event=${e.id}${e.eventDate ? `&date=${e.eventDate}` : ""}`, icon: CalendarDays });
  for (const p of shownPeople)
    if (p.nextFollowUp && p.stage !== "won" && p.stage !== "lost") nexts.push({ key: p.id, title: `Follow up with ${p.name}`, sub: p.role ?? "Lead follow-up", due: p.nextFollowUp, href: `/admin/leads?view=${p.id}`, icon: UserRound });
  nexts.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const openJobs = links.jobs.filter((j) => j.status !== "closed");
  const activeReqs = links.requirements.filter((r) => r.status !== "closed" && r.status !== "filled" && r.status !== "cancelled");

  const right = (
    <>
      <SideBlock
        title="Up next"
        action={
          edit ? (
            <Link href={`/admin/calendar?new=1&company=${c.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <CalendarPlus className="h-3 w-3" aria-hidden /> New event
            </Link>
          ) : null
        }
      >
        {nexts.length ? (
          <ul className="space-y-0.5">
            {nexts.slice(0, 8).map((n) => (
              <SideItem key={n.key} href={n.href} icon={<n.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />} title={n.title} sub={n.sub} aside={n.due ? <DueChip due={n.due} today={today} /> : null} />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">Nothing planned.</p>
        )}
      </SideBlock>
      <SideBlock title="People" action={<Link href={tabHref("people")} className="text-primary hover:underline">{people.length ? `All ${people.length}` : edit ? "Add" : "None"}</Link>}>
        {shownPeople.length ? (
          <ul className="space-y-0.5">
            {shownPeople.slice(0, 6).map((p) => (
              <SideItem key={p.id} href={`/admin/leads?view=${p.id}`} icon={<Initials name={p.name} size="sm" />} title={p.name} sub={[p.role, p.email].filter(Boolean).join(" · ") || crmLabel(p.stage, "contact")} />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No people yet.</p>
        )}
      </SideBlock>
      <SideBlock title="Open jobs" action={<Link href={tabHref("linked")} className="text-primary hover:underline">{links.jobs.length ? `All ${links.jobs.length}` : "Jobs"}</Link>}>
        {openJobs.length ? (
          <ul className="space-y-0.5">
            {openJobs.slice(0, 5).map((j) => (
              <SideItem key={j.id} href={`/admin/jobs/${j.id}`} icon={<Briefcase className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />} title={j.title} sub={`${label(j.status)} · ${j.applicants} applicant${j.applicants === 1 ? "" : "s"}${j.closesOn ? ` · closes ${fmtDate(j.closesOn)}` : ""}`} />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No open jobs.</p>
        )}
      </SideBlock>
      {links.requirements.length ? (
        <SideBlock title="Requirements" action={<Link href={tabHref("linked")} className="text-primary hover:underline">{`All ${links.requirements.length}`}</Link>}>
          <ul className="space-y-0.5">
            {(activeReqs.length ? activeReqs : links.requirements).slice(0, 5).map((r) => (
              <SideItem key={r.id} href={`/admin/requirements/${r.id}`} icon={<ClipboardList className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />} title={r.title} sub={`${label(r.status)} · ${r.slots} slot${r.slots === 1 ? "" : "s"}${r.deadline ? ` · by ${fmtDate(r.deadline)}` : ""}`} />
            ))}
          </ul>
        </SideBlock>
      ) : null}
      {links.projects.length ? (
        <SideBlock title="Projects" action={<Link href={tabHref("linked")} className="text-primary hover:underline">{`All ${links.projects.length}`}</Link>}>
          <ul className="space-y-0.5">
            {links.projects.slice(0, 5).map((p) => (
              <SideItem key={p.id} href={`/admin/projects/${p.id}`} icon={<FolderKanban className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />} title={p.name} sub={`${p.code} · ${crmLabel(p.status)}`} />
            ))}
          </ul>
        </SideBlock>
      ) : null}
      <SideBlock title="At a glance">
        <SideCounts
          items={[
            { label: "People", value: people.length, href: tabHref("people") },
            { label: "Activity", value: log.length, href: tabHref("activity") },
            { label: "Events", value: links.events.length, href: tabHref("calendar") },
            { label: "Jobs", value: links.jobs.length, href: tabHref("linked") },
            { label: "Requirements", value: links.requirements.length, href: tabHref("linked") },
            { label: "Referrals", value: referralTotal, href: tabHref("linked") },
          ]}
        />
      </SideBlock>
    </>
  );

  const center = (
    <RecordCenter
      tabs={
        <Tabs
          tabs={[
            { href: tabHref("activity"), label: "Activity", active: tab === "activity", count: log.length },
            { href: tabHref("people"), label: "People", active: tab === "people", count: people.length },
            { href: tabHref("calendar"), label: "Calendar", active: tab === "calendar", count: links.events.length },
            { href: tabHref("linked"), label: "Jobs & projects", active: tab === "linked", count: links.jobs.length + links.projects.length + links.requirements.length },
          ]}
        />
      }
    >
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />

      {tab === "activity" ? (
        <>
          {edit ? (
            <form id="log" action={logAccountActivity} className="scroll-mt-20 rounded-lg border border-border bg-card focus-within:border-ring">
              <input type="hidden" name="companyId" value={c.id} />
              <input type="hidden" name="returnTo" value={self} />
              <div className="space-y-0 divide-y divide-border">
                <Input id="a-summary" name="summary" required placeholder="What happened, in one line (an email, a call, a reply)" maxLength={500} aria-label="What happened" autoFocus={Boolean(one(sp.log))} className="rounded-b-none border-0 bg-transparent px-4 shadow-none focus:ring-0 focus-visible:ring-0" />
                <Textarea id="a-detail" name="detail" rows={2} placeholder="Details: the message sent, what they said" aria-label="Details" className="block min-h-16 resize-y rounded-none border-0 bg-transparent px-4 py-2.5 shadow-none focus:ring-0 focus-visible:ring-0" />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-canvas/60 px-3 py-2">
                <Select id="a-kind" name="kind" defaultValue="note" options={LOGGABLE_KINDS.map((k) => ({ value: k, label: crmLabel(k) }))} aria-label="Kind" className="h-8 w-auto text-[13px]" />
                <Input id="a-date" name="date" type="date" defaultValue={today} aria-label="Date (India time; empty: now)" title="India time. Empty: now." className="h-8 w-36 text-[13px]" />
                <Input id="a-time" name="time" type="time" aria-label="Time" className="h-8 w-28 text-[13px]" />
                {people.length ? <Select id="a-contact" name="contactId" defaultValue="" options={people.map((p) => ({ value: p.id, label: p.name }))} placeholder="Whole account" aria-label="Who it was with" className="h-8 w-auto max-w-48 text-[13px]" /> : null}
                <SubmitButton size="sm" pendingText="Logging…" className="ml-auto">
                  Log it
                </SubmitButton>
              </div>
            </form>
          ) : null}
          <section className="rounded-lg border border-border bg-card" aria-label="Activity">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-5 py-3">
              <h2 className="text-sm font-medium text-foreground">Activity</h2>
              <span className="text-xs text-muted-foreground">Emails, calls, meetings, replies and stage changes, newest first</span>
            </div>
            <div className="px-5 py-4">{log.length ? <ActivityTimeline items={log} today={today} /> : <EmptyState title="Nothing logged yet." description="Log emails, calls and replies so anyone can pick the account up." padded={false} />}</div>
          </section>
        </>
      ) : null}

      {tab === "people" ? (
        <Stack>
          {edit && one(sp.add) ? (
            <Section title={`Add a person at ${c.name}`} description="They're added to Leads, linked to this account.">
              <div className="space-y-6">
                {unlinked.length ? (
                  <form action={addPerson} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="companyId" value={c.id} />
                    <input type="hidden" name="returnTo" value={here} />
                    <Field label="Someone already in Leads" htmlFor="link-contact" hint="Links the lead to this account instead of adding a new person." className="min-w-64 flex-1">
                      <Select id="link-contact" name="contactId" required defaultValue="" options={unlinked.map((u) => ({ value: u.id, label: u.company ? `${u.name} · ${u.company}` : u.name }))} placeholder="Pick a lead to link" />
                    </Field>
                    <SubmitButton variant="secondary">Link</SubmitButton>
                  </form>
                ) : null}
                <form action={addPerson} className="space-y-4">
                  <input type="hidden" name="companyId" value={c.id} />
                  <input type="hidden" name="returnTo" value={here} />
                  {unlinked.length ? <p className="text-sm font-medium text-foreground">Or add someone new</p> : null}
                  <FieldRow>
                    <Field label="Name" htmlFor="p-name">
                      <Input id="p-name" name="name" required />
                    </Field>
                    <Field label="Role" htmlFor="p-role">
                      <Input id="p-role" name="role" />
                    </Field>
                  </FieldRow>
                  <FieldRow>
                    <Field label="Email" htmlFor="p-email">
                      <Input id="p-email" name="email" type="email" />
                    </Field>
                    <Field label="LinkedIn or profile" htmlFor="p-profile">
                      <Input id="p-profile" name="profileUrl" placeholder="linkedin.com/in/…" />
                    </Field>
                  </FieldRow>
                  <div className="flex gap-2">
                    <SubmitButton>Add person</SubmitButton>
                    <ButtonLink href={here}>Cancel</ButtonLink>
                  </div>
                </form>
              </div>
            </Section>
          ) : null}
          <Section title={`People (${people.length})`} flush actions={edit && !one(sp.add) ? <ButtonLink href={`${self}?tab=people&add=1`} size="sm">Add person</ButtonLink> : undefined}>
            {shownPeople.length ? (
              <Table>
                <THead>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Email</Th>
                  <Th>Stage</Th>
                  <Th>Follow-up</Th>
                  <Th />
                </THead>
                <TBody>
                  {shownPeople.map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        <Link href={`/admin/leads?view=${p.id}`} className="flex items-center gap-3 font-medium text-foreground hover:text-primary">
                          <Initials name={p.name} />
                          {p.name}
                        </Link>
                      </Td>
                      <Td>{p.role ?? "–"}</Td>
                      <Td>{p.email ?? "–"}</Td>
                      <Td>
                        <ContactStageChip stage={p.stage} />
                      </Td>
                      <Td>
                        <DueChip due={p.nextFollowUp} today={today} stage={p.stage === "won" || p.stage === "lost" ? "dropped" : undefined} />
                      </Td>
                      <Td className="text-right">
                        {edit ? (
                          <form action={unlinkPerson}>
                            <input type="hidden" name="companyId" value={c.id} />
                            <input type="hidden" name="contactId" value={p.id} />
                            <input type="hidden" name="returnTo" value={here} />
                            <SubmitButton size="sm" variant="ghost" className="text-muted-foreground">
                              Unlink
                            </SubmitButton>
                          </form>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="No people yet." description="Add the person you talk to, or link a lead you already have." />
            )}
          </Section>
          {!canSeeContact(user.role) ? <p className="text-[13px] text-muted-foreground">Email addresses are masked for your role.</p> : null}
        </Stack>
      ) : null}

      {tab === "calendar" ? (
        <Section
          title="Calendar"
          description="Calls, meetings, follow-ups and deadlines with this account (India time)."
          flush
          actions={
            edit ? (
              <ButtonLink href={`/admin/calendar?new=1&company=${c.id}`} size="sm">
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> New event
              </ButtonLink>
            ) : undefined
          }
        >
          {links.events.length ? (
            <Table>
              <THead>
                <Th>When</Th>
                <Th>Event</Th>
                <Th>Type</Th>
                <Th>Status</Th>
              </THead>
              <TBody>
                {links.events.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap">
                      {e.eventDate ? shortDay(e.eventDate, today) : "No date yet"}
                      {e.startTime ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {hhmm(e.startTime)}
                          {e.endTime ? `–${hhmm(e.endTime)}` : ""}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Link href={`/admin/calendar?event=${e.id}${e.eventDate ? `&date=${e.eventDate}` : ""}`} className="font-medium text-foreground hover:text-primary">
                        {e.title}
                      </Link>
                    </Td>
                    <Td>{crmLabel(e.kind, "calendar")}</Td>
                    <Td>
                      <StatusChip value={e.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState
              title="Nothing on the calendar with this account."
              action={
                edit ? (
                  <ButtonLink href={`/admin/calendar?new=1&company=${c.id}`} size="sm">
                    New event
                  </ButtonLink>
                ) : undefined
              }
            />
          )}
        </Section>
      ) : null}

      {tab === "linked" ? (
        <Stack>
          <Section title={`Jobs (${links.jobs.length})`} flush>
            {links.jobs.length ? (
              <Table>
                <THead>
                  <Th>Job</Th>
                  <Th>Status</Th>
                  <Th>Visibility</Th>
                  <Th className="text-right">Applicants</Th>
                  <Th>Closes</Th>
                </THead>
                <TBody>
                  {links.jobs.map((j) => (
                    <Tr key={j.id}>
                      <Td>
                        <Link href={`/admin/jobs/${j.id}`} className="font-medium text-foreground hover:text-primary">
                          {j.title}
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge value={j.status} />
                      </Td>
                      <Td>{label(j.visibility)}</Td>
                      <Td className="tabular text-right">{j.applicants}</Td>
                      <Td>{fmtDate(j.closesOn)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="No jobs for this account." />
            )}
          </Section>
          <Section title={`Projects (${links.projects.length})`} flush>
            {links.projects.length ? (
              <Table>
                <THead>
                  <Th>Project</Th>
                  <Th>Code</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Target</Th>
                </THead>
                <TBody>
                  {links.projects.map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        <Link href={`/admin/projects/${p.id}`} className="font-medium text-foreground hover:text-primary">
                          {p.name}
                        </Link>
                      </Td>
                      <Td>
                        <code className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs">{p.code}</code>
                      </Td>
                      <Td>{crmLabel(p.kind)}</Td>
                      <Td>
                        <StatusChip value={p.status} />
                      </Td>
                      <Td className="tabular text-right">{p.targetCount ?? "–"}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="No projects with this account." />
            )}
          </Section>
          <Section title={`Requirements (${links.requirements.length})`} flush>
            {links.requirements.length ? (
              <Table>
                <THead>
                  <Th>Requirement</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Slots</Th>
                  <Th>Deadline</Th>
                </THead>
                <TBody>
                  {links.requirements.map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <Link href={`/admin/requirements/${r.id}`} className="font-medium text-foreground hover:text-primary">
                          {r.title}
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge value={r.status} />
                      </Td>
                      <Td className="tabular text-right">{r.slots}</Td>
                      <Td>{fmtDate(r.deadline)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="No requirements from this account." />
            )}
          </Section>
          <Section title={`Referrals (${referralTotal})`}>
            {referralTotal ? (
              <div className="flex flex-wrap gap-x-10 gap-y-4">
                {Object.entries(links.referrals).map(([k, n]) => (
                  <div key={k}>
                    <div className="quiet-label">{crmLabel(k)}</div>
                    <div className="figure mt-1 text-foreground">{n}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No referrals for this account." padded={false} />
            )}
          </Section>
          {c.website ? (
            <a href={website ?? c.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-small text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {c.domain ?? c.website}
            </a>
          ) : null}
        </Stack>
      ) : null}
    </RecordCenter>
  );

  return (
    <>
      <RecordLayout left={left} center={center} right={right} />
      {editing ? (
        <SlideOver
          title={c.name}
          subtitle="Edit the account"
          media={<OrgLogo name={c.name} domain={c.domain} size={40} />}
          closeHref={here}
        >
          <form action={saveAccount}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="returnTo" value={here} />
            <PanelSection title="Next step">
              <NextStepFields c={c} team={team} meId={meId} />
            </PanelSection>
            <PanelSection title="Details">
              <DetailFields c={c} platforms={platforms} />
            </PanelSection>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
              <ButtonLink href={here} variant="ghost">
                Cancel
              </ButtonLink>
              <span className="text-[13px] text-muted-foreground">
                Updated {ago(c.updatedAt)}
                {c.updatedBy ? ` by ${c.updatedBy}` : ""}
              </span>
            </div>
          </form>
          {can(user.role, "crm.delete") ? (
            <div className="mt-10 space-y-3 border-t border-border pt-6">
              <h3 className="text-sm font-medium text-foreground">Delete account</h3>
              <p className="text-[13px] text-muted-foreground">This removes the account and its activity log for good. Its people stay in Leads, without an account. To keep the history, set the stage to Dropped instead.</p>
              <form action={removeAccount}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="returnTo" value={here} />
                <SubmitButton variant="danger" size="sm" confirm={`Delete ${c.name}? This can't be undone.`}>
                  Delete account
                </SubmitButton>
              </form>
            </div>
          ) : null}
        </SlideOver>
      ) : null}
    </>
  );
}
