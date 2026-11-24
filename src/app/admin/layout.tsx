import type { Metadata } from "next";
import { Eye } from "lucide-react";
import { signOutNow } from "@/app/(auth)/actions";
import { CommandPalette, MobileBar, Sidebar, type NavAccess } from "@/components/nav";
import { AdminThemeSync, THEME_SCRIPT } from "@/components/admin/kit-client";
import { can, canSeeMoney, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { openSections } from "@/lib/auth/sections";

export const metadata: Metadata = { title: { default: "FynoLabs admin", template: "%s | FynoLabs admin" }, robots: { index: false, follow: false } };

/**
 * The admin frame (FynoLabs AdminPage): the sidebar on the left, the page beside it in a 1600px column
 * (1680px on detail pages), 20 → 40px gutters, 48px from the top. Phones: the sticky bar and menu.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const access: NavAccess = { import: can(user.role, "imports.csv"), team: can(user.role, "team.manage"), money: canSeeMoney(user.role), settings: can(user.role, "settings.manage"), open: openSections(user) };
  const navUser = { name: user.name || user.email, email: user.email, role: ROLE_LABELS[user.role] ?? user.role };
  return (
    <>
      {/* Applied before the first paint so a dark admin never flashes white (admin pages only). */}
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <AdminThemeSync />
      <div data-admin className="min-h-screen bg-background text-foreground lg:flex">
        <Sidebar access={access} user={navUser} signOut={signOutNow} />
        <div className="min-w-0 flex-1 px-5 pb-24 md:px-10 lg:pt-12">
          <div className="mx-auto max-w-[1600px] has-[[data-detail]]:max-w-[1680px]">
            <MobileBar access={access} user={navUser} signOut={signOutNow} />
            {user.role === "viewer" ? (
              <p className="mb-6 flex items-center gap-2 border-l-2 border-primary px-4 py-2 text-small text-muted-foreground">
                <Eye className="h-4 w-4 shrink-0" aria-hidden />
                You have view-only access. Ask an admin to change your role.
              </p>
            ) : null}
            <main className="animate-page-in">{children}</main>
          </div>
        </div>
      </div>
      <CommandPalette access={access} />
    </>
  );
}
