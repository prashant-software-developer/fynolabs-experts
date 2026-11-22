import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { partners, teamMembers } from "@/db/schema";
import { DEV_USER, isAllowedEmail, isDevBypass } from "./allow";
import type { Role } from "./permissions";
import { DEV_ROLE_COOKIE, resolveRole, type MemberRow, type RoleSource } from "./roles";

export type CurrentUser = {
  email: string;
  name: string;
  devBypass: boolean;
  role: Role;
  partnerIds: string[];
  roleSource: RoleSource;
  /** An inactive team member: signed in with Google, but every page and action is refused. */
  blocked: boolean;
};

async function memberFor(email: string): Promise<MemberRow | null> {
  const db = await getDb();
  const [m] = await db
    .select({ role: teamMembers.role, active: teamMembers.active, partnerIds: teamMembers.partnerIds })
    .from(teamMembers)
    .where(eq(teamMembers.email, email))
    .limit(1);
  return m ?? null;
}

/** Local preview as a pod lead: the dev user's own row scope if there is one, else the first partner. */
async function devPartnerScope(member: MemberRow | null): Promise<string[]> {
  if (member?.partnerIds?.length) return member.partnerIds;
  const db = await getDb();
  const [p] = await db.select({ id: partners.id }).from(partners).orderBy(asc(partners.name)).limit(1);
  return p ? [p.id] : [];
}

async function loadUser(): Promise<CurrentUser | null> {
  if (isDevBypass()) {
    const member = await memberFor(DEV_USER.email);
    const jar = await cookies();
    const r = resolveRole({ email: DEV_USER.email, member, dev: { cookieRole: jar.get(DEV_ROLE_COOKIE)?.value, partnerIds: await devPartnerScope(member) } });
    if (r.status !== "ok") return null;
    return { ...DEV_USER, devBypass: true, role: r.role, partnerIds: r.partnerIds, roleSource: r.source, blocked: false };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  // Re-checked on every request, so removing someone from ALLOWED_EMAILS takes effect at once.
  if (!email || !isAllowedEmail(email)) return null;
  const name = session?.user?.name ?? email;
  const r = resolveRole({ email, member: await memberFor(email) });
  if (r.status === "inactive") return { email, name, devBypass: false, role: "viewer", partnerIds: [], roleSource: "team", blocked: true };
  return { email, name, devBypass: false, role: r.role, partnerIds: r.partnerIds, roleSource: r.source, blocked: false };
}

/** The signed-in team member with their role, once per request. */
export const getCurrentUser = cache(loadUser);

/** For pages and server actions: a signed-in, active team member, or off to sign-in / no-access. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (user.blocked) redirect("/no-access");
  return user;
}
