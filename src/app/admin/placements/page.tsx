import Link from "next/link";
import { Download } from "@/components/icons";
import { getDb } from "@/db/client";
import { can, canSeeMoney, partnerScope } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { PLACEMENT_STATUSES, label } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { computeMoney, formatMoney, summarize } from "@/lib/money";
import { listPlacements } from "@/lib/server/placements";
import { listPartners } from "@/lib/server/requirements";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { OrgLogo } from "@/components/crm/org-logo";
import { FilterSelect, ResultCount, Toolbar } from "@/components/ui/toolbar";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { PageHeader, Section, Stat, StatGrid, Stack } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";

export const metadata = { title: "Placements" };

export default async function PlacementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab = ["partners", "months"].includes(one(sp.tab)) ? one(sp.tab) : "list";
  const status = one(sp.status);
  const partnerId = one(sp.partner);
  const user = await requireUser();
  const money = canSeeMoney(user.role);
  const scope = partnerScope(user);
  const db = await getDb();
  const [rows, allPartners] = await Promise.all([listPlacements(db, { status: status || undefined, partnerId, partnerScope: scope }), listPartners(db)]);
  const partners = scope ? allPartners.filter((p) => scope.includes(p.id)) : allPartners;
  const summary = summarize(rows.map((r) => ({ ...r.p, partnerName: r.partnerName })));
  const usd = summary.total.find((t) => t.currency === "USD") ?? summary.total[0];
  const cur = usd?.currency ?? "USD";
  const activeCount = rows.filter((r) => r.p.status === "active").length;
  const hours = summary.total.reduce((n, t) => n + t.hours, 0);
  const tasks = summary.total.reduce((n, t) => n + t.tasks, 0);
  const exportQs = new URLSearchParams({ ...(status ? { status } : {}), ...(partnerId ? { partner: partnerId } : {}) }).toString();

  return (
    <>
      <PageHeader
        title="Placements"
        subtitle={money ? "Who is working where, and what it earns. Internal only." : scope ? "Who is working where for your partners: hours and tasks." : "Who is working where: hours and tasks."}
        actions={
          can(user.role, "placements.export") ? (
            <ButtonLink href={`/api/placements/export${exportQs ? `?${exportQs}` : ""}`}>
              <Download className="h-4 w-4" /> Export CSV
            </ButtonLink>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        {money ? (
          <StatGrid>
            <Stat label="Active placements" value={activeCount} />
            <Stat label="Earned by experts" value={formatMoney(usd?.earned ?? 0, cur)} hint={summary.total.length > 1 ? "Other currencies in the tables" : undefined} />
            <Stat label="Revenue" value={formatMoney(usd?.revenue ?? 0, cur)} />
            <Stat label="Margin" value={formatMoney(usd?.margin ?? 0, cur)} />
          </StatGrid>
        ) : (
          <StatGrid>
            <Stat label="Active placements" value={activeCount} />
            <Stat label="All placements" value={rows.length} />
            <Stat label="Hours approved" value={Math.round(hours * 100) / 100} />
            <Stat label="Tasks accepted" value={tasks} />
          </StatGrid>
        )}
        <div>
          <Tabs
            tabs={[
              { href: hrefWith("/admin/placements", sp, { tab: null, ok: null }), label: "Placements", active: tab === "list", count: rows.length },
              { href: hrefWith("/admin/placements", sp, { tab: "partners", ok: null }), label: "By partner", active: tab === "partners" },
              { href: hrefWith("/admin/placements", sp, { tab: "months", ok: null }), label: "By month", active: tab === "months" },
            ]}
          />
          <Section flush>
            <Toolbar
              hidden={{ tab: tab !== "list" ? tab : null }}
              clearHref={status || partnerId ? hrefWith("/admin/placements", {}, { tab: tab !== "list" ? tab : null }) : null}
              end={<ResultCount n={rows.length} noun="placement" />}
            >
              <FilterSelect name="status" defaultValue={status} options={PLACEMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))} placeholder="Any status" label="Status" />
              <FilterSelect name="partner" defaultValue={partnerId} options={partners.map((p) => ({ value: p.id, label: p.name }))} placeholder="All partners" label="Partner" />
            </Toolbar>
            {can(user.role, "placements.create") ? <p className="border-b border-border bg-canvas px-6 py-2.5 text-[13px] text-muted-foreground">New placements start from an approved submission (Requirement → Submissions).</p> : null}
            {!rows.length ? (
              <EmptyState
                size="page"
                title={scope && !scope.length ? "No partners assigned to you yet" : "No placements"}
                description={scope && !scope.length ? "Ask an admin to add your partners in Team & access." : "When a partner approves someone, open the requirement's Submissions tab and choose Create placement."}
              />
            ) : tab === "list" ? (
              <Table>
                <THead>
                  <Th>Expert</Th>
                  <Th>Project</Th>
                  <Th>Partner</Th>
                  <Th>Status</Th>
                  <Th>Start</Th>
                  <Th className="text-right">Hours / tasks</Th>
                  {money ? <Th className="text-right">Earned by expert</Th> : null}
                  {money ? <Th className="text-right">Revenue</Th> : null}
                  {money ? <Th className="text-right">Margin</Th> : null}
                </THead>
                <TBody>
                  {rows.map((r) => {
                    const m = computeMoney(r.p);
                    return (
                      <Tr key={r.p.id}>
                        <Td>
                          {r.p.expertId ? (
                            <Link href={`/admin/experts/${r.p.expertId}`} className="inline-flex items-center gap-3 whitespace-nowrap text-foreground hover:text-primary">
                              <Avatar name={r.expertName} />
                              <span className="truncate">{r.expertName}</span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground/70">Deleted expert</span>
                          )}
                        </Td>
                        <Td className="min-w-44">
                          <Link href={`/admin/placements/${r.p.id}`} className="font-medium text-foreground hover:text-primary">
                            {r.p.projectName}
                          </Link>
                        </Td>
                        <Td>
                          <span className="inline-flex max-w-56 items-center gap-2">
                            <OrgLogo name={r.partnerName ?? ""} size={22} />
                            <span className="truncate">{r.partnerName}</span>
                          </span>
                        </Td>
                        <Td>
                          <StatusBadge value={r.p.status} />
                        </Td>
                        <Td className="whitespace-nowrap">{fmtDate(r.p.startDate)}</Td>
                        <Td className="tabular text-right">{r.p.basis === "per_task" ? `${r.p.tasksAccepted ?? 0} tasks` : `${r.p.hoursApproved ?? 0} h`}</Td>
                        {money ? <Td className="tabular text-right">{formatMoney(m.earned, r.p.currency)}</Td> : null}
                        {money ? <Td className="tabular text-right">{formatMoney(m.revenue, r.p.currency)}</Td> : null}
                        {money ? <Td className="tabular text-right">{formatMoney(m.margin, r.p.currency)}</Td> : null}
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            ) : tab === "partners" ? (
              <TotalsTable money={money} rows={summary.byPartner.map((t) => ({ key: `${t.partner}|${t.currency}`, label: t.partner, ...t }))} first="Partner" />
            ) : (
              <TotalsTable money={money} rows={summary.byMonth.map((t) => ({ key: `${t.month}|${t.currency}`, label: t.month, ...t }))} first="Start month" />
            )}
          </Section>
        </div>
      </Stack>
    </>
  );
}

function TotalsTable({ rows, first, money }: { rows: { key: string; label: string; currency: string; count: number; hours: number; tasks: number; earned: number; revenue: number; margin: number }[]; first: string; money: boolean }) {
  return (
    <Table>
      <THead>
        <Th>{first}</Th>
        <Th className="text-right">Placements</Th>
        <Th className="text-right">Hours</Th>
        <Th className="text-right">Tasks</Th>
        {money ? <Th className="text-right">Earned by experts</Th> : null}
        {money ? <Th className="text-right">Revenue</Th> : null}
        {money ? <Th className="text-right">Margin</Th> : null}
      </THead>
      <TBody>
        {rows.map((r) => (
          <Tr key={r.key}>
            <Td className="font-medium text-foreground">
              {r.label} {money ? <span className="text-[13px] font-normal text-muted-foreground/70">{r.currency}</span> : null}
            </Td>
            <Td className="tabular text-right">{r.count}</Td>
            <Td className="tabular text-right">{r.hours}</Td>
            <Td className="tabular text-right">{r.tasks}</Td>
            {money ? <Td className="tabular text-right">{formatMoney(r.earned, r.currency)}</Td> : null}
            {money ? <Td className="tabular text-right">{formatMoney(r.revenue, r.currency)}</Td> : null}
            {money ? <Td className="tabular text-right">{formatMoney(r.margin, r.currency)}</Td> : null}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
