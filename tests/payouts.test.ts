// Payouts: the expert's own Payments page (summary math, only their own rows, project titles without
// the client's name, none of the partner's money), the payout method form (UPI, emails, no bank
// account or card numbers), the admin list and changes (add, mark paid, cancel; every change logged)
// and the guarded actions. The session is mocked; the database is an in-memory PGlite.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(public url: string) {
      super(`REDIRECT ${url}`);
    }
  }
  return { user: null as unknown, expertId: null as string | null, db: null as unknown, Redirect };
});

vi.mock("@/lib/auth/session", () => ({
  getAccount: async () => (state.user ? { kind: "team", user: state.user } : null),
  getCurrentUser: async () => state.user,
  requireUser: async () => {
    if (!state.user) throw new state.Redirect("/signin");
    return state.user;
  },
}));
vi.mock("@/lib/auth/expert", () => ({
  ownExpertId: async () => state.expertId,
  portalContext: async () => (state.expertId ? { kind: "expert", expertId: state.expertId, account: { kind: "expert", email: "asha@example.com" } } : { kind: "refused" }),
}));
vi.mock("@/db/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db/client")>()), getDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new state.Redirect(url);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import { openTestDb } from "./fixtures/db";
import type { DB } from "@/db/client";
import { activity, expertPayout, experts, partners, payouts, placements } from "@/db/schema";
import type { Role } from "@/lib/auth/permissions";
import {
  checkPayoutMethod,
  createPayout,
  listPayouts,
  looksLikeAccountNumber,
  markPayout,
  methodLine,
  moneyText,
  nextPayout,
  ownPayments,
  ownPayoutMethod,
  payoutChart,
  payoutSummary,
  payoutTotals,
  periodText,
  plainAmount,
  rateText,
  savePayoutMethod,
  shortDate,
  summarizePayouts,
} from "@/lib/server/payouts";
import { addPayoutAction, findPayoutExpertAction, markPayoutAction } from "@/app/admin/payouts/actions";
import { savePayoutMethodAction } from "@/app/(portal)/me/payments/actions";
import PaymentsPage from "@/app/(portal)/me/payments/page";

let db: DB;
let client: PGlite;
const TODAY = "2026-11-26";
const ids = {} as Record<"asha" | "ben" | "acme" | "globex" | "maths" | "rust" | "benProject" | "voided" | "wrongLink" | "benPaid" | "batch", string>;

const as = (role: Role, extra: Record<string, unknown> = {}) => {
  state.user = { accountId: "00000000-0000-4000-8000-000000000001", email: `${role}@xocket.sh`, name: role, role, partnerIds: [], roleSource: "team", blocked: false, mustChangePassword: false, sections: [], ...extra };
};
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};
async function landing(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof state.Redirect) return decodeURIComponent(e.url);
    throw e;
  }
  throw new Error("expected a redirect");
}
/** Every key anywhere in a value (to prove a money field was never selected). */
function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (out.add(k), keysOf(x, out));
  return out;
}
const FORBIDDEN_KEYS = ["rateFromPartner", "revenue", "earnedByExpert", "hoursApproved", "tasksAccepted", "notes", "defaultCommissionPercent", "taxFormType", "taxFormAt", "createdBy", "updatedBy", "partnerName", "projectName", "partnerId", "commissionPercent"];

beforeAll(async () => {
  ({ db, client } = await openTestDb());
  state.db = db;
  const [acme, globex] = await db.insert(partners).values([{ name: "Acme AI Data", kind: "data_partner" }, { name: "Globex Experts", kind: "expert_platform" }]).returning({ id: partners.id });
  const [asha, ben] = await db.insert(experts).values([{ fullName: "Asha Example", email: "asha@example.com" }, { fullName: "Ben Sample", email: "ben@example.org" }]).returning({ id: experts.id });
  const [maths, rust, benProject] = await db
    .insert(placements)
    .values([
      { expertId: asha.id, partnerId: acme.id, projectName: "Acme AI Data - Maths evals", basis: "per_task", rateToExpert: 3400, rateFromPartner: 5150.75, currency: "INR", earnedByExpert: 68000, revenue: 103000.25, status: "active", startDate: "2026-10-01", notes: "Internal placement note" },
      { expertId: asha.id, partnerId: globex.id, projectName: "Globex Rust review", basis: "hourly", rateToExpert: 50, rateFromPartner: 77.77, currency: "USD", status: "ended", startDate: "2026-06-01" },
      { expertId: ben.id, partnerId: acme.id, projectName: "Ben secret project", basis: "hourly", rateToExpert: 30, rateFromPartner: 45.45, currency: "USD", status: "active" },
    ])
    .returning({ id: placements.id });
  Object.assign(ids, { asha: asha.id, ben: ben.id, acme: acme.id, globex: globex.id, maths: maths.id, rust: rust.id, benProject: benProject.id });
  const by = "farah.finance@example.com";
  const base = { createdBy: by, updatedBy: by, notes: "Internal payout note" };
  const rows = await db
    .insert(payouts)
    .values([
      { ...base, expertId: asha.id, placementId: maths.id, label: "Week 44", amount: 10000, currency: "INR", status: "paid", paidOn: "2026-11-05", reference: "UTR123", method: "upi" },
      { ...base, expertId: asha.id, placementId: maths.id, amount: 15000.5, currency: "INR", status: "paid", periodStart: "2026-10-01", periodEnd: "2026-10-15", paidOn: "2026-10-15" },
      { ...base, expertId: asha.id, placementId: rust.id, label: "Rust review hours", amount: 1301.93, currency: "USD", status: "paid", paidOn: "2026-11-20" },
      { ...base, expertId: asha.id, placementId: maths.id, label: "Week 46", amount: 12000, currency: "INR", status: "processing", expectedOn: "2026-11-28" },
      { ...base, expertId: asha.id, placementId: maths.id, label: "Week 47", amount: 20000, currency: "INR", status: "upcoming", expectedOn: "2026-12-02" },
      { ...base, expertId: asha.id, label: "Referral bonus", amount: 5000, currency: "INR", status: "upcoming", expectedOn: "2026-12-02" },
      { ...base, expertId: asha.id, placementId: rust.id, label: "Final hours", amount: 300, currency: "USD", status: "upcoming", expectedOn: "2026-12-20" },
      { ...base, expertId: asha.id, placementId: maths.id, label: "Acme batch 3", amount: 1000, currency: "INR", status: "upcoming", periodEnd: "2026-11-30" },
      { ...base, expertId: asha.id, placementId: maths.id, label: "Mistake", amount: 99999, currency: "INR", status: "void" },
      { ...base, expertId: asha.id, placementId: maths.id, label: "Week 45", amount: 7000, currency: "INR", status: "failed", expectedOn: "2026-11-10" },
      // Linked by mistake to someone else's project: the expert must not learn about it.
      { ...base, expertId: asha.id, placementId: benProject.id, label: "Linked wrongly", amount: 4000, currency: "INR", status: "upcoming", expectedOn: "2026-12-05" },
      { ...base, expertId: ben.id, placementId: benProject.id, label: "Ben's week", amount: 50000, currency: "INR", status: "paid", paidOn: "2026-11-10" },
    ])
    .returning({ id: payouts.id, label: payouts.label });
  ids.voided = rows.find((r) => r.label === "Mistake")!.id;
  ids.wrongLink = rows.find((r) => r.label === "Linked wrongly")!.id;
  ids.benPaid = rows.find((r) => r.label === "Ben's week")!.id;
  ids.batch = rows.find((r) => r.label === "Acme batch 3")!.id;
  await db.insert(expertPayout).values({ expertId: asha.id, payoutMethod: "paypal", payoutHandle: "old@example.com", taxFormType: "W-8BEN", defaultCommissionPercent: 12.5, updatedBy: "jobs-site import" });
});
afterAll(async () => {
  await client.close();
});
beforeEach(() => {
  state.user = null;
  state.expertId = null;
});

describe("money formatting", () => {
  it("INR with Indian grouping, USD as dollars, other currencies in their own format; the expert's rate", () => {
    expect(moneyText(123456, "INR")).toBe("₹1,23,456.00");
    expect(moneyText(1301.93, "USD")).toBe("$1,301.93");
    expect(moneyText(10, "EUR")).toBe("€10.00");
    expect(moneyText(0, "INR", { whole: true })).toBe("₹0");
    expect(moneyText(null, "INR")).toBe("–");
    expect(plainAmount(123456.5, "INR")).toBe("1,23,456.50");
    expect(rateText("per_task", 3400, "INR")).toBe("₹3,400 per task");
    expect(rateText("hourly", 50, "USD")).toBe("$50/hour");
    expect(rateText("hourly", null, "USD")).toBe("Rate to be confirmed");
    expect(periodText("2026-11-01", "2026-11-15")).toBe("1–15 Nov 2026");
    expect(periodText("2026-10-28", "2026-11-03")).toBe("28 Oct – 3 Nov 2026");
    expect(shortDate("2026-12-02", TODAY)).toBe("2 Dec");
    expect(shortDate("2027-01-04", TODAY)).toBe("4 Jan 2027");
  });
});

describe("the expert's summary", () => {
  it("paid to date per currency, in transit, next (earliest date, every payout on it) and this month; void and failed don't count", async () => {
    const s = await payoutSummary(db, ids.asha, { today: TODAY });
    expect(s).toEqual({
      currency: "INR",
      paidToDate: [
        { currency: "INR", amount: 25000.5 },
        { currency: "USD", amount: 1301.93 },
      ],
      current: { totals: [{ currency: "INR", amount: 12000 }], count: 1 },
      next: { expectedOn: "2026-12-02", totals: [{ currency: "INR", amount: 25000 }], count: 2 },
      paidThisMonth: { totals: [{ currency: "INR", amount: 10000 }, { currency: "USD", amount: 1301.93 }], count: 2 },
      failed: 1,
    });
    expect((await nextPayout(db, ids.asha))?.expectedOn).toBe("2026-12-02");
    // Ben's numbers are his own.
    expect((await payoutSummary(db, ids.ben, { today: TODAY })).paidToDate).toEqual([{ currency: "INR", amount: 50000 }]);
  });

  it("works on plain rows: undated upcoming payouts are next when nothing is dated; nothing at all reads zero", () => {
    const s = summarizePayouts([{ status: "upcoming", amount: 100, currency: "USD", expectedOn: null, paidOn: null }], TODAY);
    expect(s.next).toEqual({ expectedOn: null, totals: [{ currency: "USD", amount: 100 }], count: 1 });
    const empty = summarizePayouts([], TODAY, "USD");
    expect(empty).toMatchObject({ currency: "USD", paidToDate: [], next: null, paidThisMonth: { totals: [], count: 0 }, current: { count: 0 } });
  });
});

describe("the expert's Payments page data", () => {
  it("an expert only ever gets their own payouts and projects", async () => {
    const view = await ownPayments(db, ids.asha, { today: TODAY });
    const own = (await db.select({ id: payouts.id }).from(payouts).where(eq(payouts.expertId, ids.asha))).map((r) => r.id);
    expect(view.history.every((h) => own.includes(h.id))).toBe(true);
    expect(view.history.map((h) => h.id)).not.toContain(ids.benPaid);
    expect(view.history.map((h) => h.id)).not.toContain(ids.voided);
    expect(view.history).toHaveLength(10);
    expect(view.projects.map((p) => p.id)).toEqual([ids.maths, ids.rust]);
    // A payout linked to someone else's project shows as no project, and that project stays unknown.
    const wrong = view.history.find((h) => h.id === ids.wrongLink)!;
    expect(wrong).toMatchObject({ projectKey: "other", projectTitle: null });
    expect(JSON.stringify(view)).not.toContain("secret");
    expect(view.other).toEqual({ paid: [], upcoming: [{ currency: "INR", amount: 9000 }] });
    expect(view.currencies).toEqual(["INR", "USD"]);
    // Ben sees only his own.
    const benView = await ownPayments(db, ids.ben, { today: TODAY });
    expect(benView.history.map((h) => h.id)).toEqual([ids.benPaid]);
    expect(benView.method).toBeNull();
  });

  it("project titles and labels never include the partner (client) name", async () => {
    const view = await ownPayments(db, ids.asha, { today: TODAY });
    expect(view.projects.map((p) => p.title)).toEqual(["Maths evals", "Rust review"]);
    expect(view.history.find((h) => h.id === ids.batch)!.label).toBe("batch 3");
    const json = JSON.stringify(view);
    for (const name of ["Acme", "Globex"]) expect(json).not.toContain(name);
    expect(view.projects[0]).toMatchObject({ rateText: "₹3,400 per task", status: "active", paid: [{ currency: "INR", amount: 25000.5 }], upcoming: [{ currency: "INR", amount: 33000 }] });
    expect(view.projects[1]).toMatchObject({ rateText: "$50/hour", status: "ended", paid: [{ currency: "USD", amount: 1301.93 }], upcoming: [{ currency: "USD", amount: 300 }] });
  });

  it("money fields are never selected for experts beyond their own amounts and rate", async () => {
    const view = await ownPayments(db, ids.asha, { today: TODAY });
    const keys = keysOf(view);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), k).toBe(false);
    expect(Object.keys(view.projects[0]).sort()).toEqual(["basis", "currency", "id", "paid", "rate", "rateText", "status", "title", "upcoming"]);
    const json = JSON.stringify(view);
    for (const secret of ["5150.75", "103000.25", "77.77", "68000", "Internal payout note", "Internal placement note", "W-8BEN", "farah.finance"]) expect(json).not.toContain(secret);
    expect(Object.keys(view.method!).sort()).toEqual(["handle", "label", "method"]);
  });

  it("charts money per month and project: paid by paid date, not paid yet by expected date, failed left out", async () => {
    const { history } = await ownPayments(db, ids.asha, { today: TODAY });
    const year = payoutChart(history, { range: "year", currency: "INR", today: TODAY });
    expect(year.months.map((m) => m.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
    const by = Object.fromEntries(year.months.map((m) => [m.month, m]));
    expect(by["2026-10"]).toMatchObject({ paidTotal: 15000.5, upcomingTotal: 0 });
    expect(by["2026-11"]).toMatchObject({ paidTotal: 10000, upcomingTotal: 13000, paid: { [ids.maths]: 10000 }, upcoming: { [ids.maths]: 13000 } });
    expect(by["2026-12"]).toMatchObject({ paidTotal: 0, upcomingTotal: 29000, upcoming: { [ids.maths]: 20000, other: 9000 } });
    expect(year.series).toEqual([
      { key: ids.maths, label: "Maths evals" },
      { key: "other", label: "Other payouts" },
    ]);
    expect(year).toMatchObject({ paidTotal: 25000.5, upcomingTotal: 42000 });
    const usd = payoutChart(history, { range: "year", currency: "USD", today: TODAY });
    expect(usd).toMatchObject({ paidTotal: 1301.93, upcomingTotal: 300, series: [{ key: ids.rust, label: "Rust review" }] });
    const last12 = payoutChart(history, { range: "12m", currency: "INR", today: TODAY });
    expect([last12.months[0].month, last12.months.at(-1)!.month, last12.months.length]).toEqual(["2025-12", "2026-12", 13]);
    const all = payoutChart(history, { range: "all", currency: "INR", today: TODAY });
    expect(all.months.map((m) => m.month)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
});

describe("the payout method", () => {
  it("checks UPI IDs and emails, ignores a handle for bank transfer, and refuses anything like an account or card number", () => {
    expect(checkPayoutMethod({ method: "upi", handle: " Asha.E@OKAXIS " })).toEqual({ ok: true, method: "upi", handle: "asha.e@okaxis" });
    expect(checkPayoutMethod({ method: "upi", handle: "9876543210@ybl" })).toMatchObject({ ok: true, handle: "9876543210@ybl" });
    for (const bad of ["asha", "asha@", "asha@ok axis", "@okaxis", "asha@ok.axis"]) expect(checkPayoutMethod({ method: "upi", handle: bad }).ok, bad).toBe(false);
    expect(checkPayoutMethod({ method: "upi", handle: "123456789012@SBIN0001234.ifsc.npci" })).toMatchObject({ ok: false, errors: { handle: expect.stringMatching(/bank account number/) } });
    expect(checkPayoutMethod({ method: "upi", handle: "12345678901@ybl" })).toMatchObject({ ok: false, errors: { handle: expect.stringMatching(/bank account or card number/) } });
    expect(checkPayoutMethod({ method: "upi", handle: "" })).toMatchObject({ ok: false, errors: { handle: "Add your UPI ID." } });
    expect(checkPayoutMethod({ method: "paypal", handle: "Asha@Example.com" })).toEqual({ ok: true, method: "paypal", handle: "asha@example.com" });
    expect(checkPayoutMethod({ method: "wise", handle: "asha@example" }).ok).toBe(false);
    expect(checkPayoutMethod({ method: "wise", handle: "4111 1111 1111 1111" }).ok).toBe(false);
    expect(checkPayoutMethod({ method: "bank_transfer", handle: "123456789012" })).toEqual({ ok: true, method: "bank_transfer", handle: null });
    expect(checkPayoutMethod({ method: "other", handle: "Payoneer, the email on my profile" })).toMatchObject({ ok: true, handle: "Payoneer, the email on my profile" });
    for (const bad of ["Card 4111 1111 1111 1111", "IBAN GB29 NWBK 6016 1331 9268 19", "A/c 001234567890", "routing 021000021"]) expect(checkPayoutMethod({ method: "other", handle: bad }), bad).toMatchObject({ ok: false, errors: { handle: expect.stringMatching(/bank account or card number/) } });
    expect(checkPayoutMethod({ method: "other", handle: "x".repeat(121) }).ok).toBe(false);
    expect(checkPayoutMethod({ method: "crypto", handle: "x" })).toMatchObject({ ok: false, errors: { method: expect.any(String) } });
    expect(looksLikeAccountNumber("9876543210")).toBe(false);
    expect(looksLikeAccountNumber("1234 5678 9012")).toBe(true);
  });

  it("saves only the method and handle (tax form and commission untouched), logs field names only, and reads back without money fields", async () => {
    const res = await savePayoutMethod(db, ids.asha, { method: "upi", handle: "Asha.E@OKAXIS" });
    expect(res).toEqual({ ok: true, method: "upi", handle: "asha.e@okaxis", changed: true });
    const [row] = await db.select().from(expertPayout).where(eq(expertPayout.expertId, ids.asha));
    expect(row).toMatchObject({ payoutMethod: "upi", payoutHandle: "asha.e@okaxis", updatedBy: "expert-portal", taxFormType: "W-8BEN", defaultCommissionPercent: 12.5 });
    const logs = await db.select().from(activity).where(and(eq(activity.entityType, "expert"), eq(activity.entityId, ids.asha), eq(activity.action, "payout_method_saved")));
    expect(logs).toHaveLength(1);
    expect(logs[0].detail).toEqual({ fields: ["payoutMethod", "payoutHandle"], via: "portal" });
    expect(logs[0].actorEmail).toBe("expert-portal");
    // The same again changes nothing and logs nothing.
    expect(await savePayoutMethod(db, ids.asha, { method: "upi", handle: "asha.e@okaxis" })).toMatchObject({ ok: true, changed: false });
    expect(await db.$count(activity, and(eq(activity.entityId, ids.asha), eq(activity.action, "payout_method_saved")))).toBe(1);
    expect(await savePayoutMethod(db, ids.asha, { method: "upi", handle: "1234567890123@ybl" })).toMatchObject({ ok: false });
    expect(methodLine(await ownPayoutMethod(db, ids.asha))).toBe("Paid by UPI · asha.e@okaxis");
    // An old jobs-site method we don't know is shown as typed.
    await db.insert(expertPayout).values({ expertId: ids.ben, payoutMethod: "Payoneer", payoutHandle: "ben@pay.example.org", updatedBy: "jobs-site import" });
    const ben = await ownPayoutMethod(db, ids.ben);
    expect(ben).toEqual({ method: "other", label: "Payoneer", handle: "ben@pay.example.org" });
    expect(methodLine(ben)).toBe("Paid by Payoneer · ben@pay.example.org");
    expect(methodLine(null)).toBeNull();
  });
});

describe("admin: list, add, mark paid, cancel", () => {
  it("lists by status, expert and month (paid, else expected) with totals per currency", async () => {
    expect((await listPayouts(db)).length).toBe(12);
    const paid = await listPayouts(db, { status: "paid" });
    expect(paid.every((r) => r.status === "paid")).toBe(true);
    expect(paid).toHaveLength(4);
    expect((await listPayouts(db, { q: "BEN" })).map((r) => r.id)).toEqual([ids.benPaid]);
    expect((await listPayouts(db, { q: "asha@example" })).every((r) => r.expertId === ids.asha)).toBe(true);
    expect((await listPayouts(db, { month: "2026-10" })).map((r) => r.amount)).toEqual([15000.5]);
    const all = await listPayouts(db);
    // No status filter: cancelled and failed are left out of the totals.
    expect(payoutTotals(all)).toEqual({ totals: [{ currency: "INR", amount: 117000.5 }, { currency: "USD", amount: 1601.93 }], count: 10 });
    expect(payoutTotals(all.filter((r) => r.status === "void"), "void")).toEqual({ totals: [{ currency: "INR", amount: 99999 }], count: 1 });
    const row = all.find((r) => r.id === ids.benPaid)!;
    expect(row).toMatchObject({ expertName: "Ben Sample", expertEmail: "ben@example.org", projectName: "Ben secret project", partnerName: "Acme AI Data" });
  });

  it("adds a payout only for the expert's own project, without client names in what the expert sees", async () => {
    const actor = { email: "farah.finance@example.com", role: "finance" };
    const ok = { expertId: ids.asha, placementId: ids.maths, label: "Week 48", amount: "1,23,456.50", currency: "inr", expectedOn: "2026-12-09" };
    expect(await createPayout(db, actor, { ...ok, amount: "0" })).toMatchObject({ ok: false, field: "amount" });
    expect(await createPayout(db, actor, { ...ok, amount: "12.345" })).toMatchObject({ ok: false, field: "amount" });
    expect(await createPayout(db, actor, { ...ok, placementId: ids.benProject })).toMatchObject({ ok: false, field: "placementId" });
    expect(await createPayout(db, actor, { ...ok, label: "Globex hours" })).toMatchObject({ ok: false, field: "label", reason: expect.stringMatching(/names a client/) });
    expect(await createPayout(db, actor, { ...ok, label: "" })).toMatchObject({ ok: false, field: "label" });
    expect(await createPayout(db, actor, { ...ok, periodStart: "2026-11-30", periodEnd: "2026-11-01" })).toMatchObject({ ok: false, field: "periodEnd" });
    expect(await createPayout(db, actor, { ...ok, expectedOn: "2026-02-30" })).toMatchObject({ ok: false, field: "expectedOn" });
    expect(await createPayout(db, actor, { ...ok, status: "void" })).toMatchObject({ ok: false, field: "status" });
    expect(await createPayout(db, actor, { ...ok, status: "paid", paidOn: "2026-12-01" }, { today: TODAY })).toMatchObject({ ok: false, field: "paidOn" });
    expect(await createPayout(db, actor, { ...ok, expertId: "not-an-id" })).toMatchObject({ ok: false, field: "expertId" });
    const res = await createPayout(db, actor, ok);
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(payouts).where(eq(payouts.id, res.ok ? res.id : ""));
    expect(row).toMatchObject({ expertId: ids.asha, placementId: ids.maths, amount: 123456.5, currency: "INR", status: "upcoming", expectedOn: "2026-12-09", paidOn: null, createdBy: actor.email, updatedBy: actor.email });
    const log = await db.select().from(activity).where(and(eq(activity.entityType, "payout"), eq(activity.entityId, row.id)));
    expect(log.map((l) => [l.action, l.actorRole, l.detail])).toEqual([["created", "finance", { expertId: ids.asha, to: "upcoming" }]]);
    // Added as paid without a date: paid today, by the expert's payout method.
    const paid = await createPayout(db, actor, { expertId: ids.asha, label: "One-off", amount: "500", status: "paid" }, { today: TODAY });
    const [p] = await db.select().from(payouts).where(eq(payouts.id, paid.ok ? paid.id : ""));
    expect(p).toMatchObject({ status: "paid", paidOn: TODAY, method: "upi", placementId: null });
  });

  it("marks processing then paid (today, reference, the expert's method); paid is final; cancelled payouts leave the expert's page", async () => {
    const actor = { email: "admin@xocket.sh", role: "admin" };
    const res = await createPayout(db, actor, { expertId: ids.asha, placementId: ids.rust, label: "December hours", amount: "250", currency: "USD", expectedOn: "2026-12-15" });
    const id = res.ok ? res.id : "";
    expect(await markPayout(db, actor, id, { to: "upcoming" })).toMatchObject({ ok: false });
    expect(await markPayout(db, actor, id, { to: "processing" })).toEqual({ ok: true, id });
    expect(await markPayout(db, actor, id, { to: "processing" })).toMatchObject({ ok: false, reason: expect.stringMatching(/already/) });
    expect(await markPayout(db, actor, id, { to: "paid", reference: "Globex wire 7" })).toMatchObject({ ok: false, field: "reference" });
    expect(await markPayout(db, actor, id, { to: "paid", paidOn: "2026-12-30" }, { today: TODAY })).toMatchObject({ ok: false, field: "paidOn" });
    expect(await markPayout(db, actor, id, { to: "paid", reference: "UTR999" }, { today: TODAY })).toEqual({ ok: true, id });
    const [row] = await db.select().from(payouts).where(eq(payouts.id, id));
    expect(row).toMatchObject({ status: "paid", paidOn: TODAY, reference: "UTR999", method: "upi", updatedBy: actor.email });
    expect(await markPayout(db, actor, id, { to: "void" })).toMatchObject({ ok: false, reason: expect.stringMatching(/final/) });
    const log = await db.select().from(activity).where(and(eq(activity.entityType, "payout"), eq(activity.entityId, id)));
    expect(log.map((l) => l.action).sort()).toEqual(["created", "marked_paid", "marked_processing"]);
    expect(log.find((l) => l.action === "marked_paid")!.detail).toEqual({ expertId: ids.asha, from: "processing", to: "paid" });

    const cancel = await createPayout(db, actor, { expertId: ids.asha, label: "Duplicate", amount: "100" });
    const cid = cancel.ok ? cancel.id : "";
    expect((await ownPayments(db, ids.asha, { today: TODAY })).history.map((h) => h.id)).toContain(cid);
    expect(await markPayout(db, actor, cid, { to: "void" })).toEqual({ ok: true, id: cid });
    expect((await ownPayments(db, ids.asha, { today: TODAY })).history.map((h) => h.id)).not.toContain(cid);
    expect(await markPayout(db, actor, cid, { to: "processing" })).toMatchObject({ ok: false, reason: expect.stringMatching(/cancelled/) });
    expect((await db.select().from(activity).where(and(eq(activity.entityType, "payout"), eq(activity.entityId, cid)))).map((l) => l.action).sort()).toEqual(["cancelled", "created"]);
    // A failed payout can be retried.
    const f = await createPayout(db, actor, { expertId: ids.asha, label: "Retry me", amount: "100", status: "processing" });
    const fid = f.ok ? f.id : "";
    expect(await markPayout(db, actor, fid, { to: "failed" })).toEqual({ ok: true, id: fid });
    expect(await markPayout(db, actor, fid, { to: "processing" })).toEqual({ ok: true, id: fid });
  });
});

describe("guarded actions", () => {
  it("only money roles with the Fees module change payouts; the expert id for the method always comes from the session", async () => {
    const [target] = await db.select({ id: payouts.id }).from(payouts).where(and(eq(payouts.expertId, ids.asha), eq(payouts.label, "Week 47")));
    for (const role of ["recruiter", "viewer", "pod_lead"] as Role[]) {
      as(role);
      expect(await landing(markPayoutAction(form({ id: target.id, to: "processing", returnTo: "/admin/payouts" })))).toMatch(/error=.*can't change fees/);
      expect((await addPayoutAction({}, form({ expertId: ids.asha, label: "Nope", amount: "1" }))).message).toMatch(/can't change fees/);
    }
    as("finance", { sections: ["profiles"] });
    expect(await landing(markPayoutAction(form({ id: target.id, to: "processing", returnTo: "/admin/payouts" })))).toMatch(/error=You don't have access to Fees/);
    expect((await db.select({ s: payouts.status }).from(payouts).where(eq(payouts.id, target.id)))[0].s).toBe("upcoming");

    as("finance");
    expect(await landing(markPayoutAction(form({ id: target.id, to: "processing", returnTo: "/admin/payouts?status=upcoming" })))).toBe("/admin/payouts?status=upcoming&ok=Marked processing.");
    expect(await landing(findPayoutExpertAction(form({ email: " BEN@example.org ", returnTo: "/admin/payouts?add=1" })))).toBe(`/admin/payouts?add=1&expert=${ids.ben}`);
    expect(await landing(findPayoutExpertAction(form({ email: "nobody@example.org", returnTo: "/admin/payouts?add=1" })))).toMatch(/^\/admin\/payouts\?add=1&error=No expert with that email/);
    const bad = await addPayoutAction({}, form({ expertId: ids.ben, label: "Week 1", amount: "-5" }));
    expect(bad).toMatchObject({ field: "amount", values: { amount: "-5", label: "Week 1" } });
    expect(await landing(addPayoutAction({}, form({ expertId: ids.ben, placementId: ids.benProject, label: "Week 1", amount: "2000", currency: "INR" })))).toMatch(/^\/admin\/payouts\?p=[0-9a-f-]{36}&ok=Payout added\.$/);

    // The portal action saves for the signed-in expert only, whatever the form says.
    const benBefore = (await db.select().from(expertPayout).where(eq(expertPayout.expertId, ids.ben)))[0];
    state.expertId = ids.asha;
    const saved = await savePayoutMethodAction({}, form({ method: "wise", handle: "asha@wise.example.com", expertId: ids.ben }));
    expect(saved).toMatchObject({ ok: true, values: { method: "wise", handle: "asha@wise.example.com" } });
    expect((await db.select().from(expertPayout).where(eq(expertPayout.expertId, ids.ben)))[0]).toEqual(benBefore);
    expect((await ownPayoutMethod(db, ids.asha))?.handle).toBe("asha@wise.example.com");
    expect(await savePayoutMethodAction({}, form({ method: "upi", handle: "not a upi id" }))).toMatchObject({ errors: { handle: expect.any(String) }, values: { handle: "not a upi id" } });
    state.expertId = null;
    expect(await landing(savePayoutMethodAction({}, form({ method: "bank_transfer" })))).toMatch(/^\/signin/);
  });
});

describe("the Payments page", () => {
  it("renders the expert's own numbers, rates and method, never a client's name or the partner's rate", async () => {
    state.expertId = ids.asha;
    const html = renderToStaticMarkup((await PaymentsPage({ searchParams: Promise.resolve({ range: "all" }) })) as ReactElement);
    for (const text of ["Payments", "Total paid to date", "Current payout", "Next payout", "Paid this month", "Earnings over time", "By project", "Payout history", "Payout method", "Maths evals", "Rust review", "₹3,400 per task", "$50/hour", "Paid by Wise · asha@wise.example.com", "id=\"method\""]) expect(html).toContain(text);
    for (const secret of ["Acme", "Globex", "5,150.75", "5150.75", "Internal payout note", "Mistake", "secret"]) expect(html).not.toContain(secret);
    state.expertId = ids.ben;
    const benHtml = renderToStaticMarkup((await PaymentsPage({ searchParams: Promise.resolve({}) })) as ReactElement);
    expect(benHtml).not.toContain("Maths evals");
    expect(benHtml).toContain("Paid by Payoneer");
  });
});
