// What the public may see of a job, and when. Pure functions (tested in tests/jobs.test.ts):
// the board, the job page, the sitemap and the apply endpoint all ask these.
import type { Job } from "@/db/schema";
import { placeLabel } from "@/lib/match/dictionary";
import { label } from "@/lib/constants";

export type PublicState = "open" | "paused" | "closed" | "hidden";

export const todayIso = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * draft or internal: hidden (404 for the public). closed, or past its closing date: closed.
 * paused: paused. open: open. Unlisted jobs behave the same but are never listed.
 */
export function publicState(job: Pick<Job, "status" | "visibility" | "closesOn">, today = todayIso()): PublicState {
  if (job.visibility === "internal" || job.status === "draft") return "hidden";
  if (job.status === "closed" || (job.closesOn && job.closesOn < today)) return "closed";
  if (job.status === "paused") return "paused";
  return "open";
}

/** On the public board: open and public (not unlisted, internal, draft, paused, closed or past its date). */
export function isListed(job: Pick<Job, "status" | "visibility" | "closesOn">, today = todayIso()): boolean {
  return job.visibility === "public" && publicState(job, today) === "open";
}

export const acceptsApplications = (job: Pick<Job, "status" | "visibility" | "closesOn">, today = todayIso()) => publicState(job, today) === "open";

/** The only job fields that ever reach a public page. No partner, requirement, rate note or creator. */
export type PublicJob = {
  slug: string;
  title: string;
  companyLabel: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  employmentType: string;
  employmentLabel: string;
  domains: string[];
  skills: string[];
  openToCountries: string[];
  notOpenIn: string[];
  minYears: number | null;
  openings: number;
  featured: boolean;
  closesOn: string | null;
  postedAt: string;
  unlisted: boolean;
};

export function toPublicJob(job: Job): PublicJob {
  return {
    slug: job.slug,
    title: job.title,
    companyLabel: job.publicCompanyLabel,
    summary: job.summary,
    description: job.description,
    location: job.location,
    employmentType: job.employmentType,
    employmentLabel: label(job.employmentType),
    domains: [...job.domains],
    skills: [...job.skills],
    openToCountries: job.countriesAllowed.map(placeLabel),
    notOpenIn: job.countriesBlocked.map(placeLabel),
    minYears: job.minYears,
    openings: job.openings,
    featured: job.featured,
    closesOn: job.closesOn,
    postedAt: (job.publishedAt ?? job.createdAt).toISOString(),
    unlisted: job.visibility === "unlisted",
  };
}

const EMPLOYMENT_SCHEMA: Record<string, string> = { contract: "CONTRACTOR", freelance: "CONTRACTOR", part_time: "PART_TIME", full_time: "FULL_TIME" };

/** schema.org JobPosting for Google Jobs. Never a salary, never the client's name. */
export function jobPostingJsonLd(j: PublicJob, opts: { url: string; siteName: string; siteUrl: string; logoUrl: string; descriptionHtml: string }) {
  const remote = !j.location || /remote|anywhere|online/i.test(j.location);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: j.title,
    description: opts.descriptionHtml || j.summary || j.title,
    datePosted: j.postedAt.slice(0, 10),
    employmentType: EMPLOYMENT_SCHEMA[j.employmentType] ?? "CONTRACTOR",
    hiringOrganization: { "@type": "Organization", name: opts.siteName, sameAs: opts.siteUrl, logo: opts.logoUrl },
    directApply: true,
    url: opts.url,
    identifier: { "@type": "PropertyValue", name: opts.siteName, value: j.slug },
  };
  if (j.closesOn) data.validThrough = `${j.closesOn}T23:59:59Z`;
  if (remote) {
    data.jobLocationType = "TELECOMMUTE";
    data.applicantLocationRequirements = j.openToCountries.length
      ? j.openToCountries.filter((c) => !/^US-|,/.test(c)).map((name) => ({ "@type": "Country", name }))
      : { "@type": "Country", name: "Worldwide" };
  } else if (j.location) {
    data.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: j.location } };
  }
  return data;
}
