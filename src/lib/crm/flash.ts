// Server actions send the person back to the page they came from (a hidden `returnTo` field) with
// ?ok= or ?error=, the hub's flash pattern. Only /admin paths are followed.
import { redirect } from "next/navigation";

export function returnPath(fd: FormData, fallback: string): string {
  const raw = String(fd.get("returnTo") ?? "");
  if (!raw.startsWith("/admin") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  try {
    const u = new URL(raw, "http://hub.local");
    if (u.origin !== "http://hub.local") return fallback;
    u.searchParams.delete("ok");
    u.searchParams.delete("error");
    const q = query(u.searchParams);
    return `${u.pathname}${q ? `?${q}` : ""}`;
  } catch {
    return fallback;
  }
}

/** The same path with some query values changed (null removes one). */
export function withParams(path: string, changes: Record<string, string | null | undefined>): string {
  const u = new URL(path, "http://hub.local");
  for (const [k, v] of Object.entries(changes)) {
    if (v == null || v === "") u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  const q = query(u.searchParams);
  return `${u.pathname}${q ? `?${q}` : ""}`;
}

/** Spaces as %20, like the rest of the hub's redirects (a literal "+" is already %2B). */
const query = (p: URLSearchParams) => p.toString().replace(/\+/g, "%20");

export function flash(to: string, kind: "ok" | "error", msg: string, changes: Record<string, string | null | undefined> = {}): never {
  redirect(withParams(to, { ...changes, [kind]: msg }));
}

export const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "");
export const optStr = (fd: FormData, k: string): string | null => (fd.has(k) ? String(fd.get(k) ?? "") : null);
