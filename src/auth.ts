// Auth.js (next-auth v5): Google sign-in, limited to the team's domain.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail } from "@/lib/auth/allow";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // Reads AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from the environment.
      // `hd` only pre-selects the team domain in Google's account picker; the real check is below.
      // Left out when ALLOWED_EMAILS lists outside addresses, so those people can pick their account.
      authorization: {
        params: { prompt: "select_account", ...(process.env.ALLOWED_EMAILS ? {} : { hd: process.env.ALLOWED_DOMAIN || "xocket.sh" }) },
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/signin", error: "/signin" },
  trustHost: true,
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      // Google must say the email is verified, and it must be on the allow list.
      return profile?.email_verified === true && isAllowedEmail(profile.email);
    },
    jwt({ token, profile }) {
      if (profile?.email) token.email = profile.email.toLowerCase();
      return token;
    },
  },
});
