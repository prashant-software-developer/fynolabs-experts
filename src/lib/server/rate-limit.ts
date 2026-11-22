// Rate limits for the public application form, kept in hub.submit_attempts (hashes only).
import { and, count, eq, gte, lt } from "drizzle-orm";
import type { DB } from "@/db/client";
import { submitAttempts } from "@/db/schema";
import { keyedHash } from "./tokens";

export const LIMITS = {
  apply_ip: { max: 10, minutes: 60 },
  apply_email: { max: 5, minutes: 60 },
} as const;
export type LimitKind = keyof typeof LIMITS;

export async function overLimit(db: DB, kind: LimitKind, value: string, now = new Date()): Promise<boolean> {
  const { max, minutes } = LIMITS[kind];
  const since = new Date(now.getTime() - minutes * 60_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(submitAttempts)
    .where(and(eq(submitAttempts.kind, kind), eq(submitAttempts.keyHash, keyedHash(kind, value)), gte(submitAttempts.createdAt, since)));
  return Number(n) >= max;
}

export async function recordAttempt(db: DB, kind: LimitKind, value: string, now = new Date()): Promise<void> {
  await db.insert(submitAttempts).values({ kind, keyHash: keyedHash(kind, value), createdAt: now });
  // Keep the table small: drop attempts older than a day now and then.
  if (Math.random() < 0.05) await db.delete(submitAttempts).where(lt(submitAttempts.createdAt, new Date(now.getTime() - 86_400_000)));
}
