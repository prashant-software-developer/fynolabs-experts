import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { AVAILABILITY, CV_CONSENT, DOMAINS, EXPERT_STATUSES, SOURCES, label } from "@/lib/constants";
import { expertFiltersToParams, hrefWith, one, parseExpertFilters, type SearchParams } from "@/lib/filters";
import { ago } from "@/lib/format";
import { distinctValues, getExpert, listExperts } from "@/lib/server/experts";
import { listRequirements } from "@/lib/server/requirements";
import { Chips, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectAll, SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { PageHeader, Section } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { SlideOver } from "@/components/ui/slide-over";
import { SortTh, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { ExpertSummary } from "@/components/expert-summary";
import { addSelectedToRequirement } from "./actions";

export const metadata = { title: "Experts" };
const PAGE_SIZE = 50;
const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: label(v) }));

export default async function ExpertsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = parseExpertFilters(sp);
  const db = await getDb();
  const [{ rows, total }, values, reqs] = await Promise.all([
    listExperts(db, f, { limit: PAGE_SIZE, offset: (f.page - 1) * PAGE_SIZE }),
    distinctValues(db),
    listRequirements(db, { status: "active" }),
  ]);
  const viewId = one(sp.view);
  const viewing = viewId ? await getExpert(db, viewId) : null;
  const exportParams = expertFiltersToParams({ ...f, page: 1 });
  exportParams.delete("page");
  const filtered = Boolean(f.q || f.domain || f.skills.length || f.country || f.status || f.availability || f.consent || f.source || f.tag || f.minYears != null);
  const here = hrefWith("/experts", sp, { ok: null, error: null, view: null });

  return (
    <>
      <PageHeader
        title="Experts"
        subtitle={`${total} ${filtered ? "matching" : "in the hub"}`}
        actions={
          <>
            <ButtonLink href={`/api/experts/export?${exportParams.toString()}`} variant="secondary">
              <Download className="h-4 w-4" /> Export CSV
            </ButtonLink>
            <ButtonLink href="/experts/new" variant="primary">
              <Plus className="h-4 w-4" /> Add expert
            </ButtonLink>
          </>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />

      <Section className="mb-6">
        <form method="get" className="space-y-4">
          <div className="flex gap-2">
            <Input name="q" defaultValue={f.q} placeholder="Search name, skills, headline, university, email..." className="flex-1" aria-label="Search" />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Select name="domain" defaultValue={f.domain} options={[...new Set([...DOMAINS, ...values.domains])]} placeholder="Any domain" aria-label="Domain" />
            <Input name="skills" defaultValue={f.skills.join(", ")} placeholder="Skills (all of)" aria-label="Skills" />
            <Select name="country" defaultValue={f.country} options={values.countries} placeholder="Any country" aria-label="Country" />
            <Select name="status" defaultValue={f.status} options={opts(EXPERT_STATUSES)} placeholder="Any status" aria-label="Status" />
            <Select name="availability" defaultValue={f.availability} options={opts(AVAILABILITY)} placeholder="Any availability" aria-label="Availability" />
            <Select name="consent" defaultValue={f.consent} options={opts(CV_CONSENT)} placeholder="Any CV consent" aria-label="CV consent" />
            <Select name="source" defaultValue={f.source} options={opts(SOURCES)} placeholder="Any source" aria-label="Source" />
            <Input name="minYears" type="number" min={0} max={60} defaultValue={f.minYears ?? ""} placeholder="Min years" aria-label="Minimum years" />
            <Input name="tag" defaultValue={f.tag} placeholder="Tag" aria-label="Tag" />
            <div className="flex items-center gap-2">
              <Button type="submit" variant="secondary" className="flex-1">
                Apply
              </Button>
              {filtered ? (
                <Link href="/experts" className="text-sm text-muted-foreground hover:text-foreground">
                  Clear
                </Link>
              ) : null}
            </div>
          </div>
          <input type="hidden" name="sort" value={f.sort} />
          <input type="hidden" name="dir" value={f.dir} />
        </form>
      </Section>

      <Section flush>
        {rows.length === 0 ? (
          <EmptyState
            size="page"
            title={filtered ? "No experts match these filters" : "No experts yet"}
            description={filtered ? "Try fewer filters or a shorter search." : "Add someone by hand or import the jobs site and the talent register."}
            action={
              filtered ? (
                <ButtonLink href="/experts">Clear filters</ButtonLink>
              ) : (
                <ButtonLink href="/import" variant="primary">
                  Import experts
                </ButtonLink>
              )
            }
          />
        ) : (
          <form action={addSelectedToRequirement}>
            <input type="hidden" name="returnTo" value={here} />
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <span className="text-[13px] text-muted-foreground">Selected:</span>
              <Select
                name="requirementId"
                defaultValue=""
                options={reqs.map((r) => ({ value: r.req.id, label: `${r.req.title} · ${r.partnerName}` }))}
                placeholder={reqs.length ? "Add to requirement..." : "No open requirements"}
                className="w-auto max-w-full sm:max-w-sm"
                aria-label="Requirement"
              />
              <SubmitButton size="sm" variant="secondary" pendingText="Adding...">
                Add to requirement
              </SubmitButton>
            </div>
            <Table>
              <THead>
                <Th className="w-8">
                  <SelectAll />
                </Th>
                <SortTh label="Name" sortKey="name" current={f.sort} dir={f.dir} hrefFor={(s, d) => hrefWith("/experts", sp, { sort: s, dir: d, page: null, view: null, ok: null })} />
                <SortTh label="Domain" sortKey="domain" current={f.sort} dir={f.dir} hrefFor={(s, d) => hrefWith("/experts", sp, { sort: s, dir: d, page: null, view: null, ok: null })} />
                <Th>Skills</Th>
                <SortTh label="Country" sortKey="country" current={f.sort} dir={f.dir} hrefFor={(s, d) => hrefWith("/experts", sp, { sort: s, dir: d, page: null, view: null, ok: null })} />
                <SortTh label="Years" sortKey="years" current={f.sort} dir={f.dir} hrefFor={(s, d) => hrefWith("/experts", sp, { sort: s, dir: d, page: null, view: null, ok: null })} />
                <SortTh label="Status" sortKey="status" current={f.sort} dir={f.dir} hrefFor={(s, d) => hrefWith("/experts", sp, { sort: s, dir: d, page: null, view: null, ok: null })} />
                <Th>CV consent</Th>
                {/* As on the website's CRM tables, the least-needed column waits for wide screens (the list is newest first anyway). */}
                <SortTh label="Updated" sortKey="updated" current={f.sort} dir={f.dir} className="hidden 2xl:table-cell" hrefFor={(s, d) => hrefWith("/experts", sp, { sort: s, dir: d, page: null, view: null, ok: null })} />
              </THead>
              <TBody>
                {rows.map((e) => (
                  <Tr key={e.id}>
                    <Td>
                      <input type="checkbox" name="ids" value={e.id} aria-label={`Select ${e.fullName}`} className="h-4 w-4 rounded-sm align-middle" />
                    </Td>
                    <Td>
                      <div className="w-44 2xl:w-56">
                        <Link href={hrefWith("/experts", sp, { view: e.id, ok: null, error: null })} scroll={false} className="block truncate font-medium text-foreground hover:text-primary">
                          {e.fullName}
                        </Link>
                        {e.headline ? <div className="truncate text-xs text-muted-foreground">{e.headline}</div> : null}
                      </div>
                    </Td>
                    <Td>{e.domain ?? "–"}</Td>
                    <Td>
                      <div className="w-44 2xl:w-56">
                        <Chips items={e.skills} max={3} />
                      </div>
                    </Td>
                    <Td>{e.country ?? "–"}</Td>
                    <Td className="tabular">{e.yearsExperience ?? "–"}</Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge value={e.status} />
                        <StatusBadge value={e.availability} />
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge value={e.cvConsent} />
                    </Td>
                    <Td className="hidden whitespace-nowrap text-xs text-muted-foreground 2xl:table-cell">{ago(e.updatedAt)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={f.page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/experts", sp, { page: p, view: null, ok: null })} />
          </form>
        )}
      </Section>

      {viewing ? (
        <SlideOver
          title={viewing.fullName}
          closeHref={hrefWith("/experts", sp, { view: null })}
          footer={
            <div className="flex gap-2">
              <ButtonLink href={`/experts/${viewing.id}`} variant="primary" size="sm">
                Open full profile
              </ButtonLink>
              <ButtonLink href={`/experts/${viewing.id}?tab=edit`} size="sm">
                Edit
              </ButtonLink>
            </div>
          }
        >
          <ExpertSummary e={viewing} compact />
        </SlideOver>
      ) : null}
    </>
  );
}
