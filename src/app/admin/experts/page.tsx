import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, KanbanSquare, LayoutGrid, Plus, Rows3, Upload, Users } from "lucide-react";
import { getDb } from "@/db/client";
import { can, canManageView, canSeeContact, visibleExpert } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { AVAILABILITY, CV_CONSENT, DOMAINS, EXPERT_STATUSES, OUTREACH_STATUSES, PIPELINE_STAGES, SOURCE_CHANNELS, SOURCES, label } from "@/lib/constants";
import { expertFiltersToParams, hasExpertFilters, hrefWith, one, parseExpertFilters, type SearchParams } from "@/lib/filters";
import { ago, fmtDate } from "@/lib/format";
import { OUTREACH_LABELS, SOURCE_CHANNEL_LABELS, stageLabel } from "@/lib/talent";
import { distinctValues, expertBoard, expertConditions, getExpert, listExperts, type ExpertRow } from "@/lib/server/experts";
import { mergedTimeline } from "@/lib/server/expert-records";
import { jobOptions, ownerOptions, pipelineBoard, pipelinesOf, projectOptions, talentStats, trackOptions, type BoardColumn } from "@/lib/server/pipelines";
import { listGroups } from "@/lib/server/referrals";
import { listRequirements } from "@/lib/server/requirements";
import { getView, listViews, type ViewRow } from "@/lib/server/views";
import { EXPERT_COLUMNS, PAGE_SIZES, configFromParams, hasViewParams, paramsFromConfig, parsePageSize, sameConfig, viewHref, EMPTY_CONFIG, type ColumnId } from "@/lib/views";
import { and } from "drizzle-orm";
import { Chips, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { AutoSubmitSelect, SelectAll, SubmitButton } from "@/components/ui/client";
import { cn } from "@/components/ui/cn";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Checkbox, Input, Select } from "@/components/ui/field";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { SlideOver } from "@/components/ui/slide-over";
import { SortTh, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
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
  const activeFilters = [f.domain, f.skills.length, f.country, f.status, f.availability, f.consent, f.source, f.tag, f.minYears != null, f.owner, f.outreach, f.job, f.project, f.track, f.stage, f.due, f.channel].filter(Boolean).length;
  const moreFilters = activeFilters > 0;
  const here = hrefWith("/admin/experts", sp, { ok: null, error: null, view: null });
  const sortHref = (s: string, d: "asc" | "desc") => hrefWith("/admin/experts", sp, { sort: s, dir: d, page: null, view: null, ok: null, error: null });
  const currentParams = paramsFromConfig(config).toString();
  const dirty = active ? !sameConfig(active.config, config) : false;
  const manageable = active ? canManageView(user, active) : false;
  const keep = { size: one(sp.size) };
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));
  const layoutHref = (l: string | null) => hrefWith("/admin/experts", sp, { layout: l, page: null, view: null, ok: null, error: null });

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

      <div className="mb-10">
        <StatGrid>
          <Stat label="Experts" value={stats.experts} href="/admin/experts" />
          <Stat label="New to review" value={stats.applicants} hint="Status: applicant" href="/admin/experts?status=applicant" />
          <Stat label="Onboarding" value={stats.onboarding} hint="Pipelines at Selected to Signed" href="/admin/experts?layout=pipelines" />
          <Stat label="Active" value={stats.active} hint="Pipelines at Active" href="/admin/experts?stage=active" />
        </StatGrid>
      </div>

      {/* Saved views, Notion / Zoho style: the built-in list, then mine, then the team's shared ones. */}
      <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-border">
        <nav className="-mb-px flex min-w-0 flex-1 gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Saved views">
          <ViewTab href={viewHref(null, EMPTY_CONFIG, keep)} active={!active} label="All experts" />
          {views.map((v) => (
            <ViewTab key={v.id} href={viewHref(v.id, v.config, keep)} active={active?.id === v.id} label={v.name} shared={v.shared} mine={v.ownerEmail === user.email} owner={v.ownerEmail} />
          ))}
        </nav>
        <div className="flex items-center gap-2 pb-2">
          {active && dirty ? <span className="text-xs text-muted-foreground">Unsaved changes</span> : null}
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
            <form action={saveExpertView} className="absolute right-0 z-40 mt-1 w-72 space-y-3 rounded-md border border-border bg-popover p-4 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]">
              <input type="hidden" name="params" value={currentParams} />
              <p className="text-[13px] text-muted-foreground">Saves the current filters, sort, columns and layout.</p>
              <Input name="name" placeholder="View name, e.g. US maths bench" maxLength={60} required aria-label="View name" />
              {can(user.role, "views.share") ? <Checkbox name="shared" value="yes" label="Share with the team" /> : <p className="text-xs text-muted-foreground">Personal view (your role can&apos;t share views).</p>}
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

      <Section className="mb-6">
        <form method="get" className="space-y-4">
          {active ? <input type="hidden" name="v" value={active.id} /> : null}
          {sp.cols !== undefined ? <input type="hidden" name="cols" value={one(sp.cols)} /> : null}
          {layout !== "table" ? <input type="hidden" name="layout" value={layout} /> : null}
          {one(sp.size) ? <input type="hidden" name="size" value={one(sp.size)} /> : null}
          {one(sp.sort) ? <input type="hidden" name="sort" value={f.sort} /> : null}
          {one(sp.dir) ? <input type="hidden" name="dir" value={f.dir} /> : null}
          <div className="flex gap-2">
            <Input name="q" defaultValue={f.q} placeholder={contact ? "Search name, skills, headline, university, email..." : "Search name, skills, headline, university..."} className="flex-1" aria-label="Search" />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </div>
          <details open={moreFilters || undefined} className="group space-y-3">
            <summary className="cursor-pointer list-none text-small text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Filters{activeFilters ? ` (${activeFilters})` : ""} ▾</span>
              <span className="hidden group-open:inline">Hide filters ▴</span>
            </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Select name="domain" defaultValue={f.domain} options={[...new Set([...DOMAINS, ...values.domains])]} placeholder="Any domain" aria-label="Domain" />
            <Input name="skills" defaultValue={f.skills.join(", ")} placeholder="Skills (all of)" aria-label="Skills" />
            <Select name="country" defaultValue={f.country} options={values.countries} placeholder="Any country" aria-label="Country" />
            <Select name="status" defaultValue={f.status} options={opts(EXPERT_STATUSES)} placeholder="Any status" aria-label="Status" />
            <Select name="availability" defaultValue={f.availability} options={opts(AVAILABILITY)} placeholder="Any availability" aria-label="Availability" />
            <Select name="consent" defaultValue={f.consent} options={opts(CV_CONSENT)} placeholder="Any CV consent" aria-label="CV consent" />
            <Select name="source" defaultValue={f.source} options={opts(SOURCES)} placeholder="Any source" aria-label="Source" />
            <Input name="minYears" type="number" min={0} max={60} defaultValue={f.minYears ?? ""} placeholder="Min years" aria-label="Minimum years" />
            <Input name="tag" defaultValue={f.tag} placeholder="Tag" aria-label="Tag" />
            <Select name="channel" defaultValue={f.channel} options={SOURCE_CHANNELS.map((c) => ({ value: c, label: SOURCE_CHANNEL_LABELS[c] }))} placeholder="Came from anywhere" aria-label="Came from" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Select name="owner" defaultValue={f.owner} options={[{ value: "me", label: "Mine" }, ...owners.map((o) => ({ value: o.id, label: o.name })), { value: "none", label: "No owner" }]} placeholder="Any owner" aria-label="Owner" />
            <Select name="outreach" defaultValue={f.outreach} options={OUTREACH_STATUSES.map((o) => ({ value: o, label: OUTREACH_LABELS[o] }))} placeholder="Any outreach" aria-label="Outreach" />
            <Select name="due" defaultValue={f.due} options={DUE_OPTIONS} placeholder="Any next action" aria-label="Next action" />
            <Select name="job" defaultValue={f.job} options={jobList.map((j) => ({ value: j.id, label: `${j.projectCode ? `${j.projectCode} · ` : ""}${j.title}${j.status === "open" ? "" : ` (${label(j.status)})`}` }))} placeholder="Every job" aria-label="Job" />
            <Select name="project" defaultValue={f.project} options={projectList.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} placeholder="Every project" aria-label="Project" />
            <Select name="track" defaultValue={f.track} options={trackList.map((t) => ({ value: t.id, label: `${t.projectCode} · ${t.name}` }))} placeholder="Every track" aria-label="Track" />
            <Select name="stage" defaultValue={f.stage} options={PIPELINE_STAGES.map((s) => ({ value: s, label: stageLabel(s) }))} placeholder="Any pipeline stage" aria-label="Pipeline stage" />
            <div className="flex items-center gap-2 lg:col-span-3">
              <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
                Apply
              </Button>
              {filtered ? (
                <Link href={active ? viewHref(active.id, { ...config, filters: {} }, keep) : layout === "table" ? "/admin/experts" : `/admin/experts?layout=${layout}`} className="text-sm text-muted-foreground hover:text-foreground">
                  Clear filters
                </Link>
              ) : null}
            </div>
          </div>
          </details>
        </form>
      </Section>

      <Section flush>
        {/* The bulk form has no children: its controls point at it with form="bulk", so the board's own forms never nest. */}
        <form id="bulk" action={bulkExperts}>
          <input type="hidden" name="returnTo" value={here} />
        </form>
        <div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <div className="inline-flex rounded-md border border-input p-0.5" role="group" aria-label="Layout">
              <LayoutLink href={layoutHref(null)} active={layout === "table"} icon={<Rows3 className="h-3.5 w-3.5" aria-hidden />} label="Table" />
              <LayoutLink href={layoutHref("board")} active={layout === "board"} icon={<LayoutGrid className="h-3.5 w-3.5" aria-hidden />} label="Board" />
              <LayoutLink href={layoutHref("pipelines")} active={layout === "pipelines"} icon={<KanbanSquare className="h-3.5 w-3.5" aria-hidden />} label="Pipelines" />
            </div>
            {layout === "table" ? <ColumnPicker selected={columns} /> : null}
            {layout === "table" && canBulk && shown.length ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-small text-muted-foreground">Ticked:</span>
                <ChoiceFields
                  form="bulk"
                  name="op"
                  placeholder="Actions..."
                  options={[
                    ...(canEdit ? [{ value: "owner", label: "Assign an owner" }, { value: "outreach", label: "Set outreach" }, { value: "add_tags", label: "Add tags" }, { value: "remove_tags", label: "Remove tags" }] : []),
                    ...(canPipe ? [{ value: "add_job", label: "Add to a job" }] : []),
                    ...(canEdit && can(user.role, "groups.manage") ? [{ value: "add_group", label: "Add to a group" }] : []),
                    ...(can(user.role, "campaigns.manage") && canOpenSection(user, "referrals") ? [{ value: "email", label: "Email them (campaign)" }] : []),
                    ...(can(user.role, "referrals.manage") && canOpenSection(user, "send-referrals") ? [{ value: "refer", label: "Refer them" }] : []),
                    ...(canEdit ? [{ value: "dnc", label: "Mark do not contact" }] : []),
                  ]}
                  fields={{
                    owner: <Select form="bulk" name="ownerTeamMemberId" defaultValue="" options={owners.filter((o) => o.active).map((o) => ({ value: o.id, label: o.name }))} placeholder="No owner" className="h-8 w-auto text-small" aria-label="Owner" />,
                    outreach: <Select form="bulk" name="outreachStatus" defaultValue="" options={OUTREACH_STATUSES.map((o) => ({ value: o, label: OUTREACH_LABELS[o] }))} placeholder="Pick outreach" className="h-8 w-auto text-small" aria-label="Outreach" />,
                    add_tags: <Input form="bulk" name="tags" placeholder="us-sourcing, shortlist" className="h-8 w-48 text-small" aria-label="Tags" />,
                    remove_tags: <Input form="bulk" name="tags" placeholder="us-sourcing" className="h-8 w-48 text-small" aria-label="Tags" />,
                    add_job: (
                      <>
                        <Select form="bulk" name="jobId" defaultValue="" options={jobList.filter((j) => j.status === "open" || j.status === "paused" || j.status === "draft").map((j) => ({ value: j.id, label: j.title }))} placeholder="Pick a job" className="h-8 w-auto max-w-xs text-small" aria-label="Job" />
                        <Select form="bulk" name="startStage" defaultValue="new" options={[{ value: "new", label: "Start at Applied" }, { value: "shortlisted", label: "Start at Shortlisted" }]} className="h-8 w-auto text-small" aria-label="Starting stage" />
                      </>
                    ),
                    add_group: <Select form="bulk" name="groupId" defaultValue="" options={groups.map((g) => ({ value: g.id, label: g.name }))} placeholder="Pick a group" className="h-8 w-auto text-small" aria-label="Group" />,
                    dnc: <Input form="bulk" name="dncReason" placeholder="Reason, e.g. asked to stop by email" className="h-8 w-64 text-small" aria-label="Reason" />,
                  }}
                />
                <SubmitButton form="bulk" size="sm" variant="secondary" pendingText="Applying...">
                  Apply
                </SubmitButton>
                {canShortlist ? (
                  <>
                    <span className="hidden h-5 w-px bg-border sm:inline-block" aria-hidden />
                    <Select
                      form="bulk"
                      name="requirementId"
                      defaultValue=""
                      options={reqs.map((r) => ({ value: r.req.id, label: `${r.req.title} · ${r.partnerName}` }))}
                      placeholder={reqs.length ? "Add to requirement..." : "No open requirements"}
                      className="h-8 w-auto max-w-full text-small sm:max-w-xs"
                      aria-label="Requirement"
                    />
                    <PendingButton form="bulk" formAction={addSelectedToRequirement} pendingText="Adding...">
                      Add to requirement
                    </PendingButton>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {layout === "pipelines" && pipeBoard ? (
            <PipelineBoard columns={pipeBoard} sp={sp} canPipe={canPipe} here={here} />
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
                    <Th className="w-8">
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
                        <Td className="py-2">
                          <input type="checkbox" form="bulk" name="ids" value={e.id} aria-label={`Select ${e.fullName}`} className="h-4 w-4 rounded-sm align-middle" />
                        </Td>
                      ) : null}
                      <Td className="py-2">
                        <div className="w-40 2xl:w-60">
                          <Link href={hrefWith("/admin/experts", sp, { view: e.id, ok: null, error: null })} scroll={false} className="block truncate font-medium text-foreground hover:text-primary" title={e.fullName}>
                            {e.fullName}
                          </Link>
                          {e.headline ? (
                            <div className="truncate text-xs leading-4 text-muted-foreground" title={e.headline}>
                              {e.headline}
                            </div>
                          ) : null}
                        </div>
                      </Td>
                      {EXPERT_COLUMNS.filter((c) => columns.includes(c.id)).map((c) => (
                        <Td key={c.id} className="py-2 whitespace-nowrap">
                          <Cell id={c.id} e={e} owner={(e.ownerTeamMemberId && ownerName.get(e.ownerTeamMemberId)) || e.ownerName} />
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
        </div>
      </Section>

      {viewing ? (
        <SlideOver
          title={viewing.fullName}
          closeHref={hrefWith("/admin/experts", sp, { view: null })}
          footer={
            <div className="flex gap-2">
              <ButtonLink href={`/admin/experts/${viewing.id}`} variant="primary" size="sm">
                Open full profile →
              </ButtonLink>
              {canEdit ? (
                <ButtonLink href={`/admin/experts/${viewing.id}?tab=edit`} size="sm">
                  Edit
                </ButtonLink>
              ) : null}
              <ButtonLink href={`/admin/experts/${viewing.id}?tab=timeline`} size="sm" variant="ghost">
                Timeline
              </ButtonLink>
            </div>
          }
        >
          <div className="space-y-6">
            <ExpertSummary e={viewing} compact contact={contact} />
            <div className="space-y-2 border-t border-border pt-5">
              <div className="eyebrow text-muted-foreground">Facts</div>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Came from</dt>
                  <dd>{viewing.sourceChannel ? (SOURCE_CHANNEL_LABELS[viewing.sourceChannel] ?? viewing.sourceChannel) : label(viewing.primarySource)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Owner</dt>
                  <dd>{(viewing.ownerTeamMemberId && ownerName.get(viewing.ownerTeamMemberId)) || viewing.ownerName || "–"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Outreach</dt>
                  <dd>{viewing.outreachStatus ? OUTREACH_LABELS[viewing.outreachStatus as keyof typeof OUTREACH_LABELS] : "–"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Next action</dt>
                  <dd>{[viewing.nextAction, viewing.nextActionDue ? `by ${fmtDate(viewing.nextActionDue)}` : null].filter(Boolean).join(" ") || "–"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Last activity</dt>
                  <dd>{ago(viewing.lastActivityAt ?? viewing.updatedAt)}</dd>
                </div>
              </dl>
            </div>
            <div className="space-y-3 border-t border-border pt-5">
              <div className="eyebrow text-muted-foreground">Jobs ({viewingPipes.length})</div>
              {viewingPipes.length ? (
                <ul className="space-y-3">
                  {viewingPipes.map((p) => (
                    <li key={p.id} className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{p.jobTitle}</span>
                        <span className="text-xs text-muted-foreground">
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
                <EmptyState padded={false} title="No job applied for" />
              )}
            </div>
            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center justify-between">
                <div className="eyebrow text-muted-foreground">Latest activity</div>
                <Link href={`/admin/experts/${viewing.id}?tab=timeline`} className="text-xs text-primary hover:underline">
                  See the full timeline
                </Link>
              </div>
              {viewingTimeline.length ? (
                <ul className="space-y-2 text-sm">
                  {viewingTimeline.map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-foreground/85">{t.summary}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{ago(t.at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState padded={false} title="Nothing yet" />
              )}
            </div>
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}

function ViewTab({ href, active, label: text, shared, mine, owner }: { href: string; active: boolean; label: string; shared?: boolean; mine?: boolean; owner?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={shared ? (mine ? "Shared with the team" : `Shared by ${owner}`) : mine ? "Only you see this view" : undefined}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-[13px] whitespace-nowrap transition-colors",
        active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {text}
      {shared ? <Users className="h-3 w-3 text-muted-foreground/70" aria-label="Shared" /> : null}
    </Link>
  );
}

function LayoutLink({ href, active, icon, label: text }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-[3px] px-2.5 text-[13px] transition-colors", active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      {icon}
      {text}
    </Link>
  );
}

type ListRow = ExpertRow & { leadingStage?: string | null };

function Cell({ id, e, owner }: { id: ColumnId; e: ListRow; owner: string | null }) {
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
      return <span className="text-xs text-muted-foreground">{ago(e.updatedAt)}</span>;
    case "added":
      return <span className="text-xs text-muted-foreground">{fmtDate(e.createdAt)}</span>;
    case "stage":
      return <StageBar stage={e.leadingStage} />;
    case "owner":
      return <span className="block max-w-32 truncate">{owner ?? "–"}</span>;
    case "outreach":
      return <>{e.outreachStatus ? OUTREACH_LABELS[e.outreachStatus as keyof typeof OUTREACH_LABELS] : "–"}</>;
    case "next":
      return e.nextAction || e.nextActionDue ? (
        <span className="block max-w-48 truncate text-small" title={e.nextAction ?? undefined}>
          {e.nextAction ?? "Next action"}
          {e.nextActionDue ? <span className="text-xs text-muted-foreground"> · {fmtDate(e.nextActionDue)}</span> : null}
        </span>
      ) : (
        <>–</>
      );
    case "came":
      return <>{e.sourceChannel ? (SOURCE_CHANNEL_LABELS[e.sourceChannel] ?? e.sourceChannel) : "–"}</>;
    case "activity":
      return <span className="text-xs text-muted-foreground">{fmtDate(e.lastActivityAt ?? e.updatedAt)}</span>;
  }
}

/** Board layout: one column per status, cards with the essentials; a status select for roles that may edit. */
function Board({ columns, sp, canEdit, role, here }: { columns: Awaited<ReturnType<typeof expertBoard>>; sp: SearchParams; canEdit: boolean; role: Parameters<typeof visibleExpert>[0]; here: string }) {
  if (!columns.some((c) => c.total)) {
    return <EmptyState size="page" title="No experts in this view" description="Try fewer filters or a shorter search." action={<ButtonLink href={hrefWith("/admin/experts", {}, { layout: "board" })}>Clear filters</ButtonLink>} />;
  }
  return (
    // Scrolls inside its own box (both ways), so the sideways scrollbar is always in reach.
    <div className="max-h-[calc(100vh-15rem)] overflow-auto">
      <div className="flex min-w-max items-start gap-3 p-4">
        {columns.map((col) => (
          <section key={col.status} className="flex w-64 shrink-0 flex-col rounded-md border border-border bg-muted" aria-label={label(col.status)}>
            <header className="sticky top-0 z-10 flex items-center justify-between rounded-t-md bg-muted px-3 py-2.5">
              <StatusBadge value={col.status} />
              <span className="tabular text-xs text-muted-foreground">{col.total}</span>
            </header>
            <ul className="flex flex-col gap-2 px-2 pb-2">
              {col.rows.map((raw) => {
                const e = visibleExpert(role, raw);
                return (
                  <li key={e.id} className="space-y-2 rounded-md border border-border bg-card p-3">
                    <div className="min-w-0">
                      <Link href={hrefWith("/admin/experts", sp, { view: e.id, ok: null, error: null })} scroll={false} className="block truncate text-sm font-medium text-foreground hover:text-primary" title={e.fullName}>
                        {e.fullName}
                      </Link>
                      {e.headline ? (
                        <p className="truncate text-xs text-muted-foreground" title={e.headline}>
                          {e.headline}
                        </p>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-foreground/70">{[e.domain, e.country].filter(Boolean).join(" · ") || "–"}</p>
                    <Chips items={e.skills} max={2} oneLine />
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge value={e.availability} />
                      <StatusBadge value={e.cvConsent} prefix="CV" />
                    </div>
                    {canEdit ? (
                      <form action={setExpertStatus}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="returnTo" value={here} />
                        <AutoSubmitSelect name="status" defaultValue={e.status} className="control h-7 text-xs" aria-label={`Status for ${e.fullName}`}>
                          {EXPERT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {label(s)}
                            </option>
                          ))}
                        </AutoSubmitSelect>
                      </form>
                    ) : null}
                  </li>
                );
              })}
              {col.total > col.rows.length ? (
                <li>
                  <Link href={hrefWith("/admin/experts", sp, { status: col.status, layout: null, page: null, view: null })} className="block px-1 py-1 text-xs text-muted-foreground hover:text-foreground">
                    +{col.total - col.rows.length} more · open as table
                  </Link>
                </li>
              ) : null}
              {!col.total ? <li className="px-1 py-1 text-xs text-muted-foreground/70">Nobody</li> : null}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Pipelines layout: one column per stage (FynoLabs' stages), one card per person and job. */
function PipelineBoard({ columns, sp, canPipe, here }: { columns: BoardColumn[]; sp: SearchParams; canPipe: boolean; here: string }) {
  if (!columns.some((c) => c.total)) {
    return <EmptyState size="page" title="No job pipelines in this view yet" description="Add an expert to a job from their page, or tick people in the table and use Add to a job." action={<ButtonLink href="/admin/experts?layout=pipelines">Clear filters</ButtonLink>} />;
  }
  return (
    <div className="max-h-[calc(100vh-15rem)] overflow-auto">
      <div className="flex min-w-max items-start gap-3 p-4">
        {columns.map((col) => (
          <section key={col.stage} className="flex w-64 shrink-0 flex-col rounded-md border border-border bg-muted" aria-label={col.label}>
            <header className="sticky top-0 z-10 flex items-center justify-between rounded-t-md bg-muted px-3 py-2.5">
              <span className={cn("text-small font-normal", col.stage === "rejected" ? "text-danger" : "text-foreground")}>{col.label}</span>
              <span className="tabular text-xs text-muted-foreground">{col.total}</span>
            </header>
            <ul className="flex flex-col gap-2 px-2 pb-2">
              {col.rows.map((c) => (
                <li key={c.id} className="space-y-2 rounded-md border border-border bg-card p-3">
                  <div className="min-w-0">
                    <Link href={hrefWith("/admin/experts", sp, { view: c.expertId, ok: null, error: null })} scroll={false} className="block truncate text-sm font-medium text-foreground hover:text-primary" title={c.expertName}>
                      {c.expertName}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground" title={c.jobTitle}>
                      {c.projectCode ? `${c.projectCode} · ` : ""}
                      {c.jobTitle}
                      {c.trackName ? ` · ${c.trackName}` : ""}
                    </p>
                  </div>
                  <StageBar stage={c.stage} />
                  <p className="text-xs text-muted-foreground" title="In this stage since">
                    Since {fmtDate(c.stageChangedAt)}
                    {c.ownerName ? ` · ${c.ownerName}` : ""}
                  </p>
                  {c.nextAction ? (
                    <p className="truncate text-xs text-foreground/75" title={c.nextAction}>
                      Next: {c.nextAction}
                      {c.nextActionDue ? ` · ${fmtDate(c.nextActionDue)}` : ""}
                    </p>
                  ) : null}
                  {canPipe ? <StageForm action={movePipelineStage} id={c.id} stage={c.stage} rejectReason={c.rejectReason} returnTo={here} compact /> : null}
                </li>
              ))}
              {col.total > col.rows.length ? (
                <li>
                  <Link href={hrefWith("/admin/experts", sp, { stage: col.stage, layout: null, page: null, view: null })} className="block px-1 py-1 text-xs text-muted-foreground hover:text-foreground">
                    +{col.total - col.rows.length} more · open as table
                  </Link>
                </li>
              ) : null}
              {!col.total ? <li className="px-1 py-1 text-xs text-muted-foreground/70">Nothing here</li> : null}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
