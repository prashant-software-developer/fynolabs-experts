import { NextResponse } from "next/server";
import { ensure, isForbidden, type Action } from "./permissions";
import { getCurrentUser, type CurrentUser } from "./session";

/** For API routes: the signed-in user allowed to do `action`, or a 401 / 403 JSON response. */
export async function apiGuard(action: Action, ctx?: { partnerId?: string | null }): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    ensure(user, action, ctx);
  } catch (e) {
    if (isForbidden(e)) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  return user;
}

/** A later check (once the record is loaded) inside a route: null if fine, else the 403 response. */
export function apiEnsure(user: CurrentUser, action: Action, ctx?: { partnerId?: string | null }): NextResponse | null {
  try {
    ensure(user, action, ctx);
    return null;
  } catch (e) {
    if (isForbidden(e)) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
