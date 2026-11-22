"use server";
// Local development only: preview the app as another role. Refused unless the dev sign-in bypass
// is on, which production builds compile to `false`.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDevBypass } from "@/lib/auth/allow";
import { isRole } from "@/lib/auth/permissions";
import { DEV_ROLE_COOKIE } from "@/lib/auth/roles";

export async function setDevRole(fd: FormData) {
  if (!isDevBypass()) throw new Error("Role preview is only available in local development.");
  const role = String(fd.get("role") ?? "");
  if (!isRole(role)) redirect("/");
  const jar = await cookies();
  jar.set(DEV_ROLE_COOKIE, role, { path: "/", httpOnly: true, sameSite: "lax" });
  const ref = (await headers()).get("referer");
  let back = "/";
  try {
    if (ref) {
      const u = new URL(ref);
      u.searchParams.delete("ok");
      u.searchParams.delete("error");
      back = `${u.pathname}${u.search}`;
    }
  } catch {
    back = "/";
  }
  redirect(back);
}
