// Auth.js settings shared by the middleware and the server. No database access here (the
// middleware only reads the session cookie); src/auth.ts adds the password sign-in and the checks
// that need the database.
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";

export type OAuthMethod = "google" | "linkedin";

/** Google only when its keys are set (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET); LinkedIn the same. */
export function oauthMethods(env: Record<string, string | undefined> = process.env): OAuthMethod[] {
  const out: OAuthMethod[] = [];
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) out.push("google");
  if (env.AUTH_LINKEDIN_ID && env.AUTH_LINKEDIN_SECRET) out.push("linkedin");
  return out;
}

/** What the session cookie carries (signed and encrypted by Auth.js). */
export type SessionClaims = {
  /** hub.accounts.id */
  aid?: string;
  kind?: "team" | "expert";
  /** The account's token_version when this session was issued: a change ends the session. */
  tv?: number;
  role?: string | null;
  /** must_change_password */
  mcp?: boolean;
  /** Email verified (experts can't use the portal before). */
  ev?: boolean;
};

export type SessionUser = { email: string; name?: string | null; accountId: string; kind: "team" | "expert"; tokenVersion: number; mustChangePassword: boolean; verified: boolean };

const methods = oauthMethods();

export const authConfig = {
  providers: [
    // Anyone with a verified Google account can sign in; team or expert is decided by their email.
    ...(methods.includes("google") ? [Google({ authorization: { params: { prompt: "select_account" } } })] : []),
    // "Sign In with LinkedIn using OpenID Connect".
    ...(methods.includes("linkedin") ? [LinkedIn] : []),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/signin", error: "/signin" },
  trustHost: true,
  logger: {
    // A wrong password is an answer, not an error worth logging (and nothing here may log a secret).
    error(e: Error) {
      const name = (e as { type?: string }).type ?? e.name;
      if (name === "CredentialsSignin" || name === "AccessDenied") return;
      console.error(`[auth][error] ${name}: ${e.message.split("\n")[0]}`);
    },
    warn(code: string) {
      if (code !== "debug-enabled") console.warn(`[auth][warn] ${code}`);
    },
  },
  callbacks: {
    jwt({ token }) {
      return token;
    },
    session({ session, token }) {
      const t = token as SessionClaims & { email?: string; name?: string };
      if (session.user && t.aid) {
        const u = session.user as unknown as SessionUser;
        u.email = t.email ?? u.email;
        u.accountId = t.aid;
        u.kind = t.kind === "team" ? "team" : "expert";
        u.tokenVersion = typeof t.tv === "number" ? t.tv : -1;
        u.mustChangePassword = Boolean(t.mcp);
        u.verified = Boolean(t.ev);
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
