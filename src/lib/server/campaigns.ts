// Send emails (campaigns): templates, bulk emails to experts prepared as a draft (who gets it and who
// is skipped, and why), approved, then sent with an optional follow-up. The recipient list always
// leaves out people without an email, marked do not contact (also through another address of a
// do-not-contact record), unsubscribed from bulk email, or on the suppressed list. Nothing is sent
// from the hub until email is set up (see sendCampaignBatch).
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, emailCampaignRecipients, emailCampaigns, emailSendLog, emailTemplates, experts, jobs, projects, referralGroupMembers, savedViews, suppressedEmails } from "@/db/schema";
import { TEMPLATE_KINDS, isOneOf } from "@/lib/constants";
import { parseExpertFilters } from "@/lib/filters";
import { cleanLongText, cleanText } from "@/lib/normalize";
import { CAMPAIGN_KINDS, recipientBlock } from "@/lib/talent";
import { normalizeConfig, paramsFromConfig } from "@/lib/views";
import { actorEmail, logActivity, type Actor } from "./activity";
import { emailConfigured } from "./email";
import { expertConditions, isUuid } from "./experts";

export const MAX_RECIPIENTS = 2000;
const SENT_BY = (a: Actor) => actorEmail(a);

// ---------------------------------------------------------------- templates

export async function listEmailTemplates(db: DB) {
  return db
    .select({ id: emailTemplates.id, name: emailTemplates.name, kind: emailTemplates.kind, subject: emailTemplates.subject, body: emailTemplates.body, projectId: emailTemplates.projectId, projectCode: projects.code, updatedAt: emailTemplates.updatedAt, updatedBy: emailTemplates.updatedBy })
    .from(emailTemplates)
    .leftJoin(projects, eq(projects.id, emailTemplates.projectId))
    .orderBy(asc(emailTemplates.name));
}

export async function saveEmailTemplate(db: DB, actor: Actor, input: { id?: string | null; name: unknown; kind: unknown; subject: unknown; body: unknown; projectId?: unknown }) {
  const name = cleanText(input.name, 100);
  const subject = cleanText(input.subject, 200);
  const body = cleanLongText(input.body, 10_000);
  if (!name || !subject || !body) return { ok: false as const, reason: "Add a name, subject and message." };
  const kind = isOneOf(TEMPLATE_KINDS, input.kind) ? input.kind : "outreach";
  const projectId = typeof input.projectId === "string" && isUuid(input.projectId) ? input.projectId : null;
  const id = input.id && isUuid(input.id) ? input.id : null;
  const [clash] = await db.select({ id: emailTemplates.id }).from(emailTemplates).where(sql`lower(${emailTemplates.name}) = ${name.toLowerCase()}`).limit(1);
  if (clash && clash.id !== id) return { ok: false as const, reason: "A template has that name." };
  const by = SENT_BY(actor);
  const now = new Date();
  if (id) {
    const [row] = await db.update(emailTemplates).set({ name, kind, subject, body, projectId, updatedAt: now, updatedBy: by }).where(eq(emailTemplates.id, id)).returning({ id: emailTemplates.id });
    if (!row) return { ok: false as const, reason: "That template no longer exists." };
    await logActivity(db, { entityType: "email_template", entityId: id, actor, action: "updated" });
    return { ok: true as const, id };
  }
  const [row] = await db.insert(emailTemplates).values({ name, kind, subject, body, projectId, createdBy: by, updatedBy: by, createdAt: now, updatedAt: now }).returning({ id: emailTemplates.id });
  await logActivity(db, { entityType: "email_template", entityId: row.id, actor, action: "created" });
  return { ok: true as const, id: row.id };
}

export async function deleteEmailTemplate(db: DB, actor: Actor, id: string) {
  if (!isUuid(id)) return { ok: false as const, reason: "Unknown template." };
  const [row] = await db.delete(emailTemplates).where(eq(emailTemplates.id, id)).returning({ id: emailTemplates.id });
  if (!row) return { ok: false as const, reason: "That template no longer exists." };
  await logActivity(db, { entityType: "email_template", entityId: id, actor, action: "deleted" });
  return { ok: true as const };
}

// ---------------------------------------------------------------- who gets it

export type RecipientSource =
  | { kind: "experts"; ids: string[] }
  | { kind: "view"; viewId: string; viewerEmail: string }
  | { kind: "filters"; params: string; viewerEmail: string }
  | { kind: "job"; jobId: string; stage?: string }
  | { kind: "project"; projectId: string; stage?: string }
  | { kind: "group"; groupId: string };

/** The expert ids a source stands for (at most MAX_RECIPIENTS + 1, so "too many" can be said). */
export async function expertIdsFor(db: DB, src: RecipientSource): Promise<string[]> {
  const cap = MAX_RECIPIENTS + 1;
  switch (src.kind) {
    case "experts":
      return [...new Set(src.ids.filter(isUuid))].slice(0, cap);
    case "view": {
      if (!isUuid(src.viewId)) return [];
      const [v] = await db.select().from(savedViews).where(eq(savedViews.id, src.viewId)).limit(1);
      if (!v || (!v.shared && v.ownerEmail !== src.viewerEmail) || v.collection !== "experts") return [];
      const f = parseExpertFilters(Object.fromEntries(paramsFromConfig(normalizeConfig(v.config)).entries()));
      const rows = await db.select({ id: experts.id }).from(experts).where(and(...expertConditions(f, { meEmail: src.viewerEmail }))).orderBy(asc(experts.fullName)).limit(cap);
      return rows.map((r) => r.id);
    }
    case "filters": {
      const f = parseExpertFilters(Object.fromEntries(new URLSearchParams(src.params).entries()));
      const rows = await db.select({ id: experts.id }).from(experts).where(and(...expertConditions(f, { meEmail: src.viewerEmail }))).orderBy(asc(experts.fullName)).limit(cap);
      return rows.map((r) => r.id);
    }
    case "job": {
      if (!isUuid(src.jobId)) return [];
      const rows = await db
        .select({ id: applications.expertId })
        .from(applications)
        .where(and(eq(applications.jobId, src.jobId), src.stage ? eq(applications.stage, src.stage) : undefined))
        .limit(cap);
      return [...new Set(rows.map((r) => r.id))];
    }
    case "project": {
      if (!isUuid(src.projectId)) return [];
      const rows = await db
        .select({ id: applications.expertId })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(and(eq(jobs.projectId, src.projectId), src.stage ? eq(applications.stage, src.stage) : undefined))
        .limit(cap);
      return [...new Set(rows.map((r) => r.id))];
    }
    case "group": {
      if (!isUuid(src.groupId)) return [];
      const rows = await db
        .select({ id: experts.id })
        .from(referralGroupMembers)
        .innerJoin(experts, sql`${experts.id} = ${referralGroupMembers.expertId} or ${experts.email} = lower(${referralGroupMembers.email})`)
        .where(eq(referralGroupMembers.groupId, src.groupId))
        .limit(cap);
      return [...new Set(rows.map((r) => r.id))];
    }
  }
}

/** Suppressed addresses and addresses that belong to do-not-contact records (attributes.other_emails too). */
export async function blockedAddresses(db: DB): Promise<{ suppressed: Map<string, string>; dncEmails: Set<string> }> {
  const [sup, dnc] = await Promise.all([
    db.select({ email: suppressedEmails.email, reason: suppressedEmails.reason }).from(suppressedEmails),
    db.select({ email: experts.email, attributes: experts.attributes }).from(experts).where(eq(experts.status, "do_not_contact")),
  ]);
  const dncEmails = new Set<string>();
  for (const d of dnc) {
    if (d.email) dncEmails.add(d.email.toLowerCase());
    const other = (d.attributes as { other_emails?: unknown } | null)?.other_emails;
    if (Array.isArray(other)) for (const o of other) if (typeof o === "string" && o.includes("@")) dncEmails.add(o.trim().toLowerCase());
  }
  return { suppressed: new Map(sup.map((s) => [s.email.toLowerCase(), s.reason])), dncEmails };
}

export type RecipientPlan = { expertId: string; name: string; email: string | null; block: string | null };

/** Who would get it and who is skipped (with the reason), in name order. */
export async function planRecipients(db: DB, ids: string[]): Promise<RecipientPlan[]> {
  if (!ids.length) return [];
  const [people, blocked] = await Promise.all([
    db.select({ id: experts.id, name: experts.fullName, email: experts.email, status: experts.status, emailOptOut: experts.emailOptOut }).from(experts).where(inArray(experts.id, ids.slice(0, MAX_RECIPIENTS))).orderBy(asc(experts.fullName)),
    blockedAddresses(db),
  ]);
  return people.map((p) => ({ expertId: p.id, name: p.name, email: p.email, block: recipientBlock(p, blocked) }));
}

// ---------------------------------------------------------------- campaigns

export type CampaignInput = {
  name: unknown;
  kind: unknown;
  templateId?: unknown;
  subject: unknown;
  body: unknown;
  jobId?: unknown;
  projectId?: unknown;
  followUp?: boolean;
  followUpSubject?: unknown;
  followUpBody?: unknown;
  followUpAfterDays?: unknown;
};

function cleanCampaign(i: CampaignInput, allowEmpty: boolean) {
  const subject = cleanText(i.subject, 200);
  const body = cleanLongText(i.body, 10_000);
  if (!allowEmpty && (!subject || !body)) return { ok: false as const, reason: "Add a subject and a message." };
  const kind = isOneOf(CAMPAIGN_KINDS, i.kind) ? i.kind : "outreach";
  const days = Number(i.followUpAfterDays);
  const followBody = cleanLongText(i.followUpBody, 10_000);
  const follow = kind === "outreach" && Boolean(i.followUp) && Boolean(followBody);
  if (follow && !(Number.isInteger(days) && days >= 1 && days <= 30)) return { ok: false as const, reason: "Follow up after 1 to 30 days." };
  return {
    ok: true as const,
    data: {
      name: cleanText(i.name, 120) ?? `Email ${new Date().toISOString().slice(0, 10)}`,
      kind,
      templateId: typeof i.templateId === "string" && isUuid(i.templateId) ? i.templateId : null,
      subject: subject ?? "",
      body: body ?? "",
      jobId: typeof i.jobId === "string" && isUuid(i.jobId) ? i.jobId : null,
      projectId: typeof i.projectId === "string" && isUuid(i.projectId) ? i.projectId : null,
      followUpSubject: follow ? cleanText(i.followUpSubject, 200) : null,
      followUpBody: follow ? followBody : null,
      followUpAfterDays: follow ? days : null,
    },
  };
}

/**
 * A draft with its recipients: everyone eligible is "to send" (pending), the rest "skipped" with the
 * reason. recipient_count counts the ones to send. Nothing is sent.
 */
export async function prepareCampaign(db: DB, actor: Actor, input: CampaignInput & { expertIds: string[]; allowEmpty?: boolean }) {
  const c = cleanCampaign(input, Boolean(input.allowEmpty));
  if (!c.ok) return c;
  const ids = [...new Set(input.expertIds.filter(isUuid))];
  if (!ids.length) return { ok: false as const, reason: "No one to send to. Pick experts, a saved view, a job, a project or a group." };
  if (ids.length > MAX_RECIPIENTS) return { ok: false as const, reason: `Send to at most ${MAX_RECIPIENTS.toLocaleString("en-US")} experts at once.` };
  const plan = await planRecipients(db, ids);
  const by = SENT_BY(actor);
  const now = new Date();
  const toSend = plan.filter((p) => !p.block).length;
  const [row] = await db
    .insert(emailCampaigns)
    .values({ ...c.data, status: "draft", recipientCount: toSend, createdBy: by, updatedBy: by, createdAt: now, updatedAt: now })
    .returning({ id: emailCampaigns.id });
  for (let i = 0; i < plan.length; i += 500) {
    const chunk = plan.slice(i, i + 500);
    await db.insert(emailCampaignRecipients).values(
      chunk.map((p) => ({ campaignId: row.id, expertId: p.expertId, email: (p.email ?? "").toLowerCase(), status: p.block ? "skipped" : "pending", reason: p.block, updatedBy: by })),
    );
  }
  await logActivity(db, { entityType: "campaign", entityId: row.id, actor, action: "prepared", detail: { recipients: plan.length, toSend } });
  return { ok: true as const, id: row.id, toSend, skipped: plan.length - toSend };
}

/** Edit a draft's wording (and follow-up). Approved campaigns are fixed. */
export async function updateCampaignDraft(db: DB, actor: Actor, id: string, input: CampaignInput) {
  const camp = await getCampaign(db, id);
  if (!camp) return { ok: false as const, reason: "That campaign no longer exists." };
  if (camp.status !== "draft") return { ok: false as const, reason: "Only a draft can be changed." };
  const c = cleanCampaign(input, true);
  if (!c.ok) return c;
  await db.update(emailCampaigns).set({ ...c.data, updatedAt: new Date(), updatedBy: SENT_BY(actor) }).where(eq(emailCampaigns.id, id));
  await logActivity(db, { entityType: "campaign", entityId: id, actor, action: "updated" });
  return { ok: true as const };
}

export async function getCampaign(db: DB, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ c: emailCampaigns, jobTitle: jobs.title, projectCode: projects.code, projectName: projects.name, templateName: emailTemplates.name })
    .from(emailCampaigns)
    .leftJoin(jobs, eq(jobs.id, emailCampaigns.jobId))
    .leftJoin(projects, eq(projects.id, emailCampaigns.projectId))
    .leftJoin(emailTemplates, eq(emailTemplates.id, emailCampaigns.templateId))
    .where(eq(emailCampaigns.id, id))
    .limit(1);
  return row ? { ...row.c, jobTitle: row.jobTitle, projectCode: row.projectCode, projectName: row.projectName, templateName: row.templateName } : null;
}

export async function listCampaigns(db: DB, f: { status?: string } = {}) {
  return db
    .select({ id: emailCampaigns.id, name: emailCampaigns.name, kind: emailCampaigns.kind, status: emailCampaigns.status, recipientCount: emailCampaigns.recipientCount, createdAt: emailCampaigns.createdAt, createdBy: emailCampaigns.createdBy, approvedAt: emailCampaigns.approvedAt, jobTitle: jobs.title, projectCode: projects.code, followUpAfterDays: emailCampaigns.followUpAfterDays })
    .from(emailCampaigns)
    .leftJoin(jobs, eq(jobs.id, emailCampaigns.jobId))
    .leftJoin(projects, eq(projects.id, emailCampaigns.projectId))
    .where(f.status ? eq(emailCampaigns.status, f.status) : undefined)
    .orderBy(desc(emailCampaigns.createdAt))
    .limit(200);
}

export async function campaignStats(db: DB) {
  const rows = await db.select({ s: emailCampaigns.status, n: count() }).from(emailCampaigns).groupBy(emailCampaigns.status);
  const by = Object.fromEntries(rows.map((r) => [r.s, Number(r.n)]));
  const [{ t }] = await db.select({ t: count() }).from(emailTemplates);
  return { drafts: by.draft ?? 0, sending: (by.approved ?? 0) + (by.sending ?? 0), done: by.done ?? 0, cancelled: by.cancelled ?? 0, templates: Number(t), all: Object.values(by).reduce((a, b) => a + b, 0) };
}

export async function recipientCounts(db: DB, campaignId: string): Promise<Record<string, number>> {
  if (!isUuid(campaignId)) return {};
  const rows = await db.select({ s: emailCampaignRecipients.status, n: count() }).from(emailCampaignRecipients).where(eq(emailCampaignRecipients.campaignId, campaignId)).groupBy(emailCampaignRecipients.status);
  return Object.fromEntries(rows.map((r) => [r.s, Number(r.n)]));
}

export async function listRecipients(db: DB, campaignId: string, f: { status?: string; limit: number; offset: number }) {
  if (!isUuid(campaignId)) return { rows: [], total: 0 };
  const where = and(eq(emailCampaignRecipients.campaignId, campaignId), f.status ? eq(emailCampaignRecipients.status, f.status) : undefined);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ id: emailCampaignRecipients.id, expertId: emailCampaignRecipients.expertId, name: experts.fullName, email: emailCampaignRecipients.email, status: emailCampaignRecipients.status, reason: emailCampaignRecipients.reason, sentAt: emailCampaignRecipients.sentAt, followedUpAt: emailCampaignRecipients.followedUpAt })
      .from(emailCampaignRecipients)
      .innerJoin(experts, eq(experts.id, emailCampaignRecipients.expertId))
      .where(where)
      .orderBy(sql`case ${emailCampaignRecipients.status} when 'pending' then 0 when 'sent' then 1 when 'followed_up' then 2 when 'failed' then 3 when 'stopped' then 4 else 5 end`, asc(experts.fullName))
      .limit(f.limit)
      .offset(f.offset),
    db.select({ n: count() }).from(emailCampaignRecipients).where(where),
  ]);
  return { rows, total: Number(n) };
}

/** Draft -> approved (who and when). Needs a subject, a message and someone to send to. */
export async function approveCampaign(db: DB, actor: Actor, id: string) {
  const camp = await getCampaign(db, id);
  if (!camp) return { ok: false as const, reason: "That campaign no longer exists." };
  if (camp.status !== "draft") return { ok: false as const, reason: `Only a draft can be approved (this one is ${camp.status}).` };
  if (!camp.subject.trim() || !camp.body.trim()) return { ok: false as const, reason: "Write the subject and the message first." };
  // Re-check before approving: someone may have unsubscribed or been marked do not contact since.
  await recheckPending(db, actor, id);
  const counts = await recipientCounts(db, id);
  if (!counts.pending) return { ok: false as const, reason: "No one left to send to." };
  const by = SENT_BY(actor);
  const now = new Date();
  await db.update(emailCampaigns).set({ status: "approved", approvedBy: by, approvedAt: now, recipientCount: counts.pending, updatedAt: now, updatedBy: by }).where(eq(emailCampaigns.id, id));
  await logActivity(db, { entityType: "campaign", entityId: id, actor, action: "approved", detail: { toSend: counts.pending } });
  return { ok: true as const, toSend: counts.pending };
}

/** Recipients still to send who are now blocked become skipped (with the reason). */
export async function recheckPending(db: DB, actor: Actor, id: string): Promise<number> {
  const pending = await db.select({ id: emailCampaignRecipients.id, expertId: emailCampaignRecipients.expertId }).from(emailCampaignRecipients).where(and(eq(emailCampaignRecipients.campaignId, id), eq(emailCampaignRecipients.status, "pending")));
  if (!pending.length) return 0;
  const plan = await planRecipients(db, pending.map((p) => p.expertId));
  const blocked = new Map(plan.filter((p) => p.block).map((p) => [p.expertId, p.block as string]));
  let n = 0;
  for (const p of pending) {
    const why = blocked.get(p.expertId) ?? (plan.some((x) => x.expertId === p.expertId) ? null : "no longer in the hub");
    if (!why) continue;
    await db.update(emailCampaignRecipients).set({ status: "skipped", reason: why, updatedBy: SENT_BY(actor) }).where(eq(emailCampaignRecipients.id, p.id));
    n++;
  }
  if (n) await db.update(emailCampaigns).set({ recipientCount: sql`(select count(*) from ${emailCampaignRecipients} r where r.campaign_id = ${id}::uuid and r.status = 'pending')`, updatedAt: new Date() }).where(eq(emailCampaigns.id, id));
  return n;
}

/** Nothing more goes out: pending recipients become stopped ("campaign cancelled"). */
export async function cancelCampaign(db: DB, actor: Actor, id: string) {
  const camp = await getCampaign(db, id);
  if (!camp) return { ok: false as const, reason: "That campaign no longer exists." };
  if (camp.status === "done" || camp.status === "cancelled") return { ok: false as const, reason: `A ${camp.status} campaign can't be cancelled.` };
  const by = SENT_BY(actor);
  await db.update(emailCampaignRecipients).set({ status: "stopped", reason: "campaign cancelled", updatedBy: by }).where(and(eq(emailCampaignRecipients.campaignId, id), eq(emailCampaignRecipients.status, "pending")));
  await db.update(emailCampaigns).set({ status: "cancelled", updatedAt: new Date(), updatedBy: by }).where(eq(emailCampaigns.id, id));
  await logActivity(db, { entityType: "campaign", entityId: id, actor, action: "cancelled" });
  return { ok: true as const };
}

export const EMAIL_NOT_SET_UP = "Email isn't set up yet";

/**
 * Sending a batch. Off until email is set up (Resend or SMTP): then it says why instead of sending.
 * Even with email set up, the hub doesn't send campaigns yet: they need the unsubscribe page and the
 * scheduled follow-ups, which come with the email cut-over (docs/PRODUCT_PLAN.md, Phase 4).
 */
export async function sendCampaignBatch(db: DB, _actor: Actor, id: string): Promise<{ ok: false; reason: string }> {
  const camp = await getCampaign(db, id);
  if (!camp) return { ok: false, reason: "That campaign no longer exists." };
  if (camp.status !== "approved" && camp.status !== "sending") return { ok: false, reason: "Approve the campaign first." };
  if (!emailConfigured()) return { ok: false, reason: `${EMAIL_NOT_SET_UP}. The campaign stays approved; nothing was sent.` };
  return { ok: false, reason: "Sending campaigns from the hub isn't switched on yet (it comes with the unsubscribe page). The campaign stays approved; nothing was sent." };
}

// ---------------------------------------------------------------- the email log and suppressed addresses

export async function sendLog(db: DB, limit = 200) {
  return db.select({ id: emailSendLog.id, templateName: emailSendLog.templateName, recipientEmail: emailSendLog.recipientEmail, status: emailSendLog.status, errorMessage: emailSendLog.errorMessage, createdAt: emailSendLog.createdAt }).from(emailSendLog).orderBy(desc(emailSendLog.createdAt)).limit(limit);
}

export async function listSuppressed(db: DB, limit = 500) {
  return db.select({ id: suppressedEmails.id, email: suppressedEmails.email, reason: suppressedEmails.reason, createdAt: suppressedEmails.createdAt }).from(suppressedEmails).orderBy(desc(suppressedEmails.createdAt)).limit(limit);
}
