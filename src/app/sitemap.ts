import type { MetadataRoute } from "next";
import { getDb } from "@/db/client";
import { listPublicJobs } from "@/lib/server/jobs";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** The job board and every listed job (open and public). Unlisted, internal, draft and closed jobs stay out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl();
  const jobs = await listPublicJobs(await getDb());
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    ...jobs.map((j) => ({ url: `${base}/jobs/${j.slug}`, lastModified: j.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
