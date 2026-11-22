// A job as the public sees it. Takes only a PublicJob (no partner, requirement or rate note can
// reach it). Pure and synchronous, so tests render it to HTML.
import { Briefcase, CalendarClock, Globe2, MapPin, Users } from "lucide-react";
import type { PublicJob } from "@/lib/jobs-public";
import { fmtDate } from "@/lib/format";
import { renderMarkdown } from "@/lib/markdown";
import { Badge } from "@/components/ui/badge";

export function JobMeta({ job }: { job: PublicJob }) {
  const items = [
    { icon: MapPin, text: job.location || "Remote" },
    { icon: Briefcase, text: job.employmentLabel },
    { icon: Users, text: `${job.openings} ${job.openings === 1 ? "opening" : "openings"}` },
    ...(job.minYears != null ? [{ icon: CalendarClock, text: `${job.minYears}+ years` }] : []),
  ];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
      {items.map((i) => (
        <li key={i.text} className="inline-flex items-center gap-1.5">
          <i.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {i.text}
        </li>
      ))}
    </ul>
  );
}

export function JobPublicView({ job }: { job: PublicJob }) {
  const html = renderMarkdown(job.description);
  return (
    <article className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow text-primary">{job.companyLabel}</span>
          {job.featured ? <Badge tone="info">Featured</Badge> : null}
          {job.unlisted ? <Badge tone="muted">Shared by link</Badge> : null}
        </div>
        <h1 className="text-title text-foreground">{job.title}</h1>
        {job.summary ? <p className="max-w-2xl text-[15px] leading-relaxed text-foreground/75">{job.summary}</p> : null}
        <JobMeta job={job} />
      </header>
      {html ? <div className="job-prose" dangerouslySetInnerHTML={{ __html: html }} /> : null}
      <dl className="grid gap-x-8 gap-y-5 border-t border-border pt-6 sm:grid-cols-2">
        {job.skills.length ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="eyebrow text-muted-foreground">Skills</dt>
            <dd className="mt-2 flex flex-wrap gap-1.5">
              {job.skills.map((s) => (
                <Badge key={s} tone="outline" className="font-normal capitalize">
                  {s}
                </Badge>
              ))}
            </dd>
          </div>
        ) : null}
        {job.domains.length ? (
          <div>
            <dt className="eyebrow text-muted-foreground">Field</dt>
            <dd className="mt-1 text-sm text-foreground">{job.domains.join(", ")}</dd>
          </div>
        ) : null}
        <div>
          <dt className="eyebrow text-muted-foreground">Where</dt>
          <dd className="mt-1 inline-flex items-start gap-1.5 text-sm text-foreground">
            <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {job.openToCountries.length ? `Open to applicants in ${job.openToCountries.join(", ")}` : "Open to applicants anywhere"}
              {job.notOpenIn.length ? `. Not open in ${job.notOpenIn.join(", ")}.` : ""}
            </span>
          </dd>
        </div>
        {job.closesOn ? (
          <div>
            <dt className="eyebrow text-muted-foreground">Apply by</dt>
            <dd className="mt-1 text-sm text-foreground">{fmtDate(job.closesOn)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="eyebrow text-muted-foreground">Posted</dt>
          <dd className="mt-1 text-sm text-foreground">{fmtDate(job.postedAt)}</dd>
        </div>
      </dl>
    </article>
  );
}
