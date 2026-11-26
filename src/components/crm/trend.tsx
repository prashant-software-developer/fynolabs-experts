"use client";
// Charts over time for the dashboard, drawn with Recharts inside a page section: a line per measure,
// or stacked bars per series with a small legend. Light grid, muted axes, the brand blue at falling
// strengths (grey for "Other"), and a rounded tooltip.
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = { border: "1px solid hsl(var(--border))", borderRadius: 4, background: "hsl(var(--popover))", fontSize: 12, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.15)" };
const BAR_COLORS = ["hsl(var(--primary))", "hsl(var(--primary) / 0.7)", "hsl(var(--primary) / 0.45)", "hsl(var(--primary) / 0.25)"];
const OTHER_COLOR = "hsl(var(--muted-foreground) / 0.45)";

type Row = { label: string } & Record<string, number | string>;

function ChartBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} className="h-52 w-full sm:h-60 [&_.recharts-surface:focus]:outline-none">
      {children}
    </div>
  );
}

/** One measure per day as a line. */
export function LineTrend({ data, dataKey, name }: { data: Row[]; dataKey: string; name: string }) {
  const total = data.reduce((s, r) => s + Number(r[dataKey] ?? 0), 0);
  return (
    <ChartBox label={`${name}: ${total} in this period`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
          <Line type="monotone" dataKey={dataKey} name={name} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "hsl(var(--primary))" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

/** Several series per day as stacked bars (the top four in blue strengths, "Other" grey), with a legend above. */
export function StackedTrend({ data, series, name }: { data: Row[]; series: string[]; name: string }) {
  const color = (s: string, i: number) => (s === "Other" ? OTHER_COLOR : (BAR_COLORS[i] ?? BAR_COLORS[BAR_COLORS.length - 1]));
  return (
    <div className="space-y-4">
      {series.length ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color(s, i) }} aria-hidden="true" /> {s}
            </span>
          ))}
        </div>
      ) : null}
      <ChartBox label={name}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "hsl(var(--secondary))", opacity: 0.6 }} contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
            {series.map((s, i) => (
              <Bar key={s} dataKey={s} name={s} stackId="s" fill={color(s, i)} maxBarSize={40} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartBox>
    </div>
  );
}

/**
 * A few series per day as bars, stacked or side by side (Analytics, a project's activity), in the
 * same style as the dashboard: legend above, 11px axes that never scale with the width, the brand
 * blue at falling strengths and grey for "other".
 */
export function SeriesBars({ data, series, stacked = true, name }: { data: Row[]; series: { key: string; label: string; other?: boolean }[]; stacked?: boolean; name: string }) {
  const color = (s: { other?: boolean }, i: number) => (s.other ? OTHER_COLOR : (BAR_COLORS[i] ?? BAR_COLORS[BAR_COLORS.length - 1]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color(s, i) }} aria-hidden="true" /> {s.label}
          </span>
        ))}
      </div>
      <ChartBox label={name}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }} barGap={2}>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "hsl(var(--secondary))", opacity: 0.6 }} contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? "s" : undefined} fill={color(s, i)} maxBarSize={stacked ? 40 : 18} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartBox>
    </div>
  );
}
