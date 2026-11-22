// Who counts as the team by settings, and the local dev sign-in bypass. Pure functions, safe to
// import anywhere (including middleware). Experts (anyone else) are handled in account.ts.

export type AuthSettings = { domain: string; emails: string[] };

export function authSettings(env: Record<string, string | undefined> = process.env): AuthSettings {
  const domain = (env.ALLOWED_DOMAIN || "xocket.sh").trim().toLowerCase().replace(/^@/, "");
  const emails = (env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
  return { domain, emails };
}

/** Team by settings: "someone@<ALLOWED_DOMAIN>" (exactly that domain, not a subdomain) or a listed address. */
export function isAllowedEmail(email: string | null | undefined, settings: AuthSettings = authSettings()): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(e)) return false;
  if (settings.emails.includes(e)) return true;
  return Boolean(settings.domain) && e.endsWith(`@${settings.domain}`);
}

/**
 * Local development without Google keys: everyone is a fake dev@xocket.sh user (or, through the
 * "Preview as" menu, the demo expert or a signed-out guest).
 * Requires NODE_ENV=development (only `npm run dev` sets that) AND no Google credentials, and is
 * never on for Vercel. Production builds compile this to `false`.
 */
export function devBypassFor(env: Record<string, string | undefined>): boolean {
  if (env.NODE_ENV !== "development") return false;
  if (env.VERCEL || env.VERCEL_ENV) return false;
  return !(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}

export function isDevBypass(): boolean {
  // `process.env.NODE_ENV` is written out literally so Next.js replaces it at build time.
  if (process.env.NODE_ENV !== "development") return false;
  const on = devBypassFor({
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
  });
  const g = globalThis as { __expertHubBypassWarned?: boolean };
  if (on && !g.__expertHubBypassWarned) {
    g.__expertHubBypassWarned = true;
    console.warn("[expert-hub] DEV SIGN-IN BYPASS IS ON: no Google keys set, everyone is dev@xocket.sh. Local development only.");
  }
  return on;
}

export const DEV_USER = { email: "dev@xocket.sh", name: "Dev (local bypass)" } as const;

/** Local development only: "Preview as -> Expert (portal)" signs in as this demo expert (seeded, fictional). */
export const DEV_EXPERT = { email: "demo.expert@example.com", name: "Riya Portaldemo" } as const;
