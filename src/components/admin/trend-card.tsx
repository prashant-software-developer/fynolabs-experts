"use client";
// One look for every chart in the admin (as the FynoLabs TrendCard): a ruled box, a small heading,
// a 2px brand-blue monotone line or stacked bars in falling strengths of the blue, horizontal grid
// lines only, 11px muted axes and a square tooltip.
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
export const tooltipStyle = { border: "1px solid hsl(var(--border))", borderRadius: 0, background: "hsl(var(--background))", fontSize: 12, boxShadow: "none" };
/** Brand blue at 100 / 70 / 45 / 25%, grey (muted at 45%) for Other. */
export const BAR_COLORS = ["hsl(var(--primary))", "hsl(var(--primary) / 0.7)", "hsl(var(--primary) / 0.45)", "hsl(var(--primary) / 0.25)"];
export const OTHER_COLOR = "hsl(var(--muted-foreground) / 0.45)";

/** A chart in a box: heading (and an optional legend on the right), then the chart. */
export function TrendCard({ title, aside, label, children }: { title: string; aside?: ReactNode; label?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border border-border p-4 sm:p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="eyebrow text-muted-foreground">{title}</p>
        {aside}
      </div>
      <div role={label ? "img" : undefined} aria-label={label} className="mt-4 h-48 w-full sm:mt-6 sm:h-64 [&_.recharts-surface:focus]:outline-none">
        {children}
      </div>
    </div>
  );
}

/** A small coloured square and its name, for a chart's legend. */
export function LegendKey({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-small text-muted-foreground">
      <span className="h-2.5 w-2.5" style={{ background: color }} aria-hidden="true" /> {children}
    </span>
  );
}

type Row = { label: string } & Record<string, number | string>;

/** One measure per day as a line. */
export function LineTrend({ title, data, dataKey, name }: { title: string; data: Row[]; dataKey: string; name: string }) {
  const total = data.reduce((s, r) => s + Number(r[dataKey] ?? 0), 0);
  return (
    <TrendCard title={title} label={`${name}: ${total} in this period`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
          <Line type="monotone" dataKey={dataKey} name={name} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "hsl(var(--primary))" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}

/** Several series per day as stacked bars (the top four in blue strengths, "Other" grey), with a legend. */
export function StackedTrend({ title, data, series }: { title: string; data: Row[]; series: string[] }) {
  const color = (name: string, i: number) => (name === "Other" ? OTHER_COLOR : (BAR_COLORS[i] ?? BAR_COLORS[BAR_COLORS.length - 1]));
  return (
    <TrendCard
      title={title}
      aside={
        series.length ? (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {series.map((s, i) => (
              <LegendKey key={s} color={color(s, i)}>
                {s}
              </LegendKey>
            ))}
          </span>
        ) : null
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "hsl(var(--secondary))", opacity: 0.4 }} contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
          {series.map((name, i) => (
            <Bar key={name} dataKey={name} name={name} stackId="s" fill={color(name, i)} maxBarSize={40} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}
