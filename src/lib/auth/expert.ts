// The expert portal's session helper: who the signed-in expert is, linked to their hub.experts row.
// Every portal page and action gets the expert id from here, never from the request. Accounts
// whose email isn't verified yet never reach a profile.
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { accountById, linkExpertForAccount } from "@/lib/server/accounts";
import { getAccount, type CurrentUser, type ExpertAccount } from "./session";

export type PortalContext =
  | { kind: "expert"; account: ExpertAccount; expertId: string }
  | { kind: "team"; user: CurrentUser }
  | { kind: "refused"; account: ExpertAccount };

/** The verified expert's own record id (linking it on first use), or null. */
export async function expertIdFor(account: ExpertAccount): Promise<string | null> {
  if (!account.verified || account.mustChangePassword) return null;
  const db = await getDb();
  const row = await accountById(db, account.accountId);
  if (!row) return null;
  const link = await linkExpertForAccount(db, row);
  return link.ok ? link.expertId : null;
}

/** For /me pages: guests sign in; unverified accounts confirm their email first; team members get a note. */
export async function portalContext(next = "/me"): Promise<PortalContext> {
  const account = await getAccount();
  if (!account) redirect(`/signin?callbackUrl=${encodeURIComponent(next)}`);
  if (account.kind === "team") {
    if (account.user.mustChangePassword) redirect("/account/password");
    return { kind: "team", user: account.user };
  }
  if (account.mustChangePassword) redirect("/account/password");
  if (!account.verified) redirect("/verify-email");
  const id = await expertIdFor(account);
  if (!id) return { kind: "refused", account };
  return { kind: "expert", account, expertId: id };
}

/** For portal server actions: the signed-in, verified expert's own id, or null. */
export async function ownExpertId(): Promise<string | null> {
  const account = await getAccount();
  if (!account || account.kind !== "expert") return null;
  return expertIdFor(account);
}
