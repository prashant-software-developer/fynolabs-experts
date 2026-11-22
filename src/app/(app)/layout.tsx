import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { Brand, CurrentSection, MobileNav, Sidebar } from "@/components/nav";
import { requireUser } from "@/lib/auth/session";
import { isLocalDb } from "@/db/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen bg-background lg:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {user.devBypass ? (
          <div className="border-b border-warning/20 bg-warning-soft px-6 py-1.5 text-center text-xs text-warning">
            Local development: signed in automatically as {user.email} (no Google keys set). This never happens in production.
            {isLocalDb() ? " Using the local demo database." : null}
          </div>
        ) : null}
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-5 md:px-8">
            <MobileNav />
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <div className="hidden min-w-0 lg:block">
              <CurrentSection />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
              <span className="hidden md:inline">{user.email}</span>
              {!user.devBypass ? (
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/signin" });
                  }}
                >
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-foreground/75 transition-colors hover:bg-accent hover:text-foreground">
                    <LogOut className="h-3.5 w-3.5" aria-hidden />
                    Sign out
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-8 md:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
