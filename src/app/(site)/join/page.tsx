import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { signIn } from "@/auth";
import { signInMethods } from "@/auth.config";
import { nextAfterSignIn, safePath } from "@/lib/auth/account";
import { isDevBypass } from "@/lib/auth/allow";
import { getAccount } from "@/lib/auth/session";
import { one, type SearchParams } from "@/lib/filters";
import { normalizeEmail } from "@/lib/normalize";
import { siteName } from "@/lib/site";
import { GoogleButton, LinkedInButton } from "@/components/site/sign-in-buttons";
import { setDevRole } from "@/app/dev-actions";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Join as an expert", robots: { index: true, follow: true } };

const ERRORS: Record<string, string> = {
  AccessDenied: "That account couldn't sign in. Use an account with a verified email address.",
  Verification: "That sign-in link has expired or was already used. Ask for a new one.",
  OAuthAccountNotLinked: "Sign in the same way you did last time.",
};

export default async function JoinPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const next = safePath(one(sp.callbackUrl)) ?? "/me";
  const account = await getAccount();
  if (account) redirect(nextAfterSignIn(account.kind, next));
  const methods = signInMethods();
  const after = `/auth/continue?next=${encodeURIComponent(next)}`;
  const signup = one(sp.mode) === "signup";
  const error = one(sp.error);
  return (
    <div className="mx-auto max-w-md space-y-8 py-4">
      <div className="space-y-3 text-center">
        <p className="eyebrow text-primary">{siteName()} · Experts</p>
        <h1 className="text-title text-foreground">{signup ? "Join as an expert" : "Sign in or sign up"}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">One profile for every role: apply in a click, track your applications, and get invited when work fits your skills.</p>
      </div>
      {error ? <Notice tone="error">{ERRORS[error] ?? "Sign-in didn't work. Try again."}</Notice> : null}
      {one(sp.check) === "email" ? <Notice tone="success" title="Check your email">We sent you a sign-in link. It works once, for 24 hours.</Notice> : null}

      <div className="space-y-3 rounded-md border border-border bg-card px-6 py-6">
        {isDevBypass() ? (
          <form action={setDevRole}>
            <input type="hidden" name="role" value="expert" />
            <GoogleButton />
            <p className="mt-2 text-center text-xs text-muted-foreground">Local development (no Google keys): opens the portal as the demo expert.</p>
          </form>
        ) : (
          <>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: after });
              }}
            >
              <GoogleButton />
            </form>
            {methods.includes("linkedin") ? (
              <form
                action={async () => {
                  "use server";
                  await signIn("linkedin", { redirectTo: after });
                }}
              >
                <LinkedInButton />
              </form>
            ) : null}
            {methods.includes("email") ? (
              <>
                <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or with your email <span className="h-px flex-1 bg-border" />
                </div>
                <form
                  className="space-y-2"
                  action={async (fd: FormData) => {
                    "use server";
                    const email = normalizeEmail(fd.get("email"));
                    if (!email) redirect(`/join?error=AccessDenied&callbackUrl=${encodeURIComponent(next)}`);
                    await signIn("resend", { email, redirectTo: after });
                  }}
                >
                  <label htmlFor="join-email" className="sr-only">
                    Email
                  </label>
                  <input id="join-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="control h-11" />
                  <button className={buttonClass("secondary", "md", "h-11 w-full")}>
                    <Mail className="h-4 w-4" aria-hidden /> Email me a sign-in link
                  </button>
                </form>
              </>
            ) : null}
          </>
        )}
        <p className="pt-2 text-center text-xs leading-relaxed text-muted-foreground">
          New here? The same buttons create your account. By continuing you agree to how we handle your data in our{" "}
          <Link href="/privacy" className="text-foreground underline-offset-4 hover:underline">
            privacy note
          </Link>
          .
        </p>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        On the {siteName()} team? Sign in here with your work Google account and you will go straight to the admin.
      </p>
    </div>
  );
}
