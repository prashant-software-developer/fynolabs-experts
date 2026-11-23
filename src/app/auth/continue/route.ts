// After any sign-in: a temporary password goes to /account/password first, an unconfirmed email
// to /verify-email; then team members go to /admin (or the admin page they asked for) and experts
// to /me (or back to the job they came from). Experts are never sent to /admin.
import { NextResponse, type NextRequest } from "next/server";
import { expertIdFor } from "@/lib/auth/expert";
import { getAccount, landingFor } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const account = await getAccount();
  const next = req.nextUrl.searchParams.get("next");
  if (!account) return NextResponse.redirect(new URL("/signin", req.nextUrl.origin), 303);
  if (account.kind === "expert" && account.verified) await expertIdFor(account);
  return NextResponse.redirect(new URL(landingFor(account, next), req.nextUrl.origin), 303);
}
