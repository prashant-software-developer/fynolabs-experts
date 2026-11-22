import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "./session";

/** For API routes: the signed-in user, or a 401 response. */
export async function apiUser(): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  return user ?? NextResponse.json({ error: "Sign in required" }, { status: 401 });
}
