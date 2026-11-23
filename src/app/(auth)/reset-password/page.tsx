import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { one, type SearchParams } from "@/lib/filters";
import { AUTH_MESSAGES, resetTokenValid } from "@/lib/server/accounts";
import { AuthCard, AuthFootnote, AuthHeading } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/forms";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** From the emailed link. Opening the page doesn't use the link up; saving the new password does. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const token = one((await searchParams).token).slice(0, 200);
  const valid = token ? await resetTokenValid(await getDb(), token) : false;
  return (
    <>
      <AuthHeading title="Choose a new password">{valid ? "Signing in again everywhere else will need the new password." : undefined}</AuthHeading>
      <AuthCard>
        {valid ? (
          <ResetForm token={token} />
        ) : (
          <div className="space-y-4">
            <Notice tone="error">{AUTH_MESSAGES.linkInvalid}</Notice>
            <Link href="/forgot-password" className={buttonClass("primary", "md", "h-11 w-full")}>
              Ask for a new link
            </Link>
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
