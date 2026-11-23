import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { oauthMethods } from "@/auth.config";
import { safePath } from "@/lib/auth/account";
import { getAccount, landingFor } from "@/lib/auth/session";
import { CONSENT_TEXT } from "@/lib/forms/field-meta";
import { one, type SearchParams } from "@/lib/filters";
import { emailConfigured } from "@/lib/server/email";
import { siteName } from "@/lib/site";
import { AuthCard, AuthFootnote, AuthHeading, OrDivider } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/forms";
import { ProviderButtons } from "@/components/auth/provider-buttons";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Join as an expert", robots: { index: true, follow: true } };

/** Expert sign-up. The email must be confirmed (emailed code) before the account sees any profile. */
export default async function JoinPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const next = safePath(one(sp.callbackUrl));
  const account = await getAccount();
  if (account) redirect(landingFor(account, next));
  const methods = oauthMethods();
  const passwords = emailConfigured();
  const signInHref = next ? `/signin?callbackUrl=${encodeURIComponent(next)}` : "/signin";
  return (
    <>
      <AuthHeading eyebrow={`${siteName()} · Experts`} title="Join as an expert">
        One profile for every role: apply in a click, follow your applications, and get invited when work fits your skills.
      </AuthHeading>
      <AuthCard>
        {methods.length ? <ProviderButtons methods={methods} callbackUrl={next} verb="Sign up" /> : null}
        {passwords ? (
          <>
            {methods.length ? <OrDivider /> : null}
            <SignUpForm callbackUrl={next} consentText={CONSENT_TEXT} />
          </>
        ) : methods.includes("google") ? (
          <Notice tone="info">Sign up with Google for now. Sign-up with an email and password opens soon.</Notice>
        ) : (
          <div className="space-y-4">
            <Notice tone="info" title="Sign-up opens soon">
              You can still apply to any job without an account.
            </Notice>
            <Link href="/" className={buttonClass("primary", "md", "h-11 w-full")}>
              See open roles
            </Link>
          </div>
        )}
        {methods.length ? (
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            By signing up you agree to how we handle your data in our{" "}
            <Link href="/privacy" className="text-foreground underline-offset-4 hover:underline">
              privacy note
            </Link>
            .
          </p>
        ) : null}
      </AuthCard>
      <AuthFootnote>
        Already have an account?{" "}
        <Link href={signInHref} className="text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </AuthFootnote>
    </>
  );
}
