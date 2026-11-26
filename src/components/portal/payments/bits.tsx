// Payments page pieces: stat cards, the pill links (range, currency), the method status, project
// cards and the payout history table. Server components; one column, sections stacked.
import Link from "next/link";
import { Wallet } from "@/components/icons";
import { PAYOUT_STATUS_LABELS, label } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { moneyText, PAYOUT_STATUS_TONE, periodText, totalsText, type MoneyTotal, type OwnPayout, type OwnProject } from "@/lib/server/payouts";
import { PortalCard } from "@/components/portal/page";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export function StatCard({ label: title, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <PortalCard className="min-w-0 px-5 py-5">
      <p className="eyebrow text-muted-foreground">{title}</p>
      <p className="tabular mt-2 text-stat break-words text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </PortalCard>
  );
}

/** Small pill links (one is the current choice). */
export function ChoiceLinks({ items, label: name }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5" aria-label={name}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          scroll={false}
          aria-current={i.active ? "true" : undefined}
          className={cn(
            "inline-flex h-8 items-center rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors",
            i.active ? "border-primary/40 bg-primary/[0.06] text-primary" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Under the page title, on the right: how they are paid, or a link to add a method. */
export function MethodStatus({ line }: { line: string | null }) {
  if (!line)
    return (
      <a href="#method" className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline">
        <Wallet className="h-4 w-4" aria-hidden /> Add a payout method
      </a>
    );
  return (
    <a href="#method" className="inline-flex max-w-xs min-w-0 items-center gap-2 text-sm text-foreground/80 hover:text-foreground" title="Change your payout method">
      <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{line}</span>
    </a>
  );
}

const PROJECT_TONE: Record<string, "success" | "warning" | "muted"> = { active: "success", paused: "warning", ended: "muted" };

function Totals({ paid, upcoming, currency }: { paid: MoneyTotal[]; upcoming: MoneyTotal[]; currency: string }) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2">
      <div>
        <dt className="eyebrow text-muted-foreground">Paid</dt>
        <dd className="tabular mt-1 text-sm text-foreground">{totalsText(paid, currency)}</dd>
      </div>
      <div>
        <dt className="eyebrow text-muted-foreground">Upcoming</dt>
        <dd className="tabular mt-1 text-sm text-foreground">{totalsText(upcoming, currency)}</dd>
      </div>
    </dl>
  );
}

/** One card per project (their own rate and status), plus payouts that belong to no project. */
export function ProjectList({ projects, other, currency }: { projects: OwnProject[]; other: { paid: MoneyTotal[]; upcoming: MoneyTotal[] } | null; currency: string }) {
  return (
    <ul className="space-y-3">
      {projects.map((p) => (
        <PortalCard as="li" key={p.id} className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-4 sm:px-6">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] text-foreground">{p.title}</h3>
              <Badge tone={PROJECT_TONE[p.status] ?? "muted"}>{label(p.status)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{p.rateText}</p>
          </div>
          {/* Nothing yet reads zero in the currency this project is paid in (else its rate's). */}
          <Totals paid={p.paid} upcoming={p.upcoming} currency={p.paid[0]?.currency ?? p.upcoming[0]?.currency ?? p.currency} />
        </PortalCard>
      ))}
      {other ? (
        <PortalCard as="li" className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-4 sm:px-6">
          <div className="min-w-0 space-y-1">
            <h3 className="text-[15px] text-foreground">Other payouts</h3>
            <p className="text-sm text-muted-foreground">Not tied to a project.</p>
          </div>
          <Totals paid={other.paid} upcoming={other.upcoming} currency={currency} />
        </PortalCard>
      ) : null}
    </ul>
  );
}

function dateLine(p: OwnPayout): string {
  if (p.status === "paid") return `Paid ${fmtDate(p.paidOn ?? p.on)}`;
  if (p.status === "failed") return "Didn't go through";
  return p.expectedOn ? `Expected ${fmtDate(p.expectedOn)}` : "Date to be confirmed";
}

export function PayoutHistory({ rows }: { rows: OwnPayout[] }) {
  return (
    <PortalCard className="overflow-hidden">
      <Table>
        <THead>
          <Th>Payout</Th>
          <Th>Project</Th>
          <Th className="text-right">Amount</Th>
          <Th>Status</Th>
          <Th>Date</Th>
          <Th>Reference</Th>
        </THead>
        <TBody>
          {rows.map((p) => {
            const period = periodText(p.periodStart, p.periodEnd);
            return (
              <Tr key={p.id}>
                <Td className="min-w-44">
                  <div className="text-foreground">{p.label ?? period ?? "Payout"}</div>
                  {p.label && period ? <div className="text-xs text-muted-foreground">{period}</div> : null}
                </Td>
                <Td className="min-w-36">{p.projectTitle ?? <span className="text-muted-foreground/70">–</span>}</Td>
                <Td className="tabular text-right whitespace-nowrap text-foreground">{moneyText(p.amount, p.currency)}</Td>
                <Td>
                  <Badge tone={PAYOUT_STATUS_TONE[p.status]}>{PAYOUT_STATUS_LABELS[p.status]}</Badge>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{dateLine(p)}</Td>
                <Td className="text-muted-foreground">{p.reference ?? <span className="text-muted-foreground/70">–</span>}</Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </PortalCard>
  );
}
