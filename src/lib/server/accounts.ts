// Accounts: one row per login (hub.accounts), whatever the method. Email + password (sign-up,
// verification, sign-in with lockout and rate limits, reset, change), Google / LinkedIn, and the
// link from an account to its hub.experts row. Every rule is here, tested in tests/accounts-auth.test.ts.
//
// Never logged or stored: plain passwords, codes and links (only their hashes), and nothing that
// says whether an email has an account (sign-in, sign-up and reset answer the same either way).
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accounts, accountTokens, expertActivities, experts, teamMembers, type AccountRow } from "@/db/schema";
import { isTeamByEnv } from "@/lib/auth/account";
import { hashPassword, needsRehash, passwordMessage, verifyPassword } from "@/lib/auth/password";
import { cleanText, normalizeEmail } from "@/lib/normalize";
import { isErasedEmail } from "./erasure";
import { logActivity, type Actor } from "./activity";
import { brandedEmail, emailConfigured, sendEmail } from "./email";
import { clearAttempts, overLimit, recordAttempt } from "./rate-limit";
import { keyedHash } from "./tokens";

export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;
export const TOKEN_MINUTES = 30;
export const CODE_TRIES = 5;

const SYSTEM: Actor = { email: "sign-in", role: "system" };
const minutesFrom = (now: Date, m: number) => new Date(now.getTime() + m * 60_000);

export const AUTH_MESSAGES = {
  invalid: "Email or password is incorrect.",
  locked: `Too many attempts. Wait ${LOCK_MINUTES} minutes and try again, or reset your password.`,
  disabled: "This account is turned off. Ask your FynoLabs admin.",
  codeInvalid: "That code is wrong or has expired. Check the latest email, or send a new code.",
  codeTooMany: "Too many tries with this code. Send a new code.",
  linkInvalid: "That link is wrong, has expired or was already used. Ask for a new one.",
} as const;

export async function accountByEmail(db: DB, email: string): Promise<AccountRow | null> {
  const e = normalizeEmail(email);
  if (!e) return null;
  const [row] = await db.select().from(accounts).where(eq(accounts.email, e)).limit(1);
  return row ?? null;
}

export async function accountById(db: DB, id: string): Promise<AccountRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return row ?? null;
}

/** Team by settings (ADMIN_EMAILS, @ALLOWED_DOMAIN, ALLOWED_EMAILS) or a row on Team & access. */
export async function isTeamEmail(db: DB, email: string): Promise<boolean> {
  if (isTeamByEnv(email)) return true;
  const [m] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.email, email.toLowerCase())).limit(1);
  return Boolean(m);
}

const isErased = isErasedEmail;

async function bump(db: DB, id: string, set: Partial<typeof accounts.$inferInsert>, now = new Date()) {
  await db
    .update(accounts)
    .set({ ...set, tokenVersion: sql`${accounts.tokenVersion} + 1`, updatedAt: now })
    .where(eq(accounts.id, id));
}

// ---------- Sessions ----------

/** The account behind a session, or null when it is gone, turned off, or its sessions were ended. */
export async function sessionAccount(db: DB, id: string | null | undefined, tokenVersion: unknown): Promise<AccountRow | null> {
  if (!id || typeof tokenVersion !== "number") return null;
  const row = await accountById(db, id);
  if (!row || row.disabledAt || row.tokenVersion !== tokenVersion) return null;
  return row;
}

// ---------- Sign-in with a password ----------

export type SignInCode = "invalid" | "locked" | "disabled";
export type SignInResult = { ok: true; account: AccountRow } | { ok: false; code: SignInCode };

/**
 * Checks an email and password. Unknown emails, accounts without a password and wrong passwords
 * all answer "invalid", after the same scrypt work. Five wrong passwords lock a known account for
 * 15 minutes; unknown emails hit the per-email limit at the same point, so the answers match.
 */
export async function passwordSignIn(
  db: DB,
  input: { email: unknown; password: unknown; ip?: string | null; now?: Date },
  deps: { verify?: typeof verifyPassword } = {},
): Promise<SignInResult> {
  const verify = deps.verify ?? verifyPassword;
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email) ?? String(input.email ?? "").trim().toLowerCase().slice(0, 254);
  const password = typeof input.password === "string" ? input.password.slice(0, 1000) : "";
  const ip = input.ip || "unknown";
  if ((await overLimit(db, "signin_ip", ip, now)) || (email && (await overLimit(db, "signin_email", email, now)))) {
    await verify(password, null);
    return { ok: false, code: "locked" };
  }
  await recordAttempt(db, "signin_ip", ip, now);
  const account = email ? await accountByEmail(db, email) : null;
  const fail = async (code: SignInCode = "invalid"): Promise<SignInResult> => {
    if (email) await recordAttempt(db, "signin_email", email, now);
    return { ok: false, code };
  };
  if (!account || !account.passwordHash || !password) {
    await verify(password, null);
    return fail();
  }
  if (account.lockedUntil && account.lockedUntil > now) {
    await verify(password, account.passwordHash);
    return fail("locked");
  }
  const ok = await verify(password, account.passwordHash);
  if (!ok) {
    const failed = account.failedAttempts + 1;
    const lock = failed >= LOCK_AFTER;
    await db
      .update(accounts)
      .set({ failedAttempts: lock ? 0 : failed, lockedUntil: lock ? minutesFrom(now, LOCK_MINUTES) : account.lockedUntil, updatedAt: now })
      .where(eq(accounts.id, account.id));
    if (lock) await logActivity(db, { entityType: "account", entityId: account.id, actor: SYSTEM, action: "locked", detail: { minutes: LOCK_MINUTES } });
    return fail();
  }
  if (account.disabledAt) return { ok: false, code: "disabled" };
  const set: Partial<typeof accounts.$inferInsert> = { failedAttempts: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now };
  if (needsRehash(account.passwordHash)) set.passwordHash = await hashPassword(password);
  const [fresh] = await db.update(accounts).set(set).where(eq(accounts.id, account.id)).returning();
  await clearAttempts(db, "signin_email", email);
  return { ok: true, account: fresh };
}

// ---------- One-time codes and links ----------

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const codeHashFor = (tokenId: string, code: string) => keyedHash(`verify_code:${tokenId}`, code);
const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function issueToken(db: DB, accountId: string, kind: "verify_email" | "reset_password", now: Date) {
  // A new code or link replaces the old ones.
  await db
    .update(accountTokens)
    .set({ usedAt: now })
    .where(and(eq(accountTokens.accountId, accountId), eq(accountTokens.kind, kind), isNull(accountTokens.usedAt)));
  const token = randomBytes(32).toString("base64url");
  const code = kind === "verify_email" ? String(randomInt(0, 1_000_000)).padStart(6, "0") : null;
  const [row] = await db
    .insert(accountTokens)
    .values({ accountId, kind, tokenHash: sha256(token), expiresAt: minutesFrom(now, TOKEN_MINUTES), createdAt: now })
    .returning({ id: accountTokens.id });
  if (code) await db.update(accountTokens).set({ codeHash: codeHashFor(row.id, code) }).where(eq(accountTokens.id, row.id));
  return { token, code };
}

type Links = { baseUrl: string; siteName: string };

async function sendVerification(db: DB, account: AccountRow, links: Links, now: Date) {
  if (await overLimit(db, "mail_email", account.email, now)) return;
  await recordAttempt(db, "mail_email", account.email, now);
  const { token, code } = await issueToken(db, account.id, "verify_email", now);
  const url = `${links.baseUrl}/verify-email?token=${token}`;
  const body = brandedEmail({
    siteName: links.siteName,
    heading: "Confirm your email",
    paragraphs: [`Enter this code on the ${links.siteName} page to finish signing up. It works for ${TOKEN_MINUTES} minutes.`, "Or open the link below."],
    code: code!,
    button: { label: "Confirm my email", url },
    footer: `If you didn't sign up for ${links.siteName}, ignore this email.`,
  });
  await sendEmail({ to: account.email, subject: `${code} is your ${links.siteName} code`, ...body });
}

async function sendAlreadyHaveAccount(db: DB, email: string, links: Links, now: Date) {
  if (await overLimit(db, "mail_email", email, now)) return;
  await recordAttempt(db, "mail_email", email, now);
  const body = brandedEmail({
    siteName: links.siteName,
    heading: "You already have an account",
    paragraphs: [`Someone (probably you) tried to sign up for ${links.siteName} with this email, which already has an account.`, "Sign in instead. If you forgot your password, you can reset it on the sign-in page."],
    button: { label: "Sign in", url: `${links.baseUrl}/signin` },
    footer: "If this wasn't you, you don't need to do anything.",
  });
  await sendEmail({ to: email, subject: `Your ${links.siteName} account`, ...body });
}

// ---------- Expert sign-up ----------

export type SignUpInput = { name: unknown; email: unknown; password: unknown; password2: unknown; consent: unknown; ip?: string | null; now?: Date };
export type SignUpResult = { ok: true; email: string } | { ok: false; errors: Record<string, string>; message?: string };

export const SIGNUP_TEAM_EMAIL = "This email belongs to the FynoLabs team. Team accounts are set up by an admin: sign in instead.";

/**
 * Expert sign-up with a password. The account starts unverified and sees nothing until the emailed
 * code (or link) proves the address; only then is it linked to an expert record. The answer is the
 * same whether or not the email already has an account (an existing owner gets a "you already
 * have an account" email instead of a code).
 */
export async function signUpExpert(db: DB, input: SignUpInput, links: Links): Promise<SignUpResult> {
  const now = input.now ?? new Date();
  if (!emailConfigured()) return { ok: false, errors: {}, message: "Sign-up with a password isn't open yet." };
  const ip = input.ip || "unknown";
  if (await overLimit(db, "signup_ip", ip, now)) return { ok: false, errors: {}, message: "Too many sign-ups from this connection. Try again in an hour." };
  const errors: Record<string, string> = {};
  const name = cleanText(input.name, 120);
  const email = normalizeEmail(input.email);
  const password = typeof input.password === "string" ? input.password : "";
  if (!name) errors.name = "Your full name is required.";
  if (!email) errors.email = "Enter a valid email address.";
  const pw = passwordMessage(password, email);
  if (pw) errors.password = pw;
  if (!pw && input.password2 !== password) errors.password2 = "The two passwords don't match.";
  if (input.consent !== "yes" && input.consent !== "on" && input.consent !== true) errors.consent = "Tick the box to continue.";
  if (email && !errors.email && (await isTeamEmail(db, email))) errors.email = SIGNUP_TEAM_EMAIL;
  if (Object.keys(errors).length) return { ok: false, errors, message: "Check the highlighted fields." };
  await recordAttempt(db, "signup_ip", ip, now);
  const e = email!;
  // Hashed on every path (even when it isn't kept), so the timing doesn't say whether the email has an account.
  const hash = await hashPassword(password);
  const existing = await accountByEmail(db, e);
  if (existing?.accountType === "team") return { ok: false, errors: { email: SIGNUP_TEAM_EMAIL }, message: "Check the highlighted fields." };
  // People deleted on request aren't signed up again automatically (and we don't say why).
  if (!existing && (await isErased(db, e))) return { ok: true, email: e };
  if (existing && (existing.emailVerifiedAt || existing.disabledAt)) {
    if (!existing.disabledAt) await sendAlreadyHaveAccount(db, e, links, now);
    return { ok: true, email: e };
  }
  let account: AccountRow;
  if (existing) {
    // An earlier sign-up that was never confirmed: nobody proved they own the email, so this one replaces it.
    await bump(db, existing.id, { name, passwordHash: hash, passwordSetAt: now, consentAt: now, failedAttempts: 0, lockedUntil: null }, now);
    account = (await accountById(db, existing.id))!;
  } else {
    const [row] = await db
      .insert(accounts)
      .values({ email: e, name, accountType: "expert", passwordHash: hash, passwordSetAt: now, consentAt: now, createdBy: "sign-up", createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning();
    if (!row) return { ok: true, email: e };
    account = row;
    await logActivity(db, { entityType: "account", entityId: row.id, actor: SYSTEM, action: "signed_up", detail: { method: "password" } });
  }
  await sendVerification(db, account, links, now);
  return { ok: true, email: e };
}

/** "Send a new code" on /verify-email (silent when there's nothing to send). */
export async function resendVerification(db: DB, email: unknown, links: Links, now = new Date()): Promise<void> {
  const account = await accountByEmail(db, String(email ?? ""));
  if (!account || account.emailVerifiedAt || account.disabledAt || account.accountType !== "expert") return;
  await sendVerification(db, account, links, now);
}

export type VerifyCode = "code_invalid" | "code_too_many" | "link_invalid" | "rate_limited";
export type VerifyResult = { ok: true; account: AccountRow } | { ok: false; code: VerifyCode; message: string };
export const VERIFY_MESSAGES: Record<VerifyCode, string> = {
  code_invalid: AUTH_MESSAGES.codeInvalid,
  code_too_many: AUTH_MESSAGES.codeTooMany,
  link_invalid: AUTH_MESSAGES.linkInvalid,
  rate_limited: "Too many tries from this connection. Wait 15 minutes.",
};
const refuse = (code: VerifyCode): VerifyResult => ({ ok: false, code, message: VERIFY_MESSAGES[code] });

/** Checks the 6-digit code for an email, or the link's token. On success the email is verified and the expert record linked. */
export async function verifyEmail(db: DB, input: { email?: unknown; code?: unknown; token?: unknown; ip?: string | null }, now = new Date()): Promise<VerifyResult> {
  const ip = input.ip || "unknown";
  if (await overLimit(db, "verify_ip", ip, now)) return refuse("rate_limited");
  await recordAttempt(db, "verify_ip", ip, now);
  let row: typeof accountTokens.$inferSelect | undefined;
  if (typeof input.token === "string" && input.token) {
    [row] = await db
      .select()
      .from(accountTokens)
      .where(and(eq(accountTokens.tokenHash, sha256(input.token.slice(0, 200))), eq(accountTokens.kind, "verify_email")))
      .limit(1);
    if (!row || row.usedAt || row.expiresAt <= now) return refuse("link_invalid");
  } else {
    const code = String(input.code ?? "").replace(/\D/g, "");
    const account = await accountByEmail(db, String(input.email ?? ""));
    if (account) {
      [row] = await db
        .select()
        .from(accountTokens)
        .where(and(eq(accountTokens.accountId, account.id), eq(accountTokens.kind, "verify_email"), isNull(accountTokens.usedAt)))
        .orderBy(sql`${accountTokens.createdAt} desc`)
        .limit(1);
    }
    if (!row || row.expiresAt <= now || code.length !== 6) return refuse("code_invalid");
    if (row.attempts >= CODE_TRIES) return refuse("code_too_many");
    if (!row.codeHash || !sameHex(row.codeHash, codeHashFor(row.id, code))) {
      await db.update(accountTokens).set({ attempts: row.attempts + 1 }).where(eq(accountTokens.id, row.id));
      return refuse(row.attempts + 1 >= CODE_TRIES ? "code_too_many" : "code_invalid");
    }
  }
  // Single use: only one request can mark it used.
  const [used] = await db
    .update(accountTokens)
    .set({ usedAt: now })
    .where(and(eq(accountTokens.id, row.id), isNull(accountTokens.usedAt)))
    .returning({ id: accountTokens.id });
  if (!used) return refuse("link_invalid");
  const account = await accountById(db, row.accountId);
  if (!account || account.disabledAt) return refuse("link_invalid");
  const verified = await markVerified(db, account, now);
  await logActivity(db, { entityType: "account", entityId: account.id, actor: SYSTEM, action: "email_verified", detail: { via: input.token ? "link" : "code" } });
  return { ok: true, account: verified };
}

async function markVerified(db: DB, account: AccountRow, now: Date): Promise<AccountRow> {
  if (!account.emailVerifiedAt) {
    await db.update(accounts).set({ emailVerifiedAt: now, lastLoginAt: now, updatedAt: now }).where(eq(accounts.id, account.id));
  }
  const fresh = (await accountById(db, account.id))!;
  if (fresh.accountType === "expert") await linkExpertForAccount(db, fresh, now);
  return (await accountById(db, account.id))!;
}

// ---------- The expert record ----------

export type LinkResult = { ok: true; expertId: string; created: boolean } | { ok: false; reason: "unverified" | "erased" | "conflict" };

/**
 * Links a verified expert account to its hub.experts row: the one it's already linked to, else the
 * record with the same email (people imported from the jobs site keep all their data), else a new
 * record. Unverified accounts are never linked, and people deleted on request aren't brought back.
 */
export async function linkExpertForAccount(db: DB, account: AccountRow, now = new Date()): Promise<LinkResult> {
  if (!account.emailVerifiedAt) return { ok: false, reason: "unverified" };
  if (account.expertId) {
    const [e] = await db.select({ id: experts.id }).from(experts).where(eq(experts.id, account.expertId)).limit(1);
    if (e) return { ok: true, expertId: e.id, created: false };
  }
  const email = account.email;
  const [found] = await db.select({ id: experts.id, portalJoinedAt: experts.portalJoinedAt, cvConsent: experts.cvConsent }).from(experts).where(eq(experts.email, email)).limit(1);
  let expertId: string;
  let created = false;
  if (found) {
    const [taken] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.expertId, found.id), ne(accounts.id, account.id))).limit(1);
    if (taken) return { ok: false, reason: "conflict" };
    expertId = found.id;
    if (!found.portalJoinedAt) await db.update(experts).set({ portalJoinedAt: now }).where(eq(experts.id, found.id));
  } else {
    if (await isErased(db, email)) return { ok: false, reason: "erased" };
    const name = cleanText(account.name, 200) && account.name!.toLowerCase() !== email ? cleanText(account.name, 200)! : email.split("@")[0];
    const [row] = await db
      .insert(experts)
      .values({ fullName: name, email, primarySource: "portal", status: "applicant", portalJoinedAt: now, tags: ["portal"], createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning({ id: experts.id });
    if (!row) {
      const [again] = await db.select({ id: experts.id }).from(experts).where(eq(experts.email, email)).limit(1);
      if (!again) return { ok: false, reason: "conflict" };
      expertId = again.id;
    } else {
      expertId = row.id;
      created = true;
      await logActivity(db, { entityType: "expert", entityId: row.id, actor: { email: "expert-portal", role: "expert" }, action: "created", detail: { source: "portal" } });
      await db.insert(expertActivities).values({ expertId: row.id, kind: "system", summary: "Signed up on the expert portal", createdBy: "expert-portal", updatedBy: "expert-portal" });
    }
  }
  await db.update(accounts).set({ expertId, updatedAt: now }).where(eq(accounts.id, account.id));
  // The consent box ticked at sign-up (the same wording as the job forms).
  if (account.consentAt) {
    await db.update(experts).set({ cvConsent: "yes", cvConsentAt: account.consentAt, updatedAt: now }).where(eq(experts.id, expertId));
    await db.update(accounts).set({ consentAt: null }).where(eq(accounts.id, account.id));
    await logActivity(db, { entityType: "expert", entityId: expertId, actor: { email: "expert-portal", role: "expert" }, action: "cv_consent_recorded", detail: { value: "yes", via: "sign-up" } });
  }
  return { ok: true, expertId, created };
}

// ---------- Password reset ----------

/** "Forgot password?": emails a single-use reset link (30 minutes) when the account exists. Always answers the same. */
export async function requestPasswordReset(db: DB, input: { email: unknown; ip?: string | null }, links: Links, now = new Date()): Promise<void> {
  const ip = input.ip || "unknown";
  if (await overLimit(db, "reset_ip", ip, now)) return;
  await recordAttempt(db, "reset_ip", ip, now);
  const account = await accountByEmail(db, String(input.email ?? ""));
  if (!account || account.disabledAt) return;
  if (await overLimit(db, "mail_email", account.email, now)) return;
  await recordAttempt(db, "mail_email", account.email, now);
  const { token } = await issueToken(db, account.id, "reset_password", now);
  const body = brandedEmail({
    siteName: links.siteName,
    heading: "Reset your password",
    paragraphs: [`Open the link to choose a new password. It works once, for ${TOKEN_MINUTES} minutes.`],
    button: { label: "Choose a new password", url: `${links.baseUrl}/reset-password?token=${token}` },
    footer: "If you didn't ask for this, ignore this email: your password stays the same.",
  });
  await sendEmail({ to: account.email, subject: `Reset your ${links.siteName} password`, ...body });
}

/** Is this reset link still good? (The page asks before showing the form.) */
export async function resetTokenValid(db: DB, token: unknown, now = new Date()): Promise<boolean> {
  if (typeof token !== "string" || !token) return false;
  const [row] = await db
    .select({ id: accountTokens.id })
    .from(accountTokens)
    .where(and(eq(accountTokens.tokenHash, sha256(token.slice(0, 200))), eq(accountTokens.kind, "reset_password"), isNull(accountTokens.usedAt), gt(accountTokens.expiresAt, now)))
    .limit(1);
  return Boolean(row);
}

export type PasswordResult = { ok: true; account: AccountRow } | { ok: false; errors: Record<string, string>; message?: string };

/** Sets a new password from a reset link: single use, ends every other session, and verifies the email. */
export async function resetPassword(db: DB, input: { token: unknown; password: unknown; password2: unknown }, now = new Date()): Promise<PasswordResult> {
  const token = typeof input.token === "string" ? input.token.slice(0, 200) : "";
  const [row] = token
    ? await db
        .select()
        .from(accountTokens)
        .where(and(eq(accountTokens.tokenHash, sha256(token)), eq(accountTokens.kind, "reset_password")))
        .limit(1)
    : [];
  if (!row || row.usedAt || row.expiresAt <= now) return { ok: false, errors: {}, message: AUTH_MESSAGES.linkInvalid };
  const account = await accountById(db, row.accountId);
  if (!account || account.disabledAt) return { ok: false, errors: {}, message: AUTH_MESSAGES.linkInvalid };
  const password = typeof input.password === "string" ? input.password : "";
  const pw = passwordMessage(password, account.email);
  if (pw) return { ok: false, errors: { password: pw } };
  if (input.password2 !== password) return { ok: false, errors: { password2: "The two passwords don't match." } };
  const [used] = await db
    .update(accountTokens)
    .set({ usedAt: now })
    .where(and(eq(accountTokens.id, row.id), isNull(accountTokens.usedAt)))
    .returning({ id: accountTokens.id });
  if (!used) return { ok: false, errors: {}, message: AUTH_MESSAGES.linkInvalid };
  await bump(db, account.id, { passwordHash: await hashPassword(password), passwordSetAt: now, mustChangePassword: false, failedAttempts: 0, lockedUntil: null }, now);
  await clearAttempts(db, "signin_email", account.email);
  await logActivity(db, { entityType: "account", entityId: account.id, actor: SYSTEM, action: "password_reset", detail: { via: "email" } });
  // Opening the emailed link proves the address.
  const fresh = await markVerified(db, (await accountById(db, account.id))!, now);
  return { ok: true, account: fresh };
}

// ---------- Change password (signed in) ----------

export async function changePassword(db: DB, accountId: string, input: { current: unknown; password: unknown; password2: unknown }, now = new Date()): Promise<PasswordResult> {
  const account = await accountById(db, accountId);
  if (!account || account.disabledAt) return { ok: false, errors: {}, message: "Sign in again." };
  const current = typeof input.current === "string" ? input.current : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (account.passwordHash && !(await verifyPassword(current, account.passwordHash))) return { ok: false, errors: { current: "That isn't your current password." } };
  const pw = passwordMessage(password, account.email);
  if (pw) return { ok: false, errors: { password: pw } };
  if (account.passwordHash && current === password) return { ok: false, errors: { password: "Choose a password you haven't used here." } };
  if (input.password2 !== password) return { ok: false, errors: { password2: "The two passwords don't match." } };
  await bump(db, account.id, { passwordHash: await hashPassword(password), passwordSetAt: now, mustChangePassword: false, failedAttempts: 0, lockedUntil: null }, now);
  await logActivity(db, { entityType: "account", entityId: account.id, actor: { email: account.email, role: account.accountType }, action: "password_changed" });
  return { ok: true, account: (await accountById(db, account.id))! };
}

// ---------- Google and LinkedIn ----------

export type OAuthResult = { ok: true; account: AccountRow } | { ok: false; reason: "disabled" | "erased" | "invalid" };

/**
 * Google / LinkedIn sign-in (the provider has verified the email). Finds or creates the account for
 * that email, so one person has one account whatever the method. If an unconfirmed password
 * sign-up was waiting on this email, its password goes (nobody proved they owned the address).
 */
export async function oauthSignIn(db: DB, input: { email: unknown; name?: unknown; provider: string }, now = new Date()): Promise<OAuthResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, reason: "invalid" };
  const team = await isTeamEmail(db, email);
  const existing = await accountByEmail(db, email);
  const name = cleanText(input.name, 120);
  if (!existing) {
    if (!team && (await isErased(db, email))) return { ok: false, reason: "erased" };
    const [m] = team ? await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.email, email)).limit(1) : [];
    const [row] = await db
      .insert(accounts)
      .values({ email, name, accountType: team ? "team" : "expert", emailVerifiedAt: now, lastLoginAt: now, teamMemberId: m?.id ?? null, createdBy: input.provider, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning();
    const account = row ?? (await accountByEmail(db, email));
    if (!account) return { ok: false, reason: "invalid" };
    if (row) await logActivity(db, { entityType: "account", entityId: row.id, actor: SYSTEM, action: "signed_up", detail: { method: input.provider } });
    if (account.accountType === "expert") await linkExpertForAccount(db, account, now);
    return { ok: true, account: (await accountById(db, account.id))! };
  }
  if (existing.disabledAt) return { ok: false, reason: "disabled" };
  const set: Partial<typeof accounts.$inferInsert> = { lastLoginAt: now, updatedAt: now };
  if (!existing.name && name) set.name = name;
  if (team && existing.accountType !== "team") set.accountType = "team";
  if (team && !existing.teamMemberId) {
    const [m] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.email, email)).limit(1);
    if (m) set.teamMemberId = m.id;
  }
  if (!existing.emailVerifiedAt) {
    await bump(db, existing.id, { ...set, emailVerifiedAt: now, passwordHash: null, passwordSetAt: null, failedAttempts: 0, lockedUntil: null }, now);
  } else {
    await db.update(accounts).set(set).where(eq(accounts.id, existing.id));
  }
  const fresh = (await accountById(db, existing.id))!;
  if (fresh.accountType === "expert") await linkExpertForAccount(db, fresh, now);
  return { ok: true, account: (await accountById(db, existing.id))! };
}

/** The address emailed links point to: PUBLIC_SITE_URL in production (never the request's Host header there). */
export function linkBase(requestBase: string): string {
  const fixed = (process.env.PUBLIC_SITE_URL || process.env.AUTH_URL || "").trim().replace(/\/+$/, "");
  return fixed || requestBase.replace(/\/+$/, "");
}
