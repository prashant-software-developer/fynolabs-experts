// Team & access (hub.team_members and their logins in hub.accounts). Admin only: every function
// checks team.manage itself, so a forbidden call fails here even if a page or action forgot. Every
// change is logged. Temporary passwords are returned once, to be shown to the admin, and only
// their hash is stored.
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accounts, partners, teamMembers, type TeamMember } from "@/db/schema";
import { generatePassword, hashPassword } from "@/lib/auth/password";
import { ensure, isRole, ROLE_LABELS, type Role, type Subject } from "@/lib/auth/permissions";
import { adminEmails } from "@/lib/auth/roles";
import { cleanText, normalizeEmail } from "@/lib/normalize";
import { logActivity } from "./activity";
import { isUuid } from "./experts";

export type TeamActor = Subject;
export type TeamResult = { ok: true; id: string; changed: boolean; warning?: string; tempPassword?: string; note?: string } | { ok: false; reason: string };

export type TeamRow = TeamMember & {
  login: { lastLoginAt: Date | null; hasPassword: boolean; mustChangePassword: boolean; disabled: boolean; lockedUntil: Date | null } | null;
};

export async function listTeam(db: DB): Promise<TeamRow[]> {
  const rows = await db
    .select({
      member: teamMembers,
      accountId: accounts.id,
      lastLoginAt: accounts.lastLoginAt,
      passwordHash: accounts.passwordHash,
      mustChangePassword: accounts.mustChangePassword,
      disabledAt: accounts.disabledAt,
      lockedUntil: accounts.lockedUntil,
    })
    .from(teamMembers)
    .leftJoin(accounts, eq(accounts.email, teamMembers.email))
    .orderBy(desc(teamMembers.active), asc(teamMembers.email));
  return rows.map((r) => ({
    ...r.member,
    login: r.accountId
      ? { lastLoginAt: r.lastLoginAt, hasPassword: Boolean(r.passwordHash), mustChangePassword: Boolean(r.mustChangePassword), disabled: Boolean(r.disabledAt), lockedUntil: r.lockedUntil }
      : null,
  }));
}

/**
 * Gives a team member a new temporary password (they must change it at their next sign-in) and ends
 * their sessions. Creates their login if they don't have one yet; an expert login with the same
 * email becomes a team login. Returns the password once; only its hash is stored.
 */
async function setTemporaryPassword(db: DB, input: { email: string; name: string | null; memberId: string; createdBy: string }, now = new Date()): Promise<{ password: string; created: boolean; converted: boolean; accountId: string }> {
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(accounts).where(eq(accounts.email, input.email)).limit(1);
  if (!existing) {
    const [row] = await db
      .insert(accounts)
      .values({ email: input.email, name: input.name, accountType: "team", passwordHash, passwordSetAt: now, mustChangePassword: true, teamMemberId: input.memberId, createdBy: input.createdBy, createdAt: now, updatedAt: now })
      .returning({ id: accounts.id });
    return { password, created: true, converted: false, accountId: row.id };
  }
  await db
    .update(accounts)
    .set({
      accountType: "team",
      teamMemberId: input.memberId,
      name: existing.name ?? input.name,
      passwordHash,
      passwordSetAt: now,
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      tokenVersion: sql`${accounts.tokenVersion} + 1`,
      updatedAt: now,
    })
    .where(eq(accounts.id, existing.id));
  return { password, created: false, converted: existing.accountType !== "team", accountId: existing.id };
}

/** Only real partner ids are kept (pod-lead scope). */
export async function validPartnerIds(db: DB, ids: unknown[]): Promise<string[]> {
  const clean = [...new Set(ids.map(String).filter(isUuid))];
  if (!clean.length) return [];
  const rows = await db.select({ id: partners.id }).from(partners).where(inArray(partners.id, clean));
  const ok = new Set(rows.map((r) => r.id));
  return clean.filter((id) => ok.has(id));
}

/**
 * Pure rule check for a role or active change. Admins can't demote or deactivate themselves, and
 * nobody can remove the last admin (ADMIN_EMAILS count as admins and can't be removed here).
 */
export function checkMemberChange(input: {
  actorEmail: string;
  target: { email: string; role: string; active: boolean };
  next: { role: string; active: boolean };
  /** Admins other than the target: active admin rows plus ADMIN_EMAILS. */
  otherAdmins: number;
  envAdmins?: readonly string[];
}): string | null {
  const { target, next } = input;
  const changing = target.role !== next.role || target.active !== next.active;
  if (!changing) return null;
  const self = target.email === input.actorEmail.toLowerCase();
  const envAdmin = (input.envAdmins ?? []).includes(target.email);
  const wasAdmin = envAdmin || (target.role === "admin" && target.active);
  const staysAdmin = envAdmin || (next.role === "admin" && next.active);
  if (self && !next.active) return "You can't deactivate yourself. Ask another admin.";
  if (self && target.role !== next.role) return "You can't change your own role. Ask another admin.";
  if (wasAdmin && !staysAdmin && input.otherAdmins < 1) return "This is the last admin. Make someone else an admin first.";
  return null;
}

async function otherAdminCount(db: DB, targetEmail: string): Promise<number> {
  const rows = await db
    .select({ email: teamMembers.email })
    .from(teamMembers)
    .where(and(eq(teamMembers.role, "admin"), eq(teamMembers.active, true), ne(teamMembers.email, targetEmail)));
  const set = new Set(rows.map((r) => r.email));
  for (const e of adminEmails()) if (e !== targetEmail) set.add(e);
  return set.size;
}

export async function addMember(db: DB, actor: TeamActor, input: { email: unknown; name?: unknown; role: unknown; partnerIds?: unknown[] }): Promise<TeamResult> {
  ensure(actor, "team.manage");
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, reason: "Type a full email address." };
  if (!isRole(input.role)) return { ok: false, reason: "Pick a role." };
  const role: Role = input.role;
  const [exists] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.email, email)).limit(1);
  if (exists) return { ok: false, reason: `${email} is already on the team. Change their role in the list.` };
  const partnerIds = role === "pod_lead" ? await validPartnerIds(db, input.partnerIds ?? []) : [];
  const now = new Date();
  const name = cleanText(input.name, 120);
  const [row] = await db
    .insert(teamMembers)
    .values({ email, name, role, partnerIds, active: true, createdBy: actor.email, createdAt: now, updatedAt: now })
    .returning({ id: teamMembers.id });
  await logActivity(db, { entityType: "team_member", entityId: row.id, actor, action: "created", detail: { to: role, ...(role === "pod_lead" ? { partners: partnerIds.length } : {}) } });
  const pw = await setTemporaryPassword(db, { email, name, memberId: row.id, createdBy: actor.email }, now);
  await logActivity(db, { entityType: "account", entityId: pw.accountId, actor, action: pw.created ? "created" : "temporary_password_set", detail: { type: "team", ...(pw.converted ? { from: "expert" } : {}) } });
  return { ok: true, id: row.id, changed: true, tempPassword: pw.password, note: pw.converted ? `${email} had an expert account; it is now a team account (their expert profile stays).` : undefined };
}

/** A new temporary password for a team member (shown once). Their other sessions end. Not for yourself: use Change password. */
export async function resetMemberPassword(db: DB, actor: TeamActor, id: string): Promise<TeamResult> {
  ensure(actor, "team.manage");
  const [m] = isUuid(id) ? await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1) : [];
  if (!m) return { ok: false, reason: "That team member no longer exists." };
  if (m.email === actor.email.toLowerCase()) return { ok: false, reason: "That's you: use Change password instead (click your email at the top)." };
  if (!m.active) return { ok: false, reason: "Turn their access back on first." };
  const pw = await setTemporaryPassword(db, { email: m.email, name: m.name, memberId: m.id, createdBy: actor.email });
  await logActivity(db, { entityType: "team_member", entityId: m.id, actor, action: "password_reset", detail: {} });
  await logActivity(db, { entityType: "account", entityId: pw.accountId, actor, action: "temporary_password_set", detail: { type: "team" } });
  return { ok: true, id: m.id, changed: true, tempPassword: pw.password };
}

export async function updateMember(
  db: DB,
  actor: TeamActor,
  id: string,
  patch: { role?: unknown; active?: boolean; partnerIds?: unknown[]; name?: unknown },
): Promise<TeamResult> {
  ensure(actor, "team.manage");
  const [m] = isUuid(id) ? await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1) : [];
  if (!m) return { ok: false, reason: "That team member no longer exists." };
  if (patch.role !== undefined && !isRole(patch.role)) return { ok: false, reason: "Pick a role." };
  const next = { role: (patch.role as Role | undefined) ?? (m.role as Role), active: patch.active ?? m.active };
  const problem = checkMemberChange({ actorEmail: actor.email, target: m, next, otherAdmins: await otherAdminCount(db, m.email), envAdmins: adminEmails() });
  if (problem) return { ok: false, reason: problem };

  const set: Partial<typeof teamMembers.$inferInsert> = {};
  const logs: { action: string; detail: Record<string, unknown> }[] = [];
  if (next.role !== m.role) {
    set.role = next.role;
    logs.push({ action: "role_changed", detail: { from: m.role, to: next.role } });
  }
  if (next.active !== m.active) {
    set.active = next.active;
    logs.push({ action: next.active ? "reactivated" : "deactivated", detail: {} });
  }
  const accessChanged = next.active !== m.active;
  if (patch.partnerIds !== undefined) {
    const ids = await validPartnerIds(db, patch.partnerIds);
    if (JSON.stringify([...ids].sort()) !== JSON.stringify([...m.partnerIds].sort())) {
      set.partnerIds = ids;
      logs.push({ action: "scope_changed", detail: { partners: ids.length } });
    }
  }
  if (patch.name !== undefined) {
    const name = cleanText(patch.name, 120);
    if (name !== m.name) {
      set.name = name;
      logs.push({ action: "updated", detail: { fields: ["name"] } });
    }
  }
  if (!logs.length) return { ok: true, id: m.id, changed: false };
  await db.update(teamMembers).set({ ...set, updatedAt: new Date() }).where(eq(teamMembers.id, m.id));
  // Turning access off also turns their login off and ends every session at once; on again, it works again.
  if (accessChanged) {
    await db
      .update(accounts)
      .set(next.active ? { disabledAt: null, updatedAt: new Date() } : { disabledAt: new Date(), tokenVersion: sql`${accounts.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(accounts.email, m.email));
  }
  for (const l of logs) await logActivity(db, { entityType: "team_member", entityId: m.id, actor, action: l.action, detail: l.detail });
  return { ok: true, id: m.id, changed: true };
}

export const roleOptions = () => (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
