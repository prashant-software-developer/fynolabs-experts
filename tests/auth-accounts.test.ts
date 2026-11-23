// Email + password accounts end to end on PGlite: hashing, the policy, sign-in with lockout and
// rate limits, sign-up and email verification (and what it links), password reset and change,
// Google / LinkedIn, and how every one of them ends other sessions (token_version).
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import { rowsOf, type DB } from "@/db/client";
import { accounts, accountTokens, activity, erasures, experts, teamMembers } from "@/db/schema";
import { GENERATED_ALPHABET, generatePassword, hashPassword, needsRehash, parseHash, passwordProblem, passwordStrength, verifyPassword } from "@/lib/auth/password";
import { accountFromRow } from "@/lib/auth/team-access";
import { emailHash } from "@/lib/normalize";
import {
  AUTH_MESSAGES,
  SIGNUP_TEAM_EMAIL,
  accountByEmail,
  changePassword,
  linkExpertForAccount,
  oauthSignIn,
  passwordSignIn,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  resetTokenValid,
  sessionAccount,
  signUpExpert,
  verifyEmail,
} from "@/lib/server/accounts";
import { testOutbox } from "@/lib/server/email";
import { deleteExpertOnRequest } from "@/lib/server/experts";

let db: DB;
let client: PGlite;
const links = { baseUrl: "https://jobs.example.test", siteName: "FynoLabs" };
const GOOD = "Correct-Horse-Battery-9";
const mins = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
let ipN = 0;
const ip = () => `198.51.100.${++ipN % 250}`;

async function makeAccount(email: string, opts: { password?: string; type?: "team" | "expert"; verified?: boolean } = {}) {
  const [row] = await db
    .insert(accounts)
    .values({ email, name: email.split("@")[0], accountType: opts.type ?? "expert", passwordHash: opts.password ? await hashPassword(opts.password) : null, emailVerifiedAt: opts.verified === false ? null : new Date() })
    .returning();
  return row;
}
const lastMail = (to: string) => [...testOutbox()].reverse().find((m) => m.to === to);
const codeIn = (text: string) => /Your code: (\d{6})/.exec(text)?.[1] ?? null;

beforeAll(async () => {
  ({ db, client } = await openTestDb());
});
afterAll(async () => {
  await client.close();
});
beforeEach(() => {
  process.env.HUB_TEST_MAIL = "memory";
  testOutbox().length = 0;
});

describe("password hashing", () => {
  it("scrypt N=2^15 r=8 p=1 with a random 16-byte salt, stored as a versioned string", async () => {
    const h = await hashPassword(GOOD);
    expect(h).toMatch(/^scrypt\$1\$15\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(parseHash(h)?.salt.length).toBe(16);
    expect(h).not.toContain(GOOD);
    expect(await hashPassword(GOOD)).not.toBe(h); // a fresh salt every time
    expect(await verifyPassword(GOOD, h)).toBe(true);
    expect(await verifyPassword(`${GOOD}x`, h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
    expect(needsRehash(h)).toBe(false);
  });

  it("reads older parameters (and asks for a re-hash), never matches a broken or missing hash", async () => {
    const salt = randomBytes(16);
    const key = scryptSync(GOOD, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
    const old = ["scrypt", "1", "14", "8", "1", salt.toString("base64url"), key.toString("base64url")].join("$");
    expect(await verifyPassword(GOOD, old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
    for (const bad of [null, "", "plain-text", "bcrypt$1$x", "scrypt$2$15$8$1$a$b", old.replace("$14$", "$99$")]) expect(await verifyPassword(GOOD, bad)).toBe(false);
  });
});

describe("password rules", () => {
  it("at least 10 characters, not the email, not a common password", () => {
    expect(passwordProblem("short", null)).toBe("too_short");
    expect(passwordProblem("asha.k@example.org", "asha.k@example.org")).toBe("is_email");
    expect(passwordProblem("asha.k.example", "asha.k@example.org")).toBeNull();
    expect(passwordProblem("ashakumar1", "ashakumar1@example.org")).toBe("is_email");
    for (const p of ["password123", "Password123!", "qwerty12345", "1234567890", "aaaaaaaaaaaa", "fynolabs2026", "Welcome@2026", "iloveyou99"]) expect(passwordProblem(p, null), p).toBe("common");
    for (const p of [GOOD, "my cat eats paper", "Nimbus-Quokka-71"]) expect(passwordProblem(p, "someone@example.org"), p).toBeNull();
    expect(passwordStrength("").label).toBe("");
    expect(passwordStrength("password123").score).toBe(0);
    expect(passwordStrength("Correct-Horse-Battery-9").score).toBe(3);
  });

  it("generated passwords: 20 characters, every class, policy-compliant, safe to type in cmd and PowerShell", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[@#\-_+=.?]/);
      expect(passwordProblem(p, "prashant@xocket.sh")).toBeNull();
      expect([...p].every((c) => GENERATED_ALPHABET.includes(c))).toBe(true);
      expect(p).not.toMatch(/[\s"'`^&|<>%!\\0O1lI]/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});

describe("sign-in with a password", () => {
  it("one generic answer for a wrong password, an unknown email and an account without a password", async () => {
    await makeAccount("lena@example.org", { password: GOOD });
    await makeAccount("google.only@example.org");
    const wrong = await passwordSignIn(db, { email: "lena@example.org", password: "Wrong-password-1", ip: ip() });
    const unknown = await passwordSignIn(db, { email: "nobody@example.org", password: GOOD, ip: ip() });
    const noPassword = await passwordSignIn(db, { email: "google.only@example.org", password: GOOD, ip: ip() });
    expect(wrong).toEqual({ ok: false, code: "invalid" });
    expect(unknown).toEqual(wrong);
    expect(noPassword).toEqual(wrong);
    expect(AUTH_MESSAGES.invalid).toBe("Email or password is incorrect.");
    const ok = await passwordSignIn(db, { email: " LENA@Example.org ", password: GOOD, ip: ip() });
    expect(ok.ok && ok.account.email).toBe("lena@example.org");
    expect(ok.ok && ok.account.lastLoginAt).toBeInstanceOf(Date);
  });

  it("unknown emails do the same scrypt work as known ones (a dummy hash), so timing doesn't tell", async () => {
    const verify = vi.fn(verifyPassword);
    await passwordSignIn(db, { email: "ghost@example.org", password: GOOD, ip: ip() }, { verify });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][1]).toBeNull(); // verifyPassword then checks against the dummy hash
    const known = vi.fn(verifyPassword);
    await passwordSignIn(db, { email: "lena@example.org", password: "Wrong-password-2", ip: ip() }, { verify: known });
    expect(known).toHaveBeenCalledTimes(1);
    expect(String(known.mock.calls[0][1])).toMatch(/^scrypt\$1\$/);
    // Both paths take real scrypt time (tens of milliseconds), not a quick "no such user".
    const t0 = performance.now();
    await passwordSignIn(db, { email: "ghost2@example.org", password: GOOD, ip: ip() });
    const tUnknown = performance.now() - t0;
    const t1 = performance.now();
    await passwordSignIn(db, { email: "lena@example.org", password: "Wrong-password-3", ip: ip() });
    const tKnown = performance.now() - t1;
    expect(tUnknown).toBeGreaterThan(tKnown / 4);
  });

  it("locks an account for 15 minutes after 5 wrong passwords, then lets the right one in", async () => {
    const t = new Date("2026-11-23T10:00:00Z");
    await makeAccount("locky@example.org", { password: GOOD });
    for (let i = 0; i < 5; i++) expect(await passwordSignIn(db, { email: "locky@example.org", password: `nope-nope-${i}`, ip: ip(), now: mins(t, i) })).toEqual({ ok: false, code: "invalid" });
    const row = (await accountByEmail(db, "locky@example.org"))!;
    expect(row.lockedUntil?.toISOString()).toBe(mins(t, 4 + 15).toISOString());
    // Even the right password is refused while locked.
    expect(await passwordSignIn(db, { email: "locky@example.org", password: GOOD, ip: ip(), now: mins(t, 6) })).toEqual({ ok: false, code: "locked" });
    expect(await passwordSignIn(db, { email: "locky@example.org", password: GOOD, ip: ip(), now: mins(t, 10) })).toEqual({ ok: false, code: "locked" });
    const later = await passwordSignIn(db, { email: "locky@example.org", password: GOOD, ip: ip(), now: mins(t, 4 + 15 + 1) });
    expect(later.ok).toBe(true);
    expect((await accountByEmail(db, "locky@example.org"))!).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    const [log] = await db.select().from(activity).where(eq(activity.action, "locked"));
    expect(log.detail).toEqual({ minutes: 15 });
  });

  it("an unknown email gets the same 'too many attempts' at the same point (per-email limit), and one address can't hammer (per-IP limit)", async () => {
    const t = new Date("2026-11-23T12:00:00Z");
    for (let i = 0; i < 5; i++) expect(await passwordSignIn(db, { email: "nope@example.org", password: `x-x-x-x-x-${i}`, ip: ip(), now: mins(t, i) })).toEqual({ ok: false, code: "invalid" });
    expect(await passwordSignIn(db, { email: "nope@example.org", password: GOOD, ip: ip(), now: mins(t, 6) })).toEqual({ ok: false, code: "locked" });
    const one = "203.0.113.9";
    for (let i = 0; i < 30; i++) await passwordSignIn(db, { email: `spray${i}@example.org`, password: "whatever-123", ip: one, now: t });
    expect(await passwordSignIn(db, { email: "lena@example.org", password: GOOD, ip: one, now: t })).toEqual({ ok: false, code: "locked" });
  });

  it("a turned-off account says so only to someone with the right password", async () => {
    const row = await makeAccount("off@example.org", { password: GOOD });
    await db.update(accounts).set({ disabledAt: new Date() }).where(eq(accounts.id, row.id));
    expect(await passwordSignIn(db, { email: "off@example.org", password: "wrong-wrong-1", ip: ip() })).toEqual({ ok: false, code: "invalid" });
    expect(await passwordSignIn(db, { email: "off@example.org", password: GOOD, ip: ip() })).toEqual({ ok: false, code: "disabled" });
  });
});

describe("sessions end when the password changes, is reset, or the account is turned off", () => {
  it("token_version", async () => {
    const row = await makeAccount("tv@example.org", { password: GOOD });
    expect(await sessionAccount(db, row.id, row.tokenVersion)).not.toBeNull();
    expect(await sessionAccount(db, row.id, row.tokenVersion + 1)).toBeNull();
    expect(await sessionAccount(db, row.id, undefined)).toBeNull();
    expect(await sessionAccount(db, "not-a-uuid", 0)).toBeNull();

    const changed = await changePassword(db, row.id, { current: GOOD, password: "Another-Good-Pass-7", password2: "Another-Good-Pass-7" });
    expect(changed.ok).toBe(true);
    expect(await sessionAccount(db, row.id, row.tokenVersion)).toBeNull();
    const v1 = (await accountByEmail(db, "tv@example.org"))!.tokenVersion;
    expect(v1).toBe(row.tokenVersion + 1);

    await requestPasswordReset(db, { email: "tv@example.org", ip: ip() }, links);
    const token = /token=([A-Za-z0-9_-]+)/.exec(lastMail("tv@example.org")!.text)![1];
    expect((await resetPassword(db, { token, password: "Third-Good-Pass-8", password2: "Third-Good-Pass-8" })).ok).toBe(true);
    expect(await sessionAccount(db, row.id, v1)).toBeNull();
    const v2 = (await accountByEmail(db, "tv@example.org"))!.tokenVersion;

    await db.update(accounts).set({ disabledAt: new Date() }).where(eq(accounts.id, row.id));
    expect(await sessionAccount(db, row.id, v2)).toBeNull();
  });

  it("change password: needs the current one, follows the rules, and a new password must differ", async () => {
    const row = await makeAccount("ch@example.org", { password: GOOD });
    expect(await changePassword(db, row.id, { current: "wrong", password: "Fine-Password-22", password2: "Fine-Password-22" })).toMatchObject({ ok: false, errors: { current: expect.any(String) } });
    expect(await changePassword(db, row.id, { current: GOOD, password: "password123", password2: "password123" })).toMatchObject({ ok: false, errors: { password: expect.stringMatching(/common/) } });
    expect(await changePassword(db, row.id, { current: GOOD, password: GOOD, password2: GOOD })).toMatchObject({ ok: false, errors: { password: expect.any(String) } });
    expect(await changePassword(db, row.id, { current: GOOD, password: "Fine-Password-22", password2: "Fine-Password-23" })).toMatchObject({ ok: false, errors: { password2: expect.any(String) } });
    await db.update(accounts).set({ mustChangePassword: true }).where(eq(accounts.id, row.id));
    const ok = await changePassword(db, row.id, { current: GOOD, password: "Fine-Password-22", password2: "Fine-Password-22" });
    expect(ok.ok && ok.account.mustChangePassword).toBe(false);
  });
});

describe("expert sign-up and email verification", () => {
  it("is switched off without Resend or SMTP", async () => {
    delete process.env.HUB_TEST_MAIL;
    const res = await signUpExpert(db, { name: "No Mail", email: "nomail@example.org", password: GOOD, password2: GOOD, consent: "yes", ip: ip() }, links);
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/isn't open yet/) });
    expect(await accountByEmail(db, "nomail@example.org")).toBeNull();
  });

  it("checks every field, and refuses team emails (team accounts are set up by an admin)", async () => {
    const bad = await signUpExpert(db, { name: "", email: "x", password: "short", password2: "", consent: "", ip: ip() }, links);
    expect(bad).toMatchObject({ ok: false, errors: { name: expect.any(String), email: expect.any(String), password: expect.any(String), consent: expect.any(String) } });
    const mismatch = await signUpExpert(db, { name: "M", email: "m@example.org", password: GOOD, password2: `${GOOD}!`, consent: "yes", ip: ip() }, links);
    expect(mismatch).toMatchObject({ ok: false, errors: { password2: expect.any(String) } });
    expect(await signUpExpert(db, { name: "Team", email: "someone@xocket.sh", password: GOOD, password2: GOOD, consent: "yes", ip: ip() }, links)).toMatchObject({ ok: false, errors: { email: SIGNUP_TEAM_EMAIL } });
    await db.insert(teamMembers).values({ email: "contractor.team@gmail.com", role: "viewer" });
    expect(await signUpExpert(db, { name: "C", email: "Contractor.Team@gmail.com", password: GOOD, password2: GOOD, consent: "yes", ip: ip() }, links)).toMatchObject({ ok: false, errors: { email: SIGNUP_TEAM_EMAIL } });
    expect(await accountByEmail(db, "contractor.team@gmail.com")).toBeNull();
    expect(testOutbox()).toHaveLength(0);
  });

  it("an imported expert's record is only linked once the email is verified, and keeps all their data", async () => {
    const [imported] = await db
      .insert(experts)
      .values({ fullName: "Imported Person", email: "imported@example.org", skills: ["python", "statistics"], headline: "Statistician", primarySource: "jobs_site", status: "bench", notes: "Team note" })
      .returning();
    const [other] = await db.insert(experts).values({ fullName: "Someone Else", email: "else@example.org", primarySource: "manual" }).returning();
    const res = await signUpExpert(db, { name: "Imp Person", email: "Imported@Example.org", password: GOOD, password2: GOOD, consent: "yes", ip: ip() }, links);
    expect(res).toEqual({ ok: true, email: "imported@example.org" });
    const pending = (await accountByEmail(db, "imported@example.org"))!;
    expect(pending).toMatchObject({ accountType: "expert", emailVerifiedAt: null, expertId: null });
    // Not verified: no profile, whatever asks.
    expect(await linkExpertForAccount(db, pending)).toEqual({ ok: false, reason: "unverified" });
    expect(await accountFromRow(db, pending)).toMatchObject({ kind: "expert", verified: false, expertId: null });
    // Signing in works, but only to finish verifying.
    expect((await passwordSignIn(db, { email: "imported@example.org", password: GOOD, ip: ip() })).ok).toBe(true);

    const mail = lastMail("imported@example.org")!;
    const code = codeIn(mail.text)!;
    expect(mail.subject).toContain(code);
    expect(mail.text).toContain("https://jobs.example.test/verify-email?token=");
    const [tok] = await db.select().from(accountTokens).where(eq(accountTokens.accountId, pending.id));
    expect(tok.codeHash).not.toContain(code);
    expect(tok.expiresAt.getTime() - tok.createdAt.getTime()).toBe(30 * 60_000);

    const wrong = code === "000000" ? "111111" : "000000";
    expect(await verifyEmail(db, { email: "imported@example.org", code: wrong, ip: ip() })).toMatchObject({ ok: false, code: "code_invalid" });
    const ok = await verifyEmail(db, { email: "imported@example.org", code, ip: ip() });
    expect(ok.ok).toBe(true);
    const acc = (await accountByEmail(db, "imported@example.org"))!;
    expect(acc.emailVerifiedAt).toBeInstanceOf(Date);
    expect(acc.expertId).toBe(imported.id);
    const [after] = await db.select().from(experts).where(eq(experts.id, imported.id));
    expect(after).toMatchObject({ fullName: "Imported Person", skills: ["python", "statistics"], headline: "Statistician", status: "bench", notes: "Team note", primarySource: "jobs_site", cvConsent: "yes" });
    expect(after.portalJoinedAt).toBeInstanceOf(Date);
    const [untouched] = await db.select().from(experts).where(eq(experts.id, other.id));
    expect(untouched.portalJoinedAt).toBeNull();
    expect(await db.$count(accounts, eq(accounts.expertId, other.id))).toBe(0);
    // The code is single use.
    expect((await verifyEmail(db, { email: "imported@example.org", code, ip: ip() })).ok).toBe(false);
  });

  it("a new email gets a new expert record; the emailed link works once; 5 wrong codes use a code up", async () => {
    await signUpExpert(db, { name: "Fresh Person", email: "fresh@example.org", password: GOOD, password2: GOOD, consent: "yes", ip: ip() }, links);
    const token = /token=([A-Za-z0-9_-]+)/.exec(lastMail("fresh@example.org")!.text)![1];
    const viaLink = await verifyEmail(db, { token, ip: ip() });
    expect(viaLink.ok).toBe(true);
    const [e] = await db.select().from(experts).where(eq(experts.email, "fresh@example.org"));
    expect(e).toMatchObject({ fullName: "Fresh Person", primarySource: "portal", status: "applicant", cvConsent: "yes" });
    expect(await verifyEmail(db, { token, ip: ip() })).toMatchObject({ ok: false, code: "link_invalid" });

    await signUpExpert(db, { name: "Tries", email: "tries@example.org", password: GOOD, password2: GOOD, consent: "yes", ip: ip() }, links);
    const code = codeIn(lastMail("tries@example.org")!.text)!;
    const wrong = code === "999999" ? "888888" : "999999";
    for (let i = 0; i < 4; i++) expect((await verifyEmail(db, { email: "tries@example.org", code: wrong, ip: ip() })).ok).toBe(false);
    expect(await verifyEmail(db, { email: "tries@example.org", code: wrong, ip: ip() })).toMatchObject({ code: "code_too_many" });
    expect(await verifyEmail(db, { email: "tries@example.org", code, ip: ip() })).toMatchObject({ ok: false, code: "code_too_many" });
    // A new code works.
    await resendVerification(db, "tries@example.org", links);
    const fresh = codeIn(lastMail("tries@example.org")!.text)!;
    expect((await verifyEmail(db, { email: "tries@example.org", code: fresh, ip: ip() })).ok).toBe(true);
  });

  it("codes expire after 30 minutes", async () => {
    const t = new Date("2026-11-23T08:00:00Z");
    await signUpExpert(db, { name: "Late", email: "late@example.org", password: GOOD, password2: GOOD, consent: "yes", ip: ip(), now: t }, links);
    const code = codeIn(lastMail("late@example.org")!.text)!;
    expect(await verifyEmail(db, { email: "late@example.org", code, ip: ip() }, mins(t, 31))).toMatchObject({ ok: false, code: "code_invalid" });
  });

  it("doesn't say whether an email has an account: an existing owner gets a 'you already have an account' email instead", async () => {
    await makeAccount("owner@example.org", { password: GOOD });
    const res = await signUpExpert(db, { name: "Someone", email: "owner@example.org", password: "Other-Password-55", password2: "Other-Password-55", consent: "yes", ip: ip() }, links);
    expect(res).toEqual({ ok: true, email: "owner@example.org" });
    expect(lastMail("owner@example.org")!.subject).toMatch(/Your FynoLabs account/);
    expect(codeIn(lastMail("owner@example.org")!.text)).toBeNull();
    expect(await verifyPassword(GOOD, (await accountByEmail(db, "owner@example.org"))!.passwordHash)).toBe(true);
    // An unconfirmed sign-up is replaced by the next one (nobody proved they own the email).
    await signUpExpert(db, { name: "First", email: "squat@example.org", password: GOOD, password2: GOOD, consent: "yes", ip: ip() }, links);
    const first = (await accountByEmail(db, "squat@example.org"))!;
    await signUpExpert(db, { name: "Real Owner", email: "squat@example.org", password: "Real-Owners-Pass-1", password2: "Real-Owners-Pass-1", consent: "yes", ip: ip() }, links);
    const second = (await accountByEmail(db, "squat@example.org"))!;
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Real Owner");
    expect(second.tokenVersion).toBe(first.tokenVersion + 1);
    expect(await verifyPassword(GOOD, second.passwordHash)).toBe(false);
    // People deleted on request aren't signed up again (and nothing says why).
    await db.insert(erasures).values({ emailSha256: emailHash("gone@example.org"), actorEmail: "admin@xocket.sh" });
    expect(await signUpExpert(db, { name: "Gone", email: "gone@example.org", password: GOOD, password2: GOOD, consent: "yes", ip: ip() }, links)).toEqual({ ok: true, email: "gone@example.org" });
    expect(await accountByEmail(db, "gone@example.org")).toBeNull();
    expect(lastMail("gone@example.org")).toBeUndefined();
  });
});

describe("password reset by email", () => {
  it("single use, 30 minutes, stored hashed, and silent for unknown emails", async () => {
    const owner = await makeAccount("reset@example.org", { password: GOOD });
    await requestPasswordReset(db, { email: "nobody-here@example.org", ip: ip() }, links);
    expect(testOutbox()).toHaveLength(0);
    await requestPasswordReset(db, { email: "Reset@Example.org", ip: ip() }, links);
    const mail = lastMail("reset@example.org")!;
    const token = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(mail.text)![1];
    const [row] = await db.select().from(accountTokens).where(eq(accountTokens.accountId, owner.id));
    expect(row.kind).toBe("reset_password");
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(row.tokenHash).not.toContain(token);
    const all = rowsOf<{ t: string }>(await db.execute(sql`select row_to_json(t)::text as t from hub.account_tokens t`));
    expect(all.some((r) => r.t.includes(token))).toBe(false);
    expect(await resetTokenValid(db, token)).toBe(true);
    expect(await resetTokenValid(db, token, mins(new Date(), 31))).toBe(false);
    expect(await resetPassword(db, { token, password: "password123", password2: "password123" })).toMatchObject({ ok: false, errors: { password: expect.any(String) } });
    expect(await resetPassword(db, { token, password: "Brand-New-Pass-42", password2: "Brand-New-Pass-42" }, mins(new Date(), 31))).toMatchObject({ ok: false, message: AUTH_MESSAGES.linkInvalid });
    expect((await resetPassword(db, { token, password: "Brand-New-Pass-42", password2: "Brand-New-Pass-42" })).ok).toBe(true);
    expect(await resetPassword(db, { token, password: "Brand-New-Pass-43", password2: "Brand-New-Pass-43" })).toMatchObject({ ok: false, message: AUTH_MESSAGES.linkInvalid });
    expect((await passwordSignIn(db, { email: "reset@example.org", password: "Brand-New-Pass-42", ip: ip() })).ok).toBe(true);
    expect((await passwordSignIn(db, { email: "reset@example.org", password: GOOD, ip: ip() })).ok).toBe(false);
    // A newer link replaces an older one.
    await requestPasswordReset(db, { email: "reset@example.org", ip: ip() }, links);
    const a = /token=([A-Za-z0-9_-]+)/.exec(lastMail("reset@example.org")!.text)![1];
    await requestPasswordReset(db, { email: "reset@example.org", ip: ip() }, links);
    expect(await resetTokenValid(db, a)).toBe(false);
  });
});

describe("Google and LinkedIn use the same account", () => {
  it("one person, one account; an unconfirmed password sign-up loses its password; team emails become team; deleted people can't come back", async () => {
    await signUpExpert(db, { name: "Pending", email: "both@example.org", password: GOOD, password2: GOOD, consent: "yes", ip: ip() }, links);
    const before = (await accountByEmail(db, "both@example.org"))!;
    const res = await oauthSignIn(db, { email: "Both@Example.org", name: "Both Ways", provider: "google" });
    expect(res.ok && res.account.id).toBe(before.id);
    const after = (await accountByEmail(db, "both@example.org"))!;
    expect(after).toMatchObject({ passwordHash: null, tokenVersion: before.tokenVersion + 1 });
    expect(after.emailVerifiedAt).toBeInstanceOf(Date);
    expect(after.expertId).not.toBeNull();
    const team = await oauthSignIn(db, { email: "member@xocket.sh", name: "Member", provider: "google" });
    expect(team.ok && team.account.accountType).toBe("team");
    await db.insert(erasures).values({ emailSha256: emailHash("erased.oauth@example.org"), actorEmail: "admin@xocket.sh" });
    expect(await oauthSignIn(db, { email: "erased.oauth@example.org", provider: "linkedin" })).toEqual({ ok: false, reason: "erased" });
  });

  it("delete on request removes the expert's login too", async () => {
    const acc = (await accountByEmail(db, "fresh@example.org"))!;
    expect(acc.expertId).not.toBeNull();
    await deleteExpertOnRequest(db, acc.expertId!, "admin@xocket.sh");
    expect(await accountByEmail(db, "fresh@example.org")).toBeNull();
  });
});
