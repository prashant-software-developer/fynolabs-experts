// npm run admin:create (scripts/create-admin.ts): creates or updates the owner's admin login.
// The team_members row gets role admin; the account is a team account with the email marked
// verified. A password is only ever passed in as plain text to be hashed here, never stored.
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accounts, teamMembers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { cleanText, normalizeEmail } from "@/lib/normalize";
import { logActivity } from "./activity";

export type AdminUpsert = { email: string; created: boolean; memberCreated: boolean; passwordChanged: boolean; mustChangePassword: boolean };

export async function adminAccountExists(db: DB, email: string): Promise<boolean> {
  const e = normalizeEmail(email);
  if (!e) return false;
  const [row] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, e)).limit(1);
  return Boolean(row);
}

/**
 * Makes `email` an active admin with a verified team login. With a password, sets it (a generated
 * one must be changed at the first sign-in) and ends every other session; without one, the
 * existing password stays.
 */
export async function upsertAdminAccount(
  db: DB,
  input: { email: string; name?: string | null; password: string | null; generated: boolean; actor: string },
  now = new Date(),
): Promise<AdminUpsert> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Not a valid email address.");
  const name = cleanText(input.name, 120);
  const actor = { email: input.actor, role: "admin" };

  let [member] = await db.select().from(teamMembers).where(eq(teamMembers.email, email)).limit(1);
  const memberCreated = !member;
  if (!member) {
    [member] = await db.insert(teamMembers).values({ email, name, role: "admin", active: true, createdBy: input.actor, createdAt: now, updatedAt: now }).returning();
    await logActivity(db, { entityType: "team_member", entityId: member.id, actor, action: "created", detail: { to: "admin", via: "admin:create" } });
  } else if (member.role !== "admin" || !member.active || (!member.name && name)) {
    await db.update(teamMembers).set({ role: "admin", active: true, name: member.name ?? name, updatedAt: now }).where(eq(teamMembers.id, member.id));
    await logActivity(db, { entityType: "team_member", entityId: member.id, actor, action: "role_changed", detail: { from: member.role, to: "admin", via: "admin:create" } });
  }

  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const [existing] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  if (!existing) {
    const [row] = await db
      .insert(accounts)
      .values({ email, name, accountType: "team", teamMemberId: member.id, emailVerifiedAt: now, passwordHash, passwordSetAt: passwordHash ? now : null, mustChangePassword: Boolean(passwordHash) && input.generated, createdBy: input.actor, createdAt: now, updatedAt: now })
      .returning({ id: accounts.id });
    await logActivity(db, { entityType: "account", entityId: row.id, actor, action: "created", detail: { type: "team", via: "admin:create" } });
    return { email, created: true, memberCreated, passwordChanged: Boolean(passwordHash), mustChangePassword: Boolean(passwordHash) && input.generated };
  }
  await db
    .update(accounts)
    .set({
      accountType: "team",
      teamMemberId: member.id,
      name: existing.name ?? name,
      emailVerifiedAt: existing.emailVerifiedAt ?? now,
      disabledAt: null,
      ...(passwordHash
        ? { passwordHash, passwordSetAt: now, mustChangePassword: input.generated, failedAttempts: 0, lockedUntil: null, tokenVersion: sql`${accounts.tokenVersion} + 1` }
        : {}),
      updatedAt: now,
    })
    .where(eq(accounts.id, existing.id));
  await logActivity(db, { entityType: "account", entityId: existing.id, actor, action: passwordHash ? "password_reset" : "updated", detail: { type: "team", via: "admin:create" } });
  return { email, created: false, memberCreated, passwordChanged: Boolean(passwordHash), mustChangePassword: passwordHash ? input.generated : existing.mustChangePassword };
}
