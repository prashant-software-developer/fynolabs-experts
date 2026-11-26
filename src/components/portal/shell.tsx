// The expert portal frame (/me): a slim rail on the left from 1024px (the mark, the six sections,
// the account at the bottom) and a top bar with a menu on phones. Pages stack beside it in one
// column, never side by side.
import Link from "next/link";
import { PortalAccountMenu, PortalMobileBar, PortalRail, type PortalAttention } from "./shell-client";

export function PortalShell({ name, email, avatarUrl, attention, children }: { name: string; email: string; avatarUrl?: string | null; attention?: PortalAttention; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[96px] shrink-0 flex-col items-center border-r border-border bg-background pt-6 pb-4 lg:flex">
        <Link href="/me" aria-label="Home" className="rounded-lg p-1.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/fynolabs-mark.svg" alt="FynoLabs" width={30} height={30} className="h-[30px] w-[30px]" />
        </Link>
        <PortalRail attention={attention} />
        <div className="mt-auto">
          <PortalAccountMenu name={name} email={email} avatarUrl={avatarUrl} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <PortalMobileBar name={name} email={email} avatarUrl={avatarUrl} attention={attention} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-16 sm:px-8 lg:px-14 lg:pt-14">{children}</main>
      </div>
    </div>
  );
}
