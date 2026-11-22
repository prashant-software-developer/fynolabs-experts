// Team & access (hub.team_members). Admin only: every function checks team.manage itself, so a
// forbidden call fails here even if a page or action forgot. Every change is logged.
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import { partners, teamMembers, type TeamMember } from "@/db/schema";
import { isAllowedEmail } from "@/lib/auth/allow";
import { ensure, isRole, ROLE_LABELS, type Role, type Subject } from "@/lib/auth/permissions";
import { adminEmails } from "@/lib/auth/roles";
import { cleanText, normalizeEmail } from "@/lib/normalize";
import { logActivity } from "./activity";
import { isUuid } from "./experts";

export type TeamActor = Subject;
export type TeamResult = { ok: true; id: string; changed: boolean; warning?: string } | { ok: false; reason: string };

export async function listTeam(db: DB): Promise<TeamMember[]> {
  return db.select().from(teamMembers).orderBy(desc(teamMembers.active), asc(teamMembers.email));
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

function signInWarning(email: string): string | undefined {
  return isAllowedEmail(email) ? undefined : `${email} can't sign in yet: add it to ALLOWED_EMAILS (or use an address on the team domain).`;
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
  const [row] = await db
    .insert(teamMembers)
    .values({ email, name: cleanText(input.name, 120), role, partnerIds, active: true, createdBy: actor.email, createdAt: now, updatedAt: now })
    .returning({ id: teamMembers.id });
  await logActivity(db, { entityType: "team_member", entityId: row.id, actor, action: "created", detail: { to: role, ...(role === "pod_lead" ? { partners: partnerIds.length } : {}) } });
  return { ok: true, id: row.id, changed: true, warning: signInWarning(email) };
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
  for (const l of logs) await logActivity(db, { entityType: "team_member", entityId: m.id, actor, action: l.action, detail: l.detail });
  return { ok: true, id: m.id, changed: true };
}

export const roleOptions = () => (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
