import type { Metadata } from "next";
import Link from "next/link";
import { portalContext } from "@/lib/auth/expert";
import { contactEmail } from "@/lib/site";
import { PortalTabs } from "@/components/portal/portal-tabs";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export const metadata: Metadata = { title: { template: "%s · My profile", default: "My profile" }, robots: { index: false, follow: false } };

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await portalContext("/me");
  if (ctx.kind === "team") {
    return (
      <div className="rounded-md border border-border">
        <EmptyState
          size="page"
          title="This is the expert portal"
          description={`You're signed in as ${ctx.user.email}, a team account. Team work happens in the admin. To see the portal as an expert does, use an expert account${ctx.user.devBypass ? " (or Preview as → Expert in local development)" : ""}.`}
          action={
            <Link href="/admin" className={buttonClass("primary", "sm")}>
              Go to the admin
            </Link>
          }
        />
      </div>
    );
  }
  if (ctx.kind === "refused") {
    return (
      <div className="rounded-md border border-border">
        <EmptyState size="page" title="We can't open a profile for this account" description={`If you think this is a mistake, write to ${contactEmail()}.`} />
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <p className="eyebrow text-primary">Your account</p>
        <h1 className="text-title text-foreground">My profile</h1>
        <p className="text-sm text-muted-foreground">Signed in as {ctx.account.email}</p>
      </header>
      <PortalTabs />
      {children}
    </div>
  );
}
