import { cookies } from "next/headers";
import { isDevBypass } from "@/lib/auth/allow";
import { DEV_ROLE_COOKIE } from "@/lib/auth/roles";
import { getAccount } from "@/lib/auth/session";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { DevRoleSwitcher } from "@/components/role-controls";
import { isLocalDb } from "@/db/client";

/** Public pages: job board, job pages, sign-up and the expert portal. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const account = await getAccount();
  const dev = isDevBypass();
  const preview = dev ? ((await cookies()).get(DEV_ROLE_COOKIE)?.value ?? "") : "";
  const realDbInDev = process.env.NODE_ENV === "development" && !isLocalDb();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {realDbInDev ? (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-danger/30 bg-danger px-4 py-2 text-center text-xs font-medium text-white">
          <span>Real database (production): applications and sign-ups here are real.{dev ? (account?.kind === "team" ? ` Signed in automatically as ${account.user.email}.` : " Previewing signed out.") : ""}</span>
          {dev ? <DevRoleSwitcher current={account?.kind === "team" ? account.user.role : "guest"} realDb /> : null}
        </div>
      ) : dev ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning/20 bg-warning-soft px-4 py-1.5 text-center text-xs text-warning">
          <span>Local development: {account?.kind === "expert" ? `previewing as the demo expert ${account.email}` : account?.kind === "team" ? `signed in automatically as ${account.user.email}` : "previewing signed out"}.</span>
          <DevRoleSwitcher current={account?.kind === "team" ? account.user.role : ((preview === "expert" ? "expert" : "guest") as "expert" | "guest")} />
        </div>
      ) : null}
      <SiteHeader account={account} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <SiteFooter />
    </div>
  );
}
