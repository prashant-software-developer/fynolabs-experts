// The expert portal's session helper: who the signed-in expert is, linked to their hub.experts row.
// Every portal page and action gets the expert id from here, never from the request.
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { linkExpertAccount } from "@/lib/server/portal";
import { getAccount, type CurrentUser, type ExpertAccount } from "./session";

export type PortalContext =
  | { kind: "expert"; account: ExpertAccount; expertId: string }
  | { kind: "team"; user: CurrentUser }
  | { kind: "refused"; account: ExpertAccount };

/** For /me pages: guests go to /join; team members get a note (they use /admin). */
export async function portalContext(next = "/me"): Promise<PortalContext> {
  const account = await getAccount();
  if (!account) redirect(`/join?callbackUrl=${encodeURIComponent(next)}`);
  if (account.kind === "team") return { kind: "team", user: account.user };
  const db = await getDb();
  const link = await linkExpertAccount(db, account);
  if (!link.ok) return { kind: "refused", account };
  return { kind: "expert", account, expertId: link.expertId };
}

/** For portal server actions: the signed-in expert's own id, or null (not an expert). */
export async function ownExpertId(): Promise<string | null> {
  const account = await getAccount();
  if (!account || account.kind !== "expert") return null;
  const db = await getDb();
  const link = await linkExpertAccount(db, account);
  return link.ok ? link.expertId : null;
}
