// Small helpers for plain form actions: where to go back to, with a message (?ok= / ?error=).

export const withFlash = (path: string, kind: "ok" | "error", msg: string) => {
  const clean = path.replace(/([?&])(ok|error)=[^&]*/g, "$1").replace(/[?&]+$/, "").replace(/\?&/, "?");
  return `${clean}${clean.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`;
};

/** A same-site path from the form (returnTo), or the fallback. */
export function returnPath(fd: FormData, fallback: string): string {
  const p = String(fd.get("returnTo") ?? "");
  return p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\") ? p : fallback;
}

export const ids = (fd: FormData, key = "ids") => fd.getAll(key).map(String).filter(Boolean);
export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
