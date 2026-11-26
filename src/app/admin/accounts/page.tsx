import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, Download, LayoutGrid, Plus, Rows3 } from "@/components/icons";
import { getDb } from "@/db/client";
import { can, canManageView } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { PARTNER_KINDS, label } from "@/lib/constants";
import { todayIST } from "@/lib/crm/dates";
import { COMPANY_STAGES } from "@/lib/constants";
import { COMPANY_TABS, COMPANY_TAB_LABELS, crmLabel } from "@/lib/crm/labels";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { ago, fmtDate } from "@/lib/format";
import { ACCOUNT_LIST, columnsCookie, hasListViewParams, listConfigFromParams, listParamsFromConfig, listViewHref, pageOf, sameListConfig } from "@/lib/list-views";
import { PAGE_SIZES } from "@/lib/views";
import { allCompanies, companyActivityLog, companyView, getCompany, myTeamMemberId, ownerLabel, ownerOptions, parseCompanyFilters, teamOptions, type CompanyRow } from "@/lib/server/companies";
import { contactsAt, visibleContact } from "@/lib/server/contacts";
import { getListView, listListViews } from "@/lib/server/views";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { BoardCard, BoardCardFooter, BoardColumn, BoardEmpty, BoardScroller } from "@/components/crm/board";
import { ContactStageChip, DueChip, Facts, PriorityDot, StageBar, StageChip } from "@/components/crm/chips";
import { NewAccountFields, priorityOptions, stageOptions } from "@/components/crm/company-fields";
import { ListViewTabs } from "@/components/crm/list-view-tabs";
import { OrgLogo } from "@/components/crm/org-logo";
import { RowLink } from "@/components/crm/row-link";
import { ViewSwitch } from "@/components/crm/segments";
import { ColumnPicker } from "@/components/column-picker";
import { Avatar, Person } from "@/components/ui/avatar";
import { Chips } from "@/components/ui/badge";
import { BulkApply, BulkBar, BulkMenu } from "@/components/ui/bulk-bar";
import { ButtonLink } from "@/components/ui/button";
import { AutoSubmitSelect, SelectAll, SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { PageSummary, Pagination } from "@/components/ui/pagination";
import { PanelSection, SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { FilterSelect, ResultCount, SearchField, Toolbar } from "@/components/ui/toolbar";
import { deleteListView, saveListView, updateListView } from "../list-view-actions";
import { createAccount, setAccountStage } from "./actions";
import { bulkAccountsAction } from "./list-actions";

export const metadata = { title: "Accounts" };
const SPEC = ACCOUNT_LIST;
const BULK = "bulk-accounts";
const field = "h-9 w-full text-[13px]";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("accounts");
  if (!allowed) return <NoAccessPage role={user.role} />;
  const db = await getDb();
  const today = todayIST();

  // Saved view: ?v=<id>. A bare ?v=<id> link opens with that view's tab, filters, columns and layout.
  const views = await listListViews(db, user, "accounts");
  const vId = one(sp.v);
  const active = vId ? (views.find((v) => v.id === vId) ?? (await getListView(db, user, vId, "accounts"))) : null;
  if (active && !hasListViewParams(SPEC, sp)) redirect(listViewHref(SPEC, active.id, active.config, { size: one(sp.size) }));
  const config = listConfigFromParams(SPEC, sp, active ? null : (await cookies()).get(columnsCookie("accounts"))?.value);
  const columns = config.columns;

  const [all, team, meId] = await Promise.all([allCompanies(db), teamOptions(db), myTeamMemberId(db, user.email)]);
  const f = parseCompanyFilters(sp);
  const layout = config.layout;
  const view = companyView(all, f, today, meId);
  const paged = pageOf(view.rows, one(sp.page), one(sp.size));
  const edit = can(user.role, "crm.edit");
  const canDelete = can(user.role, "crm.delete");
  const here = hrefWith("/admin/accounts", sp, { ok: null, error: null });
  const close = hrefWith("/admin/accounts", sp, { view: null, new: null, ok: null, error: null });
  const filtered = Boolean(f.q || f.kind || f.stage || f.owner || f.line || f.tag);
  const viewing = one(sp.view) ? await getCompany(db, one(sp.view)) : null;
  const [people, latest] = viewing ? await Promise.all([contactsAt(db, viewing.id), companyActivityLog(db, viewing.id, 5)]) : [[], []];
  const keep = { size: one(sp.size) };
  const currentParams = listParamsFromConfig(SPEC, config).toString();
  const exportParams = new URLSearchParams(Object.entries(config.filters));

  const layoutHref = (l: "board" | null) => hrefWith("/admin/accounts", sp, { layout: l, view: null, page: null, ok: null, error: null });
  const shownCols = SPEC.columns.filter((c) => columns.includes(c.id));
  const ownerChoices = [
    ...team.filter((m) => m.active).map((m) => ({ value: `tm:${m.id}`, label: m.name || m.email.split("@")[0] })),
    ...ownerOptions(all, team, meId).filter((o) => o.value.startsWith("name:")),
    { value: "none", label: "No owner" },
  ];

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={`${all.length} ${all.length === 1 ? "company" : "companies"}: AI data partners, expert platforms, agencies, clients.`}
        actions={
          <>
            {edit ? (
              <ButtonLink href={`/api/admin/accounts/export?${exportParams.toString()}`} variant="secondary">
                <Download className="h-4 w-4" aria-hidden /> Export CSV
              </ButtonLink>
            ) : null}
            {edit ? (
              <ButtonLink href={hrefWith("/admin/accounts", sp, { new: "1", view: null, ok: null, error: null })} variant="primary">
                <Plus className="h-4 w-4" aria-hidden /> New account
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="mb-8">
        <StatGrid>
          <Stat label="Pipeline" value={view.stats.pipeline} hint="Not on hold or dropped" href={hrefWith("/admin/accounts", sp, { tab: null, v: null, page: null, view: null })} />
          <Stat label="In talks" value={view.stats.inTalks} hint="Contacted and talking" />
          <Stat label="Due now" value={view.stats.dueNow} hint="Overdue or due today" href={hrefWith("/admin/accounts", sp, { tab: "due", v: null, page: null, view: null })} />
          <Stat label="Pilots & active" value={view.stats.won} />
        </StatGrid>
      </div>
      <ListViewTabs
        builtIns={COMPANY_TABS.map((t) => ({ href: hrefWith("/admin/accounts", sp, { tab: t === "pipeline" ? null : t, v: null, page: null, view: null, ok: null, error: null }), label: COMPANY_TAB_LABELS[t], active: !active && f.tab === t, count: view.counts[t] }))}
        views={views.map((v) => ({ href: listViewHref(SPEC, v.id, v.config, keep), label: v.name, active: active?.id === v.id, shared: v.shared, title: v.shared ? (v.ownerEmail === user.email ? "Shared with the team" : `Shared by ${v.ownerEmail}`) : "Only you see this view" }))}
        hidden={{ collection: "accounts" }}
        currentParams={currentParams}
        active={active ? { id: active.id, name: active.name, dirty: !sameListConfig(SPEC, active.config, config), manageable: canManageView(user, active) } : null}
        canShare={can(user.role, "views.share")}
        placeholder="View name, e.g. My hot accounts"
        save={saveListView}
        update={updateListView}
        remove={deleteListView}
      />

      <Section flush allowOverflow>
        <Toolbar
          hidden={{ v: active?.id, tab: f.tab !== "pipeline" ? f.tab : null, layout: layout === "board" ? "board" : null, cols: sp.cols !== undefined ? one(sp.cols) : null, size: layout === "board" ? one(sp.size) : null }}
          clearHref={filtered ? hrefWith("/admin/accounts", {}, { v: active?.id ?? null, tab: f.tab === "pipeline" ? null : f.tab, layout: layout === "board" ? "board" : null, cols: sp.cols !== undefined ? one(sp.cols) : null }) : null}
          end={
            <>
              {layout === "table" ? <PageSummary total={paged.total} page={paged.page} pageSize={paged.size} sizes={PAGE_SIZES} /> : <ResultCount n={view.rows.length} noun="account" />}
              {layout === "table" ? <ColumnPicker selected={columns} columns={SPEC.columns} defaults={SPEC.defaultColumns} path={SPEC.path} cookie={columnsCookie("accounts")} fixed={SPEC.fixed} /> : null}
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

        {/* The bulk form has no children: the row checkboxes and the bar's controls point at it with form=. */}
        <form id={BULK} action={bulkAccountsAction}>
          <input type="hidden" name="returnTo" value={here} />
        </form>
        {layout === "table" && edit && paged.rows.length ? (
          <BulkBar form={BULK} noun="account" exportHref="/api/admin/accounts/export" deleteOp={canDelete ? "delete" : null}>
            <BulkMenu label="Change stage">
              <Select form={BULK} name="stage" defaultValue="" options={stageOptions} placeholder="Pick a stage" className={field} aria-label="Stage" />
              <BulkApply form={BULK} op="stage" />
            </BulkMenu>
            <BulkMenu label="Assign owner">
              <Select form={BULK} name="owner" defaultValue="" options={ownerChoices} placeholder="Pick an owner" className={field} aria-label="Owner" />
              <BulkApply form={BULK} op="owner" />
            </BulkMenu>
            <BulkMenu label="Priority">
              <Select form={BULK} name="priority" defaultValue="" options={priorityOptions} placeholder="Pick a priority" className={field} aria-label="Priority" />
              <BulkApply form={BULK} op="priority" />
            </BulkMenu>
            <BulkMenu label="Tags">
              <Input form={BULK} name="addTags" placeholder="Add tags, e.g. q1, warm" className={field} aria-label="Tags to add" />
              <BulkApply form={BULK} op="add_tags">
                Add tags
              </BulkApply>
              <div className="border-t border-border pt-3">
                <Input form={BULK} name="removeTags" placeholder="Remove tags" className={field} aria-label="Tags to remove" />
              </div>
              <BulkApply form={BULK} op="remove_tags">
                Remove tags
              </BulkApply>
            </BulkMenu>
          </BulkBar>
        ) : null}

        {layout === "board" ? (
          all.length ? (
            <Board view={view} sp={sp} today={today} edit={edit} here={here} />
          ) : (
            <EmptyAccounts edit={edit} filtered={false} sp={sp} />
          )
        ) : paged.rows.length ? (
          <>
            <Table sticky>
              <THead>
                {edit ? (
                  <Th className="w-10">
                    <SelectAll form={BULK} label="Select all on this page" />
                  </Th>
                ) : null}
                <Th>Account</Th>
                {shownCols.map((c) => (
                  <Th key={c.id}>{c.label}</Th>
                ))}
              </THead>
              <TBody>
                {paged.rows.map((c) => (
                  <tr key={c.id} className="row-hover relative">
                    {edit ? (
                      <Td>
                        <input type="checkbox" form={BULK} name="ids" value={c.id} aria-label={`Select ${c.name}`} className="relative z-10 h-4 w-4 rounded-sm align-middle" />
                      </Td>
                    ) : null}
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
                    {shownCols.map((col) => (
                      <AccountCell key={col.id} id={col.id} c={c} today={today} />
                    ))}
                  </tr>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={paged.page}
              pageSize={paged.size}
              total={paged.total}
              hrefFor={(p) => hrefWith("/admin/accounts", sp, { page: p, view: null, ok: null, error: null })}
              sizes={PAGE_SIZES}
              sizeHref={(s) => hrefWith("/admin/accounts", sp, { size: s === 50 ? null : s, page: null, view: null, ok: null, error: null })}
            />
          </>
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
              <SubmitButton pendingText="Adding…">Add account</SubmitButton>
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

function AccountCell({ id, c, today }: { id: string; c: CompanyRow; today: string }) {
  switch (id) {
    case "stage":
      return (
        <Td>
          <StageBar stage={c.stage} />
        </Td>
      );
    case "owner":
      return (
        <Td className="whitespace-nowrap">
          <Person name={ownerLabel(c)} className="max-w-40" />
        </Td>
      );
    case "next":
      return (
        <Td>
          <span className="line-clamp-2 block max-w-80 min-w-52" title={c.nextStep ?? undefined}>
            {c.nextStep ?? <span className="text-muted-foreground/70">–</span>}
          </span>
        </Td>
      );
    case "due":
      return (
        <Td className="whitespace-nowrap">
          <DueChip due={c.nextStepDue} today={today} stage={c.stage} />
        </Td>
      );
    case "route":
      return (
        <Td>
          <span className="block max-w-48 truncate text-[13px] text-foreground/75" title={c.bestRoute ?? undefined}>
            {c.bestRoute ?? "–"}
          </span>
        </Td>
      );
    case "kind":
      return <Td className="whitespace-nowrap">{label(c.kind)}</Td>;
    case "line":
      return <Td className="whitespace-nowrap">{crmLabel(c.businessLine)}</Td>;
    case "priority":
      return <Td className="whitespace-nowrap">{crmLabel(c.priority)}</Td>;
    case "tags":
      return <Td>{c.tags.length ? <div className="w-44"><Chips items={c.tags} max={2} oneLine /></div> : <span className="text-muted-foreground/70">–</span>}</Td>;
    case "people":
      return <Td className="tabular">{c.people}</Td>;
    case "location":
      return (
        <Td>
          <span className="block max-w-40 truncate" title={c.location ?? undefined}>
            {c.location ?? "–"}
          </span>
        </Td>
      );
    case "activity":
      return <Td className="whitespace-nowrap text-[13px] text-muted-foreground">{c.lastActivityAt ? ago(c.lastActivityAt) : "–"}</Td>;
    case "added":
      return <Td className="whitespace-nowrap text-[13px] text-muted-foreground">{fmtDate(c.createdAt)}</Td>;
    case "updated":
      return <Td className="whitespace-nowrap text-[13px] text-muted-foreground">{ago(c.updatedAt)}</Td>;
    default:
      return <Td>–</Td>;
  }
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
