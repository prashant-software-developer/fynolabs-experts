import { getDb } from "@/db/client";
import { requireSection } from "@/lib/auth/section-guard";
import { isIsoDate, shortDay, todayIST } from "@/lib/crm/dates";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { RANGES, SOURCE_LABELS, rangeFor, visitorAnalytics } from "@/lib/server/analytics";
import { BarList, DayBars } from "@/components/crm/charts";
import { Segments } from "@/components/crm/segments";
import { Button } from "@/components/ui/button";
import { EmptyState, NoAccess } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { PageHeader, Section, Stack, Stat, StatGrid } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export const metadata = { title: "Analytics" };

const SERIES = [
  { key: "linkedin", label: SOURCE_LABELS.linkedin, className: "fill-primary" },
  { key: "google", label: SOURCE_LABELS.google, className: "fill-info" },
  { key: "direct", label: SOURCE_LABELS.direct, className: "fill-foreground/60" },
  { key: "other", label: SOURCE_LABELS.other, className: "fill-muted-foreground/40" },
];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("analytics");
  if (!allowed)
    return (
      <>
        <PageHeader title="Analytics" />
        <Section>
          <NoAccess what="Analytics" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const today = todayIST();
  const daysRaw = Number(one(sp.days));
  const days = (RANGES as readonly number[]).includes(daysRaw) ? daysRaw : 30;
  const from = isIsoDate(one(sp.from)) ? one(sp.from) : undefined;
  const to = isIsoDate(one(sp.to)) ? one(sp.to) : undefined;
  const range = rangeFor(days, today, from, to);
  const custom = Boolean(from && to && range.start === from);
  const a = await visitorAnalytics(db, range);
  const hasVisits = a.visitors > 0 || a.pageViews > 0;

  return (
    <>
      <PageHeader title="Analytics" subtitle={`Visitors to fynolabs.si by source, ${shortDay(range.start, today)} – ${shortDay(range.end, today)} (${range.days} days).`} />
      <Stack>
        <div className="flex flex-wrap items-center gap-3">
          <Segments label="Date range" items={RANGES.map((d) => ({ href: hrefWith("/admin/analytics", {}, { days: d === 30 ? null : d }), label: `${d} days`, active: !custom && days === d }))} />
          <form method="get" className="flex flex-wrap items-center gap-2">
            <Input name="from" type="date" defaultValue={custom ? range.start : ""} aria-label="From" className="h-8 w-auto text-small" />
            <span className="text-muted-foreground">–</span>
            <Input name="to" type="date" defaultValue={custom ? range.end : ""} aria-label="To" className="h-8 w-auto text-small" />
            <Button type="submit" variant="secondary" size="sm">
              Show
            </Button>
          </form>
        </div>
        <StatGrid>
          <Stat label="Visitors" value={a.visitors.toLocaleString("en-GB")} />
          <Stat label="Page views" value={a.pageViews.toLocaleString("en-GB")} />
          <Stat label="Applications" value={a.applications} hint="Job forms and the talent call" />
          <Stat label="Messages" value={a.messages} hint="Contact form" />
        </StatGrid>
        <Section title="Visitors per day, by source">
          {hasVisits ? <DayBars label="Visitors per day by source" days={a.days} series={SERIES} /> : <EmptyState title="No visitors in this range." description="Visitor totals come from the FynoLabs site (copied with the FynoLabs data)." padded={false} />}
        </Section>
        <Section title="Applications and messages per day">
          {a.applications || a.messages ? (
            <DayBars
              label="Applications and messages per day"
              stacked={false}
              days={a.activity}
              series={[
                { key: "applications", label: "Applications", className: "fill-primary" },
                { key: "messages", label: "Messages", className: "fill-foreground/60" },
              ]}
            />
          ) : (
            <EmptyState title="No applications or messages in this range." padded={false} />
          )}
        </Section>
        <Section title="Sources">
          {hasVisits ? (
            <BarList items={a.sources.map((s) => ({ key: s.source, label: s.label, value: s.visitors, hint: `${s.pageViews} page views · ${s.share}%`, tone: s.source === "linkedin" ? "primary" : undefined }))} />
          ) : (
            <EmptyState title="No sources yet." padded={false} />
          )}
        </Section>
        <Section title="Top landing pages" description="Where visits started (sessions)." flush>
          {a.landing.length ? <PathTable rows={a.landing.map((r) => ({ key: r.path, label: r.path, n: r.sessions }))} unit="Sessions" /> : <EmptyState title="No page views in this range." />}
        </Section>
        <Section title="Top pages" description="Every page view." flush>
          {a.pages.length ? <PathTable rows={a.pages.map((r) => ({ key: r.path, label: r.path, n: r.views }))} unit="Views" /> : <EmptyState title="No page views in this range." />}
        </Section>
        <Section title="Top referrers" description="Sites that sent visitors (sessions)." flush>
          {a.referrers.length ? <PathTable rows={a.referrers.map((r) => ({ key: r.host, label: r.host, n: r.sessions }))} unit="Sessions" /> : <EmptyState title="No referrers in this range." />}
        </Section>
      </Stack>
    </>
  );
}

function PathTable({ rows, unit }: { rows: { key: string; label: string; n: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <Table>
      <THead>
        <Th>Page</Th>
        <Th className="w-1/3" />
        <Th className="text-right">{unit}</Th>
      </THead>
      <TBody>
        {rows.map((r) => (
          <Tr key={r.key}>
            <Td className="max-w-md truncate font-mono text-small" title={r.label}>
              {r.label}
            </Td>
            <Td>
              <span className="block h-1.5 overflow-hidden bg-secondary">
                <span className="block h-1.5 bg-foreground/70" style={{ width: `${(r.n / max) * 100}%` }} />
              </span>
            </Td>
            <Td className="tabular text-right">{r.n}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
