// Who counts as the team by settings. Pure functions, safe to import anywhere (including
// middleware). Experts (anyone else) are handled in account.ts.

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
