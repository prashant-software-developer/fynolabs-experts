// Small charts drawn on the server: horizontal bars with counts, and bars per day (stacked by a
// series). No chart library; the numbers are in the markup for screen readers and tooltips.
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { shortDay } from "@/lib/crm/dates";

/** One row per item: label, a bar against the largest value, the count. */
export function BarList({ items, emptyText }: { items: { key: string; label: string; value: number; href?: string; hint?: string; tone?: "primary" | "foreground" | "muted" }[]; emptyText?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.some((i) => i.value) && emptyText) return <p className="text-small text-muted-foreground">{emptyText}</p>;
  return (
    <div className="space-y-2">
      {items.map((i) => {
        const body = (
          <>
            <span className="w-36 shrink-0 truncate text-foreground/70 group-hover:text-foreground">{i.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden bg-secondary">
              <span
                className={cn("block h-1.5 transition-colors", i.tone === "primary" ? "bg-primary" : i.tone === "muted" ? "bg-muted-foreground/50" : "bg-foreground/75 group-hover:bg-foreground")}
                style={{ width: `${(i.value / max) * 100}%` }}
              />
            </span>
            <span className="tabular w-16 shrink-0 text-right text-foreground/80">{i.value}</span>
            {i.hint ? <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:inline">{i.hint}</span> : null}
          </>
        );
        return i.href ? (
          <Link key={i.key} href={i.href} className="group flex items-center gap-3 text-sm">
            {body}
          </Link>
        ) : (
          <div key={i.key} className="group flex items-center gap-3 text-sm">
            {body}
          </div>
        );
      })}
    </div>
  );
}

export type Series = { key: string; label: string; className: string };

/**
 * Bars per day. `stacked`: one bar per day with the series on top of each other; otherwise the
 * series side by side. The x-axis shows a few dates ("5 Nov"); each bar has a tooltip.
 */
export function DayBars({ days, series, stacked = true, height = 160, label }: { days: ({ day: string } & Record<string, number | string>)[]; series: Series[]; stacked?: boolean; height?: number; label: string }) {
  const n = Math.max(1, days.length);
  const W = 720;
  const H = height;
  const pad = { top: 8, bottom: 22, left: 28, right: 4 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const val = (d: Record<string, number | string>, k: string) => Number(d[k] ?? 0);
  const totals = days.map((d) => (stacked ? series.reduce((s, x) => s + val(d, x.key), 0) : Math.max(0, ...series.map((x) => val(d, x.key)))));
  const max = Math.max(1, ...totals);
  const nice = max <= 5 ? 5 : max <= 10 ? 10 : Math.ceil(max / 5) * 5;
  const slot = plotW / n;
  const barW = Math.max(2, Math.min(28, slot * 0.7));
  const every = Math.ceil(n / 8);
  const y = (v: number) => pad.top + plotH - (v / nice) * plotH;
  return (
    <figure className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.left} x2={W - pad.right} y1={y(nice * f)} y2={y(nice * f)} className="stroke-border" strokeWidth={1} />
            <text x={pad.left - 6} y={y(nice * f) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {Math.round(nice * f)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x0 = pad.left + i * slot + (slot - barW) / 2;
          const tip = `${shortDay(d.day)}: ${series.map((s) => `${s.label} ${val(d, s.key)}`).join(", ")}`;
          if (stacked) {
            let acc = 0;
            return (
              <g key={d.day}>
                <title>{tip}</title>
                <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} className="fill-transparent" />
                {series.map((s) => {
                  const v = val(d, s.key);
                  if (!v) return null;
                  const top = y(acc + v);
                  const h = y(acc) - top;
                  acc += v;
                  return <rect key={s.key} x={x0} y={top} width={barW} height={Math.max(0.5, h)} className={s.className} rx={1} />;
                })}
              </g>
            );
          }
          const w = barW / series.length;
          return (
            <g key={d.day}>
              <title>{tip}</title>
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} className="fill-transparent" />
              {series.map((s, j) => {
                const v = val(d, s.key);
                return v ? <rect key={s.key} x={x0 + j * w} y={y(v)} width={Math.max(1, w - 1)} height={Math.max(0.5, y(0) - y(v))} className={s.className} rx={1} /> : null;
              })}
            </g>
          );
        })}
        {days.map((d, i) =>
          (i % every === 0 && n - 1 - i >= Math.ceil(every / 2)) || i === n - 1 ? (
            <text key={`l-${d.day}`} x={pad.left + i * slot + slot / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {shortDay(d.day)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden>
              <rect width="10" height="10" rx="2" className={s.className} />
            </svg>
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
