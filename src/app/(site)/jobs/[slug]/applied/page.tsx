import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { oauthMethods } from "@/auth.config";
import { getDb } from "@/db/client";
import { getAccount } from "@/lib/auth/session";
import { emailConfigured } from "@/lib/server/email";
import { jobForPage } from "@/lib/server/public-jobs";
import { buttonClass } from "@/components/ui/button";
import { ProviderButtons } from "@/components/auth/provider-buttons";

export const metadata: Metadata = { title: "Application received", robots: { index: false, follow: false } };

export default async function AppliedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const account = await getAccount();
  const found = await jobForPage(db, slug, account);
  if (!found) notFound();
  const { job } = found;
  const next = "/me/onboarding";
  const methods = oauthMethods();
  const canSignUp = emailConfigured() || methods.length > 0;
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <section className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" strokeWidth={1.5} aria-hidden />
        <p className="eyebrow text-primary">Application received</p>
        <h1 className="text-title text-foreground">Thank you. We have your application.</h1>
        <p className="mx-auto max-w-lg text-[15px] leading-relaxed text-foreground/70">
          For <span className="text-foreground">{job.title}</span>. We read every application. If your profile fits, we will email you about the next steps.
        </p>
      </section>

      {account?.kind === "expert" ? (
        <section className="space-y-4 rounded-md border border-border bg-card px-6 py-6 text-center sm:px-8">
          <h2 className="text-lg font-light text-foreground">Make your profile complete</h2>
          <p className="text-sm text-muted-foreground">A full profile (CV, skills, hours) gets you matched to more roles.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/me/onboarding" className={buttonClass("primary", "md")}>
              Complete my profile
            </Link>
            <Link href="/me/applications" className={buttonClass("secondary", "md")}>
              My applications
            </Link>
          </div>
        </section>
      ) : canSignUp && !account ? (
        <section className="space-y-5 rounded-md border border-border bg-card px-6 py-7 sm:px-8">
          <div className="space-y-1.5 text-center">
            <h2 className="text-lg font-light text-foreground">Create your expert account</h2>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              Use the email you applied with. You can follow this application, complete your profile once, and get invited to roles that fit.
            </p>
          </div>
          <div className="mx-auto max-w-sm space-y-3">
            <ProviderButtons methods={methods} callbackUrl={next} verb="Sign up" />
            {emailConfigured() ? (
              <Link href={`/join?callbackUrl=${encodeURIComponent(next)}`} className={buttonClass(methods.length ? "secondary" : "primary", "md", "h-11 w-full")}>
                Sign up with your email
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <p className="text-center text-[13px] text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Back to all open roles
        </Link>
      </p>
    </div>
  );
}
