// Which role a signed-in person has. Pure, so it is easy to test; session.ts feeds it the
// environment, the person's hub.team_members row and (local development only) the preview cookie.
import { authSettings } from "./allow";
import { isRole, type Role } from "./permissions";

export type MemberRow = { role: string; active: boolean; partnerIds: string[] };

export type RoleSource = "admin_emails" | "team" | "default" | "dev";

export type Resolution =
  | { status: "ok"; role: Role; partnerIds: string[]; source: RoleSource }
  | { status: "inactive" };

const list = (v: string | undefined) =>
  (v || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

/** ADMIN_EMAILS: these people are always admins (bootstrap, so the first admin can sign in). */
export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return list(env.ADMIN_EMAILS);
}

/** DEFAULT_ROLE for team-domain people without a row; anything unknown falls back to viewer. */
export function defaultRole(env: Record<string, string | undefined> = process.env): Role {
  const v = (env.DEFAULT_ROLE || "").trim().toLowerCase();
  return isRole(v) ? v : "viewer";
}

/** DEV_ROLE for the local auto sign-in (default admin). */
export function devRole(env: Record<string, string | undefined> = process.env): Role {
  const v = (env.DEV_ROLE || "").trim().toLowerCase();
  return isRole(v) ? v : "admin";
}

export const DEV_ROLE_COOKIE = "hub_dev_role";
/** Extra "Preview as" values (local development only): the demo expert, or signed out. */
export const DEV_PREVIEW_EXPERT = "expert";
export const DEV_PREVIEW_GUEST = "guest";

/**
 * 1. Local dev auto sign-in: the preview cookie, else DEV_ROLE, else admin.
 * 2. Email in ADMIN_EMAILS: admin, always.
 * 3. A hub.team_members row: its role (and partner scope); an inactive row is blocked.
 * 4. Otherwise DEFAULT_ROLE (viewer unless set) for people on ALLOWED_DOMAIN. Outside addresses
 *    allowed through ALLOWED_EMAILS get viewer until an admin gives them a role.
 */
export function resolveRole(input: {
  email: string;
  member: MemberRow | null;
  env?: Record<string, string | undefined>;
  dev?: { cookieRole?: string | null; partnerIds?: string[] } | null;
}): Resolution {
  const env = input.env ?? process.env;
  const email = input.email.trim().toLowerCase();
  if (input.dev) {
    const cookie = (input.dev.cookieRole || "").trim().toLowerCase();
    const role = isRole(cookie) ? cookie : devRole(env);
    return { status: "ok", role, partnerIds: role === "pod_lead" ? (input.dev.partnerIds ?? []) : [], source: "dev" };
  }
  if (adminEmails(env).includes(email)) return { status: "ok", role: "admin", partnerIds: [], source: "admin_emails" };
  const m = input.member;
  if (m) {
    if (!m.active) return { status: "inactive" };
    const role = isRole(m.role) ? m.role : "viewer";
    return { status: "ok", role, partnerIds: role === "pod_lead" ? [...(m.partnerIds ?? [])] : [], source: "team" };
  }
  const { domain } = authSettings(env);
  const onDomain = Boolean(domain) && email.endsWith(`@${domain}`);
  return { status: "ok", role: onDomain ? defaultRole(env) : "viewer", partnerIds: [], source: "default" };
}
