import type { Metadata } from "next";
import Link from "next/link";
import { Eye, LogOut } from "lucide-react";
import { signOutNow } from "@/app/(auth)/actions";
import { Brand, CurrentSection, MobileNav, Sidebar, type NavAccess } from "@/components/nav";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "Expert Hub", template: "%s · Expert Hub" }, robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const access: NavAccess = { import: can(user.role, "imports.csv"), team: can(user.role, "team.manage") };
  return (
    <div className="min-h-screen bg-background lg:flex">
      <Sidebar access={access} />
      <div className="flex min-w-0 flex-1 flex-col">
        {user.role === "viewer" ? (
          <div className="flex items-center justify-center gap-2 border-b border-border bg-info-soft px-6 py-1.5 text-center text-xs text-info">
            <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
            You have view-only access. Ask an admin to change your role.
          </div>
        ) : null}
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-5 md:px-8">
            <MobileNav access={access} />
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <div className="hidden min-w-0 lg:block">
              <CurrentSection access={access} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2.5 text-[13px] text-muted-foreground">
              <Link href="/account/password" className="hidden underline-offset-4 hover:text-foreground hover:underline md:inline" title="Change password">
                {user.email}
              </Link>
              <span className="inline-flex h-5 items-center rounded-full border border-border bg-secondary px-2 text-[11px] font-medium text-foreground/80" title={`Your role: ${ROLE_LABELS[user.role]}`}>
                {ROLE_LABELS[user.role]}
              </span>
              <form action={signOutNow}>
                <button className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-foreground/75 transition-colors hover:bg-accent hover:text-foreground">
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-8 md:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
