import Link from "next/link";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { todayIndia } from "@/lib/talent";
import { CHART_RANGE_LABELS, CHART_RANGES, chartRange, methodLine, moneyText, ownPayments, payoutChart, shortDate, totalsText } from "@/lib/server/payouts";
import { PortalCard, PortalEmpty, PortalHeader, PortalSectionTitle } from "@/components/portal/page";
import { ChoiceLinks, MethodStatus, PayoutHistory, ProjectList, StatCard } from "@/components/portal/payments/bits";
import { EarningsChart } from "@/components/portal/payments/earnings-chart";
import { PayoutMethodForm } from "@/components/portal/payments/method-form";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await portalContext("/me/payments");
  if (ctx.kind !== "expert") return null;
  const today = todayIndia();
  const data = await ownPayments(await getDb(), ctx.expertId, { today });
  const { summary, currency } = data;
  const range = chartRange(one(sp.range));
  const asked = one(sp.cur).toUpperCase();
  const chartCurrency = data.currencies.includes(asked) ? asked : (data.currencies[0] ?? currency);
  const chart = payoutChart(data.history, { range, currency: chartCurrency, today });
  const here = { range: range === "year" ? "" : range, cur: chartCurrency === (data.currencies[0] ?? currency) ? "" : chartCurrency };
  const next = summary.next;
  const inTransit = summary.current.count;

  return (
    <>
      <PortalHeader
        title="Payments"
        subtitle={
          <>
            Total paid to date <span className="tabular text-foreground">{totalsText(summary.paidToDate, currency)}</span>
          </>
        }
        aside={<MethodStatus line={methodLine(data.method)} />}
      />
      <div className="space-y-12">
        {summary.failed ? (
          <Notice tone="warning" title={summary.failed === 1 ? "A payout didn't go through" : `${summary.failed} payouts didn't go through`}>
            Check your{" "}
            <a href="#method" className="text-foreground underline underline-offset-4">
              payout method
            </a>
            . We&apos;ll send it again once it&apos;s right.
          </Notice>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Current payout" value={inTransit ? totalsText(summary.current.totals, currency) : moneyText(0, currency, { whole: true })} hint={inTransit ? (inTransit === 1 ? "In transit" : `${inTransit} payouts in transit`) : "No payout in transit"} />
          <StatCard
            label="Next payout"
            value={next ? next.totals.map((t) => `~${moneyText(t.amount, t.currency)}`).join(" · ") : "–"}
            hint={next ? (next.expectedOn ? `${next.expectedOn < today ? "Was due" : "Estimated"} ${shortDate(next.expectedOn, today)}` : "Date to be confirmed") : "Nothing scheduled yet"}
          />
          <StatCard label="Paid this month" value={totalsText(summary.paidThisMonth.totals, currency)} hint={`${summary.paidThisMonth.count} ${summary.paidThisMonth.count === 1 ? "payout" : "payouts"}`} />
        </div>

        <section>
          <PortalSectionTitle
            action={
              <div className="flex flex-wrap items-center gap-3">
                <ChoiceLinks label="Range" items={CHART_RANGES.map((r) => ({ href: hrefWith("/me/payments", here, { range: r === "year" ? null : r }), label: CHART_RANGE_LABELS[r], active: r === range }))} />
                {data.currencies.length > 1 ? (
                  <ChoiceLinks label="Currency" items={data.currencies.map((c, i) => ({ href: hrefWith("/me/payments", here, { cur: i === 0 ? null : c }), label: c, active: c === chartCurrency }))} />
                ) : null}
              </div>
            }
          >
            Earnings over time
          </PortalSectionTitle>
          <PortalCard className="px-5 py-5 sm:px-6">
            <EarningsChart data={chart} rangeLabel={CHART_RANGE_LABELS[range]} />
          </PortalCard>
        </section>

        <section>
          <PortalSectionTitle count={data.projects.length || undefined}>By project</PortalSectionTitle>
          {data.projects.length || data.other ? (
            <ProjectList projects={data.projects} other={data.other} currency={currency} />
          ) : (
            <PortalEmpty
              title="No projects yet"
              description="When you join a project, its rate and payouts show here."
              action={
                <Link href="/" className={buttonClass("secondary", "sm")}>
                  Browse open roles
                </Link>
              }
            />
          )}
        </section>

        <section>
          <PortalSectionTitle count={data.history.length || undefined}>Payout history</PortalSectionTitle>
          {data.history.length ? <PayoutHistory rows={data.history} /> : <PortalEmpty title="No payouts yet" description="When we record a payout for your work, it shows here with its status." />}
        </section>

        <section id="method" className="scroll-mt-8">
          <PortalSectionTitle>Payout method</PortalSectionTitle>
          <PortalCard className="space-y-5 px-5 py-5 sm:px-6">
            <p className="text-sm text-muted-foreground">Where we send your payouts. You can change it any time.</p>
            <PayoutMethodForm method={data.method?.method ?? null} handle={data.method?.handle ?? null} />
          </PortalCard>
        </section>
      </div>
    </>
  );
}
