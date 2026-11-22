// Auth.js settings shared by the middleware and the server. No database access here (the
// middleware only reads the session cookie); src/auth.ts adds what needs the database.
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";

export type SignInMethod = "google" | "email" | "linkedin";

/** Email magic links only when Resend is set up; LinkedIn only when its app keys are set. */
export function signInMethods(env: Record<string, string | undefined> = process.env): SignInMethod[] {
  const out: SignInMethod[] = ["google"];
  if (env.RESEND_API_KEY && env.EMAIL_FROM) out.push("email");
  if (env.AUTH_LINKEDIN_ID && env.AUTH_LINKEDIN_SECRET) out.push("linkedin");
  return out;
}

export const authConfig = {
  providers: [
    // Reads AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET. Anyone with a verified Google account can sign
    // in; whether they are team or expert is decided by their email (src/lib/auth/account.ts).
    Google({ authorization: { params: { prompt: "select_account" } } }),
    // Reads AUTH_LINKEDIN_ID and AUTH_LINKEDIN_SECRET (LinkedIn "Sign In with LinkedIn using OpenID Connect").
    ...(signInMethods().includes("linkedin") ? [LinkedIn] : []),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/join", error: "/join", verifyRequest: "/join?check=email" },
  trustHost: true,
  callbacks: {
    signIn({ account, profile, user }) {
      if (account?.provider === "google") return profile?.email_verified === true && Boolean(profile.email);
      if (account?.provider === "linkedin") return profile?.email_verified !== false && Boolean(profile?.email);
      // Email links: opening the link proves the address.
      if (account?.provider === "resend") return Boolean(user?.email);
      return false;
    },
    jwt({ token, profile, user }) {
      const email = (profile?.email ?? user?.email ?? token.email ?? "").toString().toLowerCase();
      if (email) token.email = email;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        (session.user as { kind?: string }).kind = typeof token.kind === "string" ? token.kind : undefined;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
