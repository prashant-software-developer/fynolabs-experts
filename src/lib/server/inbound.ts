// Inbound applications: what came in through the FynoLabs talent form (the internal job "Talent call
// (FynoLabs)") and the job forms, for the team to look at and mark handled. A pipeline is open while
// nobody has handled it and it is still at Applied.
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, experts, jobFormFields, jobs, legacyMap } from "@/db/schema";
import { actorEmail, logActivity, type Actor } from "./activity";
import { isUuid } from "./experts";

export const INBOUND_KINDS = ["talent", "jobs", "all"] as const;
export const INBOUND_STATES = ["open", "handled", "all"] as const;
export type InboundKind = (typeof INBOUND_KINDS)[number];
export type InboundState = (typeof INBOUND_STATES)[number];

/** The internal job the talent-call applications sit on (made by the FynoLabs sync), or null. */
export async function talentCallJobId(db: DB): Promise<string | null> {
  const [m] = await db.select({ id: legacyMap.hubId }).from(legacyMap).where(and(eq(legacyMap.sourceTable, "fynolabs.talent_call"), eq(legacyMap.sourceId, "job"))).limit(1);
  if (m) return m.id;
  const [j] = await db.select({ id: jobs.id }).from(jobs).where(or(sql`${jobs.slug} like 'fynolabs-talent-call%'`, eq(jobs.title, "Talent call (FynoLabs)"))).limit(1);
  return j?.id ?? null;
}

const openCond = () => and(isNull(applications.handledAt), eq(applications.stage, "new"))!;
const handledCond = () => or(isNotNull(applications.handledAt), ne(applications.stage, "new"))!;

function conds(talentJob: string | null, f: { kind: InboundKind; state: InboundState; q?: string; jobId?: string }): SQL[] {
  const c: SQL[] = [];
  if (f.kind === "talent") c.push(talentJob ? eq(applications.jobId, talentJob) : sql`false`);
  if (f.kind === "jobs" && talentJob) c.push(ne(applications.jobId, talentJob));
  if (f.state === "open") c.push(openCond());
  if (f.state === "handled") c.push(handledCond());
  if (f.jobId && isUuid(f.jobId)) c.push(eq(applications.jobId, f.jobId));
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
    c.push(or(ilike(experts.fullName, like), ilike(experts.email, like), ilike(experts.headline, like), ilike(jobs.title, like))!);
  }
  return c;
}

export async function listInbound(db: DB, f: { kind: InboundKind; state: InboundState; q?: string; jobId?: string; limit: number; offset: number }) {
  const talentJob = await talentCallJobId(db);
  const where = and(...conds(talentJob, f));
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: applications.id,
        expertId: applications.expertId,
        name: experts.fullName,
        email: experts.email,
        headline: experts.headline,
        country: experts.country,
        expertStatus: experts.status,
        cvRef: experts.cvRef,
        jobId: applications.jobId,
        jobTitle: jobs.title,
        stage: applications.stage,
        channel: applications.channel,
        handledAt: applications.handledAt,
        handledBy: applications.handledBy,
        consentAt: applications.consentAt,
        createdAt: applications.createdAt,
        answers: applications.answers,
      })
      .from(applications)
      .innerJoin(experts, eq(experts.id, applications.expertId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(where)
      .orderBy(desc(applications.createdAt))
      .limit(f.limit)
      .offset(f.offset),
    db.select({ n: count() }).from(applications).innerJoin(experts, eq(experts.id, applications.expertId)).innerJoin(jobs, eq(jobs.id, applications.jobId)).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r, isTalentCall: r.jobId === talentJob })), total: Number(n), talentJob };
}
export type InboundRow = Awaited<ReturnType<typeof listInbound>>["rows"][number];

/** Counts for the tabs: open / handled / all, for the kind picked. */
export async function inboundCounts(db: DB, kind: InboundKind) {
  const talentJob = await talentCallJobId(db);
  const base = conds(talentJob, { kind, state: "all" });
  const one = async (extra?: SQL) => Number((await db.select({ n: count() }).from(applications).where(and(...base, ...(extra ? [extra] : []))))[0].n);
  const [open, handled, all] = await Promise.all([one(openCond()), one(handledCond()), one()]);
  return { open, handled, all };
}

/** The labelled answers of one application (the side panel), in form order. File answers show their name. */
export async function inboundAnswers(db: DB, appId: string): Promise<{ label: string; value: string }[]> {
  if (!isUuid(appId)) return [];
  const [a] = await db.select({ jobId: applications.jobId, answers: applications.answers }).from(applications).where(eq(applications.id, appId)).limit(1);
  if (!a) return [];
  const fields = await db.select({ id: jobFormFields.id, label: jobFormFields.label, type: jobFormFields.type }).from(jobFormFields).where(eq(jobFormFields.jobId, a.jobId)).orderBy(jobFormFields.position);
  const answers = (a.answers ?? {}) as Record<string, unknown>;
  const out: { label: string; value: string }[] = [];
  for (const f of fields) {
    if (f.type === "section") continue;
    const v = answers[f.id];
    if (v == null || v === "") continue;
    const value = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? String((v as { filename?: string }).filename ?? "File") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
    if (value.trim()) out.push({ label: f.label, value: value.slice(0, 3000) });
  }
  return out;
}

/** Mark handled (or open again). handled_at / handled_by say who and when. */
export async function setHandled(db: DB, actor: Actor, ids: string[], handled: boolean) {
  const clean = [...new Set(ids.filter(isUuid))].slice(0, 500);
  if (!clean.length) return { ok: false as const, reason: "Tick at least one application." };
  const by = actorEmail(actor);
  const rows = await db.select({ id: applications.id, handledAt: applications.handledAt, jobId: applications.jobId }).from(applications).where(inArray(applications.id, clean));
  const moving = rows.filter((r) => Boolean(r.handledAt) !== handled);
  if (moving.length) {
    await db
      .update(applications)
      .set(handled ? { handledAt: new Date(), handledBy: by, updatedAt: new Date() } : { handledAt: null, handledBy: null, updatedAt: new Date() })
      .where(inArray(applications.id, moving.map((r) => r.id)));
    for (const r of moving) await logActivity(db, { entityType: "application", entityId: r.id, actor, action: handled ? "handled" : "reopened", detail: { jobId: r.jobId } });
  }
  return { ok: true as const, changed: moving.length };
}
