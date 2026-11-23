import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { SessionUser } from "@/auth.config";
import { getDb } from "@/db/client";
import { sessionAccount } from "@/lib/server/accounts";
import * as accountRules from "./account";
import { accountFromRow, type Account, type CurrentUser, type ExpertAccount } from "./team-access";

export type { Account, CurrentUser, ExpertAccount };

async function loadAccount(): Promise<Account | null> {
  const session = await auth();
  const u = session?.user as Partial<SessionUser> | undefined;
  if (!u?.accountId) return null;
  const db = await getDb();
  // The account must still exist, be on, and have the token_version the session was issued with.
  const row = await sessionAccount(db, u.accountId, u.tokenVersion);
  if (!row) return null;
  return accountFromRow(db, row);
}

/** Whoever is signed in (team member or expert), once per request. */
export const getAccount = cache(loadAccount);

/** The signed-in team member with their role, once per request. Experts and guests: null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const a = await getAccount();
  return a?.kind === "team" ? a.user : null;
});

/** For team pages and server actions: an active team member, else off to sign-in / team-only / password / no-access. */
export async function requireUser(): Promise<CurrentUser> {
  const a = await getAccount();
  if (!a) redirect("/signin");
  if (a.kind === "expert") redirect("/team-only");
  if (a.user.mustChangePassword) redirect("/account/password");
  if (a.user.blocked) redirect("/no-access");
  return a.user;
}

/** Where a signed-in account goes from a sign-in page: a temporary password first, then email verification, then the app. */
export function landingFor(a: Account, next: string | null | undefined): string {
  const { nextAfterSignIn } = accountRules;
  if (a.kind === "team" ? a.user.mustChangePassword : a.mustChangePassword) return "/account/password";
  if (a.kind === "expert" && !a.verified) return "/verify-email";
  return nextAfterSignIn(a.kind, next);
}
