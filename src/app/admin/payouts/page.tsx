import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { can, canSeeMoney, roleLabel } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { PAYOUT_METHOD_LABELS, PAYOUT_METHODS, PAYOUT_STATUS_LABELS, PAYOUT_STATUSES, isOneOf, label, type PayoutStatus } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { todayIndia } from "@/lib/talent";
import { expertForPayout, expertMethodFor, listPayouts, moneyText, PAYOUT_STATUS_TONE, payoutActivity, payoutForAdmin, payoutMoveAllowed, payoutTotals, periodText, placementOptions, plainAmount, type AdminPayout } from "@/lib/server/payouts";
import { ActivityList } from "@/components/activity-list";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Field, FieldRow, Input, Select } from "@/components/ui/field";
import { PageHeader, Section } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { CellStack, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { FilterSelect, ResultCount, SearchField, Toolbar } from "@/components/ui/toolbar";
import { Facts, PanelBlock, SectionBlocked } from "@/components/talent/bits";
import { findPayoutExpertAction, markPayoutAction } from "./actions";
import { AddPayoutForm } from "./add-form";

export const metadata = { title: "Payouts" };

const statusOf = (s: string): PayoutStatus => (isOneOf(PAYOUT_STATUSES, s) ? s : "upcoming");
const methodLabel = (m: string | null) => (m ? (isOneOf(PAYOUT_METHODS, m) ? PAYOUT_METHOD_LABELS[m] : label(m)) : null);
const what = (r: Pick<AdminPayout, "label" | "periodStart" | "periodEnd">) => r.label ?? periodText(r.periodStart, r.periodEnd) ?? "Payout";

function StatusChip({ status }: { status: string }) {
  const s = statusOf(status);
  return (
    <Badge tone={PAYOUT_STATUS_TONE[s]} pill dot>
      {PAYOUT_STATUS_LABELS[s]}
    </Badge>
  );
}

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "fees")) return <SectionBlocked title="Payouts" section="fees" />;
  if (!canSeeMoney(user.role)) {
    return (
      <>
        <PageHeader title="Payouts" />
        <Section flush>
          <NoAccess what="Payouts" role={roleLabel(user.role)} />
        </Section>
      </>
    );
  }
  const db = await getDb();
  const manage = can(user.role, "fees.manage");
  const status = isOneOf(PAYOUT_STATUSES, one(sp.status)) ? one(sp.status) : "";
  const q = one(sp.q);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(one(sp.month)) ? one(sp.month) : "";
  const rows = await listPayouts(db, { status, q, month });
  const totals = payoutTotals(rows, status);
  const list = hrefWith("/admin/payouts", sp, { ok: null, error: null, p: null, add: null, expert: null });
  const panelHref = (id: string) => hrefWith("/admin/payouts", sp, { p: id, ok: null, error: null, add: null, expert: null });
  const openId = one(sp.p);
  const open = openId ? (rows.find((r) => r.id === openId) ?? (await payoutForAdmin(db, openId))) : null;
  const adding = manage && Boolean(one(sp.add)) && !open;
  const filtered = Boolean(status || q || month);

  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle="What we pay experts, per project and period. Experts see their own in the portal. Money: admins and finance only."
        actions={
          manage ? (
            <ButtonLink href={hrefWith("/admin/payouts", sp, { add: "1", p: null, expert: null, ok: null, error: null })} variant="primary">
              <Plus className="h-4 w-4" /> Add payout
            </ButtonLink>
          ) : null
        }
      />
      {open || adding ? null : <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />}
      <Section flush>
        <Toolbar submit clearHref={filtered ? "/admin/payouts" : null} end={<ResultCount n={rows.length} noun="payout" />}>
          <SearchField name="q" defaultValue={q} placeholder="Expert name or email" label="Expert name or email" />
          <FilterSelect name="status" defaultValue={status} options={PAYOUT_STATUSES.map((s) => ({ value: s, label: PAYOUT_STATUS_LABELS[s] }))} placeholder="Any status" label="Status" />
          <Input name="month" type="month" defaultValue={month} aria-label="Month" title="Month paid, or expected if not paid yet" className="w-auto" />
        </Toolbar>
        {rows.length ? (
          <Table>
            <THead>
              <Th>Expert</Th>
              <Th>Payout</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Expected</Th>
              <Th>Paid</Th>
              <Th className="hidden 2xl:table-cell">Reference</Th>
              {manage ? <Th className="text-right">Next step</Th> : null}
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={r.expertName} />
                      <CellStack primary={<Link href={`/admin/experts/${r.expertId}`} className="font-medium text-foreground hover:text-primary">{r.expertName}</Link>} secondary={r.expertEmail} />
                    </div>
                  </Td>
                  <Td className="min-w-56">
                    <CellStack
                      primary={
                        <Link href={panelHref(r.id)} scroll={false} className="font-medium text-foreground hover:text-primary">
                          {what(r)}
                        </Link>
                      }
                      secondary={r.projectName ? [r.projectName, r.partnerName].filter(Boolean).join(" · ") : undefined}
                    />
                  </Td>
                  <Td className="tabular whitespace-nowrap">
                    {plainAmount(r.amount, r.currency)} <span className="text-[13px] text-muted-foreground">{r.currency}</span>
                  </Td>
                  <Td>
                    <StatusChip status={r.status} />
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDate(r.expectedOn)}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(r.paidOn)}</Td>
                  <Td className="hidden text-[13px] 2xl:table-cell">{r.reference ?? "–"}</Td>
                  {manage ? (
                    <Td className="text-right">
                      <NextStep row={r} back={list} panel={panelHref(r.id)} />
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </TBody>
            <tfoot className="border-t border-border">
              {totals.totals.map((t, i) => (
                <tr key={t.currency}>
                  <Td colSpan={2} className="text-[13px] text-muted-foreground">
                    {i === 0 ? `Total · ${totals.count} ${totals.count === 1 ? "payout" : "payouts"}${status ? "" : " (cancelled and failed left out)"}` : null}
                  </Td>
                  <Td className="tabular font-medium whitespace-nowrap text-foreground">
                    {plainAmount(t.amount, t.currency)} <span className="text-[13px] font-normal text-muted-foreground">{t.currency}</span>
                  </Td>
                  <Td colSpan={manage ? 5 : 4} />
                </tr>
              ))}
            </tfoot>
          </Table>
        ) : (
          <EmptyState
            size="page"
            title={filtered ? "No payouts in this view" : "No payouts yet"}
            description={filtered ? "Change or clear the filters." : "Add one when an expert has earned something: they see it in their portal under Payments."}
            action={
              manage && !filtered ? (
                <ButtonLink href="/admin/payouts?add=1" size="sm" variant="primary">
                  Add payout
                </ButtonLink>
              ) : undefined
            }
          />
        )}
      </Section>
      {open ? <PayoutPanel row={open} sp={sp} manage={manage} closeHref={list} here={panelHref(open.id)} /> : null}
      {adding ? <AddPayoutPanel sp={sp} closeHref={list} /> : null}
    </>
  );
}

/** The row's one obvious next step; everything else is in the side panel. */
function NextStep({ row, back, panel }: { row: AdminPayout; back: string; panel: string }) {
  if (row.status === "upcoming" || row.status === "failed")
    return (
      <form action={markPayoutAction}>
        <input type="hidden" name="id" value={row.id} />
        <input type="hidden" name="to" value="processing" />
        <input type="hidden" name="returnTo" value={back} />
        <SubmitButton size="sm" variant="ghost" pendingText="Saving…">
          {row.status === "failed" ? "Retry" : "Mark processing"}
        </SubmitButton>
      </form>
    );
  if (row.status === "processing")
    return (
      <ButtonLink href={panel} size="sm" variant="ghost">
        Mark paid…
      </ButtonLink>
    );
  return null;
}

function StatusForm({ id, to, here, children, variant = "secondary", confirm }: { id: string; to: string; here: string; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; confirm?: string }) {
  return (
    <form action={markPayoutAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="returnTo" value={here} />
      <SubmitButton size="sm" variant={variant} pendingText="Saving…" confirm={confirm}>
        {children}
      </SubmitButton>
    </form>
  );
}

async function PayoutPanel({ row, sp, manage, closeHref, here }: { row: AdminPayout; sp: SearchParams; manage: boolean; closeHref: string; here: string }) {
  const db = await getDb();
  const [history, expertMethod] = await Promise.all([payoutActivity(db, row.id), manage ? expertMethodFor(db, row.expertId) : Promise.resolve(null)]);
  const s = statusOf(row.status);
  const allowed = (to: string) => manage && payoutMoveAllowed(s, to);
  const period = periodText(row.periodStart, row.periodEnd);
  const today = todayIndia();
  return (
    <SlideOver
      title="Payout"
      addon={<StatusChip status={row.status} />}
      closeHref={closeHref}
      footer={
        <ButtonLink href={`/admin/experts/${row.expertId}`} size="sm">
          Open expert →
        </ButtonLink>
      }
    >
      <div className="space-y-6">
        <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
        <div className="space-y-1.5">
          <div className="text-sm text-muted-foreground">
            {row.expertName}
            {row.expertEmail ? ` · ${row.expertEmail}` : ""}
          </div>
          <div className="tabular text-stat text-foreground">{moneyText(row.amount, row.currency)}</div>
          <div className="text-sm text-foreground/80">
            {what(row)}
            {row.label && period ? ` · ${period}` : ""}
          </div>
        </div>
        <PanelBlock title="Details">
          <Facts
            items={[
              { label: "Project", value: row.projectName ? `${row.projectName}${row.partnerName ? ` · ${row.partnerName}` : ""}` : null },
              { label: "Period", value: period },
              { label: "Expected", value: row.expectedOn ? fmtDate(row.expectedOn) : null },
              { label: "Paid", value: row.paidOn ? fmtDate(row.paidOn) : null },
              { label: "Paid by", value: methodLabel(row.method) },
              { label: "Reference", value: row.reference },
              { label: "Added", value: `${fmtDate(row.createdAt)}${row.createdBy ? ` by ${row.createdBy}` : ""}` },
              { label: "Last change by", value: row.updatedBy },
            ]}
          />
          {row.notes ? <p className="text-sm whitespace-pre-line text-foreground/80">{row.notes}</p> : null}
        </PanelBlock>
        {allowed("paid") ? (
          <PanelBlock title="Mark paid">
            <form action={markPayoutAction} className="space-y-3">
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="to" value="paid" />
              <input type="hidden" name="returnTo" value={here} />
              <FieldRow>
                <Field label="Paid on" htmlFor="paidOn">
                  <Input id="paidOn" name="paidOn" type="date" max={today} defaultValue={today} />
                </Field>
                <Field label="Paid by" htmlFor="method" hint={expertMethod ? "The expert's payout method." : "The expert hasn't added a payout method."}>
                  <Select id="method" name="method" defaultValue={row.method ?? expertMethod ?? ""} options={PAYOUT_METHODS.map((m) => ({ value: m, label: PAYOUT_METHOD_LABELS[m] }))} placeholder="Not recorded" />
                </Field>
              </FieldRow>
              <Field label="Reference" htmlFor="reference" hint="UTR or transaction ID. The expert sees it.">
                <Input id="reference" name="reference" maxLength={120} defaultValue={row.reference ?? ""} />
              </Field>
              <SubmitButton size="sm" pendingText="Saving…">
                Mark paid
              </SubmitButton>
            </form>
          </PanelBlock>
        ) : null}
        {allowed("processing") || allowed("failed") || allowed("void") ? (
          <PanelBlock title="Status">
            <div className="flex flex-wrap gap-2">
              {allowed("processing") ? (
                <StatusForm id={row.id} to="processing" here={here}>
                  {s === "failed" ? "Retry (mark processing)" : "Mark processing"}
                </StatusForm>
              ) : null}
              {allowed("failed") ? (
                <StatusForm id={row.id} to="failed" here={here}>
                  Mark failed
                </StatusForm>
              ) : null}
              {allowed("void") ? (
                <StatusForm id={row.id} to="void" here={here} variant="danger" confirm="Cancel this payout? The expert won't see it any more. This can't be undone.">
                  Cancel payout
                </StatusForm>
              ) : null}
            </div>
          </PanelBlock>
        ) : null}
        {manage && (s === "paid" || s === "void") ? <p className="text-[13px] text-muted-foreground">{s === "paid" ? "Paid payouts are final." : "Cancelled payouts are final."}</p> : null}
        <PanelBlock title="History">
          <ActivityList items={history} showEntity={false} />
        </PanelBlock>
      </div>
    </SlideOver>
  );
}

async function AddPayoutPanel({ sp, closeHref }: { sp: SearchParams; closeHref: string }) {
  const db = await getDb();
  const expert = await expertForPayout(db, one(sp.expert));
  const options = expert ? await placementOptions(db, expert.id) : [];
  const active = options.filter((o) => o.status === "active");
  return (
    <SlideOver title="Add payout" closeHref={closeHref}>
      <div className="space-y-6">
        <FlashFromParams error={one(sp.error)} />
        {expert ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-foreground">
                {expert.fullName}
                {expert.email ? <span className="text-muted-foreground"> · {expert.email}</span> : null}
              </p>
              <Link href="/admin/payouts?add=1" scroll={false} className="text-small text-muted-foreground hover:text-foreground">
                Change
              </Link>
            </div>
            <AddPayoutForm
              expertId={expert.id}
              today={todayIndia()}
              placements={options.map((o) => ({ value: o.id, label: `${o.projectName}${o.partnerName ? ` · ${o.partnerName}` : ""} (${label(o.status).toLowerCase()})` }))}
              defaultPlacement={active.length === 1 ? active[0].id : ""}
            />
          </>
        ) : (
          <form action={findPayoutExpertAction} className="space-y-4">
            <input type="hidden" name="returnTo" value="/admin/payouts?add=1" />
            <p className="text-small text-muted-foreground">Who is it for? Type the expert&apos;s email.</p>
            <Field label="Expert email" htmlFor="email">
              <Input id="email" name="email" type="email" required autoComplete="off" />
            </Field>
            <SubmitButton size="sm" pendingText="Finding…">
              Find expert
            </SubmitButton>
          </form>
        )}
      </div>
    </SlideOver>
  );
}
