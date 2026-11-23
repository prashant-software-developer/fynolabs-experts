// Auth.js (next-auth v5) for the server. Email + password for everyone (the "password" provider),
// the emailed sign-up code ("email-code"), and Google / LinkedIn when their keys are set. Every
// method lands on the same hub.accounts row. JWT sessions carry the account id, its type, role
// and token_version; each request re-checks them against the database (src/lib/server/accounts.ts),
// so a turned-off account or a changed password ends every other session at once.
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig, type SessionClaims } from "./auth.config";
import type { AccountRow } from "@/db/schema";

/** The answer behind a refused sign-in. Only these codes reach the page: never more detail. */
export class SignInRefused extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

function ipOf(req: Request | undefined): string | null {
  const h = req?.headers;
  const fwd = h?.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : h?.get("x-real-ip"))?.trim() || null;
}

const userFrom = (a: AccountRow) => ({ id: a.id, email: a.email, name: a.name ?? a.email });

async function claimsFor(a: AccountRow): Promise<SessionClaims & { email: string; name: string }> {
  const { teamRoleFor } = await import("@/lib/auth/team-access");
  return {
    aid: a.id,
    email: a.email,
    name: a.name ?? a.email,
    kind: a.accountType === "team" ? "team" : "expert",
    tv: a.tokenVersion,
    role: a.accountType === "team" ? await teamRoleFor(a) : null,
    mcp: a.mustChangePassword,
    ev: Boolean(a.emailVerifiedAt) || a.accountType === "team",
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: { email: {}, password: {} },
      async authorize(c, req) {
        const { getDb } = await import("@/db/client");
        const { passwordSignIn } = await import("@/lib/server/accounts");
        const res = await passwordSignIn(await getDb(), { email: c?.email, password: c?.password, ip: ipOf(req) });
        if (!res.ok) throw new SignInRefused(res.code);
        return userFrom(res.account);
      },
    }),
    Credentials({
      id: "email-code",
      name: "Email code",
      credentials: { email: {}, code: {}, token: {} },
      async authorize(c, req) {
        const { getDb } = await import("@/db/client");
        const { verifyEmail } = await import("@/lib/server/accounts");
        const res = await verifyEmail(await getDb(), { email: c?.email, code: c?.code, token: c?.token, ip: ipOf(req) });
        if (!res.ok) throw new SignInRefused(res.code);
        return userFrom(res.account);
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile, user }) {
      if (account?.type === "credentials") return Boolean(user?.id);
      const verified = account?.provider === "google" ? profile?.email_verified === true : account?.provider === "linkedin" ? profile?.email_verified !== false : false;
      const email = (profile?.email ?? user?.email ?? "").toString();
      if (!verified || !email) return false;
      const { getDb } = await import("@/db/client");
      const { oauthSignIn } = await import("@/lib/server/accounts");
      const res = await oauthSignIn(await getDb(), { email, name: profile?.name ?? user?.name, provider: account!.provider });
      return res.ok;
    },
    async jwt({ token, user, account }) {
      const { getDb } = await import("@/db/client");
      const { accountByEmail, accountById, sessionAccount } = await import("@/lib/server/accounts");
      const db = await getDb();
      if (user && account) {
        // Just signed in: the account row decides everything in the cookie.
        const row = account.type === "credentials" ? await accountById(db, String(user.id)) : await accountByEmail(db, String(user.email ?? ""));
        if (!row || row.disabledAt) return null;
        return { ...token, sub: row.id, ...(await claimsFor(row)) };
      }
      // Every later request: the account must still exist, be on, and have the same token_version.
      const t = token as SessionClaims;
      const row = await sessionAccount(db, t.aid, t.tv);
      if (!row) return null;
      return { ...token, ...(await claimsFor(row)) };
    },
  },
});
