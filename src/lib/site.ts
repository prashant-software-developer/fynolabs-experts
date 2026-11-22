// The public site's name, contact address and absolute URL (for share links, Open Graph and Google Jobs).
import { headers } from "next/headers";

export const siteName = () => (process.env.PUBLIC_SITE_NAME || "FynoLabs").trim();
export const contactEmail = () => (process.env.PUBLIC_CONTACT_EMAIL || "hello@fynolabs.si").trim();

/** PUBLIC_SITE_URL when set (production), else the address this request came in on. */
export async function siteUrl(): Promise<string> {
  const fixed = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return "http://localhost:3000";
  }
}

/** A job link with campaign tags (share links). */
export function utmLink(base: string, utm: { source?: string; medium?: string; campaign?: string; content?: string }): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(utm)) if (v && v.trim()) u.searchParams.set(`utm_${k}`, v.trim().slice(0, 100));
  return u.toString();
}
