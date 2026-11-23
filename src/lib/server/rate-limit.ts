// Rate limits for the public form and for sign-in, sign-up and password resets, kept in
// hub.submit_attempts (keyed hashes only: never an IP address or an email in plain text).
import { and, count, eq, gte, lt } from "drizzle-orm";
import type { DB } from "@/db/client";
import { submitAttempts } from "@/db/schema";
import { keyedHash } from "./tokens";

export const LIMITS = {
  apply_ip: { max: 10, minutes: 60 },
  apply_email: { max: 5, minutes: 60 },
  // Sign-in: every attempt from one address; failed attempts for one email (known or not, so the
  // answer is the same either way; known accounts also lock for 15 minutes after 5 failures).
  signin_ip: { max: 30, minutes: 15 },
  signin_email: { max: 5, minutes: 15 },
  signup_ip: { max: 10, minutes: 60 },
  // Emails with a code or a link, per address they go to.
  mail_email: { max: 5, minutes: 60 },
  reset_ip: { max: 10, minutes: 60 },
  verify_ip: { max: 30, minutes: 15 },
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

/** Forgets the attempts for one value (after a successful sign-in). */
export async function clearAttempts(db: DB, kind: LimitKind, value: string): Promise<void> {
  await db.delete(submitAttempts).where(and(eq(submitAttempts.kind, kind), eq(submitAttempts.keyHash, keyedHash(kind, value))));
}
