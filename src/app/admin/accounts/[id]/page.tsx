import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, ExternalLink, Plus } from "lucide-react";
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
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { DefinitionList, PageHeader, Section, Stack, Stat, StatGrid } from "@/components/ui/layout";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { addPerson, logAccountActivity, removeAccount, saveAccount, unlinkPerson } from "../actions";

export const metadata = { title: "Account" };

const TABS = ["overview", "people", "activity", "calendar", "linked"] as const;
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
  const tab: Tab = (TABS as readonly string[]).includes(tabRaw) ? (tabRaw as Tab) : "overview";
  const edit = can(user.role, "crm.edit");
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
  const tabHref = (t: Tab) => (t === "overview" ? self : `${self}?tab=${t}`);
  const here = tab === "overview" ? self : `${self}?tab=${tab}`;
  const referralTotal = Object.values(links.referrals).reduce((n, v) => n + v, 0);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/accounts", label: "Accounts" }}
        media={<OrgLogo name={c.name} domain={c.domain} size={40} />}
        title={c.name}
        badge={
          <>
            <StageChip stage={c.stage} />
            <PriorityDot priority={c.priority} />
          </>
        }
        meta={
          <span>
            {label(c.kind)} · {crmLabel(c.businessLine)}
          </span>
        }
        actions={
          edit ? (
            <>
              <ButtonLink href={`${self}?tab=people&add=1`} variant="secondary">
                <Plus className="h-4 w-4" aria-hidden /> Add person
              </ButtonLink>
              <ButtonLink href={`${self}?tab=activity&log=1`} variant="primary">
                Log activity
              </ButtonLink>
            </>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="mb-6">
        <StatGrid>
          <Stat label="Owner" value={c.ownerTeamMemberId && c.ownerTeamMemberId === meId ? "You" : (ownerLabel(c) ?? "No owner")} />
          <Stat label="Next step due" value={c.nextStepDue ? (c.nextStepDue === today ? "Today" : shortDay(c.nextStepDue, today)) : "Not set"} hint={c.nextStepDue && c.nextStepDue < today && c.stage !== "dropped" ? "Late" : undefined} />
          <Stat label="People" value={people.length} href={tabHref("people")} />
          <Stat label="Last activity" value={c.lastActivityAt ? fmtDate(c.lastActivityAt) : "None"} hint={c.lastActivityAt ? ago(c.lastActivityAt) : undefined} href={tabHref("activity")} />
        </StatGrid>
      </div>
      <Tabs
        tabs={[
          { href: tabHref("overview"), label: "Overview", active: tab === "overview" },
          { href: tabHref("people"), label: "People", active: tab === "people", count: people.length },
          { href: tabHref("activity"), label: "Activity", active: tab === "activity", count: log.length },
          { href: tabHref("calendar"), label: "Calendar", active: tab === "calendar", count: links.events.length },
          { href: tabHref("linked"), label: "Jobs & projects", active: tab === "linked", count: links.jobs.length + links.projects.length + links.requirements.length },
        ]}
      />

      {tab === "overview" ? (
        edit ? (
          <form action={saveAccount}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="returnTo" value={here} />
            <Stack>
              <Section title="Next step">
                <NextStepFields c={c} team={team} meId={meId} />
              </Section>
              <Section title="Details">
                <DetailFields c={c} platforms={platforms} />
              </Section>
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
                <span className="text-xs text-muted-foreground">
                  Updated {ago(c.updatedAt)}
                  {c.updatedBy ? ` by ${c.updatedBy}` : ""}
                </span>
              </div>
            </Stack>
          </form>
        ) : (
          <Stack>
            <Section title="Next step">
              <DefinitionList
                items={[
                  { label: "Next step", value: c.nextStep },
                  { label: "Stage", value: crmLabel(c.stage) },
                  { label: "Due", value: c.nextStepDue ? <DueChip due={c.nextStepDue} today={today} stage={c.stage} /> : null },
                  { label: "Owner", value: ownerLabel(c) },
                  { label: "Best route", value: c.bestRoute },
                ]}
              />
            </Section>
            <Section title="Details">
              <DefinitionList
                items={[
                  { label: "Type", value: label(c.kind) },
                  { label: "Business line", value: crmLabel(c.businessLine) },
                  { label: "Priority", value: crmLabel(c.priority) },
                  { label: "Website", value: c.website },
                  { label: "Location", value: c.location },
                  { label: "On Platforms", value: c.platformName },
                  { label: "Tags", value: c.tags.join(", ") || null },
                  { label: "Notes", value: c.notes },
                ]}
              />
            </Section>
          </Stack>
        )
      ) : null}
      {tab === "overview" && c.platformId && c.platformName ? (
        <p className="mt-4 text-small text-muted-foreground">
          <Link href={`/admin/platforms/${c.platformId}`} className="text-primary hover:underline">
            Open {c.platformName} on Platforms
          </Link>{" "}
          (referral link, people referred).
        </p>
      ) : null}
      {tab === "overview" && can(user.role, "crm.delete") ? (
        <Section title="Delete account" description="This removes the account and its activity log for good. Its people stay in Leads, without an account. To keep the history, set the stage to Dropped instead." className="mt-6">
          <form action={removeAccount}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="returnTo" value={here} />
            <SubmitButton variant="danger" size="sm" confirm={`Delete ${c.name}? This can't be undone.`}>
              Delete account
            </SubmitButton>
          </form>
        </Section>
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
                  {unlinked.length ? <p className="eyebrow text-muted-foreground">Or add someone new</p> : null}
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
                        <Link href={`/admin/leads?view=${p.id}`} className="flex items-center gap-2.5 font-normal text-foreground hover:text-primary">
                          <Initials name={p.name} />
                          {p.name}
                        </Link>
                      </Td>
                      <Td>{p.role ?? "–"}</Td>
                      <Td className="text-small">{p.email ?? "–"}</Td>
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
          {!canSeeContact(user.role) ? <p className="text-xs text-muted-foreground">Email addresses are masked for your role.</p> : null}
        </Stack>
      ) : null}

      {tab === "activity" ? (
        <Stack>
          {edit ? (
            <Section title="Log activity" description="An email, a call, a reply: what happened, so anyone can pick the account up.">
              <form action={logAccountActivity} className="space-y-4">
                <input type="hidden" name="companyId" value={c.id} />
                <input type="hidden" name="returnTo" value={`${self}?tab=activity`} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Kind" htmlFor="a-kind">
                    <Select id="a-kind" name="kind" defaultValue="note" options={LOGGABLE_KINDS.map((k) => ({ value: k, label: crmLabel(k) }))} />
                  </Field>
                  <Field label="Date" htmlFor="a-date" hint="India time. Empty: now.">
                    <Input id="a-date" name="date" type="date" defaultValue={today} />
                  </Field>
                  <Field label="Time" htmlFor="a-time">
                    <Input id="a-time" name="time" type="time" />
                  </Field>
                </div>
                <Field label="What happened" htmlFor="a-summary">
                  <Input id="a-summary" name="summary" required placeholder="In one line" maxLength={500} />
                </Field>
                <Field label="Details" htmlFor="a-detail">
                  <Textarea id="a-detail" name="detail" rows={3} placeholder="The message sent, what they said" />
                </Field>
                {people.length ? (
                  <Field label="Who it was with" htmlFor="a-contact">
                    <Select id="a-contact" name="contactId" defaultValue="" options={people.map((p) => ({ value: p.id, label: p.name }))} placeholder="Whole account" />
                  </Field>
                ) : null}
                <SubmitButton pendingText="Logging...">Log it</SubmitButton>
              </form>
            </Section>
          ) : null}
          <Section title={`Activity (${log.length})`}>
            {log.length ? <ActivityTimeline items={log} today={today} /> : <EmptyState title="Nothing logged yet." description="Log emails, calls and replies so anyone can pick the account up." padded={false} />}
          </Section>
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
                      {e.startTime ? <span className="text-muted-foreground"> · {hhmm(e.startTime)}{e.endTime ? `–${hhmm(e.endTime)}` : ""}</span> : null}
                    </Td>
                    <Td>
                      <Link href={`/admin/calendar?event=${e.id}${e.eventDate ? `&date=${e.eventDate}` : ""}`} className="font-normal text-foreground hover:text-primary">
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
            <EmptyState title="Nothing on the calendar with this account." action={edit ? <ButtonLink href={`/admin/calendar?new=1&company=${c.id}`} size="sm">New event</ButtonLink> : undefined} />
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
                        <Link href={`/admin/jobs/${j.id}`} className="font-normal text-foreground hover:text-primary">
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
                        <Link href={`/admin/projects/${p.id}`} className="font-normal text-foreground hover:text-primary">
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
                        <Link href={`/admin/requirements/${r.id}`} className="font-normal text-foreground hover:text-primary">
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
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {Object.entries(links.referrals).map(([k, n]) => (
                  <div key={k}>
                    <div className="eyebrow text-muted-foreground">{crmLabel(k)}</div>
                    <div className="tabular text-xl font-light text-foreground">{n}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No referrals for this account." padded={false} />
            )}
          </Section>
          {c.website ? (
            <a href={c.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-small text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {c.domain ?? c.website}
            </a>
          ) : null}
        </Stack>
      ) : null}
    </>
  );
}
