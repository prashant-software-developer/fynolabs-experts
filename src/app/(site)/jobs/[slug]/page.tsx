import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { applications } from "@/db/schema";
import { getAccount } from "@/lib/auth/session";
import { one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { prefillFromProfile } from "@/lib/forms/job-fields";
import { jobPostingJsonLd, toPublicJob } from "@/lib/jobs-public";
import { markdownToText, renderMarkdown } from "@/lib/markdown";
import { jobFields } from "@/lib/server/jobs";
import { expertIdFor } from "@/lib/auth/expert";
import { ownCv, ownProfile } from "@/lib/server/portal";
import { jobForPage } from "@/lib/server/public-jobs";
import { siteName, siteUrl } from "@/lib/site";
import { ApplyForm } from "@/components/jobs/apply-form";
import { JobPublicView } from "@/components/jobs/public-job";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const db = await getDb();
  const found = await jobForPage(db, slug, await getAccount());
  if (!found) return { title: "Job not found", robots: { index: false } };
  const j = toPublicJob(found.job);
  const base = await siteUrl();
  const description = j.summary || markdownToText(j.description, 180) || `${j.title} at ${j.companyLabel}.`;
  const title = `${j.title} · ${siteName()}`;
  const indexable = found.state === "open" && !j.unlisted && !found.preview;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${base}/jobs/${j.slug}` },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { title, description, type: "website", siteName: siteName(), url: `${base}/jobs/${j.slug}`, images: [{ url: `${base}/brand/fynolabs-mark.svg` }] },
    twitter: { card: "summary", title, description },
  };
}

const TRACK_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "e"];

export default async function JobPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const account = await getAccount();
  const found = await jobForPage(db, slug, account);
  if (!found) notFound();
  const { job, state, preview } = found;
  const pub = toPublicJob(job);
  const fields = await jobFields(db, job.id);
  const base = await siteUrl();

  // A signed-in expert: prefill from their profile and file the answers under their account.
  let values = {};
  let lockedEmail: string | null = null;
  let cvNote: string | null = null;
  let appliedOn: Date | null = null;
  // Only a verified account ever sees its profile here.
  const ownId = account?.kind === "expert" ? await expertIdFor(account) : null;
  if (account?.kind === "expert" && ownId) {
    const [p, cv, [app]] = await Promise.all([
      ownProfile(db, ownId),
      ownCv(db, ownId),
      db.select({ createdAt: applications.createdAt }).from(applications).where(and(eq(applications.jobId, job.id), eq(applications.expertId, ownId))).limit(1),
    ]);
    if (p) values = prefillFromProfile(fields, p);
    const emailField = fields.find((f) => f.mapsTo === "email");
    if (emailField) {
      values = { ...values, [emailField.id]: account.email };
      lockedEmail = emailField.id;
    }
    if (cv && cv.storage === "upload") cvNote = `We'll use the CV you already gave us (${cv.filename}) unless you choose a new one.`;
    appliedOn = app?.createdAt ?? null;
  }
  const hidden: Record<string, string> = {};
  for (const k of TRACK_KEYS) {
    const v = one(sp[k]).slice(0, 100);
    if (v) hidden[k] = v;
  }
  const descriptionHtml = renderMarkdown(job.description);
  const jsonLd = state === "open" && !preview && !pub.unlisted ? jobPostingJsonLd(pub, { url: `${base}/jobs/${pub.slug}`, siteName: siteName(), siteUrl: base, logoUrl: `${base}/brand/fynolabs-mark.svg`, descriptionHtml }) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /> : null}
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All open roles
      </Link>
      {preview ? (
        <Notice tone="warning" title="Preview for the team">
          This job is {job.status === "draft" ? "a draft" : "internal"}, so the public can&apos;t open this page. Open it from the job&apos;s Share tab when it&apos;s ready.
        </Notice>
      ) : null}
      <JobPublicView job={pub} />

      <section id="apply" className="space-y-6 rounded-md border border-border bg-card px-5 py-6 sm:px-8 sm:py-8" aria-labelledby="apply-title">
        <div className="space-y-1.5">
          <h2 id="apply-title" className="text-xl font-light text-foreground">
            Apply for this role
          </h2>
          <p className="text-sm text-muted-foreground">
            {ownId ? "Your profile filled in what we already know. Check it and add the rest." : "No account needed. Takes about five minutes."}
          </p>
        </div>
        {state === "closed" ? (
          <Notice tone="info" title="This job is no longer accepting applications">
            Browse the other open roles, or join as an expert so we can invite you when a similar one opens.
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/" className={buttonClass("secondary", "sm")}>
                See open roles
              </Link>
              <Link href="/join?mode=signup" className={buttonClass("ghost", "sm")}>
                Join as an expert
              </Link>
            </div>
          </Notice>
        ) : state === "paused" ? (
          <Notice tone="info" title="Applications are paused for now">
            We have enough applicants to review at the moment. Check back soon.
          </Notice>
        ) : (
          <>
            {appliedOn ? <Notice tone="success">You applied on {fmtDate(appliedOn)}. Sending the form again updates your answers.</Notice> : null}
            <ApplyForm slug={job.slug} fields={fields} values={values} hidden={hidden} lockedEmailFieldId={lockedEmail} cvNote={cvNote} preview={preview} initialError={one(sp.error) || null} />
          </>
        )}
      </section>
    </div>
  );
}
