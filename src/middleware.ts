// Every page, server action and API route needs a signed-in team member.
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { isAllowedEmail, isDevBypass } from "@/lib/auth/allow";

const guarded = auth((req) => {
  const email = req.auth?.user?.email;
  if (email && isAllowedEmail(email)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const url = new URL("/signin", req.nextUrl.origin);
  const back = req.nextUrl.pathname + req.nextUrl.search;
  if (back !== "/") url.searchParams.set("callbackUrl", back);
  return NextResponse.redirect(url);
});

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (isDevBypass()) return NextResponse.next();
  return (guarded as unknown as (r: NextRequest, e: NextFetchEvent) => Promise<Response>)(req, ev);
}

export const config = {
  // Node.js middleware (stable since Next.js 15.5): same runtime as the rest of the app.
  runtime: "nodejs",
  // Everything except sign-in itself, Auth.js callbacks and static files.
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
