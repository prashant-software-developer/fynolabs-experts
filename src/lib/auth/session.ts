import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { partners, teamMembers } from "@/db/schema";
import { accountKind } from "./account";
import { DEV_EXPERT, DEV_USER, isDevBypass } from "./allow";
import type { Role } from "./permissions";
import { DEV_PREVIEW_EXPERT, DEV_PREVIEW_GUEST, DEV_ROLE_COOKIE, resolveRole, type MemberRow, type RoleSource } from "./roles";

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

/** Someone signed in who is not on the team: they get the expert portal, never /admin. */
export type ExpertAccount = { kind: "expert"; email: string; name: string; devPreview: boolean };
export type Account = { kind: "team"; user: CurrentUser } | ExpertAccount;

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

async function loadAccount(): Promise<Account | null> {
  if (isDevBypass()) {
    const jar = await cookies();
    const preview = jar.get(DEV_ROLE_COOKIE)?.value;
    if (preview === DEV_PREVIEW_GUEST) return null;
    if (preview === DEV_PREVIEW_EXPERT) return { kind: "expert", email: DEV_EXPERT.email, name: DEV_EXPERT.name, devPreview: true };
    const member = await memberFor(DEV_USER.email);
    const r = resolveRole({ email: DEV_USER.email, member, dev: { cookieRole: preview, partnerIds: await devPartnerScope(member) } });
    if (r.status !== "ok") return null;
    return { kind: "team", user: { ...DEV_USER, devBypass: true, role: r.role, partnerIds: r.partnerIds, roleSource: r.source, blocked: false } };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const name = session?.user?.name ?? email;
  // Re-checked on every request, so a change to the team list or the settings takes effect at once.
  const member = await memberFor(email);
  if (accountKind({ email, hasTeamRow: Boolean(member) }) === "expert") return { kind: "expert", email, name, devPreview: false };
  const r = resolveRole({ email, member });
  if (r.status === "inactive") return { kind: "team", user: { email, name, devBypass: false, role: "viewer", partnerIds: [], roleSource: "team", blocked: true } };
  return { kind: "team", user: { email, name, devBypass: false, role: r.role, partnerIds: r.partnerIds, roleSource: r.source, blocked: false } };
}

/** Whoever is signed in (team member or expert), once per request. */
export const getAccount = cache(loadAccount);

/** The signed-in team member with their role, once per request. Experts and guests: null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const a = await getAccount();
  return a?.kind === "team" ? a.user : null;
});

/** For team pages and server actions: an active team member, else off to sign-in / team-only / no-access. */
export async function requireUser(): Promise<CurrentUser> {
  const a = await getAccount();
  if (!a) redirect("/signin");
  if (a.kind === "expert") redirect("/team-only");
  if (a.user.blocked) redirect("/no-access");
  return a.user;
}
