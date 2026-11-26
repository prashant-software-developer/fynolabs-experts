import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS, PROJECT_KINDS } from "@/lib/constants";
import { shortDay, todayIST } from "@/lib/crm/dates";
import { PROJECT_KIND_HINTS, crmLabel } from "@/lib/crm/labels";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { companyChoices } from "@/lib/server/companies";
import { PROJECT_TABS, PROJECT_TAB_LABELS, allProjects, funnelFor, getProject, projectParts, projectView, type ProjectTab } from "@/lib/server/projects";
import { CodeTag, Facts, StatusChip } from "@/components/crm/chips";
import { RowLink } from "@/components/crm/row-link";
import { Person } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Field, FieldRow, Input, Select } from "@/components/ui/field";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { PanelSection, SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { ResultCount, SearchField, Toolbar } from "@/components/ui/toolbar";
import { createProjectForm } from "./actions";

export const metadata = { title: "Projects" };

const ownerOf = (p: { ownerMemberName: string | null; ownerMemberEmail: string | null }) => p.ownerMemberName ?? p.ownerMemberEmail?.split("@")[0] ?? null;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("projects");
  if (!allowed)
    return (
      <>
        <PageHeader title="Projects" />
        <Section>
          <NoAccess what="Projects" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const all = await allProjects(db);
  const tabRaw = one(sp.tab);
  const tab: ProjectTab = (PROJECT_TABS as readonly string[]).includes(tabRaw) ? (tabRaw as ProjectTab) : "active";
  const q = one(sp.q);
  const view = projectView(all, tab, q);
  const manage = can(user.role, "projects.manage");
  const close = hrefWith("/admin/projects", sp, { view: null, new: null, ok: null, error: null });
  const viewing = one(sp.view) ? await getProject(db, one(sp.view)) : null;
  const parts = viewing ? await projectParts(db, viewing.id, user.role) : null;
  const funnel = viewing && parts ? await funnelFor(db, viewing, parts.tracks) : null;
  const companies = one(sp.new) && manage ? await companyChoices(db) : [];
  const today = todayIST();

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="One engagement with one partner: its roles, tracks, team, documents and progress."
        actions={
          manage ? (
            <ButtonLink href={hrefWith("/admin/projects", sp, { new: "1", view: null, ok: null, error: null })} variant="primary">
              <Plus className="h-4 w-4" aria-hidden /> New project
            </ButtonLink>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="mb-8">
        <StatGrid>
          <Stat label="Active" value={view.stats.active} />
          <Stat label="Planned" value={view.stats.planned} />
          <Stat label="Roles in projects" value={view.stats.roles} />
          <Stat label="Target, active" value={view.stats.target} hint="People" />
        </StatGrid>
      </div>
      <Tabs tabs={PROJECT_TABS.map((t) => ({ href: hrefWith("/admin/projects", sp, { tab: t === "active" ? null : t, view: null, ok: null, error: null }), label: PROJECT_TAB_LABELS[t], active: tab === t, count: view.counts[t] }))} />
      <Section flush>
        <Toolbar hidden={{ tab: tab !== "active" ? tab : null }} clearHref={q ? hrefWith("/admin/projects", sp, { q: null }) : null} end={<ResultCount n={view.rows.length} noun="project" />}>
          <SearchField defaultValue={q} placeholder="Search code, name, partner" label="Search projects" />
        </Toolbar>
        {view.rows.length ? (
          <Table sticky>
            <THead>
              <Th>Project</Th>
              <Th>Code</Th>
              <Th className="text-right">Roles</Th>
              <Th className="text-right">Target</Th>
              <Th>Owner</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {view.rows.map((p) => (
                <tr key={p.id} className="row-hover relative">
                  <Td>
                    <RowLink href={hrefWith("/admin/projects", sp, { view: p.id, new: null, ok: null, error: null })} className="block max-w-80 truncate">
                      {p.name}
                    </RowLink>
                    <span className="block text-[13px] text-muted-foreground">
                      {p.companyName ?? "Our own"} · {crmLabel(p.kind)}
                    </span>
                  </Td>
                  <Td>
                    <CodeTag code={p.code} />
                  </Td>
                  <Td className="tabular">{p.roles}</Td>
                  <Td className="tabular">{p.targetCount ?? "–"}</Td>
                  <Td>
                    <Person name={ownerOf(p)} className="max-w-40" />
                  </Td>
                  <Td>
                    <StatusChip value={p.status} />
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            size="page"
            title={all.length ? "No projects in this view." : "No projects yet."}
            description={all.length ? "Try another tab or a shorter search." : manage ? "Use “New project” for your first partner engagement." : "An admin or recruiter adds projects."}
            action={all.length ? <ButtonLink href="/admin/projects?tab=all">Show all</ButtonLink> : manage ? <ButtonLink href={hrefWith("/admin/projects", sp, { new: "1" })} variant="primary">New project</ButtonLink> : undefined}
          />
        )}
      </Section>

      {one(sp.new) && manage ? (
        <SlideOver title="New project" subtitle="One engagement with one partner. Add tracks, the team, roles and required documents on the project page." closeHref={close}>
          <form action={createProjectForm} className="space-y-4">
            <input type="hidden" name="returnTo" value={close} />
            <FieldRow>
              <Field label="Code" htmlFor="np-code" hint="Short and unique, e.g. T500 or RUST.">
                <Input id="np-code" name="code" required maxLength={20} className="uppercase" />
              </Field>
              <Field label="Type" htmlFor="np-kind">
                <Select id="np-kind" name="kind" defaultValue="referral" options={PROJECT_KINDS.map((k) => ({ value: k, label: `${crmLabel(k)}: ${PROJECT_KIND_HINTS[k]}` }))} />
              </Field>
            </FieldRow>
            <Field label="Name" htmlFor="np-name">
              <Input id="np-name" name="name" required maxLength={160} />
            </Field>
            <FieldRow>
              <Field label="Partner account" htmlFor="np-company">
                <Select id="np-company" name="companyId" defaultValue="" options={companies.map((c) => ({ value: c.id, label: c.name }))} placeholder="None (our own)" />
              </Field>
              <Field label="Target (people)" htmlFor="np-target">
                <Input id="np-target" name="targetCount" type="number" min={0} />
              </Field>
            </FieldRow>
            <Field label="Countries" htmlFor="np-countries" hint="ISO codes people must live in, e.g. US, GB, CA. Empty means anywhere.">
              <Input id="np-countries" name="countries" placeholder="US, GB" />
            </Field>
            <div className="flex gap-2">
              <SubmitButton pendingText="Adding...">Add project</SubmitButton>
              <ButtonLink href={close}>Cancel</ButtonLink>
            </div>
          </form>
        </SlideOver>
      ) : null}

      {viewing && parts && funnel ? (
        <SlideOver
          title={viewing.name}
          subtitle={[viewing.companyName ?? "Our own", crmLabel(viewing.kind)].join(" · ")}
          addon={
            <>
              <CodeTag code={viewing.code} />
              <StatusChip value={viewing.status} />
            </>
          }
          closeHref={close}
          footer={
            <ButtonLink href={`/admin/projects/${viewing.id}`} variant="primary">
              Open full project <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          }
        >
          <div>
            <PanelSection title="Details">
              {viewing.description ? <p className="line-clamp-3 text-sm text-foreground/80">{viewing.description}</p> : null}
              <Facts
                items={[
                  { label: "Partner", value: viewing.companyName ?? "Our own" },
                  { label: "Type", value: crmLabel(viewing.kind) },
                  { label: "Owner", value: ownerOf(viewing) ? <Person name={ownerOf(viewing)} /> : null },
                  { label: "Target", value: viewing.targetCount != null ? String(viewing.targetCount) : null },
                  { label: "Started", value: viewing.startsOn ? shortDay(viewing.startsOn, today) : null },
                  { label: "Countries", value: viewing.countries.length ? viewing.countries.join(", ") : "Anywhere" },
                ]}
              />
            </PanelSection>
            <PanelSection title="Progress">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="People" value={funnel.people} />
                <Stat label={viewing.targetCount != null ? `Achieved of ${viewing.targetCount}` : "Achieved"} value={funnel.achieved} />
                <Stat label="Per week" value={funnel.pace ? funnel.pace.toFixed(1) : "0"} />
              </div>
              {funnel.people ? (
                <p className="text-[13px] text-muted-foreground">
                  {PIPELINE_STAGES.filter((s) => funnel.stages[s])
                    .map((s) => `${PIPELINE_STAGE_LABELS[s]} ${funnel.stages[s]}`)
                    .join(" · ")}
                </p>
              ) : (
                <EmptyState title="No one in this project yet." description="People join through one of its roles." padded={false} />
              )}
            </PanelSection>
            <PanelSection title={`Roles (${parts.roles.length})`}>
              {parts.roles.length ? (
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {parts.roles.map((r) => (
                    <li key={r.id}>
                      <Link href={`/admin/jobs/${r.id}`} className="row-hover flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{r.title}</span>
                          <span className="text-[13px] text-muted-foreground">
                            {r.visibility === "internal" ? "Internal" : "On the site"} · {crmLabel(r.status)}
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-[13px] text-muted-foreground">{r.people} people</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No roles yet." description="Link a role on the project page." padded={false} />
              )}
            </PanelSection>
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}
