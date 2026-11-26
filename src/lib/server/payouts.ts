// Payouts to experts (money): what we pay each expert, per project and period. Experts read their
// own on /me/payments: only their own rows, their own rate (placements.rate_to_expert), never the
// partner's rate, revenue, commissions or fees, and never the client's name. The team records
// payouts on /admin/payouts (money roles only: view money.read, change fees.manage). Paid and
// cancelled (void) payouts are final; payouts are never deleted. Tested in tests/payouts.test.ts.
import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { activity, expertPayout, experts, partners, payouts, placements, type Activity } from "@/db/schema";
import { PAYOUT_METHOD_LABELS, PAYOUT_METHODS, PAYOUT_STATUSES, isOneOf, label as labelOf, type PayoutStatus } from "@/lib/constants";
import { cleanLongText, cleanText } from "@/lib/normalize";
import { mentionsPartner } from "@/lib/public-copy";
import { todayIndia } from "@/lib/talent";
import { actorEmail, actorRole, logActivity, type Actor } from "./activity";
import { projectTitleForExpert } from "./portal-home";

export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export type MoneyTotal = { currency: string; amount: number };

const PORTAL_ACTOR: Actor = { email: "expert-portal", role: "expert" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Payouts with no project are charted and totalled under this key. */
export const NO_PROJECT = "other";

/** The expert's next payout that hasn't been paid yet (for Home), or null. */
export async function nextPayout(db: DB, expertId: string): Promise<{ amount: number; currency: string; expectedOn: string | null } | null> {
  const [row] = await db
    .select({ amount: payouts.amount, currency: payouts.currency, expectedOn: payouts.expectedOn })
    .from(payouts)
    .where(and(eq(payouts.expertId, expertId), eq(payouts.status, "upcoming")))
    .orderBy(asc(payouts.expectedOn))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------- formatting (pure)

const localeFor = (currency: string) => (currency === "INR" ? "en-IN" : currency === "USD" ? "en-US" : "en");

/**
 * "₹1,23,456.00" (INR with Indian grouping), "$1,301.93" (USD), other currencies in their own
 * format. `whole`: no ".00" on a whole amount ("₹3,400", "₹0").
 */
export function moneyText(amount: number | null | undefined, currency: string | null | undefined, opts: { whole?: boolean } = {}): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "–";
  const n = Number(amount);
  const cur = (currency ?? "").trim().toUpperCase() || "INR";
  const whole = Boolean(opts.whole) && Number.isInteger(r2(n));
  try {
    return new Intl.NumberFormat(localeFor(cur), { style: "currency", currency: cur, ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}) }).format(n);
  } catch {
    return `${cur} ${whole ? String(Math.round(n)) : n.toFixed(2)}`;
  }
}

/** The number alone, grouped for its currency ("1,23,456.00" for INR, "1,301.93" for USD), for tables with a currency column. */
export function plainAmount(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "–";
  const cur = (currency ?? "").trim().toUpperCase() || "INR";
  return new Intl.NumberFormat(localeFor(cur), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));
}

/** Several currencies side by side ("₹12,000.00 · $50.00"); nothing at all reads "₹0" in the fallback currency. */
export function totalsText(totals: readonly MoneyTotal[], fallbackCurrency: string, opts: { whole?: boolean } = {}): string {
  if (!totals.length) return moneyText(0, fallbackCurrency, { whole: true });
  return totals.map((t) => moneyText(t.amount, t.currency, opts)).join(" · ");
}

/** Short amounts for a chart's axis ("₹1.2L", "₹60K", "$1.5K"). */
export function compactMoney(amount: number, currency: string): string {
  const cur = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(localeFor(cur), { style: "currency", currency: cur, notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(amount);
  } catch {
    return `${cur} ${Math.round(amount)}`;
  }
}

/** The expert's own rate: "₹3,400 per task" or "$50/hour". */
export function rateText(basis: string, rate: number | null | undefined, currency: string): string {
  if (rate == null) return "Rate to be confirmed";
  const amount = moneyText(rate, currency, { whole: true });
  return basis === "per_task" ? `${amount} per task` : `${amount}/hour`;
}

const dayMonth = (iso: string, withYear: boolean) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

/** "2 Dec" in the current year, "2 Dec 2027" otherwise. */
export function shortDate(iso: string, today = todayIndia()): string {
  return dayMonth(iso, iso.slice(0, 4) !== today.slice(0, 4));
}

/** "1–15 Nov 2026", "28 Oct – 3 Nov 2026", "28 Dec 2026 – 3 Jan 2027"; one end only: "From ..." / "Until ...". */
export function periodText(start: string | null | undefined, end: string | null | undefined): string | null {
  if (start && end) {
    if (start === end) return dayMonth(start, true);
    if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8, 10))}–${dayMonth(end, true)}`;
    if (start.slice(0, 4) === end.slice(0, 4)) return `${dayMonth(start, false)} – ${dayMonth(end, true)}`;
    return `${dayMonth(start, true)} – ${dayMonth(end, true)}`;
  }
  if (start) return `From ${dayMonth(start, true)}`;
  if (end) return `Until ${dayMonth(end, true)}`;
  return null;
}

export const PAYOUT_STATUS_TONE: Record<PayoutStatus, "info" | "progress" | "success" | "danger" | "muted"> = {
  upcoming: "info",
  processing: "progress",
  paid: "success",
  failed: "danger",
  void: "muted",
};

// ---------------------------------------------------------------- payout method (expert side)

const METHOD_ALIASES = new Map<string, PayoutMethod>([
  ["bank", "bank_transfer"],
  ["bank_transfer", "bank_transfer"],
  ["banktransfer", "bank_transfer"],
  ["bank_account", "bank_transfer"],
  ["wire", "bank_transfer"],
  ["wire_transfer", "bank_transfer"],
  ["neft", "bank_transfer"],
  ["imps", "bank_transfer"],
  ["upi", "upi"],
  ["paypal", "paypal"],
  ["wise", "wise"],
  ["transferwise", "wise"],
  ["other", "other"],
]);
const methodKey = (raw: string | null | undefined) => (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

/** A stored method (the old jobs site's wording too) as one of PAYOUT_METHODS; unknown wording is "other". */
export function normalizeMethod(raw: string | null | undefined): PayoutMethod | null {
  const k = methodKey(raw);
  if (!k) return null;
  return METHOD_ALIASES.get(k) ?? "other";
}

export type OwnPayoutMethod = { method: PayoutMethod; label: string; handle: string | null };

/** How the expert asked to be paid: method and handle only (never the tax form or our commission). */
export async function ownPayoutMethod(db: DB, expertId: string): Promise<OwnPayoutMethod | null> {
  const [row] = await db.select({ method: expertPayout.payoutMethod, handle: expertPayout.payoutHandle }).from(expertPayout).where(eq(expertPayout.expertId, expertId)).limit(1);
  const method = normalizeMethod(row?.method);
  if (!row || !method) return null;
  // Wording from the old jobs site we don't know (e.g. "Payoneer") is shown as they typed it.
  const name = METHOD_ALIASES.has(methodKey(row.method)) ? PAYOUT_METHOD_LABELS[method] : labelOf(cleanText(row.method, 40) ?? "other");
  return { method, label: name, handle: cleanText(row.handle, 200) };
}

/** "Paid by UPI · name@okaxis", "Paid by bank transfer"; null when there is no method yet. */
export function methodLine(m: OwnPayoutMethod | null): string | null {
  if (!m) return null;
  if (m.method === "bank_transfer") return "Paid by bank transfer";
  const name = m.method === "other" && m.label === PAYOUT_METHOD_LABELS.other ? "another method" : m.label;
  return m.handle ? `Paid by ${name} · ${m.handle}` : `Paid by ${name}`;
}

/** name@bank: the name may be a mobile number; the bank part is the app's handle (okaxis, ybl, paytm...). */
export const UPI_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Does this look like a bank account, card or routing number? Any run of 9 or more digits (spaces,
 * dots or dashes between them allowed), except a 10-digit mobile number, or 12+ digits in all.
 */
export function looksLikeAccountNumber(text: string): boolean {
  if (text.replace(/\D/g, "").length >= 12) return true;
  for (const run of text.match(/\d(?:[\s.-]?\d)*/g) ?? []) {
    const digits = run.replace(/\D/g, "");
    if (digits.length >= 11) return true;
    if (digits.length >= 9 && !/^[6-9]\d{9}$/.test(digits)) return true;
  }
  return false;
}

export type MethodErrors = { method?: string; handle?: string };
export type MethodCheck = { ok: true; method: PayoutMethod; handle: string | null } | { ok: false; errors: MethodErrors };

const NO_ACCOUNT_NUMBERS = "That looks like a bank account or card number. We never collect those here; we'll ask by email if we need bank details.";

/**
 * Checks the payout method form. UPI: a UPI ID (name@bank). PayPal and Wise: the account's email.
 * Bank transfer: nothing (we ask for bank details by email). Other: a short note. Anything that
 * looks like a bank account or card number is refused.
 */
export function checkPayoutMethod(input: { method: unknown; handle?: unknown }): MethodCheck {
  const method = typeof input.method === "string" ? input.method.trim() : "";
  if (!isOneOf(PAYOUT_METHODS, method)) return { ok: false, errors: { method: "Choose how we should pay you." } };
  if (method === "bank_transfer") return { ok: true, method, handle: null };
  const raw = String(input.handle ?? "").trim();
  if (!raw) return { ok: false, errors: { handle: method === "upi" ? "Add your UPI ID." : method === "other" ? "Tell us how to pay you." : `Add the email on your ${PAYOUT_METHOD_LABELS[method]} account.` } };
  if (method === "upi") {
    const id = raw.toLowerCase();
    if (/\.ifsc\.npci$/.test(id)) return { ok: false, errors: { handle: "That UPI ID holds your bank account number. Use one like name@okaxis, or your mobile number UPI ID." } };
    if (!UPI_ID_RE.test(id)) return { ok: false, errors: { handle: "Enter a UPI ID like name@okaxis." } };
    if (looksLikeAccountNumber(id)) return { ok: false, errors: { handle: NO_ACCOUNT_NUMBERS } };
    return { ok: true, method, handle: id };
  }
  if (method === "paypal" || method === "wise") {
    const email = raw.toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, errors: { handle: "Enter the email address on that account." } };
    if (looksLikeAccountNumber(email)) return { ok: false, errors: { handle: NO_ACCOUNT_NUMBERS } };
    return { ok: true, method, handle: email };
  }
  if (raw.length > 120) return { ok: false, errors: { handle: "Keep it short: up to 120 characters." } };
  const note = cleanText(raw, 120);
  if (!note) return { ok: false, errors: { handle: "Tell us how to pay you." } };
  if (looksLikeAccountNumber(note)) return { ok: false, errors: { handle: NO_ACCOUNT_NUMBERS } };
  return { ok: true, method, handle: note };
}

/** Saves the expert's own payout method (expert_payout; the tax form and commission stay as they are). */
export async function savePayoutMethod(db: DB, expertId: string, input: { method: unknown; handle?: unknown }): Promise<(MethodCheck & { ok: false }) | { ok: true; method: PayoutMethod; handle: string | null; changed: boolean }> {
  const check = checkPayoutMethod(input);
  if (!check.ok) return check;
  const [cur] = await db.select({ method: expertPayout.payoutMethod, handle: expertPayout.payoutHandle }).from(expertPayout).where(eq(expertPayout.expertId, expertId)).limit(1);
  const fields: string[] = [];
  if ((cur?.method ?? null) !== check.method) fields.push("payoutMethod");
  if ((cur?.handle ?? null) !== check.handle) fields.push("payoutHandle");
  if (!fields.length) return { ok: true, method: check.method, handle: check.handle, changed: false };
  const now = new Date();
  const set = { payoutMethod: check.method, payoutHandle: check.handle, updatedBy: "expert-portal", updatedAt: now };
  await db.insert(expertPayout).values({ expertId, ...set }).onConflictDoUpdate({ target: expertPayout.expertId, set });
  await logActivity(db, { entityType: "expert", entityId: expertId, actor: PORTAL_ACTOR, action: "payout_method_saved", detail: { fields, via: "portal" } });
  return { ok: true, method: check.method, handle: check.handle, changed: true };
}

// ---------------------------------------------------------------- summary (pure + Home)

export type PayoutSummary = {
  /** The expert's main currency (most of their payouts), for "₹0" when there is nothing. */
  currency: string;
  paidToDate: MoneyTotal[];
  /** Processing: on its way. */
  current: { totals: MoneyTotal[]; count: number };
  /** The earliest upcoming date (every upcoming payout on that date), or the undated ones. */
  next: { expectedOn: string | null; totals: MoneyTotal[]; count: number } | null;
  paidThisMonth: { totals: MoneyTotal[]; count: number };
  /** Payouts that didn't go through (the expert should check their payout method). */
  failed: number;
};

type SumRow = { status: string; amount: number; currency: string; expectedOn: string | null; paidOn: string | null };

/** The currency most of these payouts are in (ties: the first one listed), else the fallback. */
export function mainCurrency(rows: readonly { currency: string }[], fallback = "INR"): string {
  const n = new Map<string, number>();
  for (const r of rows) n.set(r.currency, (n.get(r.currency) ?? 0) + 1);
  let best = fallback;
  let max = 0;
  for (const [c, k] of n)
    if (k > max) {
      best = c;
      max = k;
    }
  return best;
}

const addTo = (m: Map<string, number>, r: { currency: string; amount: number }) => m.set(r.currency, r2((m.get(r.currency) ?? 0) + Number(r.amount)));

/** Main currency first, then the others A-Z. */
function totalsOf(m: Map<string, number>, main: string): MoneyTotal[] {
  return [...m.entries()].sort(([a], [b]) => (a === main ? -1 : b === main ? 1 : a.localeCompare(b))).map(([currency, amount]) => ({ currency, amount }));
}

/** Paid to date, in transit, next and this month's payouts, per currency. Void payouts don't count. */
export function summarizePayouts(rows: readonly SumRow[], today: string, fallbackCurrency = "INR"): PayoutSummary {
  const live = rows.filter((r) => r.status !== "void");
  const currency = mainCurrency(live, fallbackCurrency);
  const month = today.slice(0, 7);
  const paid = new Map<string, number>();
  const current = new Map<string, number>();
  const thisMonth = new Map<string, number>();
  let currentCount = 0;
  let monthCount = 0;
  let failed = 0;
  for (const r of live) {
    if (r.status === "paid") {
      addTo(paid, r);
      if (r.paidOn?.slice(0, 7) === month) {
        addTo(thisMonth, r);
        monthCount++;
      }
    } else if (r.status === "processing") {
      addTo(current, r);
      currentCount++;
    } else if (r.status === "failed") failed++;
  }
  const upcoming = live.filter((r) => r.status === "upcoming");
  let next: PayoutSummary["next"] = null;
  if (upcoming.length) {
    const when = upcoming.map((r) => r.expectedOn).filter((d): d is string => Boolean(d)).sort()[0] ?? null;
    const group = upcoming.filter((r) => (r.expectedOn ?? null) === when);
    const m = new Map<string, number>();
    for (const r of group) addTo(m, r);
    next = { expectedOn: when, totals: totalsOf(m, currency), count: group.length };
  }
  return {
    currency,
    paidToDate: totalsOf(paid, currency),
    current: { totals: totalsOf(current, currency), count: currentCount },
    next,
    paidThisMonth: { totals: totalsOf(thisMonth, currency), count: monthCount },
    failed,
  };
}

/** The currency of the expert's latest project, for an expert with no payouts yet. */
async function projectCurrency(db: DB, expertId: string): Promise<string> {
  const [p] = await db.select({ currency: placements.currency }).from(placements).where(eq(placements.expertId, expertId)).orderBy(desc(placements.createdAt)).limit(1);
  return p?.currency ?? "INR";
}

/** The expert's payout summary (their own rows only), e.g. for Home. */
export async function payoutSummary(db: DB, expertId: string, opts: { today?: string } = {}): Promise<PayoutSummary> {
  const rows = await db
    .select({ status: payouts.status, amount: payouts.amount, currency: payouts.currency, expectedOn: payouts.expectedOn, paidOn: payouts.paidOn })
    .from(payouts)
    .where(and(eq(payouts.expertId, expertId), ne(payouts.status, "void")))
    .orderBy(desc(payouts.createdAt));
  return summarizePayouts(rows, opts.today ?? todayIndia(), rows.length ? "INR" : await projectCurrency(db, expertId));
}

// ---------------------------------------------------------------- the expert's Payments page

export type OwnPayout = {
  id: string;
  label: string | null;
  amount: number;
  currency: string;
  status: Exclude<PayoutStatus, "void">;
  periodStart: string | null;
  periodEnd: string | null;
  expectedOn: string | null;
  paidOn: string | null;
  reference: string | null;
  /** The placement id, or NO_PROJECT. */
  projectKey: string;
  /** The project as the expert sees it (never the client's name); null without a project. */
  projectTitle: string | null;
  /** The date it is listed and charted under: paid date when paid, else the expected date (or the period's end, or when it was added). */
  on: string;
};

export type OwnProject = {
  id: string;
  title: string;
  basis: string;
  rate: number | null;
  currency: string;
  status: string;
  rateText: string;
  paid: MoneyTotal[];
  /** Upcoming and processing (not paid yet). */
  upcoming: MoneyTotal[];
};

export type OwnPayments = {
  currency: string;
  /** Currencies with payouts to chart (main first). */
  currencies: string[];
  summary: PayoutSummary;
  method: OwnPayoutMethod | null;
  projects: OwnProject[];
  /** Totals of payouts that belong to no project (null when there are none). */
  other: { paid: MoneyTotal[]; upcoming: MoneyTotal[] } | null;
  history: OwnPayout[];
};

/** Paid and not-yet-paid (upcoming, processing) totals of some payouts. */
function projectTotals(rows: readonly OwnPayout[], main: string) {
  const paid = new Map<string, number>();
  const upcoming = new Map<string, number>();
  for (const h of rows) {
    if (h.status === "paid") addTo(paid, h);
    else if (h.status === "upcoming" || h.status === "processing") addTo(upcoming, h);
  }
  return { paid: totalsOf(paid, main), upcoming: totalsOf(upcoming, main) };
}

/** Text an expert sees, with the client's name taken out (labels typed by the team, imported references). */
function withoutClient(text: string | null, partnerName: string | null): string | null {
  if (!text || !partnerName || !mentionsPartner(text, partnerName)) return text;
  const out = projectTitleForExpert(text, partnerName);
  return out === "Project" && !/\bproject\b/i.test(text) ? null : out;
}

const PROJECT_ORDER: Record<string, number> = { active: 0, paused: 1, ended: 2 };

/**
 * Everything /me/payments shows, for the signed-in expert only: their payouts (not cancelled ones),
 * their projects with their own rate, their payout method and the summary. Internal notes, the
 * partner's rate, revenue, commissions and client names are never selected or returned.
 */
export async function ownPayments(db: DB, expertId: string, opts: { today?: string } = {}): Promise<OwnPayments> {
  const today = opts.today ?? todayIndia();
  const [rows, projectRows, method] = await Promise.all([
    db
      .select({
        id: payouts.id,
        label: payouts.label,
        amount: payouts.amount,
        currency: payouts.currency,
        status: payouts.status,
        periodStart: payouts.periodStart,
        periodEnd: payouts.periodEnd,
        expectedOn: payouts.expectedOn,
        paidOn: payouts.paidOn,
        reference: payouts.reference,
        createdAt: payouts.createdAt,
        placementId: placements.id,
        projectName: placements.projectName,
        partnerName: partners.name,
      })
      .from(payouts)
      // Only the expert's own placement names a project (a payout linked to someone else's shows as no project).
      .leftJoin(placements, and(eq(placements.id, payouts.placementId), eq(placements.expertId, payouts.expertId)))
      .leftJoin(partners, eq(partners.id, placements.partnerId))
      .where(and(eq(payouts.expertId, expertId), ne(payouts.status, "void")))
      .orderBy(desc(payouts.createdAt))
      .limit(1000),
    db
      .select({ id: placements.id, projectName: placements.projectName, partnerName: partners.name, basis: placements.basis, rate: placements.rateToExpert, currency: placements.currency, status: placements.status, startDate: placements.startDate })
      .from(placements)
      .leftJoin(partners, eq(partners.id, placements.partnerId))
      .where(eq(placements.expertId, expertId)),
    ownPayoutMethod(db, expertId),
  ]);

  const history: OwnPayout[] = rows
    .map((r) => {
      const status = r.status as OwnPayout["status"];
      const added = todayIndia(r.createdAt);
      const on = (status === "paid" ? (r.paidOn ?? r.expectedOn) : r.expectedOn) ?? r.periodEnd ?? added;
      return {
        id: r.id,
        label: withoutClient(r.label, r.partnerName),
        amount: Number(r.amount),
        currency: r.currency,
        status,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        expectedOn: r.expectedOn,
        paidOn: r.paidOn,
        reference: withoutClient(r.reference, r.partnerName),
        projectKey: r.placementId ?? NO_PROJECT,
        projectTitle: r.placementId ? projectTitleForExpert(r.projectName ?? "", r.partnerName) : null,
        on,
      };
    })
    .sort((a, b) => b.on.localeCompare(a.on));

  const ordered = [...projectRows].sort((a, b) => (PROJECT_ORDER[a.status] ?? 3) - (PROJECT_ORDER[b.status] ?? 3) || (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  // No payouts yet: "₹0" in the currency of their current project.
  const summary = summarizePayouts(history, today, rows.length ? "INR" : (ordered[0]?.currency ?? "INR"));
  const chartable = history.filter((p) => p.status !== "failed");
  const currencies = [...new Set(chartable.map((p) => p.currency))].sort((a, b) => (a === summary.currency ? -1 : b === summary.currency ? 1 : a.localeCompare(b)));

  const projects: OwnProject[] = ordered.map((p) => {
    const rate = p.rate == null ? null : Number(p.rate);
    return {
      id: p.id,
      title: projectTitleForExpert(p.projectName, p.partnerName),
      basis: p.basis,
      rate,
      currency: p.currency,
      status: p.status,
      rateText: rateText(p.basis, rate, p.currency),
      ...projectTotals(
        history.filter((h) => h.projectKey === p.id),
        summary.currency,
      ),
    };
  });
  const loose = history.filter((h) => h.projectKey === NO_PROJECT && h.status !== "failed");
  const other = loose.length ? projectTotals(loose, summary.currency) : null;

  return { currency: summary.currency, currencies, summary, method, projects, other, history };
}

// ---------------------------------------------------------------- earnings chart (pure)

export const CHART_RANGES = ["year", "12m", "all"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export const CHART_RANGE_LABELS: Record<ChartRange, string> = { year: "This year", "12m": "Last 12 months", all: "All time" };
export const chartRange = (v: unknown): ChartRange => (isOneOf(CHART_RANGES, v) ? v : "year");

export type ChartSeries = { key: string; label: string };
export type ChartMonth = { month: string; paid: Record<string, number>; upcoming: Record<string, number>; paidTotal: number; upcomingTotal: number };
export type ChartData = { range: ChartRange; currency: string; months: ChartMonth[]; series: ChartSeries[]; paidTotal: number; upcomingTotal: number };

/** "2026-11" plus n months. */
export function addMonths(month: string, n: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function monthsFrom(start: string, end: string): string[] {
  const out: string[] = [];
  for (let m = start; m <= end && out.length < 240; m = addMonths(m, 1)) out.push(m);
  return out;
}

/**
 * Money per month in one currency, per project: paid by the paid date, upcoming and processing
 * (not paid yet) by the expected date. year = January to December this year; 12m = the last 12
 * months (and up to 3 months ahead when something is expected then); all = first payout to last.
 * Failed payouts are left out.
 */
export function payoutChart(rows: readonly Pick<OwnPayout, "status" | "amount" | "currency" | "on" | "projectKey" | "projectTitle">[], opts: { range: ChartRange; currency: string; today: string }): ChartData {
  const now = opts.today.slice(0, 7);
  const items = rows.filter((r) => r.currency === opts.currency && r.status !== "failed").map((r) => ({ ...r, month: r.on.slice(0, 7), paid: r.status === "paid" }));
  let start: string;
  let end: string;
  if (opts.range === "year") {
    start = `${now.slice(0, 4)}-01`;
    end = `${now.slice(0, 4)}-12`;
  } else if (opts.range === "12m") {
    start = addMonths(now, -11);
    const ahead = items.filter((i) => !i.paid && i.month > now).map((i) => i.month).sort().pop();
    end = ahead ? (ahead < addMonths(now, 3) ? ahead : addMonths(now, 3)) : now;
  } else {
    const months = items.map((i) => i.month).sort();
    start = months[0] && months[0] < now ? months[0] : now;
    end = months.length && months[months.length - 1] > now ? months[months.length - 1] : now;
    if (monthsFrom(start, end).length >= 120) start = addMonths(end, -119);
  }
  const months: ChartMonth[] = monthsFrom(start, end).map((month) => ({ month, paid: {}, upcoming: {}, paidTotal: 0, upcomingTotal: 0 }));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const totals = new Map<string, { label: string; total: number }>();
  for (const i of items) {
    const m = byMonth.get(i.month);
    if (!m) continue;
    const bucket = i.paid ? m.paid : m.upcoming;
    bucket[i.projectKey] = r2((bucket[i.projectKey] ?? 0) + i.amount);
    if (i.paid) m.paidTotal = r2(m.paidTotal + i.amount);
    else m.upcomingTotal = r2(m.upcomingTotal + i.amount);
    const s = totals.get(i.projectKey) ?? { label: i.projectTitle ?? "Other payouts", total: 0 };
    s.total = r2(s.total + i.amount);
    totals.set(i.projectKey, s);
  }
  const series = [...totals.entries()]
    .sort(([ka, a], [kb, b]) => Number(ka === NO_PROJECT) - Number(kb === NO_PROJECT) || b.total - a.total)
    .map(([key, s]) => ({ key, label: s.label }));
  return {
    range: opts.range,
    currency: opts.currency,
    months,
    series,
    paidTotal: r2(months.reduce((n, m) => n + m.paidTotal, 0)),
    upcomingTotal: r2(months.reduce((n, m) => n + m.upcomingTotal, 0)),
  };
}

// ---------------------------------------------------------------- admin (money roles)

/** Allowed moves: upcoming -> processing / paid / void; processing -> paid / failed / void; failed -> processing / paid / void. Paid and void are final. */
const MOVES: Record<PayoutStatus, readonly PayoutStatus[]> = {
  upcoming: ["processing", "paid", "void"],
  processing: ["paid", "failed", "void"],
  failed: ["processing", "paid", "void"],
  paid: [],
  void: [],
};
export const payoutMoveAllowed = (from: string, to: string): boolean => isOneOf(PAYOUT_STATUSES, from) && (MOVES[from] as readonly string[]).includes(to);

/** Every payout change writes one activity row ("payout" isn't in activity.ts's EntityType list, so it is written here, same shape as logActivity). */
async function logPayout(db: DB, actor: Actor, payoutId: string, action: string, detail: Record<string, unknown>) {
  await db.insert(activity).values({ entityType: "payout", entityId: payoutId, actorEmail: actorEmail(actor), actorRole: actorRole(actor), action, detail });
}

const adminColumns = {
  id: payouts.id,
  expertId: payouts.expertId,
  expertName: experts.fullName,
  expertEmail: experts.email,
  placementId: payouts.placementId,
  projectName: placements.projectName,
  partnerName: partners.name,
  label: payouts.label,
  amount: payouts.amount,
  currency: payouts.currency,
  status: payouts.status,
  periodStart: payouts.periodStart,
  periodEnd: payouts.periodEnd,
  expectedOn: payouts.expectedOn,
  paidOn: payouts.paidOn,
  method: payouts.method,
  reference: payouts.reference,
  notes: payouts.notes,
  createdBy: payouts.createdBy,
  updatedBy: payouts.updatedBy,
  createdAt: payouts.createdAt,
  updatedAt: payouts.updatedAt,
};
/** The date a payout is filed under: paid date, else expected date, else the period's end, else the day it was added (India). */
const filedOn = sql`coalesce(${payouts.paidOn}, ${payouts.expectedOn}, ${payouts.periodEnd}, (${payouts.createdAt} at time zone 'Asia/Kolkata')::date)`;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type PayoutFilter = { status?: string; q?: string; month?: string };

/** Payouts for the admin list: by status, expert name or email, and month (paid, else expected). Newest first. */
export async function listPayouts(db: DB, f: PayoutFilter = {}) {
  const c: SQL[] = [];
  if (f.status && isOneOf(PAYOUT_STATUSES, f.status)) c.push(eq(payouts.status, f.status));
  const q = (f.q ?? "").trim().slice(0, 200);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    c.push(or(ilike(experts.fullName, like), ilike(experts.email, like)) as SQL);
  }
  if (f.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(f.month)) c.push(sql`to_char(${filedOn}, 'YYYY-MM') = ${f.month}`);
  return db
    .select(adminColumns)
    .from(payouts)
    .innerJoin(experts, eq(experts.id, payouts.expertId))
    .leftJoin(placements, eq(placements.id, payouts.placementId))
    .leftJoin(partners, eq(partners.id, placements.partnerId))
    .where(c.length ? and(...c) : undefined)
    .orderBy(sql`${filedOn} desc`, desc(payouts.createdAt))
    .limit(2000);
}
export type AdminPayout = Awaited<ReturnType<typeof listPayouts>>[number];

export async function payoutForAdmin(db: DB, id: string): Promise<AdminPayout | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select(adminColumns)
    .from(payouts)
    .innerJoin(experts, eq(experts.id, payouts.expertId))
    .leftJoin(placements, eq(placements.id, payouts.placementId))
    .leftJoin(partners, eq(partners.id, placements.partnerId))
    .where(eq(payouts.id, id))
    .limit(1);
  return row ?? null;
}

/** Totals per currency for a list. With no status filter, cancelled and failed payouts are left out. */
export function payoutTotals(rows: readonly { status: string; amount: number; currency: string }[], statusFilter?: string): { totals: MoneyTotal[]; count: number } {
  const keep = statusFilter && isOneOf(PAYOUT_STATUSES, statusFilter) ? rows : rows.filter((r) => r.status !== "void" && r.status !== "failed");
  const m = new Map<string, number>();
  for (const r of keep) addTo(m, r);
  return { totals: totalsOf(m, mainCurrency(keep)), count: keep.length };
}

export async function payoutActivity(db: DB, id: string, limit = 50): Promise<Activity[]> {
  if (!isUuid(id)) return [];
  return db.select().from(activity).where(and(eq(activity.entityType, "payout"), eq(activity.entityId, id))).orderBy(desc(activity.createdAt)).limit(limit);
}

export type PayoutExpert = { id: string; fullName: string; email: string | null };

export async function findExpertByEmail(db: DB, email: string): Promise<PayoutExpert | null> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return null;
  const [row] = await db.select({ id: experts.id, fullName: experts.fullName, email: experts.email }).from(experts).where(eq(experts.email, e)).limit(1);
  return row ?? null;
}

export async function expertForPayout(db: DB, id: string): Promise<PayoutExpert | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select({ id: experts.id, fullName: experts.fullName, email: experts.email }).from(experts).where(eq(experts.id, id)).limit(1);
  return row ?? null;
}

/** The expert's projects for the "Add payout" form (the team sees the partner). */
export async function placementOptions(db: DB, expertId: string) {
  if (!isUuid(expertId)) return [];
  return db
    .select({ id: placements.id, projectName: placements.projectName, partnerName: partners.name, status: placements.status, currency: placements.currency })
    .from(placements)
    .leftJoin(partners, eq(partners.id, placements.partnerId))
    .where(eq(placements.expertId, expertId))
    .orderBy(sql`case ${placements.status} when 'active' then 0 when 'paused' then 1 else 2 end`, desc(placements.startDate));
}

/** The expert's current payout method (to record how a payout was paid). */
export async function expertMethodFor(db: DB, expertId: string | null): Promise<PayoutMethod | null> {
  // A payout keeps its amount after its expert is deleted on request (expert_id is then null).
  if (!expertId) return null;
  const [row] = await db.select({ method: expertPayout.payoutMethod }).from(expertPayout).where(eq(expertPayout.expertId, expertId)).limit(1);
  return normalizeMethod(row?.method);
}

/** "2026-11-30", or null when empty, or "bad" when it isn't a real date. */
function dateField(raw: unknown): string | null | "bad" {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return "bad";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 2000 || y > 2100 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "bad";
  return s;
}

/** "1,23,456.50" -> 123456.5; null unless above 0, at most 1 crore, and at most 2 decimals. */
export function parseAmount(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/[,\s₹$]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= 10_000_000 ? n : null;
}

export type PayoutResult = { ok: true; id: string } | { ok: false; reason: string; field?: string };
const fail = (reason: string, field?: string): PayoutResult => ({ ok: false, reason, ...(field ? { field } : {}) });

/** Text the expert will see must not name a client: checked against every partner's name. */
async function clientNamed(db: DB, texts: [field: string, text: string | null][]): Promise<{ field: string; partner: string } | null> {
  const shown = texts.filter(([, t]) => Boolean(t));
  if (!shown.length) return null;
  const names = await db.select({ name: partners.name }).from(partners);
  for (const [field, text] of shown) for (const p of names) if (mentionsPartner(text, p.name)) return { field, partner: p.name };
  return null;
}

export type NewPayoutInput = {
  expertId: unknown;
  placementId?: unknown;
  label?: unknown;
  amount: unknown;
  currency?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  expectedOn?: unknown;
  status?: unknown;
  paidOn?: unknown;
  reference?: unknown;
  notes?: unknown;
};

const NEW_STATUSES = ["upcoming", "processing", "paid"] as const;

/** Adds a payout for an expert (optionally for one of their projects). Paid needs no future date; it defaults to today. */
export async function createPayout(db: DB, actor: Actor, input: NewPayoutInput, opts: { today?: string } = {}): Promise<PayoutResult> {
  const today = opts.today ?? todayIndia();
  const expert = typeof input.expertId === "string" ? await expertForPayout(db, input.expertId) : null;
  if (!expert) return fail("Find the expert first.", "expertId");
  const amount = parseAmount(input.amount);
  if (amount == null) return fail("Amount: a number above 0 (up to 1,00,00,000), at most 2 decimals.", "amount");
  const currency = String(input.currency ?? "").trim().toUpperCase() || "INR";
  if (!/^[A-Z]{3}$/.test(currency)) return fail("Pick a currency.", "currency");
  const status = String(input.status ?? "").trim() || "upcoming";
  if (!isOneOf(NEW_STATUSES, status)) return fail("A new payout is upcoming, processing or paid.", "status");
  const dates = { periodStart: dateField(input.periodStart), periodEnd: dateField(input.periodEnd), expectedOn: dateField(input.expectedOn), paidOn: dateField(input.paidOn) };
  for (const [field, v] of Object.entries(dates)) if (v === "bad") return fail("Pick a real date (or leave it empty).", field);
  const { periodStart, periodEnd, expectedOn } = dates as Record<string, string | null>;
  if (periodStart && periodEnd && periodStart > periodEnd) return fail("The period ends before it starts.", "periodEnd");
  const paidOn = status === "paid" ? ((dates.paidOn as string | null) ?? today) : null;
  if (paidOn && paidOn > today) return fail("The paid date can't be in the future.", "paidOn");
  const label = cleanText(input.label, 120);
  if (!label && !periodStart && !periodEnd) return fail("Add a label or the period it covers, so the expert knows what it's for.", "label");
  const reference = cleanText(input.reference, 120);
  const notes = cleanLongText(input.notes, 1000);
  let placementId: string | null = null;
  if (input.placementId != null && String(input.placementId).trim() !== "") {
    const [p] = isUuid(input.placementId) ? await db.select({ expertId: placements.expertId }).from(placements).where(eq(placements.id, input.placementId)).limit(1) : [];
    if (!p || p.expertId !== expert.id) return fail("That project isn't this expert's.", "placementId");
    placementId = input.placementId as string;
  }
  const named = await clientNamed(db, [["label", label], ["reference", reference]]);
  if (named) return fail(`The ${named.field} names a client (${named.partner}). Experts see it: use the period or the project instead.`, named.field);
  const method = status === "paid" ? await expertMethodFor(db, expert.id) : null;
  const by = actorEmail(actor);
  const now = new Date();
  const [row] = await db
    .insert(payouts)
    .values({ expertId: expert.id, placementId, label, amount, currency, status, periodStart, periodEnd, expectedOn, paidOn, method, reference, notes, createdBy: by, updatedBy: by, createdAt: now, updatedAt: now })
    .returning({ id: payouts.id });
  await logPayout(db, actor, row.id, "created", { expertId: expert.id, to: status });
  return { ok: true, id: row.id };
}

export type MarkPayoutInput = { to: unknown; paidOn?: unknown; reference?: unknown; method?: unknown };

/**
 * Moves a payout on: processing, paid (paid date defaults to today; reference; how it was paid
 * defaults to the expert's payout method), failed, or void (cancelled). Paid and void are final.
 */
export async function markPayout(db: DB, actor: Actor, id: unknown, input: MarkPayoutInput, opts: { today?: string } = {}): Promise<PayoutResult> {
  if (!isUuid(id)) return fail("That payout no longer exists.");
  const to = String(input.to ?? "");
  if (!isOneOf(PAYOUT_STATUSES, to) || to === "upcoming") return fail("Pick processing, paid, failed or cancel.");
  const [cur] = await db.select({ status: payouts.status, expertId: payouts.expertId, method: payouts.method, reference: payouts.reference }).from(payouts).where(eq(payouts.id, id)).limit(1);
  if (!cur) return fail("That payout no longer exists.");
  if (!payoutMoveAllowed(cur.status, to)) {
    if (cur.status === "paid") return fail("This payout is paid. Paid payouts are final.");
    if (cur.status === "void") return fail("This payout was cancelled.");
    return fail(`It's ${cur.status} already.`);
  }
  const patch: Partial<typeof payouts.$inferInsert> = { status: to, updatedBy: actorEmail(actor), updatedAt: new Date() };
  if (to === "paid") {
    const today = opts.today ?? todayIndia();
    const paidOn = dateField(input.paidOn);
    if (paidOn === "bad") return fail("Paid on: pick a real date.", "paidOn");
    if (paidOn && paidOn > today) return fail("The paid date can't be in the future.", "paidOn");
    const reference = cleanText(input.reference, 120);
    const named = await clientNamed(db, [["reference", reference]]);
    if (named) return fail(`The reference names a client (${named.partner}). Experts see it.`, "reference");
    const method = isOneOf(PAYOUT_METHODS, input.method) ? input.method : (normalizeMethod(cur.method) ?? (await expertMethodFor(db, cur.expertId)));
    Object.assign(patch, { paidOn: paidOn ?? today, reference: reference ?? cur.reference, method });
  }
  const [row] = await db.update(payouts).set(patch).where(and(eq(payouts.id, id), eq(payouts.status, cur.status))).returning({ id: payouts.id });
  if (!row) return fail("Someone changed this payout just now. Reload and try again.");
  await logPayout(db, actor, id, to === "void" ? "cancelled" : `marked_${to}`, { expertId: cur.expertId, from: cur.status, to });
  return { ok: true, id };
}
