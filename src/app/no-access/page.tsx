import { redirect } from "next/navigation";
import { signOutNow } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "No access" };

/** Shown to a team member whose access has been turned off (or who is no longer on the team). */
export default async function NoAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (!user.blocked) redirect("/admin");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/fynolabs-mark.svg" alt="" width={40} height={40} className="mx-auto h-10 w-10" />
        <div className="space-y-2">
          <p className="eyebrow text-primary">Expert Hub</p>
          <h1 className="text-title text-foreground">Your access is turned off</h1>
          <p className="text-sm text-muted-foreground">
            {user.email} isn&apos;t active on the team. Ask an admin to turn your access back on in Settings → Team &amp; access.
          </p>
        </div>
        <form action={signOutNow}>
          <button className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-normal text-foreground transition-colors hover:bg-secondary/70">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
