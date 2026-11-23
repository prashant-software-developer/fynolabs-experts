import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { oauthMethods } from "@/auth.config";
import { safePath } from "@/lib/auth/account";
import { getAccount, landingFor } from "@/lib/auth/session";
import { one, type SearchParams } from "@/lib/filters";
import { AuthCard, AuthFootnote, AuthHeading, OrDivider } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/forms";
import { ProviderButtons } from "@/components/auth/provider-buttons";
import { Notice } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

const OK: Record<string, string> = {
  "signed-out": "You're signed out.",
  "password-changed": "Password changed. Sign in with your new password.",
};

const ERRORS: Record<string, string> = {
  AccessDenied: "That account couldn't sign in. Use an account with a verified email address, or ask your FynoLabs admin.",
  OAuthAccountNotLinked: "Sign in the same way you did last time.",
  Configuration: "Sign-in isn't working right now. Try again in a few minutes.",
};

/** One sign-in page for the team and experts: team members land on /admin, experts on /me (or back on the job). */
export default async function SignInPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const next = safePath(one(sp.callbackUrl));
  const account = await getAccount();
  if (account) redirect(landingFor(account, next));
  const methods = oauthMethods();
  const error = one(sp.error);
  const ok = OK[one(sp.ok)];
  return (
    <>
      <AuthHeading title="Sign in">For experts and the FynoLabs team.</AuthHeading>
      <AuthCard>
        {error && error !== "CredentialsSignin" ? <Notice tone="error">{ERRORS[error] ?? "Sign-in didn't work. Try again."}</Notice> : null}
        {ok ? <Notice tone="success">{ok}</Notice> : null}
        {methods.length ? (
          <>
            <ProviderButtons methods={methods} callbackUrl={next} />
            <OrDivider />
          </>
        ) : null}
        <SignInForm callbackUrl={next} />
      </AuthCard>
      <AuthFootnote>
        New here?{" "}
        <Link href={next ? `/join?callbackUrl=${encodeURIComponent(next)}` : "/join"} className="text-foreground underline-offset-4 hover:underline">
          Create an expert account
        </Link>
        <br />
        You can also apply to any job without an account.
      </AuthFootnote>
    </>
  );
}
