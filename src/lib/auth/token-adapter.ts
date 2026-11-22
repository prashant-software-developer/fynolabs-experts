// The smallest Auth.js adapter that email sign-in links need. People are identified by email (the
// JWT session), so there is no user or account table: only the one-time link tokens are stored,
// in hub.auth_verification_tokens (Auth.js hashes them before they get here).
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { and, eq } from "drizzle-orm";

const asUser = (u: { email: string; name?: string | null; emailVerified?: Date | null }): AdapterUser => ({
  id: u.email.toLowerCase(),
  email: u.email.toLowerCase(),
  name: u.name ?? null,
  emailVerified: u.emailVerified ?? null,
});

export function tokenAdapter(): Adapter {
  const db = async () => (await import("@/db/client")).getDb();
  const table = async () => (await import("@/db/schema")).authVerificationTokens;
  return {
    async createUser(user) {
      return asUser(user);
    },
    async getUser() {
      return null;
    },
    async getUserByEmail() {
      return null;
    },
    async getUserByAccount() {
      return null;
    },
    async updateUser(user) {
      return asUser({ email: user.email ?? user.id, name: user.name, emailVerified: user.emailVerified });
    },
    async linkAccount() {
      return undefined;
    },
    async createVerificationToken(token) {
      const t = await table();
      await (await db()).insert(t).values({ identifier: token.identifier.toLowerCase(), token: token.token, expires: token.expires });
      return token;
    },
    async useVerificationToken({ identifier, token }) {
      const t = await table();
      const [row] = await (await db())
        .delete(t)
        .where(and(eq(t.identifier, identifier.toLowerCase()), eq(t.token, token)))
        .returning();
      return row ? { identifier: row.identifier, token: row.token, expires: row.expires } : null;
    },
  };
}
