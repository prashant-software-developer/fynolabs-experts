// Placement money: what the expert earns, what the partner pays, and totals.
export type MoneyInput = {
  basis: "hourly" | "per_task" | string;
  rateToExpert: number | null;
  rateFromPartner: number | null;
  hoursApproved: number | null;
  tasksAccepted: number | null;
  earnedByExpert: number | null;
  revenue: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Fills earned / revenue from units x rate when they weren't typed in. */
export function computeMoney(p: MoneyInput): { earned: number | null; revenue: number | null; margin: number | null } {
  const units = p.basis === "per_task" ? p.tasksAccepted : p.hoursApproved;
  const earned = p.earnedByExpert ?? (units != null && p.rateToExpert != null ? r2(units * p.rateToExpert) : null);
  const revenue = p.revenue ?? (units != null && p.rateFromPartner != null ? r2(units * p.rateFromPartner) : null);
  const margin = earned != null && revenue != null ? r2(revenue - earned) : null;
  return { earned, revenue, margin };
}

export type Totals = { count: number; earned: number; revenue: number; margin: number; hours: number; tasks: number };
const empty = (): Totals => ({ count: 0, earned: 0, revenue: 0, margin: 0, hours: 0, tasks: 0 });

export type SummaryRow = MoneyInput & { partnerName: string; currency: string; startDate: string | null; status: string };

/** Totals per partner and per start month, kept apart by currency. */
export function summarize(rows: SummaryRow[]) {
  const byPartner = new Map<string, Totals & { partner: string; currency: string }>();
  const byMonth = new Map<string, Totals & { month: string; currency: string }>();
  const all = new Map<string, Totals & { currency: string }>();
  for (const row of rows) {
    const m = computeMoney(row);
    const add = (t: Totals) => {
      t.count += 1;
      t.earned = r2(t.earned + (m.earned ?? 0));
      t.revenue = r2(t.revenue + (m.revenue ?? 0));
      t.margin = r2(t.revenue - t.earned);
      t.hours = r2(t.hours + (row.hoursApproved ?? 0));
      t.tasks += row.tasksAccepted ?? 0;
    };
    const pk = `${row.partnerName}|${row.currency}`;
    if (!byPartner.has(pk)) byPartner.set(pk, { ...empty(), partner: row.partnerName, currency: row.currency });
    add(byPartner.get(pk)!);
    const month = row.startDate ? row.startDate.slice(0, 7) : "No start date";
    const mk = `${month}|${row.currency}`;
    if (!byMonth.has(mk)) byMonth.set(mk, { ...empty(), month, currency: row.currency });
    add(byMonth.get(mk)!);
    if (!all.has(row.currency)) all.set(row.currency, { ...empty(), currency: row.currency });
    add(all.get(row.currency)!);
  }
  return {
    byPartner: [...byPartner.values()].sort((a, b) => b.revenue - a.revenue),
    byMonth: [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)),
    total: [...all.values()],
  };
}

export function formatMoney(n: number | null | undefined, currency = "USD"): string {
  if (n == null) return "–";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
