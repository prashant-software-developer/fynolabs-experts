import Link from "next/link";
import { ExternalLink, Plus, Radar, Star } from "lucide-react";
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
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
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
      <nav className="mb-5 flex gap-5 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Views">
        {VIEWS.map((v) => {
          const active = view === v.id;
          const n = viewCount(v.id);
          return (
            <Link
              key={v.id}
              href={hrefWith("/admin/jobs", sp, { view: v.id || null, ok: null, error: null })}
              aria-current={active ? "page" : undefined}
              className={cn("eyebrow -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors", active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {v.label}
              {n != null ? <span className="tabular text-muted-foreground">({n})</span> : null}
            </Link>
          );
        })}
      </nav>
      <Section className="mb-6">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          {view ? <input type="hidden" name="view" value={view} /> : null}
          <Input name="q" defaultValue={q} placeholder="Search title or summary" aria-label="Search jobs" />
          <Select name="visibility" defaultValue={visibility} options={JOB_VISIBILITY.map((x) => ({ value: x, label: label(x) }))} placeholder="Any visibility" aria-label="Visibility" className="sm:w-40" />
          <Select name="partner" defaultValue={partnerId} options={partners.map((p) => ({ value: p.id, label: p.name }))} placeholder="Any partner" aria-label="Partner" className="sm:w-52" />
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            {filtered ? (
              <Link href={view ? `/admin/jobs?view=${view}` : "/admin/jobs"} className="text-sm text-muted-foreground hover:text-foreground">
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </Section>
      <Section flush>
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
                      <Link href={`/admin/jobs/${job.id}`} className="inline-flex items-center gap-1.5 font-normal text-foreground hover:text-primary">
                        {job.featured ? <Star className="h-3.5 w-3.5 fill-current text-warning" aria-label="Featured" /> : null}
                        {job.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">/jobs/{job.slug}</div>
                    </Td>
                    <Td>
                      <StatusBadge value={job.status} />
                      {pub === "closed" && job.status === "open" ? <div className="mt-1 text-xs text-muted-foreground">Past closing date</div> : null}
                    </Td>
                    <Td>
                      <Badge tone={job.visibility === "public" ? "outline" : "muted"}>{label(job.visibility)}</Badge>
                    </Td>
                    <Td className="tabular text-right">
                      <Link href={`/admin/jobs/${job.id}?tab=applicants`} className="hover:text-primary">
                        {applicants}
                      </Link>
                      {newApplicants ? <div className="text-xs text-info">{newApplicants} new</div> : null}
                    </Td>
                    <Td className="text-muted-foreground">{partnerName ?? "–"}</Td>
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
