import Link from "next/link";
import { signOut } from "@/auth";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth/session";
import { isLocalDb } from "@/db/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      {user.devBypass ? (
        <div className="bg-amber-100 px-6 py-1.5 text-center text-xs text-amber-900">
          Local development: signed in automatically as {user.email} (no Google keys set). This never happens in production.
          {isLocalDb() ? " Using the local demo database." : null}
        </div>
      ) : null}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-6 w-6" />
            Expert Hub
          </Link>
          <Nav />
          <div className="ml-auto flex shrink-0 items-center gap-3 text-[13px] text-slate-500">
            <span className="hidden md:inline">{user.email}</span>
            {!user.devBypass ? (
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/signin" });
                }}
              >
                <button className="rounded-md px-2 py-1 hover:bg-slate-100 hover:text-slate-900">Sign out</button>
              </form>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
