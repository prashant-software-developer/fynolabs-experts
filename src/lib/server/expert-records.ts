// The rest of an expert's page: outreach fields, do not contact, timeline notes, documents,
// engagements and earnings (money-only), and the merged timeline (hub.expert_activities plus the
// audit log). Every write sets updated_by and writes a timeline row where the FynoLabs admin does.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { activity, applications, engagements, expertActivities, expertDocuments, expertFiles, experts, jobs, monthlyEarnings, teamMembers } from "@/db/schema";
import { canSeeMoney, rowsWithoutMoney, type Role } from "@/lib/auth/permissions";
import { DOCUMENT_STATUSES, OUTREACH_STATUSES, SOURCE_CHANNELS, isOneOf } from "@/lib/constants";
import { cleanLongText, cleanText, isoDate } from "@/lib/normalize";
import { DOCUMENT_STATUS_LABELS, OUTREACH_LABELS } from "@/lib/talent";
import { actorEmail, logActivity, type Actor } from "./activity";
import { addTimeline } from "./applications";
import { isUuid } from "./experts";

// ---------------------------------------------------------------- outreach and do not contact

export type OutreachInput = {
  ownerTeamMemberId?: string | null;
  outreachStatus?: string | null;
  nextAction?: string | null;
  nextActionDue?: string | null;
  sourceChannel?: string | null;
  sourceDetail?: string | null;
};

/** Owner, outreach, next action (+ due) and where they came from, for one or many experts. */
export async function updateOutreach(db: DB, actor: Actor, ids: string[], input: OutreachInput): Promise<{ ok: true; updated: number } | { ok: false; reason: string }> {
  const clean = [...new Set(ids.filter(isUuid))].slice(0, 2000);
  if (!clean.length) return { ok: false, reason: "Tick at least one expert." };
  const patch: Partial<typeof experts.$inferInsert> = {};
  if (input.ownerTeamMemberId !== undefined) {
    const owner = input.ownerTeamMemberId && isUuid(input.ownerTeamMemberId) ? input.ownerTeamMemberId : null;
    if (owner) {
      const [m] = await db.select({ id: teamMembers.id, name: teamMembers.name, email: teamMembers.email }).from(teamMembers).where(eq(teamMembers.id, owner)).limit(1);
      if (!m) return { ok: false, reason: "Pick someone on the team." };
      patch.ownerName = m.name ?? m.email;
    } else patch.ownerName = null;
    patch.ownerTeamMemberId = owner;
  }
  if (input.outreachStatus !== undefined) {
    if (input.outreachStatus && !isOneOf(OUTREACH_STATUSES, input.outreachStatus)) return { ok: false, reason: "Pick an outreach status." };
    patch.outreachStatus = input.outreachStatus || null;
  }
  if (input.nextAction !== undefined) {
    patch.nextAction = cleanText(input.nextAction, 300);
    patch.nextActionAuto = false;
  }
  if (input.nextActionDue !== undefined) {
    const d = isoDate(input.nextActionDue);
    if (input.nextActionDue && !d) return { ok: false, reason: "Pick a date for the next action." };
    patch.nextActionDue = d;
  }
  if (input.sourceChannel !== undefined) {
    if (input.sourceChannel && !isOneOf(SOURCE_CHANNELS, input.sourceChannel)) return { ok: false, reason: "Pick where they came from." };
    patch.sourceChannel = input.sourceChannel || null;
  }
  if (input.sourceDetail !== undefined) patch.sourceDetail = cleanText(input.sourceDetail, 300);
  if (!Object.keys(patch).length) return { ok: true, updated: 0 };
  const before = await db.select({ id: experts.id, outreachStatus: experts.outreachStatus }).from(experts).where(inArray(experts.id, clean));
  const now = new Date();
  const contacted = patch.outreachStatus === "contacted";
  await db
    .update(experts)
    .set({ ...patch, updatedAt: now, lastActivityAt: now, ...(contacted ? { lastContactedAt: now } : {}) })
    .where(inArray(experts.id, before.map((b) => b.id)));
  const by = actorEmail(actor);
  for (const b of before) {
    if (patch.outreachStatus !== undefined && patch.outreachStatus !== b.outreachStatus && patch.outreachStatus && patch.outreachStatus !== "applied") {
      const words = patch.outreachStatus === "not_contacted" ? "not contacted yet" : OUTREACH_LABELS[patch.outreachStatus as keyof typeof OUTREACH_LABELS].toLowerCase();
      await addTimeline(db, { expertId: b.id, kind: "outreach", summary: `Outreach: ${words}`, by });
    }
    await logActivity(db, { entityType: "expert", entityId: b.id, actor, action: "outreach_updated", detail: { fields: Object.keys(patch) } });
  }
  return { ok: true, updated: before.length };
}

/** Do not contact on (with a reason) or off. Nobody marked so is emailed, referred or added to a job. */
export async function setDoNotContact(db: DB, actor: Actor, ids: string[], on: boolean, reason?: string | null): Promise<{ ok: true; updated: number } | { ok: false; reason: string }> {
  const clean = [...new Set(ids.filter(isUuid))].slice(0, 2000);
  if (!clean.length) return { ok: false, reason: "Tick at least one expert." };
  const rows = await db.select({ id: experts.id, status: experts.status }).from(experts).where(inArray(experts.id, clean));
  const by = actorEmail(actor);
  const why = cleanText(reason, 300);
  let updated = 0;
  for (const r of rows) {
    const is = r.status === "do_not_contact";
    if (is === on) continue;
    const now = new Date();
    await db
      .update(experts)
      .set(on ? { status: "do_not_contact", dncReason: why, dncAt: now, updatedAt: now, lastActivityAt: now } : { status: "bench", dncReason: null, dncAt: null, updatedAt: now, lastActivityAt: now })
      .where(eq(experts.id, r.id));
    await addTimeline(db, { expertId: r.id, kind: "system", summary: on ? `Marked do not contact${why ? `: ${why}` : ""}` : "Do not contact removed", by });
    await logActivity(db, { entityType: "expert", entityId: r.id, actor, action: on ? "do_not_contact_on" : "do_not_contact_off" });
    updated++;
  }
  return { ok: true, updated };
}

/** Tags added to (or removed from) many experts. Tags are lower case. */
export async function changeTags(db: DB, actor: Actor, ids: string[], tags: string[], remove: boolean) {
  const clean = [...new Set(ids.filter(isUuid))].slice(0, 2000);
  const t = [...new Set(tags.map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  if (!clean.length || !t.length) return { ok: false as const, reason: !clean.length ? "Tick at least one expert." : "Add at least one tag." };
  const arr = sql`${`{${t.map((x) => `"${x.replace(/["\\]/g, "")}"`).join(",")}}`}::text[]`;
  await db
    .update(experts)
    .set({ tags: remove ? sql`array(select unnest(${experts.tags}) except select unnest(${arr}))` : sql`array(select distinct unnest(${experts.tags} || ${arr}))`, updatedAt: new Date() })
    .where(inArray(experts.id, clean));
  for (const id of clean) await logActivity(db, { entityType: "expert", entityId: id, actor, action: remove ? "tags_removed" : "tags_added", detail: { tags: t } });
  return { ok: true as const, updated: clean.length };
}

/** A note on the timeline: the first line is the title, the rest the detail (FynoLabs "Add a note"). */
export async function addTimelineNote(db: DB, actor: Actor, expertId: string, text: string, applicationId?: string | null) {
  if (!isUuid(expertId)) return { ok: false as const, reason: "Unknown expert." };
  const body = cleanLongText(text, 5000);
  if (!body) return { ok: false as const, reason: "Write a note first." };
  const [first, ...rest] = body.split(/\r?\n/);
  const app = applicationId && isUuid(applicationId) ? applicationId : null;
  if (app) {
    const [a] = await db.select({ e: applications.expertId }).from(applications).where(eq(applications.id, app)).limit(1);
    if (!a || a.e !== expertId) return { ok: false as const, reason: "That job isn't theirs." };
  }
  await addTimeline(db, { expertId, applicationId: app, kind: "note", summary: first.slice(0, 500), detail: rest.join("\n").trim() || null, by: actorEmail(actor) });
  await db.update(experts).set({ lastActivityAt: new Date() }).where(eq(experts.id, expertId));
  await logActivity(db, { entityType: "expert", entityId: expertId, actor, action: "note_added" });
  return { ok: true as const };
}

// ---------------------------------------------------------------- the merged timeline

export type TimelineItem = { id: string; at: Date; kind: string; summary: string; detail: string | null; by: string | null; jobTitle: string | null; source: "timeline" | "audit" };

const AUDIT_WORDS: Record<string, string> = {
  created: "Record created",
  updated: "Profile edited",
  status_changed: "Status changed",
  note_added: "Note added",
  cv_uploaded: "CV uploaded",
  cv_downloaded: "CV downloaded",
  cv_consent_recorded: "CV consent recorded",
  outreach_updated: "Outreach fields changed",
  do_not_contact_on: "Marked do not contact",
  do_not_contact_off: "Do not contact removed",
  tags_added: "Tags added",
  tags_removed: "Tags removed",
  added_to_group: "Added to a group",
  removed_from_group: "Removed from a group",
};

/** Timeline entries and audit-log rows of one expert, newest first. */
export async function mergedTimeline(db: DB, expertId: string, limit = 300): Promise<TimelineItem[]> {
  if (!isUuid(expertId)) return [];
  const [tl, audit] = await Promise.all([
    db
      .select({ id: expertActivities.id, at: expertActivities.happenedAt, kind: expertActivities.kind, summary: expertActivities.summary, detail: expertActivities.detail, by: expertActivities.createdBy, jobTitle: jobs.title })
      .from(expertActivities)
      .leftJoin(applications, eq(applications.id, expertActivities.applicationId))
      .leftJoin(jobs, eq(jobs.id, applications.jobId))
      .where(eq(expertActivities.expertId, expertId))
      .orderBy(desc(expertActivities.happenedAt))
      .limit(limit),
    db.select().from(activity).where(and(eq(activity.entityType, "expert"), eq(activity.entityId, expertId))).orderBy(desc(activity.createdAt)).limit(limit),
  ]);
  const items: TimelineItem[] = [
    ...tl.map((t) => ({ ...t, source: "timeline" as const })),
    ...audit.map((a) => ({
      id: a.id,
      at: a.createdAt,
      kind: "system",
      summary: AUDIT_WORDS[a.action] ?? a.action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      detail: Array.isArray((a.detail as { fields?: unknown } | null)?.fields) ? `Fields: ${((a.detail as { fields: string[] }).fields).join(", ")}` : null,
      by: a.actorEmail,
      jobTitle: null,
      source: "audit" as const,
    })),
  ];
  return items.sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, limit);
}

// ---------------------------------------------------------------- documents

export async function documentsOf(db: DB, expertId: string) {
  if (!isUuid(expertId)) return [];
  const signed = sql<string | null>`(select filename from ${expertFiles} f where f.id = ${expertDocuments.signedFileId})`;
  return db
    .select({
      id: expertDocuments.id,
      kind: expertDocuments.kind,
      title: expertDocuments.title,
      status: expertDocuments.status,
      fileId: expertDocuments.fileId,
      signedFileId: expertDocuments.signedFileId,
      fileName: expertFiles.filename,
      signedFileName: signed,
      sentTo: expertDocuments.sentTo,
      sentAt: expertDocuments.sentAt,
      signedAt: expertDocuments.signedAt,
      expiresAt: expertDocuments.expiresAt,
      notes: expertDocuments.notes,
      applicationId: expertDocuments.applicationId,
      jobTitle: jobs.title,
      createdAt: expertDocuments.createdAt,
    })
    .from(expertDocuments)
    .leftJoin(expertFiles, eq(expertFiles.id, expertDocuments.fileId))
    .leftJoin(applications, eq(applications.id, expertDocuments.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(expertDocuments.expertId, expertId))
    .orderBy(desc(expertDocuments.createdAt));
}

/** Not sent -> Sent for signing -> Signed; Withdraw (and Restore). Writes the timeline. */
export async function setDocumentStatus(db: DB, actor: Actor, id: string, status: string) {
  if (!isUuid(id) || !isOneOf(DOCUMENT_STATUSES, status)) return { ok: false as const, reason: "Pick a status." };
  const [d] = await db.select().from(expertDocuments).where(eq(expertDocuments.id, id)).limit(1);
  if (!d) return { ok: false as const, reason: "That document no longer exists." };
  if (d.status === status) return { ok: true as const, changed: false, expertId: d.expertId };
  if (d.status === "signed" && status !== "void") return { ok: false as const, reason: "A signed document stays signed (withdraw it instead)." };
  const now = new Date();
  const by = actorEmail(actor);
  await db
    .update(expertDocuments)
    .set({ status, updatedAt: now, updatedBy: by, ...(status === "sent" && !d.sentAt ? { sentAt: now } : {}), ...(status === "signed" ? { signedAt: d.signedAt ?? now } : {}) })
    .where(eq(expertDocuments.id, id));
  const words: Record<string, string | null> = { sent: "sent for signing", signed: "signed", void: "withdrawn", draft: null };
  if (words[status]) await addTimeline(db, { expertId: d.expertId, applicationId: d.applicationId, kind: "document", summary: `${d.title}: ${words[status]}`, by });
  await logActivity(db, { entityType: "expert", entityId: d.expertId, actor, action: "document_status", detail: { documentId: id, from: d.status, to: status } });
  return { ok: true as const, changed: true, expertId: d.expertId, label: DOCUMENT_STATUS_LABELS[status as keyof typeof DOCUMENT_STATUS_LABELS] };
}

// ---------------------------------------------------------------- engagements and earnings

/** Engagements (commission is money: removed for roles without money rights). */
export async function engagementsOf(db: DB, expertId: string, role: Role) {
  if (!isUuid(expertId)) return [];
  const rows = await db.select().from(engagements).where(eq(engagements.expertId, expertId)).orderBy(desc(engagements.startedOn));
  return rowsWithoutMoney(role, "engagements", rows);
}

/** Money-only: monthly earnings and our commission. Empty for roles without money rights. */
export async function earningsOf(db: DB, expertId: string, role: Role) {
  if (!isUuid(expertId) || !canSeeMoney(role)) return [];
  const rows = await db
    .select({ id: monthlyEarnings.id, month: monthlyEarnings.month, grossInr: monthlyEarnings.grossInr, commissionInr: monthlyEarnings.commissionInr, commissionPercent: monthlyEarnings.commissionPercent, notes: monthlyEarnings.notes, platform: engagements.platform, project: engagements.project })
    .from(monthlyEarnings)
    .innerJoin(engagements, eq(engagements.id, monthlyEarnings.engagementId))
    .where(eq(monthlyEarnings.expertId, expertId))
    .orderBy(desc(monthlyEarnings.month));
  return rowsWithoutMoney(role, "monthly_earnings", rows);
}
