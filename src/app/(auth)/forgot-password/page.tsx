import type { Metadata } from "next";
import Link from "next/link";
import { oauthMethods } from "@/auth.config";
import { emailConfigured } from "@/lib/server/email";
import { contactEmail } from "@/lib/site";
import { AuthCard, AuthFootnote, AuthHeading } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forms";
import { ProviderButtons } from "@/components/auth/provider-buttons";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };

/** Emails a single-use reset link. Never says whether the email has an account. */
export default function ForgotPasswordPage() {
  const mail = emailConfigured();
  const google = oauthMethods().includes("google");
  return (
    <>
      <AuthHeading title="Forgot your password?">{mail ? "Enter your email and we'll send you a link to choose a new one." : "Here's how to get back in."}</AuthHeading>
      <AuthCard>
        {mail ? (
          <ForgotForm />
        ) : (
          <div className="space-y-5 text-sm leading-relaxed text-foreground/85">
            <div className="space-y-1">
              <p className="font-normal text-foreground">On the FynoLabs team?</p>
              <p className="text-muted-foreground">Ask your FynoLabs admin to reset it. They'll give you a temporary password.</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="font-normal text-foreground">An expert?</p>
                <p className="text-muted-foreground">{google ? "Sign in with Google using the same email." : `Write to ${contactEmail()} from the email you signed up with.`}</p>
              </div>
              {google ? <ProviderButtons methods={["google"]} callbackUrl={null} /> : null}
            </div>
          </div>
        )}
      </AuthCard>
      <AuthFootnote>
        <Link href="/signin" className="text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </AuthFootnote>
    </>
  );
}
