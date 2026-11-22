// After any sign-in: team members go to /admin (or the admin page they asked for), experts to
// /me (or back to the job they came from). Experts are never sent to /admin.
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { nextAfterSignIn } from "@/lib/auth/account";
import { getAccount } from "@/lib/auth/session";
import { linkExpertAccount } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const account = await getAccount();
  const next = req.nextUrl.searchParams.get("next");
  if (account?.kind === "expert") await linkExpertAccount(await getDb(), account);
  const to = nextAfterSignIn(account ? account.kind : "guest", next);
  return NextResponse.redirect(new URL(to, req.nextUrl.origin), 303);
}
