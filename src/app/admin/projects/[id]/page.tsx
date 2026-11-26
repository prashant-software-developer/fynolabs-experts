import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { can, canSeeMoney } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { DOCUMENT_KINDS, DOCUMENT_STAGES, PIPELINE_STAGES, PIPELINE_STAGE_LABELS, PROJECT_KINDS, PROJECT_ROLES, PROJECT_STATUSES, label } from "@/lib/constants";
import { shortDay, todayIST } from "@/lib/crm/dates";
import { PROJECT_KIND_HINTS, PROJECT_ROLE_HINTS, crmLabel } from "@/lib/crm/labels";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { companyChoices } from "@/lib/server/companies";
import { platformChoices } from "@/lib/server/platforms";
import { activeTeam, funnelFor, getProject, linkableJobs, projectParts, projectPeople } from "@/lib/server/projects";
import { DayBars } from "@/components/crm/charts";
import { Facts, StatusChip } from "@/components/crm/chips";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { cn } from "@/components/ui/cn";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { FactsBar, PageHeader, Section, Stack, Stat, StatGrid } from "@/components/ui/layout";
import { Person } from "@/components/ui/avatar";
import { OrgLogo } from "@/components/crm/org-logo";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { linkRolesForm, removeProject, saveDocumentsForm, saveFeesForm, saveProjectForm, saveTeamForm, saveTracksForm } from "../actions";

export const metadata = { title: "Project" };

const TABS = ["pipeline", "people", "roles", "team", "tracks", "documents", "fees", "reports", "details"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { pipeline: "Pipeline", people: "People", roles: "Roles", team: "Team", tracks: "Tracks", documents: "Documents", fees: "Fee rules", reports: "Partner reports", details: "Details" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user, allowed } = await requireSection("projects");
  if (!allowed)
    return (
      <>
        <PageHeader title="Project" back={{ href: "/admin/projects", label: "Projects" }} />
        <Section>
          <NoAccess what="Projects" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const p = await getProject(db, id);
  if (!p) notFound();
  const money = canSeeMoney(user.role);
  const tabRaw = one(sp.tab);
  const tab: Tab = (TABS as readonly string[]).includes(tabRaw) && (tabRaw !== "fees" || money) ? (tabRaw as Tab) : "pipeline";
  const editing = one(sp.edit);
  const manage = can(user.role, "projects.manage");
  const today = todayIST();
  const parts = await projectParts(db, p.id, user.role);
  const [funnel, people, team, linkable, companies, platforms] = await Promise.all([
    funnelFor(db, p, parts.tracks),
    tab === "people" ? projectPeople(db, p.id, user.role, one(sp.stage)) : Promise.resolve([]),
    manage && (editing === "team" || tab === "details") ? activeTeam(db) : Promise.resolve([]),
    manage && editing === "roles" ? linkableJobs(db, p.id) : Promise.resolve([]),
    manage && tab === "details" ? companyChoices(db) : Promise.resolve([]),
    manage && tab === "details" ? platformChoices(db) : Promise.resolve([]),
  ]);
  const self = `/admin/projects/${p.id}`;
  const tabHref = (t: Tab, extra: Record<string, string | null> = {}) => hrefWith(self, {}, { tab: t === "pipeline" ? null : t, ...extra });
  const here = hrefWith(self, sp, { ok: null, error: null, edit: null });
  const owner = p.ownerMemberName ?? p.ownerMemberEmail?.split("@")[0] ?? null;
  const visibleTabs = TABS.filter((t) => t !== "fees" || money);
  const counts: Partial<Record<Tab, number>> = { people: funnel.people, roles: parts.roles.length, team: parts.members.length, tracks: parts.tracks.length, documents: parts.documents.length, fees: parts.feeRules.length, reports: parts.reports.length };
  const trackName = (tid: string | null) => parts.tracks.find((t) => t.id === tid)?.name ?? "Whole project";
  const maxStage = Math.max(1, ...PIPELINE_STAGES.filter((s) => s !== "rejected").map((s) => funnel.stages[s] ?? 0));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/projects", label: "Projects" }}
        title={p.name}
        media={<CodeTile code={p.code} />}
        badge={<StatusChip value={p.status} />}
        subtitle={`${p.code}${p.description ? ` · ${p.description}` : ""}`}
        actions={manage ? <ButtonLink href={tabHref("details")}>Edit</ButtonLink> : undefined}
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <FactsBar
        items={[
          { label: "Partner", value: p.companyId ? <span className="inline-flex min-w-0 items-center gap-2"><OrgLogo name={p.companyName ?? ""} size={22} /><span className="truncate">{p.companyName}</span></span> : "Our own", href: p.companyId ? `/admin/accounts?view=${p.companyId}` : undefined },
          { label: "Owner", value: owner ? <Person name={owner} /> : null },
          { label: "Platform", value: p.platformId ? p.platformName : null, href: p.platformId ? `/admin/platforms/${p.platformId}` : undefined },
          { label: "Dates", value: p.startsOn || p.endsOn ? `${p.startsOn ? shortDay(p.startsOn, today) : "–"} → ${p.endsOn ? shortDay(p.endsOn, today) : "open"}` : null },
        ]}
      />
      <Stack>
        <StatGrid>
          <Stat label="People" value={funnel.people} href={tabHref("people")} />
          <Stat label={p.targetCount != null ? `Achieved of ${p.targetCount}` : "Achieved"} value={funnel.achieved} />
          <Stat label="Per week (4 wks)" value={funnel.pace ? funnel.pace.toFixed(1) : "0"} />
          <Stat label="Target reached" value={funnel.projected ? shortDay(funnel.projected, today) : "–"} hint={funnel.projected ? "At this pace" : undefined} />
        </StatGrid>
        <Section title="About">
          <Facts
            items={[
              { label: "Type", value: crmLabel(p.kind) },
              { label: "Started", value: p.startsOn ? shortDay(p.startsOn, today) : null },
              { label: "Ends", value: p.endsOn ? shortDay(p.endsOn, today) : null },
              { label: "Countries", value: p.countries.length ? p.countries.join(", ") : "Anywhere" },
              { label: "Referral link", value: p.referralUrl ? <span className="break-all">{p.referralUrl}</span> : null },
              { label: "Discord", value: p.discord },
            ]}
          />
        </Section>
      </Stack>
      <div className="mt-8">
        <Tabs tabs={visibleTabs.map((t) => ({ href: tabHref(t), label: TAB_LABELS[t], active: tab === t, count: counts[t] }))} />
      </div>

      {tab === "pipeline" ? (
        <Stack>
          <Section title="By stage" description={`${funnel.people} people in all · ${funnel.rejected} rejected. Applications on this project's roles.`}>
            {funnel.people ? (
              <div className="space-y-2">
                {PIPELINE_STAGES.filter((s) => s !== "rejected").map((s) => (
                  <Link key={s} href={tabHref("people", { stage: s })} className="group flex items-center gap-3 text-sm">
                    <span className="w-36 shrink-0 text-foreground/70 group-hover:text-foreground">{PIPELINE_STAGE_LABELS[s]}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                      <span className={cn("block h-2 rounded-full", s === "active" || s === "ended" ? "bg-primary" : "bg-foreground/75")} style={{ width: `${((funnel.stages[s] ?? 0) / maxStage) * 100}%` }} />
                    </span>
                    <span className="tabular w-12 text-foreground/80">{funnel.stages[s] ?? 0}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No one in this project yet." description="People join a project through one of its roles." padded={false} />
            )}
          </Section>
          <Section title="Last 12 weeks" description="People added and reaching the goal, per week (India time).">
            <DayBars
              label="People added and reaching the goal per week"
              stacked={false}
              days={funnel.weekly.map((w) => ({ day: w.week, added: w.added, achieved: w.achieved }))}
              series={[
                { key: "added", label: "Added", className: "fill-foreground/60" },
                { key: "achieved", label: "Reached the goal", className: "fill-primary" },
              ]}
            />
          </Section>
          {funnel.tracks.length ? (
            <Section title="Tracks" flush>
              <TracksTable tracks={funnel.tracks} />
            </Section>
          ) : null}
        </Stack>
      ) : null}

      {tab === "people" ? (
        <Section
          flush
          title="People"
          actions={
            <form method="get" className="flex items-center gap-2">
              <input type="hidden" name="tab" value="people" />
              <Select name="stage" defaultValue={one(sp.stage)} options={PIPELINE_STAGES.map((s) => ({ value: s, label: `${PIPELINE_STAGE_LABELS[s]} (${funnel.stages[s] ?? 0})` }))} placeholder={`Every stage (${Object.values(funnel.stages).reduce((n, v) => n + v, 0)})`} aria-label="Stage" className="h-8 w-auto text-small" />
              <Button type="submit" variant="secondary" size="sm">
                Show
              </Button>
            </form>
          }
        >
          {people.length ? (
            <Table>
              <THead>
                <Th>Person</Th>
                <Th>{parts.tracks.length ? "Role and track" : "Role"}</Th>
                <Th>Stage</Th>
                <Th>Since</Th>
                <Th>Owner</Th>
              </THead>
              <TBody>
                {people.map((x) => (
                  <Tr key={x.applicationId}>
                    <Td>
                      <Link href={`/admin/experts?view=${x.expertId}`} className="font-medium text-foreground hover:text-primary">
                        {x.name}
                      </Link>
                      <span className="block text-[13px] text-muted-foreground">{x.email ?? "No email"}</span>
                    </Td>
                    <Td>
                      <Link href={`/admin/jobs/${x.jobId}?tab=applicants`} className="hover:text-primary">
                        {x.jobTitle}
                      </Link>
                      {parts.tracks.length ? <span className="block text-[13px] text-muted-foreground">{x.trackName ?? "No track"}</span> : null}
                    </Td>
                    <Td>
                      <StatusBadge value={x.stage === "new" ? "new" : x.stage} />
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(x.stageChangedAt)}</Td>
                    <Td>{x.owner ?? "–"}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title={one(sp.stage) ? "No one matches this view." : "No one on this project's roles yet."} description={one(sp.stage) ? undefined : "People join through the project's roles (Jobs → Applicants)."} />
          )}
        </Section>
      ) : null}

      {tab === "roles" ? (
        <Stack>
          {manage && editing === "roles" ? (
            <Section title={`Link roles to ${p.code}`} description="Jobs not in this project. Linking moves a role out of any other project.">
              {linkable.length ? (
                <form action={linkRolesForm} className="space-y-4">
                  <input type="hidden" name="projectId" value={p.id} />
                  <input type="hidden" name="returnTo" value={tabHref("roles")} />
                  <ul className="max-h-80 space-y-2 overflow-y-auto">
                    {linkable.map((j) => (
                      <li key={j.id}>
                        <Checkbox name="jobIds" value={j.id} label={<span>{j.title} <span className="text-[13px] text-muted-foreground">· {crmLabel(j.status)}{j.projectCode ? ` · now in ${j.projectCode}` : " · not in a project"}</span></span>} />
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <SubmitButton>Link roles</SubmitButton>
                    <ButtonLink href={tabHref("roles")}>Cancel</ButtonLink>
                  </div>
                </form>
              ) : (
                <EmptyState title="Every job is already in this project." padded={false} />
              )}
            </Section>
          ) : null}
          <Section
            title={`Roles (${parts.roles.length})`}
            flush
            actions={
              manage ? (
                <>
                  <ButtonLink href={tabHref("roles", { edit: "roles" })} size="sm">
                    Link existing role
                  </ButtonLink>
                  <ButtonLink href="/admin/jobs/new" size="sm">
                    Add a role
                  </ButtonLink>
                </>
              ) : undefined
            }
          >
            {parts.roles.length ? (
              <Table>
                <THead>
                  <Th>Role</Th>
                  <Th>Where</Th>
                  <Th>Status</Th>
                  <Th>Track</Th>
                  <Th className="text-right">People</Th>
                  <Th>Closes</Th>
                  <Th />
                </THead>
                <TBody>
                  {parts.roles.map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <Link href={`/admin/jobs/${r.id}`} className="font-medium text-foreground hover:text-primary">
                          {r.title}
                        </Link>
                      </Td>
                      <Td>{r.visibility === "internal" ? "Internal" : "On the site"}</Td>
                      <Td>
                        <StatusBadge value={r.status} />
                      </Td>
                      <Td>{r.trackId ? trackName(r.trackId) : "–"}</Td>
                      <Td className="tabular text-right">{r.people}</Td>
                      <Td>{fmtDate(r.closesOn)}</Td>
                      <Td className="text-right">
                        {manage ? (
                          <form action={linkRolesForm}>
                            <input type="hidden" name="projectId" value={p.id} />
                            <input type="hidden" name="jobIds" value={r.id} />
                            <input type="hidden" name="unlink" value="yes" />
                            <input type="hidden" name="returnTo" value={tabHref("roles")} />
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
              <EmptyState title="No roles yet." description="Add a new role, or link one that's already posted." />
            )}
          </Section>
        </Stack>
      ) : null}

      {tab === "team" ? (
        editing === "team" && manage ? (
          <Section title="Team" description="Who works this project, with their role and how many new applicants a day they take.">
            <form action={saveTeamForm} className="space-y-4">
              <input type="hidden" name="projectId" value={p.id} />
              <input type="hidden" name="returnTo" value={tabHref("team")} />
              {[...parts.members, null, null].map((m, i) => (
                <div key={m?.id ?? `new-${i}`} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-4">
                  <input type="hidden" name="rowId" value={m?.id ?? ""} />
                  <Select name="teamMemberId" defaultValue={m?.teamMemberId ?? ""} options={[...team, ...(m && !team.some((t) => t.id === m.teamMemberId) ? [{ id: m.teamMemberId, name: m.name, email: m.email }] : [])].map((t) => ({ value: t.id, label: t.name || t.email }))} placeholder="Pick a teammate" aria-label="Person" />
                  <Select name="role" defaultValue={m?.role ?? "recruiter"} options={PROJECT_ROLES.map((r) => ({ value: r, label: `${crmLabel(r)}: ${PROJECT_ROLE_HINTS[r]}` }))} aria-label="Role" />
                  <Input name="capacity" type="number" min={0} defaultValue={m?.capacity ?? ""} placeholder="New a day: no limit" aria-label="New applicants a day" />
                  <div className="flex items-center gap-3">
                    <Select name="active" defaultValue={m?.active === false ? "paused" : "active"} options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }]} aria-label="Status" />
                    {m ? <Checkbox name="remove" value={m.id} label="Remove" /> : null}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <SubmitButton>Save team</SubmitButton>
                <ButtonLink href={tabHref("team")}>Cancel</ButtonLink>
              </div>
            </form>
          </Section>
        ) : (
          <Section title={`Team (${parts.members.length})`} flush actions={manage ? <ButtonLink href={tabHref("team", { edit: "team" })} size="sm">Edit team</ButtonLink> : undefined}>
            {parts.members.length ? (
              <Table>
                <THead>
                  <Th>Person</Th>
                  <Th>Role</Th>
                  <Th>New applicants a day</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {parts.members.map((m) => (
                    <Tr key={m.id}>
                      <Td className="font-medium text-foreground">{m.name ?? m.email.split("@")[0]}</Td>
                      <Td>{crmLabel(m.role)}</Td>
                      <Td className="tabular">{m.capacity ?? "No limit"}</Td>
                      <Td>{m.active ? <StatusChip value="active" /> : <StatusChip value="inactive" />}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="No team yet." description="New applicants on this project's roles stay unassigned." />
            )}
          </Section>
        )
      ) : null}

      {tab === "tracks" ? (
        editing === "tracks" && manage ? (
          <Section title="Tracks" description="Parts of the project with their own target, e.g. Software engineering 125. Removing one keeps its people; they lose the track.">
            <form action={saveTracksForm} className="space-y-3">
              <input type="hidden" name="projectId" value={p.id} />
              <input type="hidden" name="returnTo" value={tabHref("tracks")} />
              {[...parts.tracks, null, null].map((t, i) => (
                <div key={t?.id ?? `new-${i}`} className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-center">
                  <input type="hidden" name="rowId" value={t?.id ?? ""} />
                  <Input name="name" defaultValue={t?.name ?? ""} placeholder="Software engineering" aria-label="Track name" />
                  <Input name="targetCount" type="number" min={0} defaultValue={t?.targetCount ?? ""} placeholder="Target (people)" aria-label="Target" />
                  {t ? <Checkbox name="remove" value={t.id} label="Remove" /> : <span />}
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <SubmitButton>Save tracks</SubmitButton>
                <ButtonLink href={tabHref("tracks")}>Cancel</ButtonLink>
              </div>
            </form>
          </Section>
        ) : (
          <Section title={`Tracks (${parts.tracks.length})`} flush actions={manage ? <ButtonLink href={tabHref("tracks", { edit: "tracks" })} size="sm">Edit tracks</ButtonLink> : undefined}>
            {funnel.tracks.length ? <TracksTable tracks={funnel.tracks} /> : <EmptyState title="No tracks." description="One target for the whole project." />}
          </Section>
        )
      ) : null}

      {tab === "documents" ? (
        editing === "documents" && manage ? (
          <Section title="Required documents" description="Created for each person when they reach the stage; nobody becomes Active until all are signed. Removing one keeps copies already made.">
            <form action={saveDocumentsForm} className="space-y-3">
              <input type="hidden" name="projectId" value={p.id} />
              <input type="hidden" name="returnTo" value={tabHref("documents")} />
              {[...parts.documents, null, null].map((d, i) => (
                <div key={d?.id ?? `new-${i}`} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-5 sm:items-center">
                  <input type="hidden" name="rowId" value={d?.id ?? ""} />
                  <Input name="title" defaultValue={d?.title ?? ""} placeholder="Contractor agreement" aria-label="Title" className="sm:col-span-2" />
                  <Select name="kind" defaultValue={d?.kind ?? "nda"} options={DOCUMENT_KINDS.map((k) => ({ value: k, label: crmLabel(k) }))} aria-label="Kind" />
                  <Select name="requiredStage" defaultValue={d?.requiredStage ?? "selected"} options={DOCUMENT_STAGES.map((s) => ({ value: s, label: `Needed by: ${PIPELINE_STAGE_LABELS[s]}` }))} aria-label="Needed by" />
                  <div className="flex items-center gap-3">
                    <Input name="expiresAfterDays" type="number" min={1} max={3650} defaultValue={d?.expiresAfterDays ?? ""} placeholder="Never expires" aria-label="Valid for (days)" />
                    {d ? <Checkbox name="remove" value={d.id} label="Remove" /> : null}
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <SubmitButton>Save documents</SubmitButton>
                <ButtonLink href={tabHref("documents")}>Cancel</ButtonLink>
              </div>
            </form>
          </Section>
        ) : (
          <Section title={`Required documents (${parts.documents.length})`} flush actions={manage ? <ButtonLink href={tabHref("documents", { edit: "documents" })} size="sm">Edit documents</ButtonLink> : undefined}>
            {parts.documents.length ? (
              <Table>
                <THead>
                  <Th>Document</Th>
                  <Th>Kind</Th>
                  <Th>Due at</Th>
                  <Th>Valid</Th>
                </THead>
                <TBody>
                  {parts.documents.map((d) => (
                    <Tr key={d.id}>
                      <Td className="font-medium text-foreground">{d.title}</Td>
                      <Td>{crmLabel(d.kind)}</Td>
                      <Td>{PIPELINE_STAGE_LABELS[d.requiredStage as keyof typeof PIPELINE_STAGE_LABELS] ?? label(d.requiredStage)}</Td>
                      <Td>{d.expiresAfterDays ? `${d.expiresAfterDays} days` : "Never expires"}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="None." description="People can become Active without signed documents." />
            )}
          </Section>
        )
      ) : null}

      {tab === "fees" && money ? (
        editing === "fees" && can(user.role, "projects.fees") ? (
          <Section title="Fee rules" description="What the partner pays us per person reaching a stage. Money: admins and finance only.">
            <form action={saveFeesForm} className="space-y-3">
              <input type="hidden" name="projectId" value={p.id} />
              <input type="hidden" name="returnTo" value={tabHref("fees")} />
              {[...parts.feeRules, null].map((f, i) => (
                <div key={f?.id ?? `new-${i}`} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-4 sm:items-center">
                  <input type="hidden" name="rowId" value={f?.id ?? ""} />
                  <Select name="trackId" defaultValue={f?.trackId ?? ""} options={parts.tracks.map((t) => ({ value: t.id, label: t.name }))} placeholder="Whole project" aria-label="Track" />
                  <Input name="amount" type="number" min={0} step="0.01" defaultValue={f?.amount ?? ""} placeholder="Fee per person" aria-label="Fee per person" />
                  <Input name="currency" defaultValue={f?.currency ?? "USD"} maxLength={3} aria-label="Currency" className="uppercase" />
                  <Select name="earnedAtStage" defaultValue={f?.earnedAtStage ?? "active"} options={DOCUMENT_STAGES.map((s) => ({ value: s, label: `Earned at: ${PIPELINE_STAGE_LABELS[s]}` }))} aria-label="Earned at" />
                  <Input name="paymentTermsDays" type="number" min={0} max={365} defaultValue={f?.paymentTermsDays ?? 30} aria-label="Payment terms (days)" />
                  <Select name="active" defaultValue={f?.active === false ? "off" : "on"} options={[{ value: "on", label: "On (new fees are added)" }, { value: "off", label: "Off" }]} aria-label="Status" />
                  <Input name="notes" defaultValue={f?.notes ?? ""} placeholder="Notes" aria-label="Notes" />
                  {f ? <Checkbox name="remove" value={f.id} label="Remove" /> : <span />}
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <SubmitButton>Save fee rules</SubmitButton>
                <ButtonLink href={tabHref("fees")}>Cancel</ButtonLink>
              </div>
            </form>
          </Section>
        ) : (
          <Section title={`Fee rules (${parts.feeRules.length})`} description="Money: admins and finance only." flush actions={can(user.role, "projects.fees") ? <ButtonLink href={tabHref("fees", { edit: "fees" })} size="sm">Edit fee rules</ButtonLink> : undefined}>
            {parts.feeRules.length ? (
              <Table>
                <THead>
                  <Th>Applies to</Th>
                  <Th className="text-right">Fee</Th>
                  <Th>Earned at</Th>
                  <Th>Terms</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {parts.feeRules.map((f) => (
                    <Tr key={f.id}>
                      <Td>
                        {p.code} · {trackName(f.trackId)}
                      </Td>
                      <Td className="tabular text-right">{formatMoney(f.amount, f.currency)}</Td>
                      <Td>{PIPELINE_STAGE_LABELS[f.earnedAtStage as keyof typeof PIPELINE_STAGE_LABELS] ?? f.earnedAtStage}</Td>
                      <Td>{f.paymentTermsDays} days</Td>
                      <Td>{f.active ? "On" : "Off"}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="No fee rules." description="Add what the partner pays per person reaching a stage." />
            )}
          </Section>
        )
      ) : null}

      {tab === "reports" ? (
        <Section title={`Partner reports (${parts.reports.length})`} description="A partner's report for a period, matched against our referrals." flush>
          {parts.reports.length ? (
            <Table>
              <THead>
                <Th>Report</Th>
                <Th>Period</Th>
                <Th className="text-right">Sign-ups</Th>
                <Th className="text-right">Qualified</Th>
                <Th className="text-right">Active</Th>
                <Th className="text-right">Matched</Th>
                <Th className="text-right">Unmatched</Th>
              </THead>
              <TBody>
                {parts.reports.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium text-foreground">{r.label ?? "Report"}</Td>
                    <Td className="whitespace-nowrap">
                      {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
                    </Td>
                    <Td className="tabular text-right">{r.signups ?? "–"}</Td>
                    <Td className="tabular text-right">{r.qualified ?? "–"}</Td>
                    <Td className="tabular text-right">{r.active ?? "–"}</Td>
                    <Td className="tabular text-right">
                      {r.matched} of {r.rowsTotal}
                    </Td>
                    <Td className="tabular text-right">{r.unmatchedCount}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="No partner reports for this project." />
          )}
        </Section>
      ) : null}

      {tab === "details" ? (
        manage ? (
          <Stack>
            <form action={saveProjectForm}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="returnTo" value={tabHref("details")} />
              <Section title={`Edit ${p.code}`}>
                <div className="space-y-4">
                  <FieldRow>
                    <Field label="Name" htmlFor="pj-name">
                      <Input id="pj-name" name="name" defaultValue={p.name} required />
                    </Field>
                    <Field label="Status" htmlFor="pj-status">
                      <Select id="pj-status" name="status" defaultValue={p.status} options={PROJECT_STATUSES.map((s) => ({ value: s, label: crmLabel(s) }))} />
                    </Field>
                  </FieldRow>
                  <FieldRow>
                    <Field label="Type" htmlFor="pj-kind">
                      <Select id="pj-kind" name="kind" defaultValue={p.kind} options={PROJECT_KINDS.map((k) => ({ value: k, label: `${crmLabel(k)}: ${PROJECT_KIND_HINTS[k]}` }))} />
                    </Field>
                    <Field label="Owner" htmlFor="pj-owner">
                      <Select id="pj-owner" name="ownerTeamMemberId" defaultValue={p.ownerTeamMemberId ?? ""} options={team.map((t) => ({ value: t.id, label: t.name || t.email }))} placeholder="No owner" />
                    </Field>
                  </FieldRow>
                  <FieldRow>
                    <Field label="Partner account" htmlFor="pj-company">
                      <Select id="pj-company" name="companyId" defaultValue={p.companyId ?? ""} options={companies.map((c) => ({ value: c.id, label: c.name }))} placeholder="None (our own)" />
                    </Field>
                    <Field label="Platform" htmlFor="pj-platform">
                      <Select id="pj-platform" name="platformId" defaultValue={p.platformId ?? ""} options={platforms.map((c) => ({ value: c.id, label: c.name }))} placeholder="None" />
                    </Field>
                  </FieldRow>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Target (people)" htmlFor="pj-target">
                      <Input id="pj-target" name="targetCount" type="number" min={0} defaultValue={p.targetCount ?? ""} />
                    </Field>
                    <Field label="Starts" htmlFor="pj-start">
                      <Input id="pj-start" name="startsOn" type="date" defaultValue={p.startsOn ?? ""} />
                    </Field>
                    <Field label="Ends" htmlFor="pj-end">
                      <Input id="pj-end" name="endsOn" type="date" defaultValue={p.endsOn ?? ""} />
                    </Field>
                  </div>
                  <FieldRow>
                    <Field label="Countries" htmlFor="pj-countries" hint="ISO codes, e.g. US, GB, CA. Empty means anywhere.">
                      <Input id="pj-countries" name="countries" defaultValue={p.countries.join(", ")} />
                    </Field>
                    <Field label="Discord" htmlFor="pj-discord" hint="The project's category or channel.">
                      <Input id="pj-discord" name="discord" defaultValue={p.discord ?? ""} />
                    </Field>
                  </FieldRow>
                  <Field label="Referral link" htmlFor="pj-ref">
                    <Input id="pj-ref" name="referralUrl" defaultValue={p.referralUrl ?? ""} />
                  </Field>
                  <Field label="Description" htmlFor="pj-desc">
                    <Textarea id="pj-desc" name="description" rows={3} defaultValue={p.description ?? ""} />
                  </Field>
                  <Field label="Rules" htmlFor="pj-rules" hint='The project&apos;s rules as JSON, e.g. {"github_required": true, "min_years": 3}.'>
                    <Textarea id="pj-rules" name="rules" rows={4} defaultValue={Object.keys(p.rules ?? {}).length ? JSON.stringify(p.rules, null, 2) : ""} className="font-mono text-xs" />
                  </Field>
                  <Field label="Notes" htmlFor="pj-notes">
                    <Textarea id="pj-notes" name="notes" rows={3} defaultValue={p.notes ?? ""} />
                  </Field>
                  <SubmitButton pendingText="Saving...">Save project</SubmitButton>
                </div>
              </Section>
            </form>
            {can(user.role, "crm.delete") ? (
              <Section title={`Delete ${p.code} · ${p.name}`} description="Its tracks, team, required documents and fee rules are removed for good. Its roles stay in Jobs with no project, and people, their pipelines, signed documents and recorded fees are kept.">
                <form action={removeProject}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="returnTo" value={here} />
                  <SubmitButton variant="danger" size="sm" confirm={`Delete ${p.code}? This can't be undone.`}>
                    Delete project
                  </SubmitButton>
                </form>
              </Section>
            ) : null}
          </Stack>
        ) : (
          <Section title="Rules">
            {Object.keys(p.rules ?? {}).length ? <pre className="overflow-x-auto rounded-md bg-secondary p-3 text-xs">{JSON.stringify(p.rules, null, 2)}</pre> : <EmptyState title="No rules set." padded={false} />}
          </Section>
        )
      ) : null}
    </>
  );
}

function TracksTable({ tracks }: { tracks: { id: string; name: string; targetCount: number | null; achieved: number; inPipeline: number }[] }) {
  return (
    <Table>
      <THead>
        <Th>Track</Th>
        <Th className="text-right">Achieved</Th>
        <Th className="text-right">Target</Th>
        <Th className="text-right">In pipeline</Th>
        <Th className="w-48">Progress</Th>
      </THead>
      <TBody>
        {tracks.map((t) => (
          <Tr key={t.id}>
            <Td className="font-medium text-foreground">{t.name}</Td>
            <Td className="tabular text-right">{t.achieved}</Td>
            <Td className="tabular text-right">{t.targetCount ?? "–"}</Td>
            <Td className="tabular text-right">{t.inPipeline}</Td>
            <Td>
              <span className="block h-1.5 overflow-hidden bg-secondary">
                <span className="block h-1.5 bg-primary" style={{ width: `${t.targetCount ? Math.min(100, (t.achieved / t.targetCount) * 100) : 0}%` }} />
              </span>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

/** A project's code as its picture in the header (P101). */
function CodeTile({ code }: { code: string }) {
  return <span className="tabular inline-flex h-12 min-w-12 items-center justify-center rounded-xl border border-border bg-card px-2 font-mono text-[13px] font-medium text-foreground/80 shadow-card">{code}</span>;
}
