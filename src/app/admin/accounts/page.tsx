import Link from "next/link";
import { LayoutGrid, Plus, Rows3 } from "lucide-react";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { PARTNER_KINDS, label } from "@/lib/constants";
import { todayIST } from "@/lib/crm/dates";
import { COMPANY_STAGES } from "@/lib/constants";
import { COMPANY_TABS, COMPANY_TAB_LABELS, crmLabel } from "@/lib/crm/labels";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { allCompanies, companyActivityLog, companyView, getCompany, myTeamMemberId, ownerLabel, ownerOptions, parseCompanyFilters, teamOptions, type CompanyRow } from "@/lib/server/companies";
import { contactsAt, visibleContact } from "@/lib/server/contacts";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ContactStageChip, DueChip, Facts, Initials, PriorityDot, StageBar } from "@/components/crm/chips";
import { NewAccountFields, stageOptions } from "@/components/crm/company-fields";
import { OrgLogo } from "@/components/crm/org-logo";
import { RowLink } from "@/components/crm/row-link";
import { Segments } from "@/components/crm/segments";
import { Button, ButtonLink } from "@/components/ui/button";
import { AutoSubmitSelect, SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { createAccount, setAccountStage } from "./actions";

export const metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("accounts");
  if (!allowed) return <NoAccessPage role={user.role} />;
  const db = await getDb();
  const today = todayIST();
  const [all, team, meId] = await Promise.all([allCompanies(db), teamOptions(db), myTeamMemberId(db, user.email)]);
  const f = parseCompanyFilters(sp);
  const layout = one(sp.layout) === "board" ? "board" : "table";
  const view = companyView(all, f, today, meId);
  const edit = can(user.role, "crm.edit");
  const here = hrefWith("/admin/accounts", sp, { ok: null, error: null });
  const close = hrefWith("/admin/accounts", sp, { view: null, new: null, ok: null, error: null });
  const filtered = Boolean(f.q || f.kind || f.stage || f.owner || f.line || f.tag);
  const viewing = one(sp.view) ? await getCompany(db, one(sp.view)) : null;
  const [people, latest] = viewing ? await Promise.all([contactsAt(db, viewing.id), companyActivityLog(db, viewing.id, 5)]) : [[], []];

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={`${all.length} ${all.length === 1 ? "company" : "companies"}: AI data partners, expert platforms, agencies, clients.`}
        actions={
          <>
            <Segments
              label="Layout"
              items={[
                { href: hrefWith("/admin/accounts", sp, { layout: null, view: null, ok: null, error: null }), label: <><Rows3 className="h-3.5 w-3.5" aria-hidden /> Table</>, active: layout === "table" },
                { href: hrefWith("/admin/accounts", sp, { layout: "board", view: null, ok: null, error: null }), label: <><LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Board</>, active: layout === "board" },
              ]}
            />
            {edit ? (
              <ButtonLink href={hrefWith("/admin/accounts", sp, { new: "1", view: null, ok: null, error: null })} variant="primary">
                <Plus className="h-4 w-4" aria-hidden /> New account
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="mb-6">
        <StatGrid>
          <Stat label="Pipeline" value={view.stats.pipeline} hint="Not on hold or dropped" href={hrefWith("/admin/accounts", sp, { tab: null, view: null })} />
          <Stat label="In talks" value={view.stats.inTalks} hint="Contacted and talking" />
          <Stat label="Due now" value={view.stats.dueNow} hint="Late or due today" href={hrefWith("/admin/accounts", sp, { tab: "due", view: null })} />
          <Stat label="Pilots & active" value={view.stats.won} />
        </StatGrid>
      </div>
      <Tabs tabs={COMPANY_TABS.map((t) => ({ href: hrefWith("/admin/accounts", sp, { tab: t === "pipeline" ? null : t, view: null, ok: null, error: null }), label: COMPANY_TAB_LABELS[t], active: f.tab === t, count: view.counts[t] }))} />

      <Section className="mb-6">
        <form method="get" className="space-y-3">
          {f.tab !== "pipeline" ? <input type="hidden" name="tab" value={f.tab} /> : null}
          {layout === "board" ? <input type="hidden" name="layout" value="board" /> : null}
          <div className="flex gap-2">
            <Input name="q" defaultValue={f.q} placeholder="Search accounts: name, next step, notes, route, tags" aria-label="Search accounts" className="flex-1" />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Select name="kind" defaultValue={f.kind} options={PARTNER_KINDS.map((k) => ({ value: k, label: label(k) }))} placeholder="Any type" aria-label="Type" />
            <Select name="stage" defaultValue={f.stage} options={COMPANY_STAGES.map((s) => ({ value: s, label: crmLabel(s) }))} placeholder="Any stage" aria-label="Stage" />
            <Select name="owner" defaultValue={f.owner} options={ownerOptions(all, team, meId).slice(1)} placeholder="Everyone" aria-label="Owner" />
            <Select name="line" defaultValue={f.line} options={[{ value: "ai_training", label: "AI Training" }, { value: "product", label: "Product Studio" }]} placeholder="Both lines" aria-label="Business line" />
            <Input name="tag" defaultValue={f.tag} placeholder="Tag" aria-label="Tag" />
            <div className="flex items-center gap-2">
              <Button type="submit" variant="secondary" className="flex-1">
                Apply
              </Button>
              {filtered ? (
                <Link href={hrefWith("/admin/accounts", {}, { tab: f.tab === "pipeline" ? null : f.tab, layout: layout === "board" ? "board" : null })} className="text-sm text-muted-foreground hover:text-foreground">
                  Clear
                </Link>
              ) : null}
            </div>
          </div>
        </form>
      </Section>

      <Section flush>
        {layout === "board" ? (
          all.length ? (
            <Board view={view} sp={sp} today={today} edit={edit} here={here} />
          ) : (
            <EmptyAccounts edit={edit} filtered={false} sp={sp} />
          )
        ) : view.rows.length ? (
          <Table sticky>
            <THead>
              <Th>Account</Th>
              <Th>Type</Th>
              <Th>Stage</Th>
              <Th>Owner</Th>
              <Th>Next step</Th>
              <Th>Due</Th>
              <Th className="hidden 2xl:table-cell">Route</Th>
            </THead>
            <TBody>
              {view.rows.map((c) => (
                <tr key={c.id} className="row-hover relative">
                  <Td className="py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <OrgLogo name={c.name} domain={c.domain} size={26} />
                      <div className="min-w-0">
                        <RowLink href={hrefWith("/admin/accounts", sp, { view: c.id, new: null, ok: null, error: null })} className="block max-w-52 truncate" title={c.name}>
                          {c.name}
                        </RowLink>
                        {c.tags.length ? <div className="max-w-56 truncate text-xs text-muted-foreground">{c.tags.join(", ")}</div> : null}
                      </div>
                      <PriorityDot priority={c.priority} />
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">{label(c.kind)}</Td>
                  <Td>
                    <StageBar stage={c.stage} />
                  </Td>
                  <Td className="whitespace-nowrap">{ownerLabel(c) ?? <span className="text-muted-foreground/70">–</span>}</Td>
                  <Td>
                    <span className="line-clamp-2 block min-w-52 max-w-80 text-small" title={c.nextStep ?? undefined}>
                      {c.nextStep ?? <span className="text-muted-foreground/70">–</span>}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <DueChip due={c.nextStepDue} today={today} stage={c.stage} />
                  </Td>
                  <Td className="hidden 2xl:table-cell">
                    <span className="block max-w-48 truncate text-small text-foreground/75" title={c.bestRoute ?? undefined}>
                      {c.bestRoute ?? "–"}
                    </span>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyAccounts edit={edit} filtered={all.length > 0} sp={sp} />
        )}
      </Section>

      {one(sp.new) && edit ? (
        <SlideOver title="New account" closeHref={close}>
          <form action={createAccount} className="space-y-5">
            <input type="hidden" name="returnTo" value={close} />
            <p className="text-small text-muted-foreground">One account per company. Add the people at it, the next step and notes on the account page.</p>
            <NewAccountFields team={team} meId={meId} />
            <div className="flex gap-2">
              <SubmitButton pendingText="Adding...">Add account</SubmitButton>
              <ButtonLink href={close}>
                Cancel
              </ButtonLink>
            </div>
          </form>
        </SlideOver>
      ) : null}

      {viewing ? (
        <SlideOver
          title="Account"
          closeHref={close}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href={`/admin/accounts/${viewing.id}`} variant="primary" size="sm">
                Open full account →
              </ButtonLink>
              {edit ? (
                <form action={setAccountStage} className="ml-auto flex items-center gap-2">
                  <input type="hidden" name="id" value={viewing.id} />
                  <input type="hidden" name="returnTo" value={here} />
                  <label className="text-small text-muted-foreground" htmlFor="panel-stage">
                    Stage
                  </label>
                  <AutoSubmitSelect id="panel-stage" name="stage" defaultValue={viewing.stage} className="control h-8 w-auto text-small">
                    {stageOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </AutoSubmitSelect>
                </form>
              ) : null}
            </div>
          }
        >
          <AccountPanel c={viewing} people={people.map((p) => visibleContact(user.role, p))} latest={latest} today={today} />
        </SlideOver>
      ) : null}
    </>
  );
}

function NoAccessPage({ role }: { role: string }) {
  return (
    <>
      <PageHeader title="Accounts" />
      <Section>
        <NoAccess what="Accounts" role={role} />
      </Section>
    </>
  );
}

function EmptyAccounts({ edit, filtered, sp }: { edit: boolean; filtered: boolean; sp: SearchParams }) {
  return filtered ? (
    <EmptyState size="page" title="No accounts in this view." description="Try another tab, fewer filters or a shorter search." action={<ButtonLink href="/admin/accounts?tab=all">Show all accounts</ButtonLink>} />
  ) : (
    <EmptyState
      size="page"
      title="No accounts yet."
      description={edit ? "Use “New account” to add the first company." : "An admin or recruiter adds accounts."}
      action={edit ? <ButtonLink href={hrefWith("/admin/accounts", sp, { new: "1" })} variant="primary">New account</ButtonLink> : undefined}
    />
  );
}

function AccountPanel({ c, people, latest, today }: { c: CompanyRow; people: Awaited<ReturnType<typeof contactsAt>>; latest: Awaited<ReturnType<typeof companyActivityLog>>; today: string }) {
  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <OrgLogo name={c.name} domain={c.domain} size={40} />
        <div className="min-w-0">
          <p className="truncate text-lg text-foreground">
            {c.name}
            <PriorityDot priority={c.priority} />
          </p>
          <p className="text-small text-muted-foreground">
            {label(c.kind)} · {crmLabel(c.businessLine)}
          </p>
        </div>
      </div>
      <StageBar stage={c.stage} />
      <Facts
        items={[
          { label: "Owner", value: ownerLabel(c) },
          { label: "Next step due", value: c.nextStepDue ? <DueChip due={c.nextStepDue} today={today} stage={c.stage} /> : null },
          { label: "Best route", value: c.bestRoute },
          {
            label: "Website",
            value: c.website ? (
              <a href={c.website} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                {c.domain ?? c.website}
              </a>
            ) : null,
          },
          { label: "Location", value: c.location },
          { label: "Platform", value: c.platformName ? <Link href={`/admin/platforms/${c.platformId}`} className="text-primary hover:underline">{c.platformName}</Link> : null },
        ]}
      />
      {c.nextStep ? (
        <div>
          <p className="eyebrow mb-1.5 text-muted-foreground">Next step</p>
          <p className="text-sm whitespace-pre-line text-foreground">{c.nextStep}</p>
        </div>
      ) : null}
      <div>
        <p className="eyebrow mb-2 text-muted-foreground">People ({people.length})</p>
        {people.length ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {people.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/leads?view=${p.id}`} className="row-hover flex items-center gap-3 px-3 py-2.5">
                  <Initials name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[p.role, p.email].filter(Boolean).join(" · ") || "–"}</span>
                  </span>
                  <ContactStageChip stage={p.stage} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No people at this account yet." padded={false} />
        )}
      </div>
      <div>
        <p className="eyebrow mb-2 text-muted-foreground">Latest activity</p>
        {latest.length ? (
          <>
            <ActivityTimeline items={latest} today={today} compact />
            <Link href={`/admin/accounts/${c.id}?tab=activity`} className="mt-3 inline-block text-small text-primary hover:underline">
              See the full timeline
            </Link>
          </>
        ) : (
          <EmptyState title="Nothing logged yet." description="Log emails, calls and replies on the account page." padded={false} />
        )}
      </div>
    </div>
  );
}

function Board({ view, sp, today, edit, here }: { view: ReturnType<typeof companyView>; sp: SearchParams; today: string; edit: boolean; here: string }) {
  return (
    <div className="max-h-[calc(100vh-15rem)] overflow-auto">
      <div className="flex min-w-max items-start gap-3 p-4">
        {view.lanes.map(({ lane, rows, due }) => (
          <section key={lane.key} className="flex w-72 shrink-0 flex-col rounded-md border border-border bg-muted" aria-label={lane.label}>
            <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-md bg-muted px-3 py-2.5">
              <span className="text-small font-medium text-foreground">{lane.label}</span>
              <span className="flex items-center gap-2 text-xs">
                {due ? <span className="font-medium text-danger">{due} due</span> : null}
                <span className="tabular text-muted-foreground">{rows.length}</span>
              </span>
            </header>
            <ul className="flex flex-col gap-2 px-2 pb-2">
              {rows.length ? (
                rows.map((c) => (
                  <li key={c.id} className="rounded-md border border-border bg-card p-3">
                    <Link href={hrefWith("/admin/accounts", sp, { view: c.id, ok: null, error: null })} scroll={false} className="group block space-y-1.5">
                      <span className="flex items-center gap-2">
                        <OrgLogo name={c.name} domain={c.domain} size={22} />
                        <span className="min-w-0 truncate text-sm font-medium text-foreground group-hover:text-primary">{c.name}</span>
                        <PriorityDot priority={c.priority} />
                      </span>
                      {lane.stages.length > 1 ? <span className="eyebrow block text-muted-foreground">{crmLabel(c.stage)}</span> : null}
                      {c.nextStep ? <span className="line-clamp-3 block text-small text-foreground/80">{c.nextStep}</span> : null}
                      <span className="block">
                        <DueChip due={c.nextStepDue} today={today} stage={c.stage} empty="No date" />
                      </span>
                    </Link>
                    {edit ? (
                      <form action={setAccountStage} className="mt-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="returnTo" value={here} />
                        <AutoSubmitSelect name="stage" defaultValue={c.stage} aria-label={`Stage of ${c.name}`} className="control h-7 w-full text-xs">
                          {stageOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </AutoSubmitSelect>
                      </form>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="px-1 py-2">
                  <EmptyState title="Nothing here" padded={false} />
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
