import Link from "next/link";
import { Search } from "@/components/icons";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { one, type SearchParams } from "@/lib/filters";
import { toPublicJob } from "@/lib/jobs-public";
import { listPublicJobs, publicDomains } from "@/lib/server/jobs";
import { ownApplications } from "@/lib/server/portal";
import { JobCard } from "@/components/jobs/job-card";
import { PortalEmpty, PortalHeader } from "@/components/portal/page";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Jobs" };

/** Open roles, as on the public job board, inside the portal; roles already applied to say so. */
export default async function PortalJobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await portalContext("/me/jobs");
  if (ctx.kind !== "expert") return null;
  const q = one(sp.q).slice(0, 100);
  const domain = one(sp.domain).slice(0, 60);
  const db = await getDb();
  const [rows, domains, apps] = await Promise.all([listPublicJobs(db, { q, domain }), publicDomains(db), ownApplications(db, ctx.expertId)]);
  const applied = new Set(apps.map((a) => a.slug));
  const jobs = rows.map(toPublicJob);
  const filtered = Boolean(q || domain);
  return (
    <>
      <PortalHeader title="Jobs" subtitle="Remote roles writing and reviewing the problems that train and test AI models. Apply in a few minutes; your profile fills most of the form." />
      <form method="get" role="search" className="mb-8 flex flex-col gap-2 sm:flex-row">
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
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] text-foreground">
          {jobs.length} open {jobs.length === 1 ? "role" : "roles"}
          {filtered ? " matching" : ""}
        </h2>
        {filtered ? (
          <Link href="/me/jobs" className="text-[13px] text-muted-foreground hover:text-foreground">
            Clear search
          </Link>
        ) : null}
      </div>
      {jobs.length ? (
        <div className="space-y-3">
          {jobs.map((j) => (
            <div key={j.slug} className="relative">
              <ul>
                <JobCard job={j} />
              </ul>
              {applied.has(j.slug) ? <span className="pointer-events-none absolute top-4 right-4 rounded-md bg-success-soft px-1.5 py-0.5 text-xs text-success">Applied</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <PortalEmpty title={filtered ? "No roles match that search" : "No open roles right now"} description={filtered ? "Try another skill or field, or clear the search." : "New roles open often. Keep your profile current and we'll invite you when one fits."} />
      )}
    </>
  );
}
