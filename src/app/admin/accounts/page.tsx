import Link from "next/link";
import { ArrowRight, LayoutGrid, Plus, Rows3 } from "lucide-react";
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
import { BoardCard, BoardCardFooter, BoardColumn, BoardEmpty, BoardScroller } from "@/components/crm/board";
import { ContactStageChip, DueChip, Facts, PriorityDot, StageBar, StageChip } from "@/components/crm/chips";
import { NewAccountFields, stageOptions } from "@/components/crm/company-fields";
import { OrgLogo } from "@/components/crm/org-logo";
import { RowLink } from "@/components/crm/row-link";
import { ViewSwitch } from "@/components/crm/segments";
import { Avatar, Person } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { AutoSubmitSelect, SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { PanelSection, SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { FilterSelect, ResultCount, SearchField, Toolbar } from "@/components/ui/toolbar";
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

  const layoutHref = (l: "board" | null) => hrefWith("/admin/accounts", sp, { layout: l, view: null, ok: null, error: null });

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={`${all.length} ${all.length === 1 ? "company" : "companies"}: AI data partners, expert platforms, agencies, clients.`}
        actions={
          edit ? (
            <ButtonLink href={hrefWith("/admin/accounts", sp, { new: "1", view: null, ok: null, error: null })} variant="primary">
              <Plus className="h-4 w-4" aria-hidden /> New account
            </ButtonLink>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="mb-8">
        <StatGrid>
          <Stat label="Pipeline" value={view.stats.pipeline} hint="Not on hold or dropped" href={hrefWith("/admin/accounts", sp, { tab: null, view: null })} />
          <Stat label="In talks" value={view.stats.inTalks} hint="Contacted and talking" />
          <Stat label="Due now" value={view.stats.dueNow} hint="Overdue or due today" href={hrefWith("/admin/accounts", sp, { tab: "due", view: null })} />
          <Stat label="Pilots & active" value={view.stats.won} />
        </StatGrid>
      </div>
      <Tabs tabs={COMPANY_TABS.map((t) => ({ href: hrefWith("/admin/accounts", sp, { tab: t === "pipeline" ? null : t, view: null, ok: null, error: null }), label: COMPANY_TAB_LABELS[t], active: f.tab === t, count: view.counts[t] }))} />

      <Section flush>
        <Toolbar
          hidden={{ tab: f.tab !== "pipeline" ? f.tab : null, layout: layout === "board" ? "board" : null }}
          clearHref={filtered ? hrefWith("/admin/accounts", {}, { tab: f.tab === "pipeline" ? null : f.tab, layout: layout === "board" ? "board" : null }) : null}
          end={
            <>
              <ResultCount n={view.rows.length} noun="account" />
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
          <SearchField defaultValue={f.q} placeholder="Search name, next step, notes, tags" label="Search accounts" />
          <FilterSelect name="kind" defaultValue={f.kind} options={PARTNER_KINDS.map((k) => ({ value: k, label: label(k) }))} placeholder="Any type" label="Type" />
          <FilterSelect name="stage" defaultValue={f.stage} options={COMPANY_STAGES.map((s) => ({ value: s, label: crmLabel(s) }))} placeholder="Any stage" label="Stage" />
          <FilterSelect name="owner" defaultValue={f.owner} options={ownerOptions(all, team, meId).slice(1)} placeholder="Any owner" label="Owner" />
          <FilterSelect name="line" defaultValue={f.line} options={[{ value: "ai_training", label: "AI Training" }, { value: "product", label: "Product Studio" }]} placeholder="Both lines" label="Business line" />
          <Input name="tag" defaultValue={f.tag} placeholder="Tag" aria-label="Tag" className="w-28" />
        </Toolbar>
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
              <Th>Stage</Th>
              <Th>Owner</Th>
              <Th>Next step</Th>
              <Th>Due</Th>
              <Th className="hidden 2xl:table-cell">Route</Th>
            </THead>
            <TBody>
              {view.rows.map((c) => (
                <tr key={c.id} className="row-hover relative">
                  <Td>
                    <div className="flex min-w-0 items-center gap-3">
                      <OrgLogo name={c.name} domain={c.domain} size={32} />
                      <div className="min-w-0">
                        <span className="flex min-w-0 items-center">
                          <RowLink href={hrefWith("/admin/accounts", sp, { view: c.id, new: null, ok: null, error: null })} className="block max-w-60 truncate" title={c.name}>
                            {c.name}
                          </RowLink>
                          <PriorityDot priority={c.priority} />
                        </span>
                        <div className="max-w-60 truncate text-[13px] text-muted-foreground" title={c.tags.length ? c.tags.join(", ") : undefined}>
                          {label(c.kind)}
                          {c.tags.length ? ` · ${c.tags.join(", ")}` : ""}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <StageBar stage={c.stage} />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Person name={ownerLabel(c)} className="max-w-40" />
                  </Td>
                  <Td>
                    <span className="line-clamp-2 block max-w-80 min-w-52" title={c.nextStep ?? undefined}>
                      {c.nextStep ?? <span className="text-muted-foreground/70">–</span>}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <DueChip due={c.nextStepDue} today={today} stage={c.stage} />
                  </Td>
                  <Td className="hidden 2xl:table-cell">
                    <span className="block max-w-48 truncate text-[13px] text-foreground/75" title={c.bestRoute ?? undefined}>
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
        <SlideOver title="New account" subtitle="One account per company. Add the people at it, the next step and notes on the account page." closeHref={close}>
          <form action={createAccount} className="space-y-5">
            <input type="hidden" name="returnTo" value={close} />
            <NewAccountFields team={team} meId={meId} />
            <div className="flex gap-2">
              <SubmitButton pendingText="Adding...">Add account</SubmitButton>
              <ButtonLink href={close}>Cancel</ButtonLink>
            </div>
          </form>
        </SlideOver>
      ) : null}

      {viewing ? (
        <SlideOver
          title={viewing.name}
          media={<OrgLogo name={viewing.name} domain={viewing.domain} size={44} />}
          subtitle={`${label(viewing.kind)} · ${crmLabel(viewing.businessLine)}`}
          addon={
            <>
              <StageChip stage={viewing.stage} />
              <PriorityDot priority={viewing.priority} />
            </>
          }
          meta={
            <>
              <Person name={ownerLabel(viewing)} empty="No owner" />
              {viewing.nextStepDue ? <DueChip due={viewing.nextStepDue} today={today} stage={viewing.stage} /> : null}
            </>
          }
          closeHref={close}
          footer={
            <>
              {edit ? (
                <form action={setAccountStage} className="mr-auto flex items-center gap-2">
                  <input type="hidden" name="id" value={viewing.id} />
                  <input type="hidden" name="returnTo" value={here} />
                  <label className="text-[13px] text-muted-foreground" htmlFor="panel-stage">
                    Stage
                  </label>
                  <AutoSubmitSelect id="panel-stage" name="stage" defaultValue={viewing.stage} className="control h-9 w-auto">
                    {stageOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </AutoSubmitSelect>
                </form>
              ) : null}
              <ButtonLink href={`/admin/accounts/${viewing.id}`} variant="primary">
                Open full account <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            </>
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
    <div>
      <PanelSection title="Where it stands">
        <StageBar stage={c.stage} />
        <Facts
          items={[
            { label: "Owner", value: ownerLabel(c) ? <Person name={ownerLabel(c)} /> : null },
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
          <div className="rounded-lg border border-border bg-canvas px-4 py-3">
            <p className="quiet-label">Next step</p>
            <p className="mt-0.5 text-sm whitespace-pre-line text-foreground">{c.nextStep}</p>
          </div>
        ) : null}
      </PanelSection>
      <PanelSection title={`People (${people.length})`}>
        {people.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {people.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/leads?view=${p.id}`} className="row-hover flex items-center gap-3 px-4 py-3">
                  <Avatar name={p.name} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{[p.role, p.email].filter(Boolean).join(" · ") || "–"}</span>
                  </span>
                  <ContactStageChip stage={p.stage} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No people at this account yet." description="Add them from the account page." padded={false} />
        )}
      </PanelSection>
      <PanelSection
        title="Latest activity"
        actions={
          latest.length ? (
            <Link href={`/admin/accounts/${c.id}?tab=activity`} className="text-[13px] text-primary hover:underline">
              See the full timeline
            </Link>
          ) : undefined
        }
      >
        {latest.length ? <ActivityTimeline items={latest} today={today} compact /> : <EmptyState title="Nothing logged yet." description="Log emails, calls and replies on the account page." padded={false} />}
      </PanelSection>
    </div>
  );
}

function Board({ view, sp, today, edit, here }: { view: ReturnType<typeof companyView>; sp: SearchParams; today: string; edit: boolean; here: string }) {
  return (
    <BoardScroller label="Accounts board">
      {view.lanes.map(({ lane, rows, due }) => (
        <BoardColumn key={lane.key} label={lane.label} title={lane.label} count={rows.length} extra={due ? <span className="font-medium text-danger">{due} due</span> : null}>
          {rows.length ? (
            rows.map((c) => (
              <BoardCard key={c.id}>
                <Link href={hrefWith("/admin/accounts", sp, { view: c.id, ok: null, error: null })} scroll={false} className="group block space-y-2.5">
                  <span className="flex items-center gap-2.5">
                    <OrgLogo name={c.name} domain={c.domain} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{c.name}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">{label(c.kind)}</span>
                    </span>
                    <PriorityDot priority={c.priority} />
                  </span>
                  {lane.stages.length > 1 ? <StageChip stage={c.stage} /> : null}
                  {c.nextStep ? <span className="line-clamp-2 block text-[13px] leading-relaxed text-foreground/85">{c.nextStep}</span> : null}
                  <BoardCardFooter>
                    <Person name={ownerLabel(c)} size="xs" empty="No owner" className="max-w-36" />
                    <DueChip due={c.nextStepDue} today={today} stage={c.stage} empty="No date" />
                  </BoardCardFooter>
                </Link>
                {edit ? (
                  <form action={setAccountStage} className="mt-3 border-t border-border pt-3">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="returnTo" value={here} />
                    <AutoSubmitSelect name="stage" defaultValue={c.stage} aria-label={`Stage of ${c.name}`} className="control h-8 w-full text-[13px]">
                      {stageOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
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
      ))}
    </BoardScroller>
  );
}
