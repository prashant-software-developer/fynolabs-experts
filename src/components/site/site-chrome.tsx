// The public site's header and footer (job board, job pages, sign-up, expert portal).
import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOutNow } from "@/app/(auth)/actions";
import type { Account } from "@/lib/auth/session";
import { buttonClass } from "@/components/ui/button";
import { contactEmail, siteName } from "@/lib/site";

export function SiteBrand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-foreground" aria-label={`${siteName()} jobs, home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/fynolabs-mark.svg" alt="" width={26} height={26} className="h-[26px] w-[26px]" />
      <span className="flex flex-col gap-0.5 whitespace-nowrap">
        <span className="text-[15px] leading-none">{siteName()}</span>
        <span className="text-[0.625rem] leading-none tracking-[0.12em] text-primary uppercase">Expert jobs</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ account }: { account: Account | null }) {
  const signOutForm = (
    <form action={signOutNow}>
      <button className={buttonClass("ghost", "sm")} aria-label="Sign out">
        <LogOut className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
      </button>
    </form>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <SiteBrand />
        <nav className="ml-auto flex items-center gap-1.5 sm:gap-2" aria-label="Site">
          <Link href="/" className="hidden h-8 items-center rounded-md px-2.5 text-[13px] text-foreground/75 transition-colors hover:bg-accent hover:text-foreground sm:inline-flex">
            Jobs
          </Link>
          {account?.kind === "expert" ? (
            <>
              <Link href="/me/applications" className="hidden h-8 items-center rounded-md px-2.5 text-[13px] text-foreground/75 transition-colors hover:bg-accent hover:text-foreground md:inline-flex">
                My applications
              </Link>
              <Link href="/me" className={buttonClass("secondary", "sm")}>
                My profile
              </Link>
              {signOutForm}
            </>
          ) : account?.kind === "team" ? (
            <>
              <Link href="/admin" className={buttonClass("secondary", "sm")}>
                Admin
              </Link>
              {signOutForm}
            </>
          ) : (
            <>
              <Link href="/signin" className="inline-flex h-8 items-center rounded-md px-2.5 text-[13px] whitespace-nowrap text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
                Sign in
              </Link>
              <Link href="/join" className={buttonClass("primary", "sm")}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const email = contactEmail();
  return (
    <footer className="mt-20 border-t border-border bg-sidebar">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-10 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-1">
          <p className="text-foreground/80">{siteName()} connects domain experts with AI training and evaluation work.</p>
          <p>
            © {new Date().getFullYear()} {siteName()} ·{" "}
            <a href={`mailto:${email}`} className="hover:text-foreground">
              {email}
            </a>
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          <Link href="/" className="hover:text-foreground">
            Open roles
          </Link>
          <Link href="/join" className="hover:text-foreground">
            Join as an expert
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
