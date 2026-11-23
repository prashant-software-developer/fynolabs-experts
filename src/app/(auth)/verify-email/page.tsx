import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safePath } from "@/lib/auth/account";
import { getAccount } from "@/lib/auth/session";
import { one, type SearchParams } from "@/lib/filters";
import { normalizeEmail } from "@/lib/normalize";
import { emailConfigured } from "@/lib/server/email";
import { AuthCard, AuthFootnote, AuthHeading } from "@/components/auth/auth-card";
import { VerifyForm, VerifyLinkForm } from "@/components/auth/forms";
import { Notice } from "@/components/ui/feedback";
import { signOutNow } from "../actions";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

/** After sign-up: the 6-digit code from the email (or the emailed link) confirms the address. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const next = safePath(one(sp.next));
  const token = one(sp.token);
  const account = await getAccount();
  // Already confirmed (or a team account): nothing to do here.
  if (account && (account.kind === "team" || account.verified) && !token) redirect(next ?? (account.kind === "team" ? "/admin" : "/me"));
  const email = account?.kind === "expert" ? account.email : normalizeEmail(one(sp.email));
  if (token) {
    return (
      <>
        <AuthHeading title="Confirm your email">One click and your expert account is ready.</AuthHeading>
        <AuthCard>
          <VerifyLinkForm token={token.slice(0, 200)} next={next} />
        </AuthCard>
      </>
    );
  }
  return (
    <>
      <AuthHeading title="Check your email">
        {email ? (
          <>
            We sent a 6-digit code to <span className="break-all text-foreground">{email}</span>
          </>
        ) : (
          "Enter the 6-digit code we emailed you."
        )}
      </AuthHeading>
      <AuthCard>
        {!emailConfigured() ? <Notice tone="warning">Email isn&apos;t set up on this site yet, so no code can be sent.</Notice> : null}
        <VerifyForm email={email} next={next} />
        <p className="text-center text-xs leading-relaxed text-muted-foreground">The code works for 30 minutes. Nothing yet? Check your spam folder, or send a new code. Your profile stays private until the email is confirmed.</p>
      </AuthCard>
      <AuthFootnote>
        {account ? (
          <form action={signOutNow} className="inline">
            Wrong email? <button className="text-foreground underline-offset-4 hover:underline">Sign out</button> and sign up again.
          </form>
        ) : (
          <>
            Wrong email?{" "}
            <Link href="/join" className="text-foreground underline-offset-4 hover:underline">
              Sign up again
            </Link>
          </>
        )}
      </AuthFootnote>
    </>
  );
}
