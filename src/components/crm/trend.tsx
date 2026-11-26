"use client";
// Charts over time for the dashboard, drawn with Recharts inside a page section: a line per measure,
// or stacked bars per series with a small legend. Light grid, muted axes, the brand blue at falling
// strengths (grey for "Other"), and a rounded tooltip.
import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
 * A few series per day as bars, stacked or side by side (Analytics, a project's activity): legend above
 * with each series' total, 11px axes, a colour per series (its own `color`, else the brand blue at falling
 * strengths, grey for "other"). With `capSpikes`, one day far above the rest (over 3x the next highest)
 * no longer flattens the chart: the axis stops just above the normal days and the tall bar shows its value.
 */
export function SeriesBars({ data, series, stacked = true, name, capSpikes = false }: { data: Row[]; series: { key: string; label: string; other?: boolean; color?: string }[]; stacked?: boolean; name: string; capSpikes?: boolean }) {
  const color = (s: { other?: boolean; color?: string }, i: number) => s.color ?? (s.other ? OTHER_COLOR : (BAR_COLORS[i] ?? BAR_COLORS[BAR_COLORS.length - 1]));
  const totals = Object.fromEntries(series.map((s) => [s.key, data.reduce((t, r) => t + Number(r[s.key] ?? 0), 0)]));
  const heights = data.map((r) => (stacked ? series.reduce((t, s) => t + Number(r[s.key] ?? 0), 0) : Math.max(0, ...series.map((s) => Number(r[s.key] ?? 0))))).sort((a, b) => b - a);
  const cap = capSpikes && heights.length > 2 && heights[1] > 0 && heights[0] > heights[1] * 3 ? Math.ceil((heights[1] * 1.25) / 10) * 10 : undefined;
  const spikeLabel = (props: { x?: unknown; y?: unknown; width?: unknown; value?: unknown }) => {
    const v = Number(props.value ?? 0);
    if (!cap || v <= cap) return null;
    return (
      <text x={Number(props.x) + Number(props.width) / 2} y={Number(props.y) + 12} textAnchor="middle" fontSize={11} fill="hsl(var(--primary-foreground))">
        {v.toLocaleString("en-GB")}
      </text>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {series.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color(s, i) }} aria-hidden="true" /> {s.label}
            <span className="tabular text-foreground">{totals[s.key].toLocaleString("en-GB")}</span>
          </span>
        ))}
        {cap ? <span className="text-xs text-muted-foreground">· axis capped at {cap.toLocaleString("en-GB")}; taller days show their number</span> : null}
      </div>
      <ChartBox label={name}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }} barGap={2}>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} domain={cap ? [0, cap] : undefined} allowDataOverflow={Boolean(cap)} />
            <Tooltip cursor={{ fill: "hsl(var(--secondary))", opacity: 0.6 }} contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? "s" : undefined} fill={color(s, i)} maxBarSize={stacked ? 40 : 18} radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {cap && !stacked ? <LabelList dataKey={s.key} content={spikeLabel} /> : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartBox>
    </div>
  );
}

type SourceSeries = { key: string; label: string; color: string };

function SourceTooltip({ active, label, payload, series }: { active?: boolean; label?: string; payload?: { payload: Row }[]; series: SourceSeries[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const total = series.reduce((t, s) => t + Number(row[s.key] ?? 0), 0);
  return (
    <div style={tooltipStyle} className="min-w-40 space-y-1.5 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-6">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="tabular text-sm font-medium text-foreground">{total.toLocaleString("en-GB")}</span>
      </div>
      {series.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-6 text-xs">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </span>
          <span className="tabular text-foreground">{Number(row[s.key] ?? 0).toLocaleString("en-GB")}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Visitors per day (Analytics). Direct traffic is most of every day, so stacking hides the sources we
 * work on. Instead: one smooth area for all visitors (the hover shows each source), and below it a small
 * chart of the `focus` sources on their own scale so a day with 20 visits from Google is easy to see.
 * Days at the end with no data yet (the copy from the FynoLabs site runs once a day) are left off.
 */
export function SourceTrend({ data, series, focus, name }: { data: Row[]; series: SourceSeries[]; focus: string[]; name: string }) {
  const totalOf = (r: Row) => series.reduce((t, s) => t + Number(r[s.key] ?? 0), 0);
  let end = data.length;
  while (end > 1 && totalOf(data[end - 1]) === 0) end--;
  const rows: Row[] = data.slice(0, end).map((r) => ({ ...r, total: totalOf(r) }));
  const totals = Object.fromEntries(series.map((s) => [s.key, rows.reduce((t, r) => t + Number(r[s.key] ?? 0), 0)]));
  const all = Object.values(totals).reduce((a, b) => a + b, 0);
  const focusSeries = series.filter((s) => focus.includes(s.key));
  const trimmed = end < data.length ? data[end - 1]?.label : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
            <span className="tabular text-foreground">{totals[s.key].toLocaleString("en-GB")}</span>
            <span className="tabular">{all ? `${Math.round((totals[s.key] / all) * 100)}%` : ""}</span>
          </span>
        ))}
        {trimmed ? <span className="text-xs text-muted-foreground">· data up to {trimmed}</span> : null}
      </div>
      <ChartBox label={`${name}: ${all} visitors`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="visitorsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={32} tickMargin={8} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={48} />
            <Tooltip cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} content={<SourceTooltip series={series} />} />
            <Area type="monotone" dataKey="total" name="Visitors" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#visitorsFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--background))", fill: "hsl(var(--primary))" }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartBox>
      {focusSeries.length ? (
        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-xs text-muted-foreground">{focusSeries.map((s) => s.label).join(" and ")}, on their own scale</p>
          <div role="img" aria-label={`${focusSeries.map((s) => s.label).join(" and ")} per day`} className="h-32 w-full [&_.recharts-surface:focus]:outline-none">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={32} tickMargin={8} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={48} />
                <Tooltip cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} content={<SourceTooltip series={focusSeries} />} />
                {focusSeries.map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 3.5, fill: s.color }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
