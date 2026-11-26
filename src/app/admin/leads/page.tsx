import Link from "next/link";
import { Building2, CalendarClock, Check, ExternalLink, LayoutGrid, Link2, Mail, Plus, Rows3 } from "lucide-react";
import { BoardCard, BoardCardFooter, BoardColumn, BoardEmpty, BoardScroller } from "@/components/crm/board";
import { Avatar } from "@/components/ui/avatar";
import { FilterSelect, ResultCount, SearchField, Toolbar } from "@/components/ui/toolbar";
import { getDb } from "@/db/client";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { CONTACT_KINDS, CONTACT_SOURCES, CONTACT_STAGES } from "@/lib/constants";
import { addDays, shortDay, todayIST } from "@/lib/crm/dates";
import { CONTACT_OPEN, CONTACT_TABS, CONTACT_TAB_LABELS, crmLabel } from "@/lib/crm/labels";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { ago } from "@/lib/format";
import { companyChoices } from "@/lib/server/companies";
import { allContacts, contactView, getContact, parseContactFilters, visibleContact, type ContactRow } from "@/lib/server/contacts";
import { ContactStageBar, ContactStageChip, DueChip, Initials } from "@/components/crm/chips";
import { OrgLogo } from "@/components/crm/org-logo";
import { RowLink } from "@/components/crm/row-link";
import { ViewSwitch } from "@/components/crm/segments";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { AutoSubmitSelect, SubmitButton } from "@/components/ui/client";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { PanelSection, SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { removeLead, saveLead, setLeadStage } from "./actions";

export const metadata = { title: "Leads" };

const opts = (list: readonly string[], ctx?: "contact") => list.map((v) => ({ value: v, label: crmLabel(v, ctx) }));
const KIND_HINT = "Client: wants a product built. Partner: AI lab, data partner or staffing firm. Talent: someone who may work with us.";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("leads");
  if (!allowed)
    return (
      <>
        <PageHeader title="Leads" />
        <Section>
          <NoAccess what="Leads" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const today = todayIST();
  const contact = canSeeContact(user.role);
  const [all, companies] = await Promise.all([allContacts(db), companyChoices(db)]);
  const f = parseContactFilters(sp);
  const layout = one(sp.layout) === "board" ? "board" : "table";
  const view = contactView(all, f, today, { searchEmail: contact });
  const edit = can(user.role, "crm.edit");
  const rows = view.rows.map((c) => visibleContact(user.role, c));
  const here = hrefWith("/admin/leads", sp, { ok: null, error: null });
  const close = hrefWith("/admin/leads", sp, { view: null, new: null, ok: null, error: null });
  const viewingRaw = one(sp.view) ? await getContact(db, one(sp.view)) : null;
  const viewing = viewingRaw ? visibleContact(user.role, viewingRaw) : null;
  const filtered = Boolean(f.q || f.kind || f.stage || f.source || f.company || f.followUp);
  const lanes = (f.tab === "open" ? CONTACT_OPEN : f.tab === "won" ? ["won"] : f.tab === "lost" ? ["lost"] : CONTACT_STAGES) as readonly string[];

  const layoutHref = (l: "board" | null) => hrefWith("/admin/leads", sp, { layout: l, view: null, ok: null, error: null });

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="The people at accounts: who we talk to, where we found them, and the next follow-up."
        actions={
          edit ? (
            <ButtonLink href={hrefWith("/admin/leads", sp, { new: "1", view: null, ok: null, error: null })} variant="primary">
              <Plus className="h-4 w-4" aria-hidden /> New lead
            </ButtonLink>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="mb-8">
        <StatGrid>
          <Stat label="Open leads" value={view.stats.open} />
          <Stat label="Calls booked" value={view.stats.calls} />
          <Stat label="Won this month" value={view.stats.wonThisMonth} />
          <Stat label="Follow-ups due" value={view.stats.followUpsDue} href={hrefWith("/admin/leads", {}, { followUp: "due" })} />
        </StatGrid>
      </div>
      <Tabs tabs={CONTACT_TABS.map((t) => ({ href: hrefWith("/admin/leads", sp, { tab: t === "open" ? null : t, view: null, ok: null, error: null }), label: CONTACT_TAB_LABELS[t], active: f.tab === t, count: view.counts[t] }))} />

      <Section flush>
        <Toolbar
          hidden={{ tab: f.tab !== "open" ? f.tab : null, layout: layout === "board" ? "board" : null }}
          clearHref={filtered ? hrefWith("/admin/leads", {}, { tab: f.tab === "open" ? null : f.tab, layout: layout === "board" ? "board" : null }) : null}
          end={
            <>
              <ResultCount n={rows.length} noun="lead" />
              <ViewSwitch
                label="Layout"
                items={[
                  { href: layoutHref(null), label: <><Rows3 aria-hidden /> Table</>, active: layout === "table" },
                  { href: layoutHref("board"), label: <><LayoutGrid aria-hidden /> Board</>, active: layout === "board" },
                ]}
              />
            </>
          }
        >
          <SearchField defaultValue={f.q} placeholder={contact ? "Search name, company, role, email" : "Search name, company, role"} label="Search leads" />
          <FilterSelect name="stage" defaultValue={f.stage} options={opts(CONTACT_STAGES, "contact")} placeholder="Any stage" label="Stage" />
          <FilterSelect name="kind" defaultValue={f.kind} options={opts(CONTACT_KINDS)} placeholder="Any type" label="Type" />
          <FilterSelect name="source" defaultValue={f.source} options={opts(CONTACT_SOURCES)} placeholder="Any source" label="Source" />
          <FilterSelect name="company" defaultValue={f.company} options={[{ value: "none", label: "No account" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]} placeholder="Any account" label="Account" />
          <FilterSelect name="followUp" defaultValue={f.followUp} options={[{ value: "due", label: "Follow-up due" }, { value: "set", label: "Has a follow-up" }, { value: "none", label: "No follow-up" }]} placeholder="Any follow-up" label="Follow-up" />
        </Toolbar>
        {layout === "board" && all.length ? (
          <BoardScroller label="Leads board">
            {lanes.map((stage) => {
              const inLane = rows.filter((r) => r.stage === stage);
              const due = inLane.filter((r) => r.nextFollowUp && r.nextFollowUp <= today).length;
              return (
                <BoardColumn key={stage} label={crmLabel(stage, "contact")} title={crmLabel(stage, "contact")} count={inLane.length} extra={due && stage !== "won" && stage !== "lost" ? <span className="font-medium text-danger">{due} due</span> : null}>
                  {inLane.length ? (
                    inLane.map((c) => (
                      <BoardCard key={c.id}>
                        <Link href={hrefWith("/admin/leads", sp, { view: c.id, ok: null, error: null })} scroll={false} className="group block space-y-2.5">
                          <span className="flex items-center gap-2.5">
                            <Avatar name={c.name} size="lg" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{c.name}</span>
                              <span className="block truncate text-[13px] text-muted-foreground">{c.role ?? "–"}</span>
                            </span>
                          </span>
                          <BoardCardFooter>
                            <span className="flex min-w-0 items-center gap-1.5">
                              {c.companyId ? <OrgLogo name={c.companyName ?? ""} size={18} /> : null}
                              <span className="truncate">{c.companyName ?? c.company ?? "No account"}</span>
                            </span>
                            {c.nextFollowUp ? <DueChip due={c.nextFollowUp} today={today} stage={stage === "won" || stage === "lost" ? "dropped" : undefined} /> : null}
                          </BoardCardFooter>
                        </Link>
                        {edit ? (
                          <form action={setLeadStage} className="mt-3 border-t border-border pt-3">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="returnTo" value={here} />
                            <AutoSubmitSelect name="stage" defaultValue={c.stage} aria-label={`Stage of ${c.name}`} className="control h-8 w-full text-[13px]">
                              {CONTACT_STAGES.map((s) => (
                                <option key={s} value={s}>
                                  {crmLabel(s, "contact")}
                                </option>
                              ))}
                            </AutoSubmitSelect>
                          </form>
                        ) : null}
                      </BoardCard>
                    ))
                  ) : (
                    <BoardEmpty />
                  )}
                </BoardColumn>
              );
            })}
          </BoardScroller>
        ) : rows.length ? (
          <Table sticky>
            <THead>
              <Th>Person</Th>
              <Th>Role</Th>
              <Th>Account</Th>
              <Th>Stage</Th>
              <Th>Email / profile</Th>
              <Th className="hidden 2xl:table-cell">Source</Th>
              <Th>Next follow-up</Th>
            </THead>
            <TBody>
              {rows.map((c) => (
                <tr key={c.id} className="row-hover relative">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Initials name={c.name} />
                      <RowLink href={hrefWith("/admin/leads", sp, { view: c.id, new: null, ok: null, error: null })} className="max-w-48 truncate">
                        {c.name}
                      </RowLink>
                    </div>
                  </Td>
                  <Td>
                    <span className="block max-w-36 truncate" title={c.role ?? undefined}>
                      {c.role ?? <span className="text-muted-foreground/70">–</span>}
                    </span>
                  </Td>
                  <Td>
                    {c.companyId ? (
                      <Link href={`/admin/accounts?view=${c.companyId}`} className="relative z-10 inline-flex max-w-52 items-center gap-2 hover:text-primary">
                        <OrgLogo name={c.companyName ?? ""} size={22} />
                        <span className="truncate">{c.companyName}</span>
                      </Link>
                    ) : (
                      <span className="text-foreground/75">{c.company ?? <span className="text-muted-foreground/70">–</span>}</span>
                    )}
                  </Td>
                  <Td>
                    <ContactStageBar stage={c.stage} />
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="max-w-52 truncate">{c.email ?? <span className="text-muted-foreground/70">–</span>}</span>
                      {c.profileUrl ? (
                        <a href={c.profileUrl} target="_blank" rel="noreferrer noopener" className="relative z-10 text-muted-foreground hover:text-primary" aria-label={`Profile of ${c.name}`}>
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      ) : null}
                    </span>
                  </Td>
                  <Td className="hidden whitespace-nowrap 2xl:table-cell">{crmLabel(c.source)}</Td>
                  <Td className="whitespace-nowrap">
                    <DueChip due={c.nextFollowUp} today={today} stage={c.stage === "won" || c.stage === "lost" ? "dropped" : undefined} />
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        ) : all.length ? (
          <EmptyState size="page" title="No leads match this view." description="Try another tab, fewer filters or a shorter search." action={<ButtonLink href="/admin/leads?tab=all">Show all leads</ButtonLink>} />
        ) : (
          <EmptyState size="page" title="No leads yet." description={edit ? "Use “New lead” to add the first one." : "An admin or recruiter adds leads."} action={edit ? <ButtonLink href="/admin/leads?new=1" variant="primary">New lead</ButtonLink> : undefined} />
        )}
      </Section>
      {!contact ? <p className="mt-3 text-[13px] text-muted-foreground">Email addresses are masked for your role.</p> : null}

      {(one(sp.new) && edit) || viewing ? (
        <SlideOver
          title={viewing ? viewing.name || "Unnamed lead" : "New lead"}
          media={viewing ? <Avatar name={viewing.name} size="2xl" /> : undefined}
          subtitle={viewing ? [viewing.role, viewing.companyName ?? viewing.company].filter(Boolean).join(" · ") || undefined : "Someone at an account: who they are, where you found them, the next follow-up."}
          addon={viewing ? <ContactStageChip stage={viewing.stage} /> : undefined}
          meta={viewing ? <LeadQuickLinks c={viewing} contact={contact} /> : undefined}
          closeHref={close}
          footer={
            <div className="flex w-full flex-wrap items-center gap-2">
              {viewing && can(user.role, "crm.delete") ? (
                <form action={removeLead}>
                  <input type="hidden" name="id" value={viewing.id} />
                  <input type="hidden" name="returnTo" value={close} />
                  <SubmitButton variant="ghost" size="sm" className="text-danger" confirm={`Delete ${viewing.name}? This cannot be undone.`}>
                    Delete
                  </SubmitButton>
                </form>
              ) : null}
              {viewing ? <span className="text-[13px] text-muted-foreground">Updated {ago(viewing.updatedAt)}</span> : null}
              {edit ? (
                <span className="ml-auto flex items-center gap-2">
                  <ButtonLink href={close} size="sm">
                    Cancel
                  </ButtonLink>
                  <button type="submit" form="lead-form" className={buttonClass("primary", "sm")}>
                    {viewing ? "Save changes" : "Add lead"}
                  </button>
                </span>
              ) : null}
            </div>
          }
        >
          {viewing ? <LeadPulse c={viewing} today={today} edit={edit} here={here} /> : null}
          {edit ? (
            <LeadForm c={viewing} companies={companies} close={close} here={here} />
          ) : viewing ? (
            <PanelSection title="Notes">{viewing.notes ? <p className="text-sm whitespace-pre-line text-foreground/85">{viewing.notes}</p> : <EmptyState title="No notes" size="section" padded={false} />}</PanelSection>
          ) : null}
        </SlideOver>
      ) : null}
    </>
  );
}

/** Under the name: one-click ways to reach them (email, copy, profile) and their account. */
function LeadQuickLinks({ c, contact }: { c: ContactRow; contact: boolean }) {
  const chip = "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary";
  return (
    <>
      {c.email && contact ? (
        <>
          <a href={`mailto:${c.email}`} className={chip}>
            <Mail className="h-3.5 w-3.5" aria-hidden /> Email
          </a>
          <CopyButton value={c.email} label="Copy email" />
        </>
      ) : null}
      {c.profileUrl ? (
        <a href={c.profileUrl.startsWith("http") ? c.profileUrl : `https://${c.profileUrl}`} target="_blank" rel="noreferrer noopener" className={chip}>
          <Link2 className="h-3.5 w-3.5" aria-hidden /> Profile
        </a>
      ) : null}
      {c.companyId ? (
        <Link href={`/admin/accounts/${c.companyId}`} className={chip}>
          <Building2 className="h-3.5 w-3.5" aria-hidden /> {c.companyName}
        </Link>
      ) : null}
    </>
  );
}

/** The lead at a glance: where it is in the pipeline (click a step to move it) and the next follow-up, with quick dates. */
function LeadPulse({ c, today, edit, here }: { c: ContactRow; today: string; edit: boolean; here: string }) {
  const closed = c.stage === "won" || c.stage === "lost";
  const steps = CONTACT_STAGES.filter((s) => s !== "lost");
  const at = (steps as readonly string[]).indexOf(c.stage);
  const quick = [
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "In 3 days", date: addDays(today, 3) },
    { label: "Next week", date: addDays(today, 7) },
  ];
  return (
    <div className="mb-8 space-y-4">
      <div className="rounded-xl border border-border bg-canvas/60 p-4">
        <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Pipeline</p>
        <ol className="flex flex-wrap items-center gap-1.5">
          {steps.map((s, k) => {
            const done = c.stage !== "lost" && k < at;
            const current = s === c.stage;
            const cls = cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
              current ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary/25 bg-primary/[0.06] text-primary" : "border-border bg-card text-muted-foreground",
              edit && !current && "hover:border-primary/50 hover:text-primary",
            );
            const body = (
              <>
                {done ? <Check className="h-3 w-3" aria-hidden /> : null}
                {crmLabel(s, "contact")}
              </>
            );
            return (
              <li key={s}>
                {edit && !current ? (
                  <form action={setLeadStage}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="stage" value={s} />
                    <input type="hidden" name="returnTo" value={here} />
                    <button type="submit" className={cls} title={`Move to ${crmLabel(s, "contact")}`}>
                      {body}
                    </button>
                  </form>
                ) : (
                  <span className={cls} aria-current={current ? "step" : undefined}>
                    {body}
                  </span>
                )}
              </li>
            );
          })}
          {c.stage === "lost" ? <li className="ml-1 text-[13px] text-muted-foreground">· Lost</li> : null}
        </ol>
      </div>
      <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-4", !closed && c.nextFollowUp && c.nextFollowUp < today ? "border-danger/25 bg-danger-soft/50" : "border-border bg-canvas/60")}>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground/70 ring-1 ring-border">
          <CalendarClock className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Next follow-up</p>
          <div className="mt-1 text-sm">{c.nextFollowUp ? <DueChip due={c.nextFollowUp} today={today} stage={closed ? "dropped" : undefined} /> : <span className="text-muted-foreground">Not set</span>}</div>
        </div>
        {edit && !closed ? (
          <div className="flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <form key={q.label} action={saveLead}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="nextFollowUp" value={q.date} />
                <input type="hidden" name="returnTo" value={here} />
                <button type="submit" className={buttonClass("secondary", "sm")} title={shortDay(q.date, today)}>
                  {q.label}
                </button>
              </form>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LeadForm({ c, companies, close, here }: { c: ContactRow | null; companies: { id: string; name: string }[]; close: string; here: string }) {
  const id = c?.id ?? "new";
  return (
    <form id="lead-form" action={saveLead}>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <input type="hidden" name="returnTo" value={c ? here : close} />
      <PanelSection title="Person">
        <div className="space-y-4">
          <FieldRow>
            <Field label="Name" htmlFor={`${id}-name`}>
              <Input id={`${id}-name`} name="name" defaultValue={c?.name ?? ""} required />
            </Field>
            <Field label="Role" htmlFor={`${id}-role`}>
              <Input id={`${id}-role`} name="role" defaultValue={c?.role ?? ""} placeholder="Founder" />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Email" htmlFor={`${id}-email`}>
              <Input id={`${id}-email`} name="email" type="email" defaultValue={c?.email ?? ""} />
            </Field>
            <Field label="Profile link" htmlFor={`${id}-profile`}>
              <Input id={`${id}-profile`} name="profileUrl" defaultValue={c?.profileUrl ?? ""} placeholder="linkedin.com/in/…" />
            </Field>
          </FieldRow>
        </div>
      </PanelSection>
      <PanelSection title="Account and pipeline">
        <div className="space-y-4">
          <Field label="Account" htmlFor={`${id}-company`} hint="Owner, next step and the activity log live on the account.">
            <Select id={`${id}-company`} name="companyId" defaultValue={c?.companyId ?? ""} options={companies.map((x) => ({ value: x.id, label: x.name }))} placeholder="No account" />
          </Field>
          {!c?.companyId ? (
            <Field label="Company (no account yet)" htmlFor={`${id}-companyText`}>
              <Input id={`${id}-companyText`} name="company" defaultValue={c?.company ?? ""} />
            </Field>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Stage" htmlFor={`${id}-stage`}>
              <Select id={`${id}-stage`} name="stage" defaultValue={c?.stage ?? "new"} options={opts(CONTACT_STAGES, "contact")} />
            </Field>
            <Field label="Type" htmlFor={`${id}-kind`} hint={KIND_HINT}>
              <Select id={`${id}-kind`} name="kind" defaultValue={c?.kind ?? "client"} options={opts(CONTACT_KINDS)} />
            </Field>
            <Field label="Next follow-up" htmlFor={`${id}-fu`}>
              <Input id={`${id}-fu`} name="nextFollowUp" type="date" defaultValue={c?.nextFollowUp ?? ""} />
            </Field>
          </div>
        </div>
      </PanelSection>
      <PanelSection title="Where you found them">
        <FieldRow>
          <Field label="Source" htmlFor={`${id}-source`}>
            <Select id={`${id}-source`} name="source" defaultValue={c?.source ?? "linkedin"} options={opts(CONTACT_SOURCES)} />
          </Field>
          <Field label="Source link" htmlFor={`${id}-sourceUrl`} hint="A post, message thread or referral.">
            <Input id={`${id}-sourceUrl`} name="sourceUrl" defaultValue={c?.sourceUrl ?? ""} placeholder="lnkd.in/…" />
          </Field>
        </FieldRow>
      </PanelSection>
      <PanelSection title="Notes">
        <Textarea id={`${id}-notes`} name="notes" rows={5} aria-label="Notes" defaultValue={c?.notes ?? ""} placeholder="What they need, what you sent, what comes next." />
      </PanelSection>
    </form>
  );
}
