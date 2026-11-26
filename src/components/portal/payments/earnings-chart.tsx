// Payments → Earnings over time: one bar per month, stacked by project. Paid in full colour, not
// paid yet (upcoming and in transit) lighter on top. Drawn on the server like the admin charts (no
// chart library); each bar has a tooltip and a table repeats the numbers for screen readers.
import { compactMoney, moneyText, NO_PROJECT, type ChartData } from "@/lib/server/payouts";

/** Project colours: the FynoLabs blue first, then quiet blues and slates. */
const PALETTE = ["fill-primary", "fill-slate-700", "fill-sky-400", "fill-indigo-300", "fill-blue-900", "fill-cyan-600"];
const OTHER_FILL = "fill-slate-400";
const LIGHT = "opacity-35";

const EMPTY: Record<ChartData["range"], string> = { year: "Nothing paid or upcoming this year.", "12m": "Nothing paid or upcoming in the last 12 months.", all: "Nothing paid or upcoming yet." };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1] ?? m;
const monthLong = (m: string) => `${monthName(m)} ${m.slice(0, 4)}`;

/** The smallest round step (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 x 10^n) at or above v. */
function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function Swatch({ className }: { className: string }) {
  return (
    <svg width="10" height="10" aria-hidden className="shrink-0">
      <rect width="10" height="10" rx="2" className={className} />
    </svg>
  );
}

export function EarningsChart({ data, rangeLabel }: { data: ChartData; rangeLabel: string }) {
  const cur = data.currency;
  const fill = new Map(data.series.map((s, i) => [s.key, s.key === NO_PROJECT ? OTHER_FILL : PALETTE[i % PALETTE.length]]));
  const max = Math.max(0, ...data.months.map((m) => m.paidTotal + m.upcomingTotal));
  if (!max) return <p className="py-10 text-center text-sm text-muted-foreground">{EMPTY[data.range]}</p>;

  const n = Math.max(1, data.months.length);
  const W = 720;
  const H = 220;
  const pad = { top: 10, bottom: 26, left: 58, right: 6 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const top = niceCeil(max);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const slot = plotW / n;
  const barW = Math.max(3, Math.min(34, slot * 0.6));
  const every = Math.ceil(n / 12);
  const manyYears = data.months[0].month.slice(0, 4) !== data.months[n - 1].month.slice(0, 4);
  const xLabel = (m: string, i: number) => (manyYears && (i === 0 || m.endsWith("-01")) ? `${monthName(m)} ’${m.slice(2, 4)}` : monthName(m));
  const title = `Earnings by month, ${rangeLabel.toLowerCase()}: paid ${moneyText(data.paidTotal, cur)}${data.upcomingTotal ? `, upcoming ${moneyText(data.upcomingTotal, cur)}` : ""}.`;

  const bar = (m: ChartData["months"][number], i: number) => {
    const x0 = pad.left + i * slot + (slot - barW) / 2;
    // Paid segments first (bottom), then what isn't paid yet, lighter, on top.
    const parts = [
      ...data.series.map((s) => ({ key: s.key, v: m.paid[s.key] ?? 0, light: false })),
      ...data.series.map((s) => ({ key: s.key, v: m.upcoming[s.key] ?? 0, light: true })),
    ].filter((p) => p.v > 0);
    const tip = [
      monthLong(m.month),
      m.paidTotal ? `Paid ${moneyText(m.paidTotal, cur)}` : null,
      m.upcomingTotal ? `Upcoming ${moneyText(m.upcomingTotal, cur)}` : null,
      ...data.series.filter((s) => m.paid[s.key] || m.upcoming[s.key]).map((s) => `${s.label}: ${moneyText((m.paid[s.key] ?? 0) + (m.upcoming[s.key] ?? 0), cur)}`),
    ]
      .filter(Boolean)
      .join("\n");
    let acc = 0;
    return (
      <g key={m.month}>
        <title>{parts.length ? tip : `${monthLong(m.month)}: nothing`}</title>
        <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} className="fill-transparent" />
        {parts.map((p) => {
          const yTop = y(acc + p.v);
          const h = y(acc) - yTop;
          acc += p.v;
          return <rect key={`${p.key}-${p.light ? "u" : "p"}`} x={x0} y={yTop} width={barW} height={Math.max(0.5, h)} rx={1.5} className={`${fill.get(p.key) ?? OTHER_FILL}${p.light ? ` ${LIGHT}` : ""}`} />;
        })}
      </g>
    );
  };

  return (
    <figure className="space-y-4">
      {/* On phones the chart keeps a readable width and scrolls sideways, like the tables. */}
      <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[600px]" role="img" aria-label={title}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={pad.left} x2={W - pad.right} y1={y(top * f)} y2={y(top * f)} className="stroke-border" strokeWidth={1} />
              <text x={pad.left - 8} y={y(top * f) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {f === 0 ? "0" : compactMoney(top * f, cur)}
              </text>
            </g>
          ))}
          {data.months.map(bar)}
          {data.months.map((m, i) =>
            i % every === 0 ? (
              <text key={`x-${m.month}`} x={pad.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {xLabel(m.month, i)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {data.series.map((s) => (
          <span key={s.key} className="inline-flex min-w-0 items-center gap-1.5">
            <Swatch className={fill.get(s.key) ?? OTHER_FILL} />
            <span className="truncate">{s.label}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-4 sm:ml-auto">
          <span className="inline-flex items-center gap-1.5">
            <Swatch className="fill-foreground/60" /> Paid
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Swatch className={`fill-foreground/60 ${LIGHT}`} /> Upcoming
          </span>
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Paid</th>
            <th scope="col">Upcoming</th>
          </tr>
        </thead>
        <tbody>
          {data.months
            .filter((m) => m.paidTotal || m.upcomingTotal)
            .map((m) => (
              <tr key={m.month}>
                <th scope="row">{monthLong(m.month)}</th>
                <td>{moneyText(m.paidTotal, cur)}</td>
                <td>{moneyText(m.upcomingTotal, cur)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}
