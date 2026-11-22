// Who someone is on the platform, and where they may go. Pure functions (tested in
// tests/accounts.test.ts); the middleware, the session helpers and the sign-in flow use them.
//
//   team   = the email is in ADMIN_EMAILS, ends with @ALLOWED_DOMAIN, is listed in ALLOWED_EMAILS,
//            or has a row in hub.team_members (an inactive row still means team, but blocked).
//   expert = anyone else who signed in.
//   guest  = not signed in.
import { isAllowedEmail } from "./allow";
import { adminEmails } from "./roles";

export type Who = "guest" | "expert" | "team";

/** Team by settings alone (no database): ADMIN_EMAILS, @ALLOWED_DOMAIN or ALLOWED_EMAILS. */
export function isTeamByEnv(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (adminEmails(env).includes(e)) return true;
  return isAllowedEmail(e, {
    domain: (env.ALLOWED_DOMAIN || "xocket.sh").trim().toLowerCase().replace(/^@/, ""),
    emails: (env.ALLOWED_EMAILS || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.includes("@")),
  });
}

/** The account type decided at sign-in (and re-checked on every request on the server). */
export function accountKind(input: { email: string; hasTeamRow: boolean; env?: Record<string, string | undefined> }): "team" | "expert" {
  if (input.hasTeamRow) return "team";
  return isTeamByEnv(input.email, input.env) ? "team" : "expert";
}

export type Access =
  | { kind: "next" }
  | { kind: "signin"; to: "/signin" | "/join" }
  | { kind: "forbidden" }
  | { kind: "unauthorized" };

const PUBLIC_EXACT = new Set(["/", "/join", "/privacy", "/signin", "/team-only", "/no-access", "/robots.txt", "/sitemap.xml", "/icon.svg", "/favicon.ico"]);
const PUBLIC_PREFIX = ["/jobs/", "/api/auth/", "/auth/", "/brand/", "/_next/"];

/** The public application endpoint: POST /api/apply/<job slug>. */
export const isApplyEndpoint = (p: string) => /^\/api\/apply\/[a-z0-9-]+\/?$/.test(p);

/**
 * What the middleware does with a request:
 *  - public pages (job board, job pages, sign-up, sign-in, brand files) and the apply endpoint: anyone;
 *  - /me and /api/me: any signed-in person (else to /join);
 *  - /admin: team only (guests to /signin, experts get a 403 page);
 *  - every other /api route: team only (401 signed out, 403 for experts).
 * The server checks again on every page, action and route; this is the first gate.
 */
export function accessFor(pathname: string, who: Who): Access {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (PUBLIC_EXACT.has(p) || p === "/jobs" || PUBLIC_PREFIX.some((x) => p.startsWith(x)) || isApplyEndpoint(p)) return { kind: "next" };
  if (p === "/me" || p.startsWith("/me/") || p === "/api/me" || p.startsWith("/api/me/")) {
    if (who === "guest") return p.startsWith("/api/") ? { kind: "unauthorized" } : { kind: "signin", to: "/join" };
    return { kind: "next" };
  }
  if (p.startsWith("/api/")) {
    if (who === "guest") return { kind: "unauthorized" };
    if (who === "expert") return { kind: "forbidden" };
    return { kind: "next" };
  }
  if (p === "/admin" || p.startsWith("/admin/")) {
    if (who === "guest") return { kind: "signin", to: "/signin" };
    if (who === "expert") return { kind: "forbidden" };
    return { kind: "next" };
  }
  // Anything else (old links are redirected in next.config.ts; the rest is a 404 page).
  return { kind: "next" };
}

/** A same-site path, or null. */
export function safePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return null;
  return s;
}

/** Where to go after signing in: team to /admin (or the admin page they asked for), experts to /me (or back to the job). */
export function nextAfterSignIn(who: Who, raw: string | null | undefined): string {
  const next = safePath(raw);
  if (who === "team") {
    if (next && next !== "/" && !next.startsWith("/join") && !next.startsWith("/signin") && !next.startsWith("/me")) return next;
    return "/admin";
  }
  if (who === "expert") {
    if (next && !next.startsWith("/admin") && !next.startsWith("/api") && !next.startsWith("/join") && !next.startsWith("/signin") && next !== "/") return next;
    return "/me";
  }
  return "/";
}
