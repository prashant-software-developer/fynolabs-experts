// Who someone is on the platform, and where they may go. Pure functions (tested in
// tests/accounts.test.ts); the middleware, the session helpers and the sign-in flow use them.
//
//   team   = the email is in ADMIN_EMAILS, ends with @ALLOWED_DOMAIN, is listed in ALLOWED_EMAILS,
//            or has a row in hub.team_members (an inactive row still means team, but blocked).
//            Team accounts are created by an admin (Team & access, npm run admin:create) or by
//            Google / LinkedIn sign-in with such an email; nobody can sign up as team.
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
  | { kind: "signin"; to: "/signin" }
  | { kind: "redirect"; to: "/account/password" | "/verify-email" }
  | { kind: "forbidden" }
  | { kind: "unauthorized" };

/** Pages anyone may open, signed in or not. */
export const PUBLIC_EXACT = new Set([
  "/",
  "/join",
  "/privacy",
  "/signin",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/team-only",
  "/no-access",
  "/db-not-set-up",
  "/robots.txt",
  "/sitemap.xml",
  "/icon.svg",
  "/favicon.ico",
]);
const PUBLIC_PREFIX = ["/jobs/", "/api/auth/", "/auth/", "/brand/", "/_next/"];

/** The public application endpoint: POST /api/apply/<job slug>. */
export const isApplyEndpoint = (p: string) => /^\/api\/apply\/[a-z0-9-]+\/?$/.test(p);

const SIGN_IN_PAGES = new Set(["/signin", "/join", "/forgot-password", "/reset-password", "/verify-email", "/db-not-set-up"]);

/** What the session cookie says beyond team / expert (the server re-checks both on every request). */
export type Flags = { mustChangePassword?: boolean; verified?: boolean };

/**
 * What the middleware does with a request:
 *  - someone signed in with a temporary password: only /account/password (and signing out) until it's changed;
 *  - public pages (job board, job pages, sign-up, sign-in, password reset, brand files) and the apply endpoint: anyone;
 *  - /account/password: any signed-in person (else to /signin);
 *  - /me and /api/me: any signed-in person whose email is verified (else to /signin, or to /verify-email);
 *  - /admin: team only (guests to /signin, experts get a 403 page);
 *  - every other /api route: team only (401 signed out, 403 for experts).
 * The server checks again on every page, action and route; this is the first gate.
 */
export function accessFor(pathname: string, who: Who, flags: Flags = {}): Access {
  const p = pathname.replace(/\/+$/, "") || "/";
  const signedIn = who !== "guest";
  // The sign-in pages stay open, so an ended session (still carrying the flag) can always sign in again.
  if (signedIn && flags.mustChangePassword && p !== "/account/password" && !SIGN_IN_PAGES.has(p) && !p.startsWith("/api/auth/") && !p.startsWith("/brand/") && !p.startsWith("/_next/")) {
    return p.startsWith("/api/") ? { kind: "forbidden" } : { kind: "redirect", to: "/account/password" };
  }
  if (PUBLIC_EXACT.has(p) || p === "/jobs" || PUBLIC_PREFIX.some((x) => p.startsWith(x)) || isApplyEndpoint(p)) return { kind: "next" };
  if (p === "/account/password") return signedIn ? { kind: "next" } : { kind: "signin", to: "/signin" };
  if (p === "/me" || p.startsWith("/me/") || p === "/api/me" || p.startsWith("/api/me/")) {
    if (who === "guest") return p.startsWith("/api/") ? { kind: "unauthorized" } : { kind: "signin", to: "/signin" };
    if (who === "expert" && flags.verified === false) return p.startsWith("/api/") ? { kind: "forbidden" } : { kind: "redirect", to: "/verify-email" };
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

/** A same-site path (for callbackUrl and every "go back to" link), or null. */
export function safePath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length > 2000 || !s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return null;
  // No control characters, backslashes or encoded slashes that a browser could turn into another site.
  if (/[\u0000-\u001f\u007f\\]/.test(s) || /^\/(%2f|%5c)/i.test(s)) return null;
  try {
    const u = new URL(s, "http://same.site");
    if (u.origin !== "http://same.site") return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

const AUTH_PAGES = ["/join", "/signin", "/verify-email", "/forgot-password", "/reset-password", "/account/password", "/db-not-set-up"];
const isAuthPage = (p: string) => AUTH_PAGES.some((a) => p === a || p.startsWith(`${a}?`) || p.startsWith(`${a}/`));

/** Where to go after signing in: team to /admin (or the admin page they asked for), experts to /me (or back to the job). */
export function nextAfterSignIn(who: Who, raw: string | null | undefined): string {
  const safe = safePath(raw);
  const next = safe && !isAuthPage(safe) ? safe : null;
  if (who === "team") {
    if (next && next !== "/" && !next.startsWith("/me")) return next;
    return "/admin";
  }
  if (who === "expert") {
    if (next && !next.startsWith("/admin") && !next.startsWith("/api") && next !== "/") return next;
    return "/me";
  }
  return "/";
}
