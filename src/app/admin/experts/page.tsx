import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Download, KanbanSquare, LayoutGrid, Plus, Rows3, SlidersHorizontal, Upload, Users } from "lucide-react";
import { getDb } from "@/db/client";
import { can, canManageView, canSeeContact, visibleExpert } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { AVAILABILITY, CV_CONSENT, DOMAINS, EXPERT_STATUSES, OUTREACH_STATUSES, PIPELINE_STAGES, SOURCE_CHANNELS, SOURCES, label } from "@/lib/constants";
import { todayIST } from "@/lib/crm/dates";
import { expertFiltersToParams, hasExpertFilters, hrefWith, one, parseExpertFilters, type SearchParams } from "@/lib/filters";
import { ago, fmtDate } from "@/lib/format";
import { OUTREACH_LABELS, SOURCE_CHANNEL_LABELS, stageLabel } from "@/lib/talent";
import { distinctValues, expertBoard, expertConditions, getExpert, listExperts, type ExpertRow } from "@/lib/server/experts";
import { mergedTimeline } from "@/lib/server/expert-records";
import { jobOptions, ownerOptions, pipelineBoard, pipelinesOf, projectOptions, talentStats, trackOptions, type BoardColumn as PipelineColumn } from "@/lib/server/pipelines";
import { listGroups } from "@/lib/server/referrals";
import { listRequirements } from "@/lib/server/requirements";
import { getView, listViews, type ViewRow } from "@/lib/server/views";
import { EXPERT_COLUMNS, PAGE_SIZES, configFromParams, hasViewParams, paramsFromConfig, parsePageSize, sameConfig, viewHref, EMPTY_CONFIG, type ColumnId } from "@/lib/views";
import { and } from "drizzle-orm";
import { BoardCard, BoardCardFooter, BoardColumn, BoardEmpty, BoardMore, BoardScroller } from "@/components/crm/board";
import { DueChip } from "@/components/crm/chips";
import { ViewSwitch } from "@/components/crm/segments";
import { Avatar, Person } from "@/components/ui/avatar";
import { Chips, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { AutoSubmitSelect, SelectAll, SubmitButton } from "@/components/ui/client";
import { cn } from "@/components/ui/cn";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Checkbox, Input, Select } from "@/components/ui/field";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { PanelSection, SlideOver } from "@/components/ui/slide-over";
import { SortTh, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { CountPill, PillNav } from "@/components/ui/tabs";
import { FilterSelect, ResultCount, SearchField, Toolbar, ToolbarDivider } from "@/components/ui/toolbar";
import { ColumnPicker } from "@/components/column-picker";
import { ExpertSummary } from "@/components/expert-summary";
import { PeopleTabs, SectionBlocked, StageBar } from "@/components/talent/bits";
import { ChoiceFields, PendingButton, StageForm } from "@/components/talent/client";
import { addSelectedToRequirement, deleteExpertView, saveExpertView, setExpertStatus, updateExpertView } from "./actions";
import { bulkExperts, movePipelineStage } from "./talent-actions";

export const metadata = { title: "Experts" };
const BOARD_PER_COLUMN = 20;
const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: label(v) }));
const DUE_OPTIONS = [
  { value: "overdue", label: "Next action overdue" },
  { value: "today", label: "Due today or earlier" },
  { value: "week", label: "Due in the next 7 days" },
];
/** Bulk-bar controls: one height, sized to their words. */
const bulkControl = "h-9 w-auto text-[13px]";

export default async function ExpertsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "profiles")) return <SectionBlocked title="Experts" section="profiles" />;
  const db = await getDb();

  // Saved view: ?v=<id>. A bare ?v=<id> link opens with that view's filters, sort, columns and layout.
  const views = await listViews(db, user);
  const vId = one(sp.v);
  const active: ViewRow | null = vId ? (views.find((v) => v.id === vId) ?? (await getView(db, user, vId))) : null;
  if (active && !hasViewParams(sp)) redirect(viewHref(active.id, active.config, { size: one(sp.size) }));

  const config = configFromParams(sp);
  const f = parseExpertFilters(sp);
  const pageSize = parsePageSize(one(sp.size));
  const layout = config.layout;
  const columns = config.columns;
  const contact = canSeeContact(user.role);
  const canShortlist = can(user.role, "matching.shortlist");
  const canEdit = can(user.role, "experts.edit");
  const canPipe = can(user.role, "applications.manage");
  const canBulk = canEdit || canShortlist || canPipe;
  const meEmail = user.email;
  const today = todayIST();

  const [{ rows, total }, values, reqs, board, stats, owners, jobList, projectList, trackList, groups] = await Promise.all([
    layout === "table" ? listExperts(db, f, { limit: pageSize, offset: (f.page - 1) * pageSize, contact, meEmail }) : listExperts(db, f, { limit: 1, offset: 0, contact, meEmail }),
    distinctValues(db),
    canShortlist ? listRequirements(db, { status: "active" }) : Promise.resolve([]),
    layout === "board" ? expertBoard(db, f, { perColumn: BOARD_PER_COLUMN, contact, meEmail }) : Promise.resolve(null),
    talentStats(db),
    ownerOptions(db),
    jobOptions(db),
    projectOptions(db),
    trackOptions(db, f.project || null),
    canEdit ? listGroups(db, { status: "active" }) : Promise.resolve([]),
  ]);
  const pipeBoard =
    layout === "pipelines"
      ? await pipelineBoard(db, { expertWhere: and(...expertConditions({ ...f, job: "", project: "", track: "", stage: "" }, { contact, meEmail })), jobId: f.job, projectId: f.project, trackId: f.track }, { perColumn: BOARD_PER_COLUMN })
      : null;
  const shown = rows.map((e) => visibleExpert(user.role, e));
  const viewId = one(sp.view);
  const viewingRaw = viewId ? await getExpert(db, viewId) : null;
  const viewing = viewingRaw ? visibleExpert(user.role, viewingRaw) : null;
  const [viewingPipes, viewingTimeline] = viewing ? await Promise.all([pipelinesOf(db, viewing.id), mergedTimeline(db, viewing.id, 5)]) : [[], []];
  const exportParams = expertFiltersToParams({ ...f, page: 1 });
  exportParams.delete("page");
  const filtered = hasExpertFilters(f);
  // The filters behind "More filters" (the four most used sit in the toolbar itself).
  const moreCount = [f.skills.length, f.country, f.consent, f.source, f.tag, f.minYears != null, f.channel, f.outreach, f.due, f.job, f.project, f.track, f.stage].filter(Boolean).length;
  const here = hrefWith("/admin/experts", sp, { ok: null, error: null, view: null });
  const sortHref = (s: string, d: "asc" | "desc") => hrefWith("/admin/experts", sp, { sort: s, dir: d, page: null, view: null, ok: null, error: null });
  const currentParams = paramsFromConfig(config).toString();
  const dirty = active ? !sameConfig(active.config, config) : false;
  const manageable = active ? canManageView(user, active) : false;
  const keep = { size: one(sp.size) };
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));
  const layoutHref = (l: string | null) => hrefWith("/admin/experts", sp, { layout: l, page: null, view: null, ok: null, error: null });
  const clearHref = active ? viewHref(active.id, { ...config, filters: {} }, keep) : layout === "table" ? "/admin/experts" : `/admin/experts?layout=${layout}`;
  const ownerOf = (e: { ownerTeamMemberId: string | null; ownerName: string | null }) => (e.ownerTeamMemberId && ownerName.get(e.ownerTeamMemberId)) || e.ownerName;

  return (
    <>
      <PageHeader
        title="Experts"
        subtitle={`${total} ${filtered ? "matching" : "in the hub"}`}
        actions={
          <>
            {can(user.role, "experts.export") ? (
              <ButtonLink href={`/api/experts/export?${exportParams.toString()}`} variant="secondary">
                <Download className="h-4 w-4" /> Export CSV
              </ButtonLink>
            ) : null}
            {can(user.role, "imports.csv") ? (
              <ButtonLink href="/admin/import" variant="secondary" title="Import people from a spreadsheet">
                <Upload className="h-4 w-4" /> Import
              </ButtonLink>
            ) : null}
            {can(user.role, "experts.create") ? (
              <ButtonLink href="/admin/experts/new" variant="primary">
                <Plus className="h-4 w-4" /> New expert
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <PeopleTabs value="profiles" counts={{ profiles: stats.experts }} />

      <div className="mb-8">
        <StatGrid>
          <Stat label="Experts" value={stats.experts} href="/admin/experts" />
          <Stat label="New to review" value={stats.applicants} hint="Status: applicant" href="/admin/experts?status=applicant" />
          <Stat label="Onboarding" value={stats.onboarding} hint="Pipelines at Selected to Signed" href="/admin/experts?layout=pipelines" />
          <Stat label="Active" value={stats.active} hint="Pipelines at Active" href="/admin/experts?stage=active" />
        </StatGrid>
      </div>

      <Section flush allowOverflow>
        {/* Saved views, Notion / Zoho style: the built-in list, then mine, then the team's shared ones. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3 sm:px-6">
          <span className="text-[13px] font-medium text-muted-foreground">Views</span>
          <PillNav
            label="Saved views"
            className="flex-1"
            items={[
              { href: viewHref(null, EMPTY_CONFIG, keep), label: "All experts", active: !active },
              ...views.map((v) => ({
                href: viewHref(v.id, v.config, keep),
                active: active?.id === v.id,
                title: v.shared ? (v.ownerEmail === user.email ? "Shared with the team" : `Shared by ${v.ownerEmail}`) : v.ownerEmail === user.email ? "Only you see this view" : undefined,
                label: (
                  <>
                    {v.name}
                    {v.shared ? <Users aria-label="Shared" /> : null}
                  </>
                ),
              })),
            ]}
          />
          <div className="flex items-center gap-2">
            {active && dirty ? <span className="text-[13px] text-muted-foreground">Unsaved changes</span> : null}
            {active && dirty && manageable ? (
              <form action={updateExpertView}>
                <input type="hidden" name="id" value={active.id} />
                <input type="hidden" name="params" value={currentParams} />
                <SubmitButton size="sm" variant="secondary" pendingText="Saving...">
                  Update view
                </SubmitButton>
              </form>
            ) : null}
            <details className="relative">
              <summary className={cn(buttonClass("ghost", "sm"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Save view
              </summary>
              <form action={saveExpertView} className="absolute right-0 z-40 mt-2 w-80 space-y-3 rounded-xl border border-border bg-popover p-4 shadow-raised">
                <input type="hidden" name="params" value={currentParams} />
                <p className="text-[13px] text-muted-foreground">Saves the current filters, sort, columns and layout.</p>
                <Input name="name" placeholder="View name, e.g. US maths bench" maxLength={60} required aria-label="View name" />
                {can(user.role, "views.share") ? <Checkbox name="shared" value="yes" label="Share with the team" /> : <p className="text-[13px] text-muted-foreground">Personal view (your role can&apos;t share views).</p>}
                <SubmitButton size="sm" pendingText="Saving...">
                  Save view
                </SubmitButton>
              </form>
            </details>
            {active && manageable ? (
              <form action={deleteExpertView}>
                <input type="hidden" name="id" value={active.id} />
                <SubmitButton size="sm" variant="ghost" confirm={`Delete the view "${active.name}"? The experts stay as they are.`} className="text-muted-foreground">
                  Delete view
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>

        <Toolbar
          hidden={{ v: active?.id, cols: sp.cols !== undefined ? one(sp.cols) : null, layout: layout !== "table" ? layout : null, size: one(sp.size), sort: one(sp.sort) ? f.sort : null, dir: one(sp.dir) ? f.dir : null }}
          clearHref={filtered ? clearHref : null}
          end={
            <>
              <ResultCount n={total} noun="expert" />
              {layout === "table" ? <ColumnPicker selected={columns} /> : null}
              <ViewSwitch
                label="Layout"
                items={[
                  { href: layoutHref(null), label: <><Rows3 aria-hidden /> Table</>, active: layout === "table" },
                  { href: layoutHref("board"), label: <><LayoutGrid aria-hidden /> Board</>, active: layout === "board" },
                  { href: layoutHref("pipelines"), label: <><KanbanSquare aria-hidden /> Pipelines</>, active: layout === "pipelines" },
                ]}
              />
            </>
          }
        >
          <SearchField defaultValue={f.q} placeholder={contact ? "Search name, skills, headline, email" : "Search name, skills, headline"} label="Search" />
          <FilterSelect name="status" defaultValue={f.status} options={opts(EXPERT_STATUSES)} placeholder="Any status" label="Status" />
          <FilterSelect name="domain" defaultValue={f.domain} options={[...new Set([...DOMAINS, ...values.domains])]} placeholder="Any domain" label="Domain" />
          <FilterSelect name="availability" defaultValue={f.availability} options={opts(AVAILABILITY)} placeholder="Any availability" label="Availability" />
          <FilterSelect name="owner" defaultValue={f.owner} options={[{ value: "me", label: "Mine" }, ...owners.map((o) => ({ value: o.id, label: o.name })), { value: "none", label: "No owner" }]} placeholder="Any owner" label="Owner" />
          <details className="group relative">
            <summary className={cn(buttonClass("secondary", "md"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden", moreCount > 0 && "border-foreground/30")}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden /> More filters
              {moreCount ? <CountPill value={moreCount} active /> : null}
            </summary>
            <div className="z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-popover p-5 shadow-raised max-sm:fixed max-sm:inset-x-4 sm:absolute sm:right-0 sm:w-[min(48rem,calc(100vw-4rem))]">
              <p className="mb-3 text-sm font-medium text-foreground">More filters</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input name="skills" defaultValue={f.skills.join(", ")} placeholder="Skills (all of)" aria-label="Skills" />
                <Select name="country" defaultValue={f.country} options={values.countries} placeholder="Any country" aria-label="Country" />
                <Select name="consent" defaultValue={f.consent} options={opts(CV_CONSENT)} placeholder="Any CV consent" aria-label="CV consent" />
                <Select name="source" defaultValue={f.source} options={opts(SOURCES)} placeholder="Any source" aria-label="Source" />
                <Input name="minYears" type="number" min={0} max={60} defaultValue={f.minYears ?? ""} placeholder="Min years" aria-label="Minimum years" />
                <Input name="tag" defaultValue={f.tag} placeholder="Tag" aria-label="Tag" />
                <Select name="channel" defaultValue={f.channel} options={SOURCE_CHANNELS.map((c) => ({ value: c, label: SOURCE_CHANNEL_LABELS[c] }))} placeholder="Came from anywhere" aria-label="Came from" />
                <Select name="outreach" defaultValue={f.outreach} options={OUTREACH_STATUSES.map((o) => ({ value: o, label: OUTREACH_LABELS[o] }))} placeholder="Any outreach" aria-label="Outreach" />
                <Select name="due" defaultValue={f.due} options={DUE_OPTIONS} placeholder="Any next action" aria-label="Next action" />
                <Select name="job" defaultValue={f.job} options={jobList.map((j) => ({ value: j.id, label: `${j.projectCode ? `${j.projectCode} · ` : ""}${j.title}${j.status === "open" ? "" : ` (${label(j.status)})`}` }))} placeholder="Every job" aria-label="Job" />
                <Select name="project" defaultValue={f.project} options={projectList.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} placeholder="Every project" aria-label="Project" />
                <Select name="track" defaultValue={f.track} options={trackList.map((t) => ({ value: t.id, label: `${t.projectCode} · ${t.name}` }))} placeholder="Every track" aria-label="Track" />
                <Select name="stage" defaultValue={f.stage} options={PIPELINE_STAGES.map((s) => ({ value: s, label: stageLabel(s) }))} placeholder="Any pipeline stage" aria-label="Pipeline stage" />
              </div>
              <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                <Button type="submit">Apply filters</Button>
                {filtered ? (
                  <Link href={clearHref} className="text-[13px] text-muted-foreground hover:text-foreground">
                    Clear filters
                  </Link>
                ) : null}
              </div>
            </div>
          </details>
        </Toolbar>

        {/* The bulk form has no children: its controls point at it with form="bulk", so the board's own forms never nest. */}
        <form id="bulk" action={bulkExperts}>
          <input type="hidden" name="returnTo" value={here} />
        </form>
        {layout === "table" && canBulk && shown.length ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-canvas px-4 py-2.5 sm:px-6">
            <span className="mr-1 text-[13px] text-muted-foreground">With the ticked:</span>
            <ChoiceFields
              form="bulk"
              name="op"
              placeholder="Choose an action"
              className={bulkControl}
              options={[
                ...(canEdit ? [{ value: "owner", label: "Assign an owner" }, { value: "outreach", label: "Set outreach" }, { value: "add_tags", label: "Add tags" }, { value: "remove_tags", label: "Remove tags" }] : []),
                ...(canPipe ? [{ value: "add_job", label: "Add to a job" }] : []),
                ...(canEdit && can(user.role, "groups.manage") ? [{ value: "add_group", label: "Add to a group" }] : []),
                ...(can(user.role, "campaigns.manage") && canOpenSection(user, "referrals") ? [{ value: "email", label: "Email them (campaign)" }] : []),
                ...(can(user.role, "referrals.manage") && canOpenSection(user, "send-referrals") ? [{ value: "refer", label: "Refer them" }] : []),
                ...(canEdit ? [{ value: "dnc", label: "Mark do not contact" }] : []),
              ]}
              fields={{
                owner: <Select form="bulk" name="ownerTeamMemberId" defaultValue="" options={owners.filter((o) => o.active).map((o) => ({ value: o.id, label: o.name }))} placeholder="No owner" className={bulkControl} aria-label="Owner" />,
                outreach: <Select form="bulk" name="outreachStatus" defaultValue="" options={OUTREACH_STATUSES.map((o) => ({ value: o, label: OUTREACH_LABELS[o] }))} placeholder="Pick outreach" className={bulkControl} aria-label="Outreach" />,
                add_tags: <Input form="bulk" name="tags" placeholder="us-sourcing, shortlist" className="h-9 w-48 text-[13px]" aria-label="Tags" />,
                remove_tags: <Input form="bulk" name="tags" placeholder="us-sourcing" className="h-9 w-48 text-[13px]" aria-label="Tags" />,
                add_job: (
                  <>
                    <Select form="bulk" name="jobId" defaultValue="" options={jobList.filter((j) => j.status === "open" || j.status === "paused" || j.status === "draft").map((j) => ({ value: j.id, label: j.title }))} placeholder="Pick a job" className={cn(bulkControl, "max-w-xs")} aria-label="Job" />
                    <Select form="bulk" name="startStage" defaultValue="new" options={[{ value: "new", label: "Start at Applied" }, { value: "shortlisted", label: "Start at Shortlisted" }]} className={bulkControl} aria-label="Starting stage" />
                  </>
                ),
                add_group: <Select form="bulk" name="groupId" defaultValue="" options={groups.map((g) => ({ value: g.id, label: g.name }))} placeholder="Pick a group" className={bulkControl} aria-label="Group" />,
                dnc: <Input form="bulk" name="dncReason" placeholder="Reason, e.g. asked to stop by email" className="h-9 w-64 text-[13px]" aria-label="Reason" />,
              }}
            />
            <SubmitButton form="bulk" size="sm" variant="secondary" pendingText="Applying...">
              Apply
            </SubmitButton>
            {canShortlist ? (
              <>
                <ToolbarDivider />
                <Select
                  form="bulk"
                  name="requirementId"
                  defaultValue=""
                  options={reqs.map((r) => ({ value: r.req.id, label: `${r.req.title} · ${r.partnerName}` }))}
                  placeholder={reqs.length ? "Add to requirement..." : "No open requirements"}
                  className={cn(bulkControl, "max-w-full sm:max-w-xs")}
                  aria-label="Requirement"
                />
                <PendingButton form="bulk" formAction={addSelectedToRequirement} pendingText="Adding...">
                  Add to requirement
                </PendingButton>
              </>
            ) : null}
          </div>
        ) : null}

        {layout === "pipelines" && pipeBoard ? (
          <PipelineBoard columns={pipeBoard} sp={sp} canPipe={canPipe} here={here} today={today} />
        ) : layout === "board" && board ? (
          <Board columns={board} sp={sp} canEdit={canEdit} role={user.role} here={here} />
        ) : shown.length === 0 ? (
          <EmptyState
            size="page"
            title={filtered ? "No experts in this view" : "No experts yet"}
            description={filtered ? "Try fewer filters or a shorter search." : "Everyone who applies to a job or sends the talent form appears here, once per email."}
            action={
              filtered ? (
                <ButtonLink href="/admin/experts">Clear filters</ButtonLink>
              ) : can(user.role, "imports.csv") ? (
                <ButtonLink href="/admin/import" variant="primary">
                  Import experts
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table sticky dense>
              <THead>
                {canBulk ? (
                  <Th className="w-10">
                    <SelectAll form="bulk" />
                  </Th>
                ) : null}
                <SortTh label="Name" sortKey="name" current={f.sort} dir={f.dir} hrefFor={sortHref} />
                {EXPERT_COLUMNS.filter((c) => columns.includes(c.id)).map((c) =>
                  "sort" in c ? (
                    <SortTh key={c.id} label={c.label} sortKey={c.sort} current={f.sort} dir={f.dir} hrefFor={sortHref} />
                  ) : (
                    <Th key={c.id} title={c.label}>
                      {"header" in c ? c.header : c.label}
                    </Th>
                  ),
                )}
              </THead>
              <TBody>
                {shown.map((e) => (
                  <Tr key={e.id}>
                    {canBulk ? (
                      <Td>
                        <input type="checkbox" form="bulk" name="ids" value={e.id} aria-label={`Select ${e.fullName}`} className="h-4 w-4 rounded-sm align-middle" />
                      </Td>
                    ) : null}
                    <Td>
                      <div className="flex w-52 items-center gap-3 2xl:w-72">
                        <Avatar name={e.fullName} size="md" />
                        <div className="min-w-0">
                          <Link href={hrefWith("/admin/experts", sp, { view: e.id, ok: null, error: null })} scroll={false} className="block truncate font-medium text-foreground hover:text-primary" title={e.fullName}>
                            {e.fullName}
                          </Link>
                          {e.headline ? (
                            <div className="truncate text-[13px] leading-5 text-muted-foreground" title={e.headline}>
                              {e.headline}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </Td>
                    {EXPERT_COLUMNS.filter((c) => columns.includes(c.id)).map((c) => (
                      <Td key={c.id} className="whitespace-nowrap">
                        <Cell id={c.id} e={e} owner={ownerOf(e)} today={today} />
                      </Td>
                    ))}
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={f.page}
              pageSize={pageSize}
              total={total}
              hrefFor={(p) => hrefWith("/admin/experts", sp, { page: p, view: null, ok: null, error: null })}
              sizes={PAGE_SIZES}
              sizeHref={(s) => hrefWith("/admin/experts", sp, { size: s === 50 ? null : s, page: null, view: null, ok: null, error: null })}
            />
          </>
        )}
      </Section>

      {viewing ? (
        <SlideOver
          title={viewing.fullName}
          media={<Avatar name={viewing.fullName} size="2xl" />}
          subtitle={viewing.headline ?? undefined}
          addon={<StatusBadge value={viewing.status} />}
          meta={
            <>
              <StatusBadge value={viewing.availability} />
              <StatusBadge value={viewing.cvConsent} prefix="CV consent:" />
              {viewing.domain ? <span className="text-[13px] text-muted-foreground">{viewing.domain}</span> : null}
            </>
          }
          closeHref={hrefWith("/admin/experts", sp, { view: null })}
          footer={
            <>
              <ButtonLink href={`/admin/experts/${viewing.id}?tab=timeline`} size="sm" variant="ghost">
                Timeline
              </ButtonLink>
              {canEdit ? (
                <ButtonLink href={`/admin/experts/${viewing.id}?tab=edit`} size="sm">
                  Edit
                </ButtonLink>
              ) : null}
              <ButtonLink href={`/admin/experts/${viewing.id}`} variant="primary">
                Open full profile <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            </>
          }
        >
          <div>
            <PanelSection title="Profile">
              <ExpertSummary e={viewing} compact contact={contact} hideHead />
            </PanelSection>
            <PanelSection title="Pipeline and outreach">
              <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <div>
                  <dt className="quiet-label">Owner</dt>
                  <dd className="mt-1 text-sm">
                    <Person name={ownerOf(viewing)} />
                  </dd>
                </div>
                <div>
                  <dt className="quiet-label">Came from</dt>
                  <dd className="mt-1 text-sm">{viewing.sourceChannel ? (SOURCE_CHANNEL_LABELS[viewing.sourceChannel] ?? viewing.sourceChannel) : label(viewing.primarySource)}</dd>
                </div>
                <div>
                  <dt className="quiet-label">Outreach</dt>
                  <dd className="mt-1 text-sm">{viewing.outreachStatus ? OUTREACH_LABELS[viewing.outreachStatus as keyof typeof OUTREACH_LABELS] : "–"}</dd>
                </div>
                <div>
                  <dt className="quiet-label">Next action</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    {viewing.nextAction || viewing.nextActionDue ? (
                      <>
                        {viewing.nextAction ? <span>{viewing.nextAction}</span> : null}
                        {viewing.nextActionDue ? <DueChip due={viewing.nextActionDue} today={today} /> : null}
                      </>
                    ) : (
                      "–"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="quiet-label">Last activity</dt>
                  <dd className="mt-1 text-sm">{ago(viewing.lastActivityAt ?? viewing.updatedAt)}</dd>
                </div>
              </dl>
            </PanelSection>
            <PanelSection title={`Jobs (${viewingPipes.length})`}>
              {viewingPipes.length ? (
                <ul className="space-y-3">
                  {viewingPipes.map((p) => (
                    <li key={p.id} className="space-y-3 rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{p.jobTitle}</span>
                        <span className="text-[13px] text-muted-foreground">
                          Since {fmtDate(p.stageChangedAt)}
                          {p.startedOn ? ` · contract ${fmtDate(p.startedOn)}${p.endedOn ? ` – ${fmtDate(p.endedOn)}` : ""}` : ""}
                        </span>
                      </div>
                      <StageBar stage={p.stage} />
                      {canPipe ? <StageForm action={movePipelineStage} id={p.id} stage={p.stage} rejectReason={p.rejectReason} returnTo={hrefWith("/admin/experts", sp, { ok: null, error: null })} compact /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState padded={false} title="No job applied for" description="Add them to a job from their profile." />
              )}
            </PanelSection>
            <PanelSection
              title="Latest activity"
              actions={
                <Link href={`/admin/experts/${viewing.id}?tab=timeline`} className="text-[13px] text-primary hover:underline">
                  See the full timeline
                </Link>
              }
            >
              {viewingTimeline.length ? (
                <ul className="divide-y divide-border">
                  {viewingTimeline.map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm first:pt-0">
                      <span className="min-w-0 truncate text-foreground/90">{t.summary}</span>
                      <span className="shrink-0 text-[13px] text-muted-foreground">{ago(t.at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState padded={false} title="Nothing yet" />
              )}
            </PanelSection>
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}

type ListRow = ExpertRow & { leadingStage?: string | null };

function Cell({ id, e, owner, today }: { id: ColumnId; e: ListRow; owner: string | null; today: string }) {
  switch (id) {
    case "domain":
      return <>{e.domain ?? "–"}</>;
    case "skills":
      return (
        <div className="w-[10.5rem] 2xl:w-60">
          <Chips items={e.skills} max={2} oneLine />
        </div>
      );
    case "country":
      return (
        <span className="block max-w-32 truncate" title={e.country ?? undefined}>
          {e.country ?? "–"}
        </span>
      );
    case "years":
      return <span className="tabular">{e.yearsExperience ?? "–"}</span>;
    case "status":
      return <StatusBadge value={e.status} />;
    case "availability":
      return <StatusBadge value={e.availability} />;
    case "consent":
      return <StatusBadge value={e.cvConsent} />;
    case "source":
      return <>{label(e.primarySource)}</>;
    case "email":
      return <span className="text-[13px]">{e.email ?? "–"}</span>;
    case "university":
      return (
        <span className="block max-w-48 truncate" title={e.university ?? undefined}>
          {e.university ?? "–"}
        </span>
      );
    case "degree":
      return <>{e.highestDegree ?? "–"}</>;
    case "hours":
      return <span className="tabular">{e.hoursPerWeek ?? "–"}</span>;
    case "updated":
      return <span className="text-[13px] text-muted-foreground">{ago(e.updatedAt)}</span>;
    case "added":
      return <span className="text-[13px] text-muted-foreground">{fmtDate(e.createdAt)}</span>;
    case "stage":
      return <StageBar stage={e.leadingStage} />;
    case "owner":
      return <Person name={owner} className="max-w-36" />;
    case "outreach":
      return <>{e.outreachStatus ? OUTREACH_LABELS[e.outreachStatus as keyof typeof OUTREACH_LABELS] : "–"}</>;
    case "next":
      return e.nextAction || e.nextActionDue ? (
        <span className="flex max-w-60 items-center gap-2" title={e.nextAction ?? undefined}>
          <span className="min-w-0 truncate">{e.nextAction ?? "Next action"}</span>
          {e.nextActionDue ? <DueChip due={e.nextActionDue} today={today} /> : null}
        </span>
      ) : (
        <>–</>
      );
    case "came":
      return <>{e.sourceChannel ? (SOURCE_CHANNEL_LABELS[e.sourceChannel] ?? e.sourceChannel) : "–"}</>;
    case "activity":
      return <span className="text-[13px] text-muted-foreground">{fmtDate(e.lastActivityAt ?? e.updatedAt)}</span>;
  }
}

/** Board layout: one column per status, cards with the essentials; a status select for roles that may edit. */
function Board({ columns, sp, canEdit, role, here }: { columns: Awaited<ReturnType<typeof expertBoard>>; sp: SearchParams; canEdit: boolean; role: Parameters<typeof visibleExpert>[0]; here: string }) {
  if (!columns.some((c) => c.total)) {
    return <EmptyState size="page" title="No experts in this view" description="Try fewer filters or a shorter search." action={<ButtonLink href={hrefWith("/admin/experts", {}, { layout: "board" })}>Clear filters</ButtonLink>} />;
  }
  return (
    <BoardScroller label="Experts by status">
      {columns.map((col) => (
        <BoardColumn key={col.status} label={label(col.status)} title={<StatusBadge value={col.status} />} count={col.total}>
          {col.rows.map((raw) => {
            const e = visibleExpert(role, raw);
            return (
              <BoardCard key={e.id} className="space-y-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={e.fullName} size="lg" />
                  <div className="min-w-0">
                    <Link href={hrefWith("/admin/experts", sp, { view: e.id, ok: null, error: null })} scroll={false} className="block truncate text-sm font-medium text-foreground hover:text-primary" title={e.fullName}>
                      {e.fullName}
                    </Link>
                    <p className="truncate text-[13px] text-muted-foreground" title={e.headline ?? undefined}>
                      {e.headline ?? ([e.domain, e.country].filter(Boolean).join(" · ") || "–")}
                    </p>
                  </div>
                </div>
                {e.headline ? <p className="truncate text-[13px] text-foreground/75">{[e.domain, e.country].filter(Boolean).join(" · ") || "–"}</p> : null}
                <Chips items={e.skills} max={2} oneLine />
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge value={e.availability} />
                  <StatusBadge value={e.cvConsent} prefix="CV" />
                </div>
                {canEdit ? (
                  <form action={setExpertStatus} className="border-t border-border pt-3">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="returnTo" value={here} />
                    <AutoSubmitSelect name="status" defaultValue={e.status} className="control h-8 text-[13px]" aria-label={`Status for ${e.fullName}`}>
                      {EXPERT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  </form>
                ) : null}
              </BoardCard>
            );
          })}
          {col.total > col.rows.length ? <BoardMore href={hrefWith("/admin/experts", sp, { status: col.status, layout: null, page: null, view: null })} n={col.total - col.rows.length} /> : null}
          {!col.total ? <BoardEmpty>Nobody</BoardEmpty> : null}
        </BoardColumn>
      ))}
    </BoardScroller>
  );
}

/** Pipelines layout: one column per stage (FynoLabs' stages), one card per person and job. */
function PipelineBoard({ columns, sp, canPipe, here, today }: { columns: PipelineColumn[]; sp: SearchParams; canPipe: boolean; here: string; today: string }) {
  if (!columns.some((c) => c.total)) {
    return <EmptyState size="page" title="No job pipelines in this view yet" description="Add an expert to a job from their page, or tick people in the table and use Add to a job." action={<ButtonLink href="/admin/experts?layout=pipelines">Clear filters</ButtonLink>} />;
  }
  return (
    <BoardScroller label="Job pipelines">
      {columns.map((col) => (
        <BoardColumn key={col.stage} label={col.label} title={<span className={col.stage === "rejected" ? "text-danger" : undefined}>{col.label}</span>} count={col.total}>
          {col.rows.map((c) => (
            <BoardCard key={c.id} className="space-y-2.5">
              <div className="min-w-0">
                <Link href={hrefWith("/admin/experts", sp, { view: c.expertId, ok: null, error: null })} scroll={false} className="block truncate text-sm font-medium text-foreground hover:text-primary" title={c.expertName}>
                  {c.expertName}
                </Link>
                <p className="truncate text-[13px] text-muted-foreground" title={c.jobTitle}>
                  {c.projectCode ? `${c.projectCode} · ` : ""}
                  {c.jobTitle}
                  {c.trackName ? ` · ${c.trackName}` : ""}
                </p>
              </div>
              <StageBar stage={c.stage} />
              {c.nextAction ? (
                <p className="line-clamp-2 text-[13px] text-foreground/85" title={c.nextAction}>
                  Next: {c.nextAction}
                </p>
              ) : null}
              <BoardCardFooter>
                <span className="flex min-w-0 items-center gap-1.5" title="In this stage since">
                  {c.ownerName ? <Avatar name={c.ownerName} size="xs" title={c.ownerName} /> : null}
                  <span className="truncate">Since {fmtDate(c.stageChangedAt)}</span>
                </span>
                {c.nextActionDue ? <DueChip due={c.nextActionDue} today={today} /> : null}
              </BoardCardFooter>
              {canPipe ? (
                <div className="border-t border-border pt-3">
                  <StageForm action={movePipelineStage} id={c.id} stage={c.stage} rejectReason={c.rejectReason} returnTo={here} compact />
                </div>
              ) : null}
            </BoardCard>
          ))}
          {col.total > col.rows.length ? <BoardMore href={hrefWith("/admin/experts", sp, { stage: col.stage, layout: null, page: null, view: null })} n={col.total - col.rows.length} /> : null}
          {!col.total ? <BoardEmpty /> : null}
        </BoardColumn>
      ))}
    </BoardScroller>
  );
}
