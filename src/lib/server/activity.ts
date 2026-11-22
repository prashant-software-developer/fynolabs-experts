import { desc, eq, and } from "drizzle-orm";
import type { DB } from "@/db/client";
import { activity } from "@/db/schema";

export type EntityType = "expert" | "requirement" | "submission" | "placement" | "partner" | "import";

/** Every change writes one row. Keep `detail` free of personal data: field names, not values. */
export async function logActivity(
  db: DB,
  a: { entityType: EntityType; entityId: string; actor: string; action: string; detail?: Record<string, unknown> },
): Promise<void> {
  await db.insert(activity).values({
    entityType: a.entityType,
    entityId: a.entityId,
    actorEmail: a.actor,
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

export async function recentActivity(db: DB, limit = 20) {
  return db.select().from(activity).orderBy(desc(activity.createdAt)).limit(limit);
}
