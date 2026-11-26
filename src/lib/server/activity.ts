import { desc, eq, and } from "drizzle-orm";
import type { DB } from "@/db/client";
import { activity } from "@/db/schema";

export type EntityType = "expert" | "requirement" | "submission" | "placement" | "partner" | "import" | "team_member" | "saved_view" | "job" | "application" | "data_request" | "account" | "contact" | "calendar_event" | "platform" | "project" | "message" | "setting" | "campaign" | "email_template" | "referral" | "group" | "fee" | "radar" | "document_template" | "payout" | "course";

/** Who did it: an email (scripts, imports) or the signed-in user with their role. */
export type Actor = string | { email: string; role?: string | null };
export const actorEmail = (a: Actor): string => (typeof a === "string" ? a : a.email);
export const actorRole = (a: Actor): string | null => (typeof a === "string" ? null : (a.role ?? null));

/** Every change writes one row. Keep `detail` free of personal data: field names, not values. */
export async function logActivity(
  db: DB,
  a: { entityType: EntityType; entityId: string; actor: Actor; action: string; detail?: Record<string, unknown> },
): Promise<void> {
  await db.insert(activity).values({
    entityType: a.entityType,
    entityId: a.entityId,
    actorEmail: actorEmail(a.actor),
    actorRole: actorRole(a.actor),
    action: a.action,
    detail: a.detail ?? null,
  });
}

export async function activityFor(db: DB, entityType: EntityType, entityId: string, limit = 100) {
  return db
    .select()
    .from(activity)
    .where(and(eq(activity.entityType, entityType), eq(activity.entityId, entityId)))
    .orderBy(desc(activity.createdAt))
    .limit(limit);
}

export async function activityOfType(db: DB, entityType: EntityType, limit = 30) {
  return db.select().from(activity).where(eq(activity.entityType, entityType)).orderBy(desc(activity.createdAt)).limit(limit);
}

export async function recentActivity(db: DB, limit = 20) {
  return db.select().from(activity).orderBy(desc(activity.createdAt)).limit(limit);
}
