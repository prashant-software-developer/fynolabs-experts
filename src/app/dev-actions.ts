"use server";
// Local development only: preview the app as another role, as the demo expert, or signed out.
// Refused unless the dev sign-in bypass is on, which production builds compile to `false`.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDevBypass } from "@/lib/auth/allow";
import { isRole } from "@/lib/auth/permissions";
import { DEV_PREVIEW_EXPERT, DEV_PREVIEW_GUEST, DEV_ROLE_COOKIE } from "@/lib/auth/roles";
import { isLocalDb } from "@/db/client";

export async function setDevRole(fd: FormData) {
  if (!isDevBypass()) throw new Error("Role preview is only available in local development.");
  const role = String(fd.get("role") ?? "");
  if (!isRole(role) && role !== DEV_PREVIEW_EXPERT && role !== DEV_PREVIEW_GUEST) redirect("/admin");
  // The demo expert is fictional: previewing as them on the real database would add them to it.
  if (role === DEV_PREVIEW_EXPERT && !isLocalDb()) redirect("/admin");
  const jar = await cookies();
  jar.set(DEV_ROLE_COOKIE, role, { path: "/", httpOnly: true, sameSite: "lax" });
  if (role === DEV_PREVIEW_EXPERT) redirect("/me");
  if (role === DEV_PREVIEW_GUEST) redirect("/");
  const ref = (await headers()).get("referer");
  let back = "/admin";
  try {
    if (ref) {
      const u = new URL(ref);
      u.searchParams.delete("ok");
      u.searchParams.delete("error");
      back = u.pathname.startsWith("/admin") ? `${u.pathname}${u.search}` : "/admin";
    }
  } catch {
    back = "/admin";
  }
  redirect(back);
}
