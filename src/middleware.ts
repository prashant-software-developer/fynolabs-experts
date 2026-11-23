// The first gate for every request (the server checks again on every page, action and route):
// public job board and job pages for anyone, /me for signed-in experts with a verified email,
// /admin and admin APIs for the team only. Experts who open /admin get a 403 page; admin APIs
// answer 401 / 403 JSON. Someone signed in with a temporary password only reaches
// /account/password until they change it. Without a database the app shows one page that says so.
import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig, type SessionUser } from "@/auth.config";
import { databaseConfigured } from "@/db/env";
import { accessFor, type Flags, type Who } from "@/lib/auth/account";

const { auth } = NextAuth(authConfig);

function decide(req: NextRequest, who: Who, flags: Flags): Response {
  const { pathname, search } = req.nextUrl;
  const access = accessFor(pathname, who, flags);
  if (access.kind === "next") return NextResponse.next();
  if (access.kind === "unauthorized") return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (access.kind === "forbidden") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: flags.mustChangePassword ? "Change your password first." : "This is for the FynoLabs team only." }, { status: 403 });
    return NextResponse.rewrite(new URL("/team-only", req.nextUrl.origin), { status: 403 });
  }
  if (access.kind === "redirect") return NextResponse.redirect(new URL(access.to, req.nextUrl.origin));
  const url = new URL(access.to, req.nextUrl.origin);
  url.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(url);
}

const guarded = auth((req) => {
  const user = req.auth?.user as Partial<SessionUser> | undefined;
  const who: Who = !user?.accountId ? "guest" : user.kind === "team" ? "team" : "expert";
  return decide(req, who, { mustChangePassword: Boolean(user?.mustChangePassword), verified: user?.verified });
});

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (!databaseConfigured()) {
    const p = req.nextUrl.pathname;
    if (p === "/db-not-set-up") return NextResponse.next();
    if (p.startsWith("/api/")) return NextResponse.json({ error: "The database isn't set up (DATABASE_URL)." }, { status: 503 });
    return NextResponse.rewrite(new URL("/db-not-set-up", req.nextUrl.origin), { status: 503 });
  }
  return (guarded as unknown as (r: NextRequest, e: NextFetchEvent) => Promise<Response>)(req, ev);
}

export const config = {
  // Node.js middleware (stable since Next.js 15.5): same runtime as the rest of the app.
  runtime: "nodejs",
  // Everything except Next.js's own files and the static brand assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/|robots.txt|sitemap.xml).*)"],
};
