import { NextResponse } from "next/server";
import { ensure, isForbidden, type Action } from "./permissions";
import { getAccount, type CurrentUser } from "./session";

export const TEAM_ONLY = "This is for the FynoLabs team only.";

/** For API routes: the signed-in team member allowed to do `action`, or a 401 / 403 JSON response. */
export async function apiGuard(action: Action, ctx?: { partnerId?: string | null }): Promise<CurrentUser | NextResponse> {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (account.kind !== "team") return NextResponse.json({ error: TEAM_ONLY }, { status: 403 });
  const user = account.user;
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
