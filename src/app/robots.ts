import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl();
  return {
    rules: [{ userAgent: "*", allow: ["/", "/jobs/"], disallow: ["/admin", "/me", "/api/", "/signin", "/auth/", "/team-only", "/no-access"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
