import type { Metadata } from "next";
import { Eye } from "lucide-react";
import { signOutNow } from "@/app/(auth)/actions";
import { AccountMenu, Brand, CommandPalette, CurrentSection, MobileNav, SearchButton, Sidebar, type NavAccess } from "@/components/nav";
import { can, canSeeMoney, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { openSections } from "@/lib/auth/sections";

export const metadata: Metadata = { title: { default: "Expert Hub", template: "%s · Expert Hub" }, robots: { index: false, follow: false } };

/**
 * The admin frame: the sidebar on the left; beside it the top bar (where you are, search, your
 * account) and the page in a 1400px column on the canvas. Phones: the menu button in the top bar.
 * `admin-ui` turns on the admin's roomier density (corners, 40px controls: see globals.css).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const access: NavAccess = { import: can(user.role, "imports.csv"), team: can(user.role, "team.manage"), money: canSeeMoney(user.role), settings: can(user.role, "settings.manage"), open: openSections(user) };
  const navUser = { name: user.name || user.email, email: user.email, role: ROLE_LABELS[user.role] ?? user.role };
  return (
    <div className="admin-ui min-h-screen bg-canvas lg:flex">
      <Sidebar access={access} />
      <div className="flex min-w-0 flex-1 flex-col">
        {user.role === "viewer" ? (
          <div className="flex items-center justify-center gap-2 border-b border-border bg-info-soft px-6 py-1.5 text-center text-[13px] text-info">
            <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
            You have view-only access. Ask an admin to change your role.
          </div>
        ) : null}
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-5 md:px-8">
            <MobileNav access={access} />
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <div className="hidden min-w-0 lg:block">
              <CurrentSection access={access} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <SearchButton />
              <AccountMenu user={navUser} access={access} signOut={signOutNow} />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-7 sm:px-6 md:px-8 lg:py-9">{children}</main>
      </div>
      <CommandPalette access={access} />
    </div>
  );
}
