import Link from "next/link";
import { getDb } from "@/db/client";
import { PLACEMENT_STATUSES, label } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { computeMoney, formatMoney, summarize } from "@/lib/money";
import { listPlacements } from "@/lib/server/placements";
import { listPartners } from "@/lib/server/requirements";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { PageHeader, Section, Stat, StatGrid, Stack } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";

export const metadata = { title: "Placements" };

export default async function PlacementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab = ["partners", "months"].includes(one(sp.tab)) ? one(sp.tab) : "list";
  const status = one(sp.status);
  const partnerId = one(sp.partner);
  const db = await getDb();
  const [rows, partners] = await Promise.all([listPlacements(db, { status: status || undefined, partnerId }), listPartners(db)]);
  const summary = summarize(rows.map((r) => ({ ...r.p, partnerName: r.partnerName })));
  const usd = summary.total.find((t) => t.currency === "USD") ?? summary.total[0];
  const cur = usd?.currency ?? "USD";
  const activeCount = rows.filter((r) => r.p.status === "active").length;

  return (
    <>
      <PageHeader title="Placements" subtitle="Who is working where, and what it earns. Internal only." />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        <StatGrid>
          <Stat label="Active placements" value={activeCount} />
          <Stat label="Earned by experts" value={formatMoney(usd?.earned ?? 0, cur)} hint={summary.total.length > 1 ? "Other currencies in the tables" : undefined} />
          <Stat label="Revenue" value={formatMoney(usd?.revenue ?? 0, cur)} />
          <Stat label="Margin" value={formatMoney(usd?.margin ?? 0, cur)} />
        </StatGrid>
        <div>
          <Tabs
            tabs={[
              { href: hrefWith("/placements", sp, { tab: null, ok: null }), label: "Placements", active: tab === "list", count: rows.length },
              { href: hrefWith("/placements", sp, { tab: "partners", ok: null }), label: "By partner", active: tab === "partners" },
              { href: hrefWith("/placements", sp, { tab: "months", ok: null }), label: "By month", active: tab === "months" },
            ]}
          />
          <Section flush>
            <form method="get" className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              {tab !== "list" ? <input type="hidden" name="tab" value={tab} /> : null}
              <Select name="status" defaultValue={status} options={PLACEMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))} placeholder="Any status" className="w-auto" aria-label="Status" />
              <Select name="partner" defaultValue={partnerId} options={partners.map((p) => ({ value: p.id, label: p.name }))} placeholder="All partners" className="w-auto" aria-label="Partner" />
              <Button type="submit" variant="secondary" size="sm">
                Filter
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">New placements start from an approved submission (Requirement → Submissions).</span>
            </form>
            {!rows.length ? (
              <EmptyState size="page" title="No placements" description="When a partner approves someone, open the requirement's Submissions tab and choose Create placement." />
            ) : tab === "list" ? (
              <Table>
                <THead>
                  <Th>Expert</Th>
                  <Th>Project</Th>
                  <Th>Partner</Th>
                  <Th>Status</Th>
                  <Th>Start</Th>
                  <Th className="text-right">Hours / tasks</Th>
                  <Th className="text-right">Earned by expert</Th>
                  <Th className="text-right">Revenue</Th>
                  <Th className="text-right">Margin</Th>
                </THead>
                <TBody>
                  {rows.map((r) => {
                    const m = computeMoney(r.p);
                    return (
                      <Tr key={r.p.id}>
                        <Td>
                          {r.p.expertId ? (
                            <Link href={`/experts/${r.p.expertId}`} className="font-medium text-foreground hover:text-primary">
                              {r.expertName}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground/70">Deleted expert</span>
                          )}
                        </Td>
                        <Td>
                          <Link href={`/placements/${r.p.id}`} className="text-foreground hover:text-primary">
                            {r.p.projectName}
                          </Link>
                        </Td>
                        <Td>{r.partnerName}</Td>
                        <Td>
                          <StatusBadge value={r.p.status} />
                        </Td>
                        <Td className="whitespace-nowrap">{fmtDate(r.p.startDate)}</Td>
                        <Td className="tabular text-right">{r.p.basis === "per_task" ? `${r.p.tasksAccepted ?? 0} tasks` : `${r.p.hoursApproved ?? 0} h`}</Td>
                        <Td className="tabular text-right">{formatMoney(m.earned, r.p.currency)}</Td>
                        <Td className="tabular text-right">{formatMoney(m.revenue, r.p.currency)}</Td>
                        <Td className="tabular text-right">{formatMoney(m.margin, r.p.currency)}</Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            ) : tab === "partners" ? (
              <TotalsTable rows={summary.byPartner.map((t) => ({ key: `${t.partner}|${t.currency}`, label: t.partner, ...t }))} first="Partner" />
            ) : (
              <TotalsTable rows={summary.byMonth.map((t) => ({ key: `${t.month}|${t.currency}`, label: t.month, ...t }))} first="Start month" />
            )}
          </Section>
        </div>
      </Stack>
    </>
  );
}

function TotalsTable({ rows, first }: { rows: { key: string; label: string; currency: string; count: number; hours: number; tasks: number; earned: number; revenue: number; margin: number }[]; first: string }) {
  return (
    <Table>
      <THead>
        <Th>{first}</Th>
        <Th className="text-right">Placements</Th>
        <Th className="text-right">Hours</Th>
        <Th className="text-right">Tasks</Th>
        <Th className="text-right">Earned by experts</Th>
        <Th className="text-right">Revenue</Th>
        <Th className="text-right">Margin</Th>
      </THead>
      <TBody>
        {rows.map((r) => (
          <Tr key={r.key}>
            <Td className="font-medium text-foreground">
              {r.label} <span className="text-xs font-normal text-muted-foreground/70">{r.currency}</span>
            </Td>
            <Td className="tabular text-right">{r.count}</Td>
            <Td className="tabular text-right">{r.hours}</Td>
            <Td className="tabular text-right">{r.tasks}</Td>
            <Td className="tabular text-right">{formatMoney(r.earned, r.currency)}</Td>
            <Td className="tabular text-right">{formatMoney(r.revenue, r.currency)}</Td>
            <Td className="tabular text-right">{formatMoney(r.margin, r.currency)}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
