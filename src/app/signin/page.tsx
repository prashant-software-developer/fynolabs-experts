import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { authSettings, isDevBypass } from "@/lib/auth/allow";
import { nextAfterSignIn, safePath } from "@/lib/auth/account";
import { getAccount } from "@/lib/auth/session";
import { DevRoleSwitcher } from "@/components/role-controls";
import { GoogleButton } from "@/components/site/sign-in-buttons";
import { Notice } from "@/components/ui/feedback";

export const metadata = { title: "Team sign-in", robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const back = safePath(sp.callbackUrl) ?? "/admin";
  const account = await getAccount();
  if (account) redirect(nextAfterSignIn(account.kind, back));
  const dev = isDevBypass();
  const { domain } = authSettings();
  const error = sp.error;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/fynolabs-mark.svg" alt="" width={40} height={40} className="mx-auto h-10 w-10" />
          <div className="space-y-2">
            <p className="eyebrow text-primary">FynoLabs</p>
            <h1 className="text-title text-foreground">Expert Hub</h1>
            <p className="text-sm text-muted-foreground">Team sign-in with your @{domain} Google account.</p>
          </div>
        </div>
        {error ? <Notice tone="error">{error === "AccessDenied" ? "That account couldn't sign in. Use a Google account with a verified email." : "Sign-in didn't work. Try again."}</Notice> : null}
        {dev ? (
          <div className="space-y-3">
            <Notice tone="warning">Local development: you are previewing signed out. Pick a team role to sign back in automatically.</Notice>
            <div className="flex justify-center">
              <DevRoleSwitcher current="guest" />
            </div>
          </div>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: `/auth/continue?next=${encodeURIComponent(back)}` });
            }}
          >
            <GoogleButton />
          </form>
        )}
        <p className="text-center text-xs text-muted-foreground">
          For the core team. Experts: <a href="/join" className="text-foreground underline-offset-4 hover:underline">sign in here</a>.
        </p>
      </div>
    </main>
  );
}
