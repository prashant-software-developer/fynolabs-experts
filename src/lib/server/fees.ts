// Fees & earnings (money: admins and finance only, checked by every page and action that calls these).
// Referral fees partners owe us (expected -> invoiced -> paid, or void), the fee rules that add an
// expected fee when someone on a project reaches a stage, and the experts' monthly earnings with
// our commission. Paid and void fees are final; fees are never deleted.
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, engagements, experts, jobs, monthlyEarnings, partners, projectFeeRules, projects, projectTracks, referralFees } from "@/db/schema";
import { DOCUMENT_STAGES, FEE_STATUSES, PIPELINE_STAGES, isOneOf, type PipelineStage } from "@/lib/constants";
import { cleanText, isoDate } from "@/lib/normalize";
import { addDays, feeMoveAllowed, isOverdue, PIPELINE_LINE, todayIndia } from "@/lib/talent";
import { actorEmail, logActivity, type Actor } from "./activity";
import { isUuid } from "./experts";

export const FEE_TABS = ["expected", "invoiced", "paid", "void", "all"] as const;

const feeColumns = {
  id: referralFees.id,
  personName: referralFees.personName,
  expertId: referralFees.expertId,
  projectId: referralFees.projectId,
  projectCode: projects.code,
  projectName: projects.name,
  companyId: referralFees.companyId,
  companyName: partners.name,
  jobId: referralFees.jobId,
  jobTitle: jobs.title,
  ruleId: referralFees.ruleId,
  amount: referralFees.amount,
  currency: referralFees.currency,
  status: referralFees.status,
  earnedOn: referralFees.earnedOn,
  invoiceNumber: referralFees.invoiceNumber,
  invoicedOn: referralFees.invoicedOn,
  dueOn: referralFees.dueOn,
  paidOn: referralFees.paidOn,
  paidAmount: referralFees.paidAmount,
  voidReason: referralFees.voidReason,
  notes: referralFees.notes,
  updatedBy: referralFees.updatedBy,
};

export async function listFees(db: DB, f: { tab?: string; projectId?: string; companyId?: string; month?: string } = {}) {
  const c: SQL[] = [];
  if (f.tab && f.tab !== "all" && isOneOf(FEE_STATUSES, f.tab)) c.push(eq(referralFees.status, f.tab));
  if (f.tab === "overdue") c.push(sql`${referralFees.status} = 'invoiced' and ${referralFees.dueOn} < ${todayIndia()}::date`);
  if (f.projectId && isUuid(f.projectId)) c.push(eq(referralFees.projectId, f.projectId));
  if (f.companyId && isUuid(f.companyId)) c.push(eq(referralFees.companyId, f.companyId));
  if (f.month && /^\d{4}-\d{2}$/.test(f.month)) c.push(sql`to_char(${referralFees.earnedOn}, 'YYYY-MM') = ${f.month}`);
  const rows = await db
    .select(feeColumns)
    .from(referralFees)
    .leftJoin(projects, eq(projects.id, referralFees.projectId))
    .leftJoin(partners, eq(partners.id, referralFees.companyId))
    .leftJoin(jobs, eq(jobs.id, referralFees.jobId))
    .where(c.length ? and(...c) : undefined)
    .orderBy(desc(referralFees.earnedOn), desc(referralFees.createdAt))
    .limit(2000);
  const today = todayIndia();
  return rows.map((r) => ({ ...r, overdue: isOverdue(r, today) }));
}
export type FeeRow = Awaited<ReturnType<typeof listFees>>[number];

const add = (m: Map<string, number>, cur: string, v: number) => m.set(cur, (m.get(cur) ?? 0) + v);

/** The four tiles (per currency): to invoice, invoiced, overdue, paid (what was received). Void left out. */
export async function feeSummary(db: DB) {
  const rows = await db.select({ status: referralFees.status, amount: referralFees.amount, paidAmount: referralFees.paidAmount, currency: referralFees.currency, dueOn: referralFees.dueOn }).from(referralFees);
  const today = todayIndia();
  const s = { toInvoice: new Map<string, number>(), toInvoiceCount: 0, invoiced: new Map<string, number>(), overdue: new Map<string, number>(), overdueCount: 0, paid: new Map<string, number>(), counts: { expected: 0, invoiced: 0, paid: 0, void: 0 } as Record<string, number> };
  for (const r of rows) {
    s.counts[r.status] = (s.counts[r.status] ?? 0) + 1;
    if (r.status === "expected") {
      add(s.toInvoice, r.currency, Number(r.amount));
      s.toInvoiceCount++;
    }
    if (r.status === "invoiced") {
      add(s.invoiced, r.currency, Number(r.amount));
      if (isOverdue(r, today)) {
        add(s.overdue, r.currency, Number(r.amount));
        s.overdueCount++;
      }
    }
    if (r.status === "paid") add(s.paid, r.currency, Number(r.paidAmount ?? r.amount));
  }
  return s;
}

export type FeeTotal = { key: string; label: string; currency: string; expected: number; invoiced: number; paid: number; count: number };

/** Totals by project, by company (the payer) and by month earned, per currency. Void fees left out. */
export async function feeTotals(db: DB): Promise<{ byProject: FeeTotal[]; byCompany: FeeTotal[]; byMonth: FeeTotal[] }> {
  const rows = await db
    .select({ status: referralFees.status, amount: referralFees.amount, paidAmount: referralFees.paidAmount, currency: referralFees.currency, earnedOn: referralFees.earnedOn, projectId: referralFees.projectId, projectCode: projects.code, projectName: projects.name, companyId: referralFees.companyId, companyName: partners.name })
    .from(referralFees)
    .leftJoin(projects, eq(projects.id, referralFees.projectId))
    .leftJoin(partners, eq(partners.id, referralFees.companyId));
  const group = (keyOf: (r: (typeof rows)[number]) => [string, string]) => {
    const m = new Map<string, FeeTotal>();
    for (const r of rows) {
      if (r.status === "void") continue;
      const [k, label] = keyOf(r);
      const key = `${k}|${r.currency}`;
      const t = m.get(key) ?? { key: k, label, currency: r.currency, expected: 0, invoiced: 0, paid: 0, count: 0 };
      if (r.status === "expected") t.expected += Number(r.amount);
      if (r.status === "invoiced") t.invoiced += Number(r.amount);
      if (r.status === "paid") t.paid += Number(r.paidAmount ?? r.amount);
      t.count++;
      m.set(key, t);
    }
    return [...m.values()];
  };
  return {
    byProject: group((r) => [r.projectId ?? "none", r.projectCode ? `${r.projectCode} · ${r.projectName}` : "No project"]).sort((a, b) => a.label.localeCompare(b.label)),
    byCompany: group((r) => [r.companyId ?? "none", r.companyName ?? "No payer"]).sort((a, b) => a.label.localeCompare(b.label)),
    byMonth: group((r) => [r.earnedOn.slice(0, 7), r.earnedOn.slice(0, 7)]).sort((a, b) => b.key.localeCompare(a.key)),
  };
}

export type MarkInput = { to: string; invoiceNumber?: string | null; invoicedOn?: string | null; dueOn?: string | null; paidOn?: string | null; paidAmount?: string | number | null; voidReason?: string | null };

/**
 * Mark fees invoiced, paid or void (at most 500 at once). Invoiced needs the invoice number; a due
 * date defaults to the invoice date plus the rule's payment terms (30 days without a rule). Paid
 * defaults to today and the full fee (a custom amount only for one fee). Void needs a reason.
 */
export async function markFees(db: DB, actor: Actor, ids: string[], input: MarkInput) {
  if (!["invoiced", "paid", "void"].includes(input.to)) return { ok: false as const, reason: "Pick invoiced, paid or void." };
  const clean = [...new Set(ids.filter(isUuid))].slice(0, 500);
  if (!clean.length) return { ok: false as const, reason: "Tick at least one fee." };
  const invoiceNumber = cleanText(input.invoiceNumber, 60);
  const voidReason = cleanText(input.voidReason, 300);
  if (input.to === "invoiced" && !invoiceNumber) return { ok: false as const, reason: "Add the invoice number." };
  if (input.to === "void" && !voidReason) return { ok: false as const, reason: "Say why." };
  const today = todayIndia();
  const invoicedOn = isoDate(input.invoicedOn) ?? today;
  const dueOn = isoDate(input.dueOn);
  const paidOn = isoDate(input.paidOn) ?? today;
  const custom = input.paidAmount != null && String(input.paidAmount).trim() !== "" ? Number(input.paidAmount) : null;
  if (custom != null && (!Number.isFinite(custom) || custom < 0 || custom > 1_000_000)) return { ok: false as const, reason: "The amount received must be between 0 and 1,000,000." };
  const rows = await db.select({ id: referralFees.id, status: referralFees.status, amount: referralFees.amount, terms: projectFeeRules.paymentTermsDays }).from(referralFees).leftJoin(projectFeeRules, eq(projectFeeRules.id, referralFees.ruleId)).where(inArray(referralFees.id, clean));
  const by = actorEmail(actor);
  const skipped: string[] = [];
  let changed = 0;
  for (const r of rows) {
    if (!feeMoveAllowed(r.status, input.to)) {
      skipped.push(r.status === "paid" ? "already paid" : r.status === "void" ? "void" : `already ${r.status}`);
      continue;
    }
    const patch: Partial<typeof referralFees.$inferInsert> =
      input.to === "invoiced"
        ? { status: "invoiced", invoiceNumber, invoicedOn, dueOn: dueOn ?? addDays(invoicedOn, r.terms ?? 30) }
        : input.to === "paid"
          ? { status: "paid", paidOn, paidAmount: custom != null && clean.length === 1 ? custom : Number(r.amount) }
          : { status: "void", voidReason };
    await db.update(referralFees).set({ ...patch, updatedAt: new Date(), updatedBy: by }).where(eq(referralFees.id, r.id));
    await logActivity(db, { entityType: "fee", entityId: r.id, actor, action: `marked_${input.to}`, detail: { from: r.status } });
    changed++;
  }
  return { ok: true as const, changed, skipped };
}

// ---------------------------------------------------------------- fee rules

export async function listFeeRules(db: DB) {
  return db
    .select({ id: projectFeeRules.id, projectId: projectFeeRules.projectId, projectCode: projects.code, projectName: projects.name, trackId: projectFeeRules.trackId, trackName: projectTracks.name, amount: projectFeeRules.amount, currency: projectFeeRules.currency, earnedAtStage: projectFeeRules.earnedAtStage, paymentTermsDays: projectFeeRules.paymentTermsDays, active: projectFeeRules.active, notes: projectFeeRules.notes })
    .from(projectFeeRules)
    .innerJoin(projects, eq(projects.id, projectFeeRules.projectId))
    .leftJoin(projectTracks, eq(projectTracks.id, projectFeeRules.trackId))
    .orderBy(asc(projects.code), asc(projectTracks.position));
}

/** One rule per project + track (or the whole project). Earned at Proposed to client ... Active. */
export async function saveFeeRule(db: DB, actor: Actor, input: { id?: string | null; projectId?: unknown; trackId?: unknown; amount: unknown; currency: unknown; earnedAtStage: unknown; paymentTermsDays: unknown; active: boolean; notes?: unknown }) {
  const amount = Number(input.amount);
  const currency = String(input.currency ?? "").trim().toUpperCase();
  const terms = input.paymentTermsDays === "" || input.paymentTermsDays == null ? 30 : Number(input.paymentTermsDays);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000 || !/^[A-Z]{3}$/.test(currency)) return { ok: false as const, reason: "Pick a project, an amount and a 3-letter currency." };
  if (!Number.isInteger(terms) || terms < 0 || terms > 365) return { ok: false as const, reason: "Payment terms are 0 to 365 days." };
  const stage = isOneOf(DOCUMENT_STAGES, input.earnedAtStage) ? input.earnedAtStage : "active";
  const by = actorEmail(actor);
  const now = new Date();
  if (input.id && isUuid(input.id)) {
    const [row] = await db.update(projectFeeRules).set({ amount, currency, earnedAtStage: stage, paymentTermsDays: terms, active: input.active, notes: cleanText(input.notes, 500), updatedAt: now, updatedBy: by }).where(eq(projectFeeRules.id, input.id)).returning({ id: projectFeeRules.id });
    if (!row) return { ok: false as const, reason: "That rule no longer exists." };
    await logActivity(db, { entityType: "fee", entityId: row.id, actor, action: "rule_updated" });
    return { ok: true as const, id: row.id };
  }
  const projectId = typeof input.projectId === "string" && isUuid(input.projectId) ? input.projectId : null;
  if (!projectId) return { ok: false as const, reason: "Pick a project, an amount and a 3-letter currency." };
  const trackId = typeof input.trackId === "string" && isUuid(input.trackId) ? input.trackId : null;
  if (trackId) {
    const [t] = await db.select({ p: projectTracks.projectId }).from(projectTracks).where(eq(projectTracks.id, trackId)).limit(1);
    if (!t || t.p !== projectId) return { ok: false as const, reason: "That track belongs to another project." };
  }
  const [clash] = await db.select({ id: projectFeeRules.id }).from(projectFeeRules).where(and(eq(projectFeeRules.projectId, projectId), trackId ? eq(projectFeeRules.trackId, trackId) : isNull(projectFeeRules.trackId))).limit(1);
  if (clash) return { ok: false as const, reason: "That project or track already has a rule; edit it instead." };
  const [row] = await db.insert(projectFeeRules).values({ projectId, trackId, amount, currency, earnedAtStage: stage, paymentTermsDays: terms, active: input.active, notes: cleanText(input.notes, 500), createdBy: by, updatedBy: by, createdAt: now, updatedAt: now }).returning({ id: projectFeeRules.id });
  await logActivity(db, { entityType: "fee", entityId: row.id, actor, action: "rule_created" });
  return { ok: true as const, id: row.id };
}

const reached = (stage: string, needed: string) => stage !== "rejected" && PIPELINE_LINE.indexOf(stage as PipelineStage) >= PIPELINE_LINE.indexOf(needed as PipelineStage);

/** The rule that applies to a pipeline: its track's rule, else the whole project's (active only). */
async function ruleFor(db: DB, projectId: string, trackId: string | null) {
  const rules = await db.select().from(projectFeeRules).where(and(eq(projectFeeRules.projectId, projectId), eq(projectFeeRules.active, true)));
  return rules.find((r) => trackId && r.trackId === trackId) ?? rules.find((r) => !r.trackId) ?? null;
}

/**
 * When a pipeline reaches its project's fee stage, an expected fee is added once (never again for
 * the same pipeline, even if the first was voided). Payer: the project's company.
 */
export async function ensureFeeForPipeline(db: DB, actor: Actor, applicationId: string): Promise<boolean> {
  const [p] = await db
    .select({ id: applications.id, stage: applications.stage, trackId: applications.trackId, expertId: applications.expertId, jobId: applications.jobId, projectId: jobs.projectId, companyId: projects.companyId, name: experts.fullName })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(experts, eq(experts.id, applications.expertId))
    .leftJoin(projects, eq(projects.id, jobs.projectId))
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!p?.projectId || !isOneOf(PIPELINE_STAGES, p.stage)) return false;
  const rule = await ruleFor(db, p.projectId, p.trackId);
  if (!rule || !reached(p.stage, rule.earnedAtStage)) return false;
  const [has] = await db.select({ id: referralFees.id }).from(referralFees).where(eq(referralFees.applicationId, applicationId)).limit(1);
  if (has) return false;
  const by = actorEmail(actor);
  const [row] = await db
    .insert(referralFees)
    .values({ projectId: p.projectId, companyId: p.companyId, ruleId: rule.id, applicationId, expertId: p.expertId, jobId: p.jobId, personName: p.name, amount: rule.amount, currency: rule.currency, status: "expected", earnedOn: todayIndia(), createdBy: by, updatedBy: by })
    .returning({ id: referralFees.id });
  await logActivity(db, { entityType: "fee", entityId: row.id, actor, action: "expected_added", detail: { applicationId, ruleId: rule.id } });
  return true;
}

/** People already past a rule's stage without a fee (offered after a rule is saved). */
export async function missingFees(db: DB, ruleId: string) {
  if (!isUuid(ruleId)) return [];
  const [rule] = await db.select().from(projectFeeRules).where(eq(projectFeeRules.id, ruleId)).limit(1);
  if (!rule || !rule.active) return [];
  const rows = await db
    .select({ id: applications.id, stage: applications.stage, trackId: applications.trackId, name: experts.fullName })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(experts, eq(experts.id, applications.expertId))
    .where(and(eq(jobs.projectId, rule.projectId), sql`not exists (select 1 from ${referralFees} f where f.application_id = ${applications.id})`));
  const out = [];
  for (const r of rows) {
    if (!reached(r.stage, rule.earnedAtStage)) continue;
    const applies = await ruleFor(db, rule.projectId, r.trackId);
    if (applies?.id === rule.id) out.push({ applicationId: r.id, name: r.name, amount: rule.amount, currency: rule.currency });
  }
  return out;
}

export async function addMissingFees(db: DB, actor: Actor, ruleId: string) {
  const list = await missingFees(db, ruleId);
  let added = 0;
  for (const m of list) if (await ensureFeeForPipeline(db, actor, m.applicationId)) added++;
  return { ok: true as const, added };
}

// ---------------------------------------------------------------- earnings

/** Monthly earnings with the engagement (platform, project), newest month first. */
export async function listEarnings(db: DB, f: { month?: string } = {}) {
  return db
    .select({ id: monthlyEarnings.id, month: monthlyEarnings.month, grossInr: monthlyEarnings.grossInr, commissionInr: monthlyEarnings.commissionInr, commissionPercent: monthlyEarnings.commissionPercent, expertId: monthlyEarnings.expertId, expertName: experts.fullName, platform: engagements.platform, agency: engagements.agency, project: engagements.project, engagementStatus: engagements.status })
    .from(monthlyEarnings)
    .innerJoin(engagements, eq(engagements.id, monthlyEarnings.engagementId))
    .innerJoin(experts, eq(experts.id, monthlyEarnings.expertId))
    .where(f.month && /^\d{4}-\d{2}$/.test(f.month) ? sql`to_char(${monthlyEarnings.month}, 'YYYY-MM') = ${f.month}` : undefined)
    .orderBy(desc(monthlyEarnings.month), asc(experts.fullName))
    .limit(2000);
}

/** Earnings per month: gross and our commission (INR), and how many people. */
export async function earningsByMonth(db: DB) {
  const rows = await db
    .select({ month: sql<string>`to_char(${monthlyEarnings.month}, 'YYYY-MM')`, gross: sql<number>`coalesce(sum(${monthlyEarnings.grossInr}), 0)`.mapWith(Number), commission: sql<number>`coalesce(sum(${monthlyEarnings.commissionInr}), 0)`.mapWith(Number), people: sql<number>`count(distinct ${monthlyEarnings.expertId})`.mapWith(Number) })
    .from(monthlyEarnings)
    .groupBy(sql`to_char(${monthlyEarnings.month}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${monthlyEarnings.month}, 'YYYY-MM') desc`);
  return rows;
}

export async function activeEngagements(db: DB) {
  return db
    .select({ id: engagements.id, expertId: engagements.expertId, expertName: experts.fullName, platform: engagements.platform, agency: engagements.agency, project: engagements.project, status: engagements.status, commissionPercent: engagements.commissionPercent, startedOn: engagements.startedOn, endedOn: engagements.endedOn })
    .from(engagements)
    .innerJoin(experts, eq(experts.id, engagements.expertId))
    .orderBy(sql`case ${engagements.status} when 'active' then 0 else 1 end`, desc(engagements.startedOn))
    .limit(1000);
}
