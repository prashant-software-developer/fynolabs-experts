import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "@/components/icons";
import { signOutNow } from "@/app/(auth)/actions";
import { getAccount } from "@/lib/auth/session";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Team only", robots: { index: false, follow: false } };

/** What an expert sees when they open /admin (the middleware serves this with a 403). */
export default async function TeamOnlyPage() {
  const account = await getAccount();
  return (
    <div className="mx-auto max-w-md space-y-6 py-10 text-center">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
      </span>
      <div className="space-y-2">
        <h1 className="text-title text-foreground">This part is for the team</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {account?.kind === "expert"
            ? `You're signed in as ${account.email}, an expert account. Your profile and applications are in your portal.`
            : "The admin is only for the FynoLabs team."}{" "}
          If you were just added to the team, sign out and sign in again.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href={account?.kind === "expert" ? "/me" : "/"} className={buttonClass("primary", "md")}>
          {account?.kind === "expert" ? "Go to my profile" : "See open roles"}
        </Link>
        {account ? (
          <form action={signOutNow}>
            <button className={buttonClass("secondary", "md")}>Sign out</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
