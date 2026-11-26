import { notFound } from "next/navigation";
import { Briefcase, ExternalLink } from "lucide-react";
import { OrgLogo } from "@/components/crm/org-logo";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { SectionBlocked } from "@/components/talent/bits";
import { label } from "@/lib/constants";
import { one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { publicState } from "@/lib/jobs-public";
import { applicantCounts } from "@/lib/server/applications";
import { getJob, jobFields } from "@/lib/server/jobs";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { FlashFromParams } from "@/components/ui/feedback";
import { FactsBar, PageHeader } from "@/components/ui/layout";
import { Tabs } from "@/components/ui/tabs";
import { setJobSharing } from "../actions";
import { ApplicantsTab, DetailsTab, FormTab, MatchesTab, ShareTab } from "./tabs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getJob(await getDb(), id);
  return { title: found ? found.job.title : "Job" };
}

const TABS = ["details", "form", "applicants", "matches", "share"] as const;
type Tab = (typeof TABS)[number];

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "posted-jobs")) return <SectionBlocked title="Jobs" section="posted-jobs" />;
  const db = await getDb();
  const found = await getJob(db, id);
  if (!found) notFound();
  const { job, partnerName, requirementTitle } = found;
  const [fields, counts] = await Promise.all([jobFields(db, id), applicantCounts(db, id)]);
  const applicants = Object.values(counts).reduce((a, b) => a + b, 0);
  const asked = one(sp.tab) as Tab;
  const tab: Tab = TABS.includes(asked) ? asked : applicants ? "applicants" : "details";
  const base = `/admin/jobs/${id}`;
  const manage = can(user.role, "jobs.manage");
  const state = publicState(job);
  const here = `${base}?tab=${tab}`;
  const quick = (status: string, text: string, variant: "primary" | "secondary" = "secondary") => (
    <form action={setJobSharing}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="returnTo" value={here} />
      <SubmitButton size="sm" variant={variant} pendingText="Saving...">
        {text}
      </SubmitButton>
    </form>
  );
  return (
    <>
      <PageHeader
        title={job.title}
        subtitle={`/jobs/${job.slug}`}
        media={
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-card" aria-hidden>
            <Briefcase className="h-5 w-5" />
          </span>
        }
        back={{ href: "/admin/jobs", label: "Jobs" }}
        meta={
          <>
            <StatusBadge value={job.status} />
            <Badge tone={job.visibility === "public" ? "outline" : "muted"} pill dot>{label(job.visibility)}</Badge>
            {job.featured ? <Badge tone="info" pill dot>Featured</Badge> : null}
            {state === "closed" && job.status === "open" ? <Badge tone="warning" pill dot>Past closing date</Badge> : null}
          </>
        }
        actions={
          <>
            <ButtonLink href={`/jobs/${job.slug}`} target="_blank" variant="secondary" size="sm">
              <ExternalLink className="h-3.5 w-3.5" /> {state === "hidden" ? "Preview page" : "Public page"}
            </ButtonLink>
            {manage && job.status === "draft" ? quick("open", "Open job", "primary") : null}
            {manage && job.status === "open" ? (
              <>
                {quick("paused", "Pause")}
                {quick("closed", "Close")}
              </>
            ) : null}
            {manage && job.status === "paused" ? (
              <>
                {quick("open", "Reopen", "primary")}
                {quick("closed", "Close")}
              </>
            ) : null}
            {manage && job.status === "closed" ? quick("open", "Reopen") : null}
          </>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <FactsBar
        items={[
          { label: "Applicants", value: <span className="tabular">{applicants}</span>, hint: counts.new ? `${counts.new} new` : "None new", href: `${base}?tab=applicants` },
          { label: "Partner (internal)", value: partnerName ? <span className="inline-flex min-w-0 items-center gap-2"><OrgLogo name={partnerName} size={22} /><span className="truncate">{partnerName}</span></span> : null },
          { label: "Requirement", value: requirementTitle ? <span className="truncate">{requirementTitle}</span> : null, href: job.requirementId && requirementTitle ? `/admin/requirements/${job.requirementId}` : undefined },
          { label: "Closes", value: job.closesOn ? fmtDate(job.closesOn) : null, hint: job.closesOn ? undefined : "No closing date" },
        ]}
      />
      <Tabs
        tabs={[
          { href: `${base}?tab=details`, label: "Details", active: tab === "details" },
          { href: `${base}?tab=form`, label: "Form", active: tab === "form", count: fields.filter((f) => f.type !== "section").length },
          { href: `${base}?tab=applicants`, label: "Applicants", active: tab === "applicants", count: applicants },
          { href: `${base}?tab=matches`, label: "Matches", active: tab === "matches" },
          { href: `${base}?tab=share`, label: "Share", active: tab === "share" },
        ]}
      />
      {tab === "details" ? <DetailsTab job={job} user={user} partnerName={partnerName} requirementTitle={requirementTitle} /> : null}
      {tab === "form" ? <FormTab job={job} user={user} fields={fields} sp={sp} /> : null}
      {tab === "applicants" ? <ApplicantsTab job={job} user={user} fields={fields} sp={sp} counts={counts} /> : null}
      {tab === "matches" ? <MatchesTab job={job} user={user} /> : null}
      {tab === "share" ? <ShareTab job={job} user={user} sp={sp} /> : null}
    </>
  );
}
