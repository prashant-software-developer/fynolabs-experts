import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { contactEmail } from "@/lib/site";
import { portalFrame } from "@/lib/server/portal-home";
import { PortalShell } from "@/components/portal/shell";
import { SiteBrand } from "@/components/site/site-chrome";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export const metadata: Metadata = { title: { template: "%s · FynoLabs", default: "Your portal · FynoLabs" }, robots: { index: false, follow: false } };

/** A plain page for the two cases that never reach the portal (a team account, a refused account). */
function Plain({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
          <SiteBrand />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="rounded-md border border-border">{children}</div>
      </main>
    </div>
  );
}

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await portalContext("/me");
  if (ctx.kind === "team") {
    return (
      <Plain>
        <EmptyState
          size="page"
          title="This is the expert portal"
          description={`You're signed in as ${ctx.user.email}, a team account. Team work happens in the admin. To see the portal as an expert does, sign in with an expert account.`}
          action={
            <Link href="/admin" className={buttonClass("primary", "sm")}>
              Go to the admin
            </Link>
          }
        />
      </Plain>
    );
  }
  if (ctx.kind === "refused") {
    return (
      <Plain>
        <EmptyState size="page" title="We can't open a profile for this account" description={`If you think this is a mistake, write to ${contactEmail()}.`} />
      </Plain>
    );
  }
  const frame = await portalFrame(await getDb(), ctx.expertId);
  return (
    <PortalShell name={frame.name || ctx.account.email} email={ctx.account.email} avatarUrl={frame.avatarUrl} attention={frame.attention}>
      {children}
    </PortalShell>
  );
}
