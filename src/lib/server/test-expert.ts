// npm run expert:create (scripts/create-test-expert.ts): a test expert login, so the team can try
// the expert side (profile, onboarding, applying, applications) before sign-up email is set up.
// An expert account with the email marked verified, linked to an expert record tagged "test".
//
// Safe by design: never a team email, never a real expert's record or someone else's login (only
// logins this script made are ever changed), never someone deleted on request. A password is only
// passed in as plain text to be hashed here, never stored.
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accounts, experts, type AccountRow } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { cleanText, normalizeEmail } from "@/lib/normalize";
import { accountByEmail, isTeamEmail, linkExpertForAccount } from "./accounts";
import { logActivity } from "./activity";
import { isErasedEmail } from "./erasure";

export const TEST_TAG = "test";
export const TEST_NAME = "Test Expert";
/** accounts.created_by for logins made here: the only existing logins this script may change. */
export const TEST_CREATED_BY = "expert:create";

export type TestExpertCheck = { ok: true; email: string; account: AccountRow | null } | { ok: false; reason: string };

/** Can this email be a test expert login? Says why not, in a sentence. */
export async function checkTestExpert(db: DB, rawEmail: string): Promise<TestExpertCheck> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, reason: "That isn't a valid email address." };
  const account = await accountByEmail(db, email);
  if ((await isTeamEmail(db, email)) || account?.accountType === "team") {
    return { ok: false, reason: `${email} is a team email, so it can only be a team login. Use an address outside the team, e.g. test.expert@example.com.` };
  }
  if (await isErasedEmail(db, email)) return { ok: false, reason: `${email} was deleted on request, and the hub never brings those back. Use another address.` };
  if (account && account.createdBy !== TEST_CREATED_BY) {
    return { ok: false, reason: `${email} already has a login that wasn't made for testing (someone signed up with it). Use another address.` };
  }
  const [found] = await db.select({ tags: experts.tags }).from(experts).where(eq(experts.email, email)).limit(1);
  if (found && !(found.tags ?? []).includes(TEST_TAG)) {
    return { ok: false, reason: `${email} belongs to an expert already in the hub (a real person). Use an address that isn't anyone's record.` };
  }
  return { ok: true, email, account };
}

export type TestExpertResult =
  | { ok: true; email: string; created: boolean; expertId: string; expertName: string; passwordChanged: boolean; mustChangePassword: boolean }
  | { ok: false; reason: string };

/**
 * Creates (or updates) the test expert login and links it to its expert record (named TEST_NAME
 * unless a name is given, tagged "test"). With a password, sets it (a generated one must be changed
 * at the first sign-in) and ends the login's other sessions; without one, the password stays.
 */
export async function upsertTestExpert(
  db: DB,
  input: { email: string; name?: string | null; password: string | null; generated: boolean; actor: string },
  now = new Date(),
): Promise<TestExpertResult> {
  const check = await checkTestExpert(db, input.email);
  if (!check.ok) return check;
  const { email } = check;
  const name = cleanText(input.name, 120) ?? TEST_NAME;
  const actor = { email: input.actor, role: "admin" };
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  let account: AccountRow;
  if (!check.account) {
    if (!passwordHash) return { ok: false, reason: "A new login needs a password." };
    [account] = await db
      .insert(accounts)
      .values({ email, name, accountType: "expert", emailVerifiedAt: now, passwordHash, passwordSetAt: now, mustChangePassword: input.generated, createdBy: TEST_CREATED_BY, createdAt: now, updatedAt: now })
      .returning();
    await logActivity(db, { entityType: "account", entityId: account.id, actor, action: "created", detail: { type: "expert", via: "expert:create", test: true } });
  } else {
    const existing = check.account;
    await db
      .update(accounts)
      .set({
        emailVerifiedAt: existing.emailVerifiedAt ?? now,
        disabledAt: null,
        ...(passwordHash
          ? { passwordHash, passwordSetAt: now, mustChangePassword: input.generated, failedAttempts: 0, lockedUntil: null, tokenVersion: sql`${accounts.tokenVersion} + 1` }
          : {}),
        updatedAt: now,
      })
      .where(eq(accounts.id, existing.id));
    await logActivity(db, { entityType: "account", entityId: existing.id, actor, action: passwordHash ? "password_reset" : "updated", detail: { type: "expert", via: "expert:create", test: true } });
    account = (await accountByEmail(db, email))!;
  }

  const link = await linkExpertForAccount(db, account, now);
  if (!link.ok) return { ok: false, reason: `The login was saved but couldn't be linked to an expert record (${link.reason}).` };
  // The record says plainly that it's a test (name and tag), so it's easy to find and delete.
  const [e] = await db.select({ fullName: experts.fullName, tags: experts.tags }).from(experts).where(eq(experts.id, link.expertId)).limit(1);
  const expertName = link.created ? name : (e?.fullName ?? name);
  await db
    .update(experts)
    .set({ fullName: expertName, tags: [...new Set([...(e?.tags ?? []), TEST_TAG])], updatedAt: now })
    .where(eq(experts.id, link.expertId));
  return {
    ok: true,
    email,
    created: !check.account,
    expertId: link.expertId,
    expertName,
    passwordChanged: Boolean(passwordHash),
    mustChangePassword: passwordHash ? input.generated : account.mustChangePassword,
  };
}
