// Auth.js (next-auth v5) for the server: Google for everyone, plus email links (Resend) and
// LinkedIn when configured. The account type (team or expert) is worked out at sign-in and kept in
// the session cookie for the middleware; the server re-checks it on every request.
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { authConfig, signInMethods } from "./auth.config";
import { tokenAdapter } from "@/lib/auth/token-adapter";

const emailLinks = signInMethods().includes("email");

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [...authConfig.providers, ...(emailLinks ? [Resend({ apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM })] : [])],
  // Email links need somewhere to keep the one-time tokens (hub.auth_verification_tokens).
  ...(emailLinks ? { adapter: tokenAdapter() } : {}),
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (params.account && token.email) {
        const { accountKindFor } = await import("@/lib/server/account-kind");
        token.kind = await accountKindFor(String(token.email));
      }
      return token;
    },
  },
});
