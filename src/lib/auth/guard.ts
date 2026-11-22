// The one guard. Every server action and API route goes through authorize() (or ensure() once the
// record's partner is known); both throw a ForbiddenError (403) when the role may not do it.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensure, isForbidden, type Action } from "./permissions";
import { requireUser, type CurrentUser } from "./session";

export { ensure, isForbidden, ForbiddenError } from "./permissions";

export async function authorize(action: Action, ctx?: { partnerId?: string | null }): Promise<CurrentUser> {
  const user = await requireUser();
  ensure(user, action, ctx);
  return user;
}

const withMsg = (path: string, kind: "ok" | "error", msg: string) => `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`;

/** Same-origin path of the page the form was sent from, without old messages. */
async function refererPath(fallback: string): Promise<string> {
  try {
    const h = await headers();
    const ref = h.get("referer");
    if (!ref) return fallback;
    const u = new URL(ref);
    const host = h.get("host");
    if (host && u.host !== host) return fallback;
    u.searchParams.delete("ok");
    u.searchParams.delete("error");
    const q = u.searchParams.toString();
    return `${u.pathname}${q ? `?${q}` : ""}`;
  } catch {
    return fallback;
  }
}

/**
 * For plain form actions: runs the action and, if the guard refused it, sends the person back to
 * the page they came from with the reason (instead of an error screen). Other errors pass through.
 */
export async function bounce(fallback: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (isForbidden(e)) redirect(withMsg(await refererPath(fallback), "error", e.message));
    throw e;
  }
}
