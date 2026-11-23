import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { safePath } from "@/lib/auth/account";
import { getAccount } from "@/lib/auth/session";
import { one, type SearchParams } from "@/lib/filters";
import { accountById } from "@/lib/server/accounts";
import { AuthCard, AuthFootnote, AuthHeading } from "@/components/auth/auth-card";
import { ChangePasswordForm } from "@/components/auth/forms";
import { Notice } from "@/components/ui/feedback";
import { signOutNow } from "../../actions";

export const metadata: Metadata = { title: "Change password", robots: { index: false, follow: false } };

/** Change password (signed in). Accounts with a temporary password are sent here and can't use anything else first. */
export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/signin?callbackUrl=/account/password");
  const id = account.kind === "team" ? account.user.accountId : account.accountId;
  const email = account.kind === "team" ? account.user.email : account.email;
  const temporary = account.kind === "team" ? account.user.mustChangePassword : account.mustChangePassword;
  const row = await accountById(await getDb(), id);
  const hasPassword = Boolean(row?.passwordHash);
  const back = account.kind === "team" ? "/admin" : "/me";
  return (
    <>
      <AuthHeading title={temporary ? "Choose your own password" : hasPassword ? "Change password" : "Set a password"}>
        Signed in as <span className="text-foreground">{email}</span>
      </AuthHeading>
      <AuthCard>
        {temporary ? <Notice tone="info">You signed in with a temporary password. Choose your own to continue.</Notice> : null}
        {!hasPassword ? <Notice tone="info">You sign in with Google or LinkedIn. A password lets you sign in with your email too.</Notice> : null}
        <ChangePasswordForm hasPassword={hasPassword} temporary={temporary} next={safePath(one(sp.next))} />
        <p className="text-center text-xs text-muted-foreground">Changing it signs you out everywhere else.</p>
      </AuthCard>
      <AuthFootnote>
        {temporary ? null : (
          <>
            <Link href={back} className="text-foreground underline-offset-4 hover:underline">
              Back
            </Link>
            {" · "}
          </>
        )}
        <form action={signOutNow} className="inline">
          <button className="text-foreground underline-offset-4 hover:underline">Sign out</button>
        </form>
      </AuthFootnote>
    </>
  );
}
