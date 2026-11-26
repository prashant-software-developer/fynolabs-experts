// Small charts: horizontal bars with counts (drawn on the server, every column reading from the
// left), and bars per day (stacked by a series) drawn with the dashboard's Recharts style.
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { shortDay } from "@/lib/crm/dates";
import { SeriesBars, SourceTrend } from "./trend";

/** One row per item: label, a bar against the largest value, the count. */
export function BarList({ items, emptyText }: { items: { key: string; label: string; value: number; href?: string; hint?: string; tone?: "primary" | "foreground" | "muted" }[]; emptyText?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.some((i) => i.value) && emptyText) return <p className="text-small text-muted-foreground">{emptyText}</p>;
  return (
    <div className="space-y-3">
      {items.map((i) => {
        const body = (
          <>
            <span className="w-28 shrink-0 truncate text-foreground/70 group-hover:text-foreground sm:w-40">{i.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <span
                className={cn("block h-1.5 rounded-full transition-colors", i.tone === "primary" ? "bg-primary" : i.tone === "muted" ? "bg-muted-foreground/50" : "bg-foreground/75 group-hover:bg-foreground")}
                style={{ width: `${(i.value / max) * 100}%` }}
              />
            </span>
            <span className="tabular w-20 shrink-0 pl-2 text-foreground/80">{i.value.toLocaleString("en-GB")}</span>
            {i.hint ? <span className="hidden w-32 shrink-0 text-xs text-muted-foreground sm:inline">{i.hint}</span> : null}
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

export type Series = { key: string; label: string; className?: string; color?: string };

/**
 * Bars per day. `stacked`: one bar per day with the series on top of each other; otherwise the
 * series side by side. Drawn by SeriesBars (src/components/crm/trend.tsx) in the dashboard's style,
 * so the axis text keeps its size at any width; a series keyed "other" is grey, the rest blue.
 * (`className` and `height` are kept for older callers and no longer used.)
 */
export function DayBars({ days, series, stacked = true, label, capSpikes = false }: { days: ({ day: string } & Record<string, number | string>)[]; series: Series[]; stacked?: boolean; height?: number; label: string; capSpikes?: boolean }) {
  const rows = days.map((d) => ({ label: shortDay(d.day), ...Object.fromEntries(series.map((s) => [s.key, Number(d[s.key] ?? 0)])) }));
  return <SeriesBars data={rows} series={series.map((s) => ({ key: s.key, label: s.label, color: s.color, other: s.key === "other" }))} stacked={stacked} name={label} capSpikes={capSpikes} />;
}

/** Visitors per day: all visitors as one area, with the `focus` sources below on their own scale (SourceTrend). */
export function VisitorTrend({ days, series, focus, label }: { days: ({ day: string } & Record<string, number | string>)[]; series: { key: string; label: string; color: string }[]; focus: string[]; label: string }) {
  const rows = days.map((d) => ({ label: shortDay(d.day), ...Object.fromEntries(series.map((s) => [s.key, Number(d[s.key] ?? 0)])) }));
  return <SourceTrend data={rows} series={series} focus={focus} name={label} />;
}
