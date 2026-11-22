import Link from "next/link";
import { getDb } from "@/db/client";
import { EXPERT_STATUSES, label } from "@/lib/constants";
import { daysSince, fmtDate } from "@/lib/format";
import { computeMoney, formatMoney } from "@/lib/money";
import { dashboardData } from "@/lib/server/dashboard";
import { ActivityList } from "@/components/activity-list";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader, Section, Stat, StatGrid, Stack } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const db = await getDb();
  const d = await dashboardData(db);
  const openSlots = d.openReqs.reduce((n, r) => n + Math.max(0, r.slots - r.filled), 0);
  const maxStatus = Math.max(1, ...Object.values(d.byStatus));
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Where every expert and every partner request stands today."
        actions={
          <>
            <ButtonLink href="/experts">Find experts</ButtonLink>
            <ButtonLink href="/requirements/new" variant="primary">
              New requirement
            </ButtonLink>
          </>
        }
      />
      <Stack>
        <StatGrid>
          <Stat label="Experts" value={d.total} hint={`${d.byStatus.bench ?? 0} on the bench`} href="/experts" />
          <Stat label="Open slots" value={openSlots} hint={`${d.openReqs.length} open requirements`} href="/requirements" />
          <Stat label="Waiting on partners" value={d.waiting.length} href="/submissions?status=waiting" />
          <Stat label="Active placements" value={d.active.length} href="/placements?status=active" />
        </StatGrid>

        <Section title="Experts by status">
          <div className="space-y-2">
            {EXPERT_STATUSES.map((s) => {
              const n = d.byStatus[s] ?? 0;
              return (
                <Link key={s} href={`/experts?status=${s}`} className="group flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 text-foreground/70 group-hover:text-foreground">{label(s)}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-1.5 rounded-full bg-foreground/75 transition-colors group-hover:bg-foreground" style={{ width: `${(n / maxStatus) * 100}%` }} />
                  </div>
                  <span className="tabular w-10 text-right text-foreground/80">{n}</span>
                </Link>
              );
            })}
          </div>
        </Section>

        <Section title="Open requirements" flush actions={<ButtonLink href="/requirements" size="sm" variant="ghost">All requirements</ButtonLink>}>
          {d.openReqs.length ? (
            <Table>
              <THead>
                <Th>Requirement</Th>
                <Th>Partner</Th>
                <Th>Status</Th>
                <Th>Open slots</Th>
                <Th>In progress</Th>
                <Th>Deadline</Th>
              </THead>
              <TBody>
                {d.openReqs.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Link href={`/requirements/${r.id}`} className="font-medium text-foreground hover:text-primary">
                        {r.title}
                      </Link>
                    </Td>
                    <Td>{r.partnerName}</Td>
                    <Td>
                      <StatusBadge value={r.status} />
                    </Td>
                    <Td className="tabular">
                      {Math.max(0, r.slots - r.filled)} of {r.slots}
                    </Td>
                    <Td className="tabular">{r.inPlay}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.deadline)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="No open requirements" action={<ButtonLink href="/requirements/new">Add one</ButtonLink>} />
          )}
        </Section>

        <Section title="Waiting on partners" description="Submitted, no answer yet. Oldest first: chase these." flush>
          {d.waiting.length ? (
            <Table>
              <THead>
                <Th>Expert</Th>
                <Th>Requirement</Th>
                <Th>Partner</Th>
                <Th>Status</Th>
                <Th>Waiting</Th>
              </THead>
              <TBody>
                {d.waiting.map((w) => {
                  const days = daysSince(w.submittedAt);
                  return (
                    <Tr key={w.id}>
                      <Td>
                        <Link href={`/experts/${w.expertId}`} className="font-medium text-foreground hover:text-primary">
                          {w.expertName}
                        </Link>
                      </Td>
                      <Td>
                        <Link href={`/requirements/${w.reqId}?tab=submissions`} className="hover:text-primary">
                          {w.reqTitle}
                        </Link>
                      </Td>
                      <Td>{w.partnerName}</Td>
                      <Td>
                        <StatusBadge value={w.status} />
                      </Td>
                      <Td className={days != null && days >= 5 ? "text-warning" : ""}>{days == null ? "–" : `${days} d`}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="Nothing waiting on partners" />
          )}
        </Section>

        <Section title="Active placements" flush actions={<ButtonLink href="/placements" size="sm" variant="ghost">All placements</ButtonLink>}>
          {d.active.length ? (
            <Table>
              <THead>
                <Th>Expert</Th>
                <Th>Project</Th>
                <Th>Partner</Th>
                <Th>Since</Th>
                <Th className="text-right">Earned</Th>
                <Th className="text-right">Revenue</Th>
              </THead>
              <TBody>
                {d.active.map((a) => {
                  const m = computeMoney(a.p);
                  return (
                    <Tr key={a.p.id}>
                      <Td>{a.expertName ?? <span className="text-muted-foreground/70">Deleted expert</span>}</Td>
                      <Td>
                        <Link href={`/placements/${a.p.id}`} className="hover:text-primary">
                          {a.p.projectName}
                        </Link>
                      </Td>
                      <Td>{a.partnerName}</Td>
                      <Td>{fmtDate(a.p.startDate)}</Td>
                      <Td className="tabular text-right">{formatMoney(m.earned, a.p.currency)}</Td>
                      <Td className="tabular text-right">{formatMoney(m.revenue, a.p.currency)}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="No active placements" />
          )}
        </Section>

        <Section title="Recent activity">
          <ActivityList items={d.activity} />
        </Section>
      </Stack>
    </>
  );
}
