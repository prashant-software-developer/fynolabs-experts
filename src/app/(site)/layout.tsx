import { getAccount } from "@/lib/auth/session";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";

/** Public pages: job board, job pages and the expert portal. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const account = await getAccount();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader account={account} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <SiteFooter />
    </div>
  );
}
