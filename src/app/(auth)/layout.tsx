import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail, siteName } from "@/lib/site";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Sign-in, sign-up, email verification and passwords: one centred card under the logo. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const email = contactEmail();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 justify-center px-4 pt-12 pb-16 sm:pt-20">
        <div className="w-full max-w-[26rem] space-y-8">
          <Link href="/" className="mx-auto flex w-fit flex-col items-center gap-3 text-foreground" aria-label={`${siteName()}, open roles`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/fynolabs-mark.svg" alt="" width={40} height={40} className="h-10 w-10" />
            <span className="text-[15px] leading-none">{siteName()}</span>
          </Link>
          {children}
        </div>
      </main>
      <footer className="px-4 pb-10 text-center text-xs text-muted-foreground">
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2" aria-label="Footer">
          <Link href="/" className="hover:text-foreground">
            Open roles
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <a href={`mailto:${email}`} className="hover:text-foreground">
            {email}
          </a>
        </nav>
      </footer>
    </div>
  );
}
