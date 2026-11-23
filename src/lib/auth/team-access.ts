// What a signed-in account is allowed to be: built from its hub.accounts row on every request.
// Team accounts get their role from Team & access (hub.team_members) or the settings
// (ADMIN_EMAILS, DEFAULT_ROLE); expert accounts get the portal once their email is verified.
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { teamMembers, type AccountRow } from "@/db/schema";
import { accountKind } from "./account";
import { resolveRole, type MemberRow, type RoleSource } from "./roles";
import type { Role } from "./permissions";

export type CurrentUser = {
  accountId: string;
  email: string;
  name: string;
  role: Role;
  partnerIds: string[];
  roleSource: RoleSource;
  /** A team member whose access is turned off (or who is no longer on the team): every page and action is refused. */
  blocked: boolean;
  /** Signed in with a temporary password: nothing else works until it's changed. */
  mustChangePassword: boolean;
};

/** Someone signed in who is not on the team: the expert portal (after verifying their email), never /admin. */
export type ExpertAccount = { kind: "expert"; accountId: string; email: string; name: string; verified: boolean; expertId: string | null; mustChangePassword: boolean };
export type Account = { kind: "team"; user: CurrentUser } | ExpertAccount;

export async function memberForAccount(db: DB, row: Pick<AccountRow, "email" | "teamMemberId">): Promise<MemberRow | null> {
  const cols = { role: teamMembers.role, active: teamMembers.active, partnerIds: teamMembers.partnerIds };
  if (row.teamMemberId) {
    const [m] = await db.select(cols).from(teamMembers).where(eq(teamMembers.id, row.teamMemberId)).limit(1);
    if (m) return m;
  }
  const [m] = await db.select(cols).from(teamMembers).where(eq(teamMembers.email, row.email)).limit(1);
  return m ?? null;
}

/** The account as the app sees it right now (re-built on every request, so changes apply at once). */
export async function accountFromRow(db: DB, row: AccountRow): Promise<Account> {
  const name = row.name ?? row.email;
  if (row.accountType !== "team") {
    return { kind: "expert", accountId: row.id, email: row.email, name, verified: Boolean(row.emailVerifiedAt), expertId: row.expertId, mustChangePassword: row.mustChangePassword };
  }
  const member = await memberForAccount(db, row);
  const base = { accountId: row.id, email: row.email, name, mustChangePassword: row.mustChangePassword };
  const blocked: CurrentUser = { ...base, role: "viewer", partnerIds: [], roleSource: "team", blocked: true };
  // A team account whose email is no longer team (taken off Team & access and the settings): blocked.
  if (accountKind({ email: row.email, hasTeamRow: Boolean(member) }) !== "team") return { kind: "team", user: blocked };
  const r = resolveRole({ email: row.email, member });
  if (r.status === "inactive") return { kind: "team", user: blocked };
  return { kind: "team", user: { ...base, role: r.role, partnerIds: r.partnerIds, roleSource: r.source, blocked: false } };
}

/** The role written into the session cookie (for information; the server re-checks every request). */
export async function teamRoleFor(row: AccountRow): Promise<string | null> {
  const { getDb } = await import("@/db/client");
  const a = await accountFromRow(await getDb(), row);
  return a.kind === "team" && !a.user.blocked ? a.user.role : null;
}
