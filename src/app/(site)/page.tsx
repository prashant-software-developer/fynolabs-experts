import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { getDb } from "@/db/client";
import { one, type SearchParams } from "@/lib/filters";
import { toPublicJob } from "@/lib/jobs-public";
import { listPublicJobs, publicDomains } from "@/lib/server/jobs";
import { siteName, siteUrl } from "@/lib/site";
import { JobCard } from "@/components/jobs/job-card";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export async function generateMetadata(): Promise<Metadata> {
  const name = siteName();
  const title = `${name} · Expert jobs in AI training and evaluation`;
  const description = "Remote work for engineers, scientists and domain experts: help train and evaluate frontier AI models. Apply in a few minutes.";
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${await siteUrl()}/` },
    openGraph: { title, description, type: "website", siteName: name, url: `${await siteUrl()}/` },
  };
}

export default async function JobBoardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100);
  const domain = one(sp.domain).slice(0, 60);
  const db = await getDb();
  const [rows, domains] = await Promise.all([listPublicJobs(db, { q, domain }), publicDomains(db)]);
  const jobs = rows.map(toPublicJob);
  const filtered = Boolean(q || domain);
  return (
    <div className="space-y-12">
      <section className="space-y-5">
        <p className="eyebrow text-primary">{siteName()} · Expert jobs</p>
        <h1 className="max-w-3xl text-[clamp(2rem,1.6rem+1.6vw,2.75rem)] leading-[1.1] font-light text-foreground">Expert work for frontier AI.</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-foreground/70">
          Remote roles for engineers, scientists and domain experts. Write and review the problems that train and test AI models, on your own schedule.
        </p>
        <form method="get" role="search" className="flex flex-col gap-2 pt-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search jobs</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" defaultValue={q} placeholder="Search by role or skill, e.g. Rust, mathematics" className="control h-11 pl-9" />
          </label>
          <select name="domain" defaultValue={domain} aria-label="Field" className="control h-11 sm:w-52">
            <option value="">All fields</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button className={buttonClass("primary", "md", "h-11 px-6")}>Search</button>
        </form>
      </section>

      <section className="space-y-4" aria-label="Open roles">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-medium text-foreground">
            {jobs.length} open {jobs.length === 1 ? "role" : "roles"}
            {filtered ? " matching" : ""}
          </h2>
          {filtered ? (
            <Link href="/" className="text-[13px] text-muted-foreground hover:text-foreground">
              Clear search
            </Link>
          ) : null}
        </div>
        {jobs.length ? (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <JobCard key={j.slug} job={j} />
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-border">
            <EmptyState
              size="page"
              title={filtered ? "No roles match that search" : "No open roles right now"}
              description={filtered ? "Try another skill or field, or clear the search." : "New roles open often. Join as an expert and we will match you when one fits."}
              action={
                <Link href={filtered ? "/" : "/join?mode=signup"} className={buttonClass("secondary", "sm")}>
                  {filtered ? "Clear search" : "Join as an expert"}
                </Link>
              }
            />
          </div>
        )}
      </section>

      <section className="rounded-md border border-border bg-secondary/40 px-6 py-8 sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <h2 className="text-lg font-light text-foreground">Not seeing your field?</h2>
            <p className="max-w-xl text-sm leading-relaxed text-foreground/70">Create an expert profile once. When a role fits your skills, we invite you first.</p>
          </div>
          <Link href="/join?mode=signup" className={buttonClass("secondary", "md")}>
            Join as an expert
          </Link>
        </div>
      </section>
    </div>
  );
}
