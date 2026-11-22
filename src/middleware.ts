// The first gate for every request (the server checks again on every page, action and route):
// public job board and job pages for anyone, /me for anyone signed in, /admin and admin APIs for
// the team only. Experts who open /admin get a 403 page; admin APIs answer 401 / 403 JSON.
import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { accessFor, isTeamByEnv, type Who } from "@/lib/auth/account";
import { isDevBypass } from "@/lib/auth/allow";
import { DEV_PREVIEW_EXPERT, DEV_PREVIEW_GUEST, DEV_ROLE_COOKIE } from "@/lib/auth/roles";

const { auth } = NextAuth(authConfig);

function decide(req: NextRequest, who: Who): Response {
  const { pathname, search } = req.nextUrl;
  const access = accessFor(pathname, who);
  if (access.kind === "next") return NextResponse.next();
  if (access.kind === "unauthorized") return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (access.kind === "forbidden") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "This is for the FynoLabs team only." }, { status: 403 });
    return NextResponse.rewrite(new URL("/team-only", req.nextUrl.origin), { status: 403 });
  }
  const url = new URL(access.to, req.nextUrl.origin);
  url.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(url);
}

const guarded = auth((req) => {
  const user = req.auth?.user as { email?: string | null; kind?: string } | undefined;
  const email = user?.email ?? null;
  const who: Who = !email ? "guest" : isTeamByEnv(email) || user?.kind === "team" ? "team" : "expert";
  return decide(req, who);
});

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (isDevBypass()) {
    const preview = req.cookies.get(DEV_ROLE_COOKIE)?.value;
    return decide(req, preview === DEV_PREVIEW_GUEST ? "guest" : preview === DEV_PREVIEW_EXPERT ? "expert" : "team");
  }
  return (guarded as unknown as (r: NextRequest, e: NextFetchEvent) => Promise<Response>)(req, ev);
}

export const config = {
  // Node.js middleware (stable since Next.js 15.5): same runtime as the rest of the app.
  runtime: "nodejs",
  // Everything except Next.js's own files and the static brand assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/|robots.txt|sitemap.xml).*)"],
};
