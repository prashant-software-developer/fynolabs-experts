"use server";
// Sign-in, sign-up, email verification and passwords. The rules live in src/lib/server/accounts.ts;
// these actions only read the form, call them and sign the person in (Auth.js sets the cookie).
// Nothing here logs a password, a code or a link.
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { signIn, signOut } from "@/auth";
import { getDb } from "@/db/client";
import { accountTokens, type AccountRow } from "@/db/schema";
import { safePath } from "@/lib/auth/account";
import { getAccount, landingFor } from "@/lib/auth/session";
import { accountFromRow } from "@/lib/auth/team-access";
import {
  AUTH_MESSAGES,
  accountByEmail,
  accountById,
  changePassword,
  linkBase,
  linkExpertForAccount,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  signUpExpert,
  VERIFY_MESSAGES,
  type VerifyCode,
} from "@/lib/server/accounts";
import { emailConfigured } from "@/lib/server/email";
import { siteName, siteUrl } from "@/lib/site";

export type AuthFormState = { error?: string; errors?: Record<string, string>; values?: Record<string, string>; ok?: string };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

async function requestIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : h.get("x-real-ip"))?.trim() || null;
}

async function links() {
  return { baseUrl: linkBase(await siteUrl()), siteName: siteName() };
}

/** Where Google / LinkedIn sign-ins come back to: /auth/continue sends team to /admin, experts to /me or back to the job. */
const continueTo = (next: string | null) => `/auth/continue${safePath(next) ? `?next=${encodeURIComponent(safePath(next)!)}` : ""}`;

/** After a sign-in in this action: straight to the right page (a temporary password first, then email verification). */
async function landOn(row: AccountRow | null, next: string | null): Promise<never> {
  if (!row) redirect("/signin");
  const db = await getDb();
  if (row.accountType === "expert" && row.emailVerifiedAt) await linkExpertForAccount(db, row);
  redirect(landingFor(await accountFromRow(db, row), safePath(next)));
}

const SIGN_IN_ERRORS: Record<string, string> = {
  invalid: AUTH_MESSAGES.invalid,
  locked: AUTH_MESSAGES.locked,
  disabled: AUTH_MESSAGES.disabled,
};

/** Runs signIn() (Auth.js sets the session cookie) and turns a refused sign-in into a message; null when signed in. */
async function trySignIn(provider: "password" | "email-code", fields: Record<string, string>, messages: Record<string, string>, fallback: string): Promise<string | null> {
  try {
    await signIn(provider, { ...fields, redirect: false });
  } catch (e) {
    if (e instanceof AuthError) return messages[(e as { code?: string }).code ?? ""] ?? fallback;
    throw e;
  }
  return null;
}

export async function signInWithPassword(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const email = str(fd, "email").trim().slice(0, 254);
  const error = await trySignIn("password", { email, password: str(fd, "password") }, SIGN_IN_ERRORS, AUTH_MESSAGES.invalid);
  if (error) return { error, values: { email } };
  return landOn(await accountByEmail(await getDb(), email), str(fd, "callbackUrl"));
}

export async function signUp(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const values = { name: str(fd, "name").slice(0, 120), email: str(fd, "email").trim().slice(0, 254) };
  const res = await signUpExpert(
    await getDb(),
    { name: values.name, email: values.email, password: str(fd, "password"), password2: str(fd, "password2"), consent: str(fd, "consent"), ip: await requestIp() },
    await links(),
  );
  if (!res.ok) return { error: res.message, errors: res.errors, values };
  const next = safePath(str(fd, "callbackUrl"));
  redirect(`/verify-email?email=${encodeURIComponent(res.email)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
}

export async function verifyWithCode(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const email = str(fd, "email").trim().slice(0, 254);
  const token = str(fd, "token").slice(0, 200);
  const fields: Record<string, string> = token ? { token } : { email, code: str(fd, "code").slice(0, 20) };
  const error = await trySignIn("email-code", fields, VERIFY_MESSAGES as Record<VerifyCode, string>, AUTH_MESSAGES.codeInvalid);
  if (error) return { error, values: { email } };
  const db = await getDb();
  let row = token ? null : await accountByEmail(db, email);
  if (token) {
    const [t] = await db.select({ accountId: accountTokens.accountId }).from(accountTokens).where(eq(accountTokens.tokenHash, createHash("sha256").update(token).digest("hex"))).limit(1);
    row = t ? await accountById(db, t.accountId) : null;
  }
  return landOn(row, str(fd, "next"));
}

export async function sendNewCode(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const email = str(fd, "email").trim().slice(0, 254);
  // After the answer, so how long it takes doesn't say whether the email is waiting for a code.
  if (emailConfigured()) {
    const l = await links();
    after(async () => resendVerification(await getDb(), email, l));
  }
  return { ok: "If this email is waiting to be confirmed, we've sent a new code. It works for 30 minutes.", values: { email } };
}

export async function forgotPassword(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const email = str(fd, "email").trim().slice(0, 254);
  if (!email.includes("@")) return { errors: { email: "Enter the email you sign in with." }, values: { email } };
  // After the answer, so how long it takes doesn't say whether the email has an account.
  if (emailConfigured()) {
    const [l, ip] = [await links(), await requestIp()];
    after(async () => requestPasswordReset(await getDb(), { email, ip }, l));
  }
  return { ok: "If an account exists for that email, we've sent a link to reset the password. It works once, for 30 minutes.", values: { email } };
}

export async function chooseNewPassword(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const password = str(fd, "password");
  const res = await resetPassword(await getDb(), { token: str(fd, "token"), password, password2: str(fd, "password2") });
  if (!res.ok) return { error: res.message, errors: res.errors };
  // Every other session has ended; this one starts fresh with the new password.
  const error = await trySignIn("password", { email: res.account.email, password }, SIGN_IN_ERRORS, AUTH_MESSAGES.invalid);
  if (error) redirect("/signin?ok=password-changed");
  return landOn(await accountById(await getDb(), res.account.id), null);
}

export async function updatePassword(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const account = await getAccount();
  if (!account) redirect("/signin?callbackUrl=/account/password");
  const accountId = account.kind === "team" ? account.user.accountId : account.accountId;
  const email = account.kind === "team" ? account.user.email : account.email;
  const password = str(fd, "password");
  const res = await changePassword(await getDb(), accountId, { current: str(fd, "current"), password, password2: str(fd, "password2") });
  if (!res.ok) return { error: res.message, errors: res.errors };
  // The change ended every session, this one too: sign straight back in with the new password.
  const error = await trySignIn("password", { email, password }, SIGN_IN_ERRORS, AUTH_MESSAGES.invalid);
  if (error) redirect("/signin?ok=password-changed");
  return landOn(await accountById(await getDb(), accountId), str(fd, "next"));
}

export async function signInWithProvider(fd: FormData) {
  const provider = str(fd, "provider");
  if (provider !== "google" && provider !== "linkedin") redirect("/signin");
  await signIn(provider, { redirectTo: continueTo(str(fd, "callbackUrl")) });
}

export async function signOutNow() {
  await signOut({ redirectTo: "/signin?ok=signed-out" });
}
