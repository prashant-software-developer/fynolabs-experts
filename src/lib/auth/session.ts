import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DEV_USER, isAllowedEmail, isDevBypass } from "./allow";

export type CurrentUser = { email: string; name: string; devBypass: boolean };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isDevBypass()) return { ...DEV_USER, devBypass: true };
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  // Re-checked on every request, so removing someone from ALLOWED_EMAILS takes effect at once.
  if (!email || !isAllowedEmail(email)) return null;
  return { email, name: session?.user?.name ?? email, devBypass: false };
}

/** For pages and server actions: signed-in team member, or off to the sign-in page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}
