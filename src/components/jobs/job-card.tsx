import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PublicJob } from "@/lib/jobs-public";
import { Badge } from "@/components/ui/badge";
import { JobMeta } from "./public-job";

/** One row on the job board. */
export function JobCard({ job }: { job: PublicJob }) {
  return (
    <li>
      <Link href={`/jobs/${job.slug}`} className="group block rounded-md border border-border bg-card px-5 py-5 transition-colors hover:border-foreground/20 hover:bg-secondary/30 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow text-muted-foreground">{job.companyLabel}</span>
              {job.featured ? <Badge tone="info">Featured</Badge> : null}
            </div>
            <h2 className="text-lg leading-snug font-normal text-foreground group-hover:text-primary">{job.title}</h2>
            {job.summary ? <p className="line-clamp-2 max-w-3xl text-sm leading-relaxed text-foreground/70">{job.summary}</p> : null}
          </div>
          <ArrowRight className="mt-1 hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary sm:block" aria-hidden />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <JobMeta job={job} />
          {job.skills.length ? (
            <span className="flex flex-wrap gap-1">
              {job.skills.slice(0, 4).map((s) => (
                <Badge key={s} tone="outline" className="font-normal capitalize">
                  {s}
                </Badge>
              ))}
              {job.skills.length > 4 ? <span className="self-center text-xs text-muted-foreground">+{job.skills.length - 4}</span> : null}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
