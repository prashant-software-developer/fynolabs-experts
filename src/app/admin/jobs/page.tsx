import Link from "next/link";
import { ExternalLink, Plus, Radar, Star } from "@/components/icons";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { SectionBlocked } from "@/components/talent/bits";
import { JOB_VISIBILITY, label } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { publicState } from "@/lib/jobs-public";
import { listPartners } from "@/lib/server/requirements";
import { jobCounts, listJobs } from "@/lib/server/jobs";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { OrgLogo } from "@/components/crm/org-logo";
import { Tabs } from "@/components/ui/tabs";
import { FilterSelect, ResultCount, SearchField, Toolbar } from "@/components/ui/toolbar";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { PageHeader, Section } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export const metadata = { title: "Jobs" };

const VIEWS = [
  { id: "", label: "All jobs" },
  { id: "live", label: "Open & paused" },
  { id: "draft", label: "Drafts" },
  { id: "closed", label: "Closed" },
  { id: "featured", label: "Featured" },
] as const;

export default async function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "posted-jobs")) return <SectionBlocked title="Jobs" section="posted-jobs" />;
  const db = await getDb();
  const view = one(sp.view);
  const q = one(sp.q).slice(0, 100);
  const visibility = one(sp.visibility);
  const partnerId = one(sp.partner);
  const [rows, counts, partners] = await Promise.all([
    listJobs(db, { q, visibility, partnerId, status: view === "featured" ? "" : view, featured: view === "featured" }),
    jobCounts(db),
    listPartners(db),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const viewCount = (id: string) => (id === "" ? total : id === "live" ? (counts.open ?? 0) + (counts.paused ?? 0) : id === "featured" ? undefined : (counts[id] ?? 0));
  const filtered = Boolean(q || visibility || partnerId);
  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle="Job openings with their own application form and public link. Applicants land in the hub as experts."
        actions={
          <>
            {canOpenSection(user, "job-radar") ? (
              <ButtonLink href="/admin/jobs/radar" variant="secondary">
                <Radar className="h-4 w-4" /> Job radar
              </ButtonLink>
            ) : null}
            <ButtonLink href="/" variant="secondary" target="_blank">
              <ExternalLink className="h-4 w-4" /> Job board
            </ButtonLink>
            {can(user.role, "jobs.manage") ? (
              <ButtonLink href="/admin/jobs/new" variant="primary">
                <Plus className="h-4 w-4" /> New job
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Tabs tabs={VIEWS.map((v) => ({ href: hrefWith("/admin/jobs", sp, { view: v.id || null, ok: null, error: null }), label: v.label, active: view === v.id, count: viewCount(v.id) }))} />
      <Section flush>
        <Toolbar hidden={{ view }} clearHref={filtered ? (view ? `/admin/jobs?view=${view}` : "/admin/jobs") : null} end={<ResultCount n={rows.length} noun="job" />}>
          <SearchField defaultValue={q} placeholder="Search title or summary" label="Search jobs" />
          <FilterSelect name="visibility" defaultValue={visibility} options={JOB_VISIBILITY.map((x) => ({ value: x, label: label(x) }))} placeholder="Any visibility" label="Visibility" />
          <FilterSelect name="partner" defaultValue={partnerId} options={partners.map((p) => ({ value: p.id, label: p.name }))} placeholder="Any partner" label="Partner" />
        </Toolbar>
        {rows.length ? (
          <Table>
            <THead>
              <Th>Job</Th>
              <Th>Status</Th>
              <Th>Visibility</Th>
              <Th className="text-right">Applicants</Th>
              <Th>Partner (internal)</Th>
              <Th>Closes</Th>
              <Th>Updated</Th>
            </THead>
            <TBody>
              {rows.map(({ job, partnerName, applicants, newApplicants }) => {
                const pub = publicState(job);
                return (
                  <Tr key={job.id}>
                    <Td className="min-w-64">
                      <Link href={`/admin/jobs/${job.id}`} className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary">
                        {job.featured ? <Star className="h-3.5 w-3.5 fill-current text-warning" aria-label="Featured" /> : null}
                        {job.title}
                      </Link>
                      <div className="mt-0.5 text-[13px] text-muted-foreground">/jobs/{job.slug}</div>
                    </Td>
                    <Td>
                      <StatusBadge value={job.status} />
                      {pub === "closed" && job.status === "open" ? <div className="mt-1 text-[13px] text-muted-foreground">Past closing date</div> : null}
                    </Td>
                    <Td>
                      <Badge tone={job.visibility === "public" ? "outline" : "muted"} pill>{label(job.visibility)}</Badge>
                    </Td>
                    <Td className="tabular text-right">
                      <span className="inline-flex items-center gap-2">
                        <Link href={`/admin/jobs/${job.id}?tab=applicants`} className="hover:text-primary">
                          {applicants}
                        </Link>
                        {newApplicants ? <Badge tone="info" pill>{newApplicants} new</Badge> : null}
                      </span>
                    </Td>
                    <Td>
                      {partnerName ? (
                        <span className="inline-flex max-w-52 items-center gap-2 text-foreground/85">
                          <OrgLogo name={partnerName} size={22} />
                          <span className="truncate">{partnerName}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">–</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(job.closesOn)}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(job.updatedAt)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            size="page"
            title={filtered || view ? "No jobs match" : "No jobs yet"}
            description={filtered || view ? "Change the filters or the view." : "Create one from a requirement (Requirements → open one → Create job), or start from scratch."}
            action={can(user.role, "jobs.manage") && !filtered && !view ? <ButtonLink href="/admin/jobs/new" variant="primary" size="sm">New job</ButtonLink> : undefined}
          />
        )}
      </Section>
    </>
  );
}
