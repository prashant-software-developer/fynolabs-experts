import Link from "next/link";
import { ExternalLink, LayoutGrid, Plus, Rows3 } from "lucide-react";
import { BoardCard, BoardCardFooter, BoardColumn, BoardEmpty, BoardScroller } from "@/components/crm/board";
import { Avatar } from "@/components/ui/avatar";
import { FilterSelect, ResultCount, SearchField, Toolbar } from "@/components/ui/toolbar";
import { getDb } from "@/db/client";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { CONTACT_KINDS, CONTACT_SOURCES, CONTACT_STAGES } from "@/lib/constants";
import { todayIST } from "@/lib/crm/dates";
import { CONTACT_OPEN, CONTACT_TABS, CONTACT_TAB_LABELS, crmLabel } from "@/lib/crm/labels";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { ago } from "@/lib/format";
import { companyChoices } from "@/lib/server/companies";
import { allContacts, contactView, getContact, parseContactFilters, visibleContact, type ContactRow } from "@/lib/server/contacts";
import { ContactStageBar, ContactStageChip, DueChip, Facts, Initials } from "@/components/crm/chips";
import { OrgLogo } from "@/components/crm/org-logo";
import { RowLink } from "@/components/crm/row-link";
import { ViewSwitch } from "@/components/crm/segments";
import { ButtonLink } from "@/components/ui/button";
import { AutoSubmitSelect, SubmitButton } from "@/components/ui/client";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
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
          meta={viewing?.nextFollowUp ? <DueChip due={viewing.nextFollowUp} today={today} stage={viewing.stage === "won" || viewing.stage === "lost" ? "dropped" : undefined} /> : undefined}
          closeHref={close}
          footer={
            viewing && can(user.role, "crm.delete") ? (
              <form action={removeLead}>
                <input type="hidden" name="id" value={viewing.id} />
                <input type="hidden" name="returnTo" value={close} />
                <SubmitButton variant="ghost" size="sm" className="text-danger" confirm={`Delete ${viewing.name}? This cannot be undone.`}>
                  Delete lead
                </SubmitButton>
              </form>
            ) : undefined
          }
        >
          {viewing ? <LeadSummary c={viewing} today={today} contact={contact} /> : null}
          {edit ? (
            <LeadForm c={viewing} companies={companies} close={close} here={here} />
          ) : viewing ? (
            <div className="mt-6 space-y-4 text-sm">
              {viewing.notes ? <p className="whitespace-pre-line text-foreground/85">{viewing.notes}</p> : <EmptyState title="No notes" padded={false} />}
            </div>
          ) : null}
        </SlideOver>
      ) : null}
    </>
  );
}

function LeadSummary({ c, today, contact }: { c: ContactRow; today: string; contact: boolean }) {
  return (
    <div className="mb-8 border-b border-border pb-7">
      <Facts
        items={[
          { label: "Account", value: c.companyId ? <Link href={`/admin/accounts/${c.companyId}`} className="text-primary hover:underline">{c.companyName}</Link> : null },
          {
            label: "Email",
            value: c.email ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="break-all">{c.email}</span>
                {contact ? <CopyButton value={c.email} label="Copy" /> : null}
              </span>
            ) : (
              "–"
            ),
          },
          { label: "Type", value: crmLabel(c.kind) },
          { label: "Source", value: crmLabel(c.source) },
          { label: "Next follow-up", value: c.nextFollowUp ? <DueChip due={c.nextFollowUp} today={today} /> : null },
          { label: "Updated", value: ago(c.updatedAt) },
        ]}
      />
    </div>
  );
}

function LeadForm({ c, companies, close, here }: { c: ContactRow | null; companies: { id: string; name: string }[]; close: string; here: string }) {
  const id = c?.id ?? "new";
  return (
    <form action={saveLead} className="space-y-4">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <input type="hidden" name="returnTo" value={c ? here : close} />
      <FieldRow>
        <Field label="Name" htmlFor={`${id}-name`}>
          <Input id={`${id}-name`} name="name" defaultValue={c?.name ?? ""} required />
        </Field>
        <Field label="Account" htmlFor={`${id}-company`} hint="The company on Accounts. Owner, next step and the activity log live there.">
          <Select id={`${id}-company`} name="companyId" defaultValue={c?.companyId ?? ""} options={companies.map((x) => ({ value: x.id, label: x.name }))} placeholder="No account" />
        </Field>
      </FieldRow>
      {!c?.companyId ? (
        <Field label="Company (no account yet)" htmlFor={`${id}-companyText`}>
          <Input id={`${id}-companyText`} name="company" defaultValue={c?.company ?? ""} />
        </Field>
      ) : null}
      <FieldRow>
        <Field label="Role" htmlFor={`${id}-role`}>
          <Input id={`${id}-role`} name="role" defaultValue={c?.role ?? ""} placeholder="Founder" />
        </Field>
        <Field label="Email" htmlFor={`${id}-email`}>
          <Input id={`${id}-email`} name="email" type="email" defaultValue={c?.email ?? ""} />
        </Field>
      </FieldRow>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Stage" htmlFor={`${id}-stage`}>
          <Select id={`${id}-stage`} name="stage" defaultValue={c?.stage ?? "new"} options={opts(CONTACT_STAGES, "contact")} />
        </Field>
        <Field label="Type" htmlFor={`${id}-kind`}>
          <Select id={`${id}-kind`} name="kind" defaultValue={c?.kind ?? "client"} options={opts(CONTACT_KINDS)} />
        </Field>
        <Field label="Source" htmlFor={`${id}-source`}>
          <Select id={`${id}-source`} name="source" defaultValue={c?.source ?? "linkedin"} options={opts(CONTACT_SOURCES)} />
        </Field>
      </div>
      <p className="-mt-2 text-[13px] text-muted-foreground">{KIND_HINT}</p>
      <FieldRow>
        <Field label="Profile link" htmlFor={`${id}-profile`} hint="LinkedIn or their website.">
          <Input id={`${id}-profile`} name="profileUrl" defaultValue={c?.profileUrl ?? ""} placeholder="linkedin.com/in/…" />
        </Field>
        <Field label="Source link" htmlFor={`${id}-sourceUrl`} hint="Where you found them: a post, a message thread or a referral.">
          <Input id={`${id}-sourceUrl`} name="sourceUrl" defaultValue={c?.sourceUrl ?? ""} placeholder="lnkd.in/…" />
        </Field>
      </FieldRow>
      <Field label="Next follow-up" htmlFor={`${id}-fu`} hint="Shows on the calendar and on My work when it's due.">
        <Input id={`${id}-fu`} name="nextFollowUp" type="date" defaultValue={c?.nextFollowUp ?? ""} className="sm:max-w-56" />
      </Field>
      <Field label="Notes" htmlFor={`${id}-notes`}>
        <Textarea id={`${id}-notes`} name="notes" rows={4} defaultValue={c?.notes ?? ""} placeholder="What they need, what you sent, what comes next." />
      </Field>
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving...">{c ? "Save changes" : "Add lead"}</SubmitButton>
        <ButtonLink href={close}>Cancel</ButtonLink>
      </div>
    </form>
  );
}
