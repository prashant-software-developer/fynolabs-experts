// Messages from the website's contact form (hub.messages), the replies the team sent
// (hub.message_replies, source_type 'contact') and saved reply drafts (hub.reply_drafts).
import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { messageReplies, messages, replyDrafts } from "@/db/schema";
import { canSeeContact, maskEmail, type Role } from "@/lib/auth/permissions";
import { cleanLongText, cleanText } from "@/lib/normalize";
import { actorEmail, logActivity, type Actor } from "./activity";
import type { Result } from "./companies";
import { sendEmail } from "./email";
import { isUuid } from "./experts";

export const MESSAGE_TABS = ["all", "open", "handled"] as const;
export type MessageTab = (typeof MESSAGE_TABS)[number];
export const MESSAGE_TAB_LABELS: Record<MessageTab, string> = { all: "All", open: "Open", handled: "Handled" };

export type MessageRow = typeof messages.$inferSelect;

const visible = (role: Role, m: MessageRow): MessageRow => (canSeeContact(role) ? m : { ...m, email: maskEmail(m.email) ?? "" });

export async function listMessages(db: DB, role: Role, opts: { tab: MessageTab; q: string; limit?: number; offset?: number }) {
  const needle = opts.q.trim();
  const search = needle
    ? sql`(${messages.name} ilike ${`%${needle}%`} or ${messages.message} ilike ${`%${needle}%`}${canSeeContact(role) ? sql` or ${messages.email} ilike ${`%${needle}%`}` : sql``})`
    : undefined;
  const tabWhere = opts.tab === "open" ? isNull(messages.handledAt) : opts.tab === "handled" ? isNotNull(messages.handledAt) : undefined;
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(and(search, tabWhere))
      .orderBy(desc(messages.createdAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db
      .select({ open: sql<number>`count(*) filter (where ${messages.handledAt} is null)`.mapWith(Number), handled: sql<number>`count(*) filter (where ${messages.handledAt} is not null)`.mapWith(Number) })
      .from(messages)
      .where(search),
  ]);
  const c = counts[0] ?? { open: 0, handled: 0 };
  return { rows: rows.map((m) => visible(role, m)), counts: { all: c.open + c.handled, open: c.open, handled: c.handled } as Record<MessageTab, number> };
}

export async function getMessage(db: DB, id: string, role: Role) {
  if (!isUuid(id)) return null;
  const [m] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!m) return null;
  const [replies, [draft]] = await Promise.all([
    db.select().from(messageReplies).where(and(eq(messageReplies.sourceType, "contact"), eq(messageReplies.sourceId, id))).orderBy(desc(messageReplies.createdAt)),
    db.select().from(replyDrafts).where(and(eq(replyDrafts.sourceType, "contact"), eq(replyDrafts.sourceId, id))).limit(1),
  ]);
  const contact = canSeeContact(role);
  return {
    message: visible(role, m),
    rawEmail: contact ? m.email : null,
    replies: replies.map((r) => ({ ...r, recipientEmail: contact ? r.recipientEmail : (maskEmail(r.recipientEmail) ?? "") })),
    draft: draft ?? null,
  };
}

export async function openMessageCount(db: DB): Promise<number> {
  const [r] = await db.select({ n: count() }).from(messages).where(isNull(messages.handledAt));
  return Number(r?.n ?? 0);
}

export async function latestOpenMessages(db: DB, role: Role, limit = 5) {
  const rows = await db.select().from(messages).where(isNull(messages.handledAt)).orderBy(desc(messages.createdAt)).limit(limit);
  return rows.map((m) => visible(role, m));
}

export async function setHandled(db: DB, id: string, handled: boolean, actor: Actor): Promise<Result> {
  if (!isUuid(id)) return { ok: false, reason: "That message no longer exists." };
  const email = actorEmail(actor);
  const rows = await db
    .update(messages)
    .set(handled ? { handledAt: new Date(), handledBy: email, updatedBy: email } : { handledAt: null, handledBy: null, updatedBy: email })
    .where(eq(messages.id, id))
    .returning({ id: messages.id });
  if (!rows.length) return { ok: false, reason: "That message no longer exists." };
  await logActivity(db, { entityType: "message", entityId: id, actor, action: handled ? "handled" : "reopened" });
  return { ok: true, id };
}

export async function saveDraft(db: DB, id: string, input: { subject: string | null; body: string | null }, actor: Actor): Promise<Result> {
  if (!isUuid(id)) return { ok: false, reason: "That message no longer exists." };
  const [m] = await db.select({ id: messages.id }).from(messages).where(eq(messages.id, id)).limit(1);
  if (!m) return { ok: false, reason: "That message no longer exists." };
  const subject = cleanText(input.subject, 300) ?? "";
  const body = cleanLongText(input.body, 20_000) ?? "";
  if (!subject && !body) return { ok: false, reason: "Write a subject or a message first." };
  const now = new Date();
  await db
    .insert(replyDrafts)
    .values({ sourceType: "contact", sourceId: id, subject, body, updatedAt: now, updatedBy: actorEmail(actor) })
    .onConflictDoUpdate({ target: [replyDrafts.sourceType, replyDrafts.sourceId], set: { subject, body, updatedAt: now, updatedBy: actorEmail(actor) } });
  await logActivity(db, { entityType: "message", entityId: id, actor, action: "draft_saved" });
  return { ok: true, id };
}

export async function discardDraft(db: DB, id: string, actor: Actor): Promise<Result> {
  if (!isUuid(id)) return { ok: false, reason: "That message no longer exists." };
  await db.delete(replyDrafts).where(and(eq(replyDrafts.sourceType, "contact"), eq(replyDrafts.sourceId, id)));
  await logActivity(db, { entityType: "message", entityId: id, actor, action: "draft_discarded" });
  return { ok: true, id };
}

/**
 * Records a reply. `send`: through the hub's email (only when email is set up); otherwise the
 * person sent it from their own email app and this only records it. The draft goes either way.
 */
export async function recordReply(db: DB, id: string, input: { subject: string | null; body: string | null; send: boolean }, actor: Actor): Promise<Result<{ id: string; sent: boolean }>> {
  if (!isUuid(id)) return { ok: false, reason: "That message no longer exists." };
  const [m] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!m) return { ok: false, reason: "That message no longer exists." };
  const subject = cleanText(input.subject, 300);
  const body = cleanLongText(input.body, 20_000);
  if (!subject || !body) return { ok: false, reason: "Add a subject and message first." };
  let status = "sent";
  let error: string | null = null;
  if (input.send) {
    const r = await sendEmail({ to: m.email, subject, text: body });
    if (!r.sent) {
      status = "failed";
      error = r.reason;
    }
  }
  await db.insert(messageReplies).values({ sourceType: "contact", sourceId: id, recipientEmail: m.email, subject, body, status, errorMessage: error, sentBy: actorEmail(actor) });
  if (status === "sent") await db.delete(replyDrafts).where(and(eq(replyDrafts.sourceType, "contact"), eq(replyDrafts.sourceId, id)));
  await logActivity(db, { entityType: "message", entityId: id, actor, action: input.send ? (status === "sent" ? "reply_sent" : "reply_failed") : "reply_logged" });
  if (status !== "sent") return { ok: false, reason: error ?? "Reply not sent." };
  return { ok: true, id, sent: input.send };
}

export async function deleteMessage(db: DB, id: string, actor: Actor): Promise<Result> {
  if (!isUuid(id)) return { ok: false, reason: "That message no longer exists." };
  const rows = await db.delete(messages).where(eq(messages.id, id)).returning({ id: messages.id });
  if (!rows.length) return { ok: false, reason: "That message no longer exists." };
  await db.delete(replyDrafts).where(and(eq(replyDrafts.sourceType, "contact"), eq(replyDrafts.sourceId, id)));
  await logActivity(db, { entityType: "message", entityId: id, actor, action: "deleted" });
  return { ok: true, id };
}

/** A mailto: link with the reply filled in (the person's own email app), kept under ~2,000 characters. */
export function mailtoLink(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s);
  let b = body;
  let href = `mailto:${encodeURIComponent(to)}?subject=${enc(subject)}&body=${enc(b)}`;
  while (href.length > 2000 && b.length > 0) {
    b = b.slice(0, Math.floor(b.length * 0.8));
    href = `mailto:${encodeURIComponent(to)}?subject=${enc(subject)}&body=${enc(`${b}…`)}`;
  }
  return href;
}

