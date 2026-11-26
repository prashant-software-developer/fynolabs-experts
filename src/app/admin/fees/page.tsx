import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { can, canSeeMoney, roleLabel } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { DOCUMENT_STAGES } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { FEE_STATUS_LABELS, FEE_STATUS_TONE, moneyByCurrency, stageLabel, todayIndia } from "@/lib/talent";
import { activeEngagements, earningsByMonth, feeSummary, feeTotals, listEarnings, listFeeRules, listFees, missingFees, type FeeRow, type FeeTotal } from "@/lib/server/fees";
import { projectOptions, trackOptions } from "@/lib/server/pipelines";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SelectAll, SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Section, Stack, Stat, StatGrid } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { FilterSelect, ResultCount, Toolbar } from "@/components/ui/toolbar";
import { CountTabs, Facts, MapBadge, PanelBlock, SectionBlocked } from "@/components/talent/bits";
import { ChoiceFields } from "@/components/talent/client";
import { addMissingFeesAction, markFeesAction, saveFeeRuleAction } from "./actions";

export const metadata = { title: "Fees" };
const TABS = [
  { id: "expected", label: "To invoice" },
  { id: "invoiced", label: "Invoiced" },
  { id: "paid", label: "Paid" },
  { id: "void", label: "Void" },
  { id: "all", label: "All" },
  { id: "totals", label: "Totals" },
  { id: "rules", label: "Fee rules" },
  { id: "earnings", label: "Earnings" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const money = (n: number | null | undefined, cur: string) => (n == null ? "–" : `${cur} ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

export default async function FeesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "fees")) return <SectionBlocked title="Fees" section="fees" />;
  if (!canSeeMoney(user.role)) {
    return (
      <>
        <PageHeader title="Fees" />
        <Section flush>
          <NoAccess what="Fees and earnings" role={roleLabel(user.role)} />
        </Section>
      </>
    );
  }
  const db = await getDb();
  const asked = one(sp.tab);
  const tab: Tab = TABS.some((t) => t.id === asked) ? (asked as Tab) : "expected";
  const manage = can(user.role, "fees.manage");
  const summary = await feeSummary(db);
  const here = hrefWith("/admin/fees", sp, { ok: null, error: null, f: null, rule: null, missing: null });
  const tabHref = (t: string) => (t === "expected" ? "/admin/fees" : `/admin/fees?tab=${t}`);

  return (
    <>
      <PageHeader
        title="Fees"
        subtitle="Referral fees partners owe us, the rules that add them, and experts' monthly earnings. Money: admins and finance only."
        actions={manage ? <ButtonLink href="/admin/fees?tab=rules&rule=new" variant="secondary"><Plus className="h-4 w-4" /> Fee rule</ButtonLink> : null}
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="mb-6">
        <StatGrid>
          <Stat label={`To invoice (${summary.toInvoiceCount})`} value={moneyByCurrency(summary.toInvoice)} href="/admin/fees" />
          <Stat label="Invoiced" value={moneyByCurrency(summary.invoiced)} href="/admin/fees?tab=invoiced" />
          <Stat label={`Overdue (${summary.overdueCount})`} value={moneyByCurrency(summary.overdue)} href="/admin/fees?tab=invoiced" />
          <Stat label="Paid" value={moneyByCurrency(summary.paid)} hint="What was received" href="/admin/fees?tab=paid" />
        </StatGrid>
      </div>
      <CountTabs
        tabs={TABS.map((t) => ({
          href: tabHref(t.id),
          label: t.label,
          active: tab === t.id,
          count: t.id === "all" ? Object.values(summary.counts).reduce((a, b) => a + b, 0) : t.id in summary.counts ? summary.counts[t.id] : null,
        }))}
      />
      {tab === "totals" ? <TotalsTab /> : tab === "rules" ? <RulesTab sp={sp} manage={manage} /> : tab === "earnings" ? <EarningsTab sp={sp} /> : <FeesTab tab={tab} sp={sp} manage={manage} here={here} />}
    </>
  );
}

async function FeesTab({ tab, sp, manage, here }: { tab: string; sp: SearchParams; manage: boolean; here: string }) {
  const db = await getDb();
  const [rows, projects] = await Promise.all([listFees(db, { tab, projectId: one(sp.project), month: one(sp.month) }), projectOptions(db)]);
  const open = one(sp.f) ? rows.find((r) => r.id === one(sp.f)) : undefined;
  const filtered = Boolean(one(sp.project) || one(sp.month));
  return (
    <>
      <Section flush>
        <Toolbar submit hidden={{ tab: tab !== "expected" ? tab : null }} clearHref={filtered ? (tab === "expected" ? "/admin/fees" : `/admin/fees?tab=${tab}`) : null} end={<ResultCount n={rows.length} noun="fee" />}>
          <FilterSelect name="project" defaultValue={one(sp.project)} options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} placeholder="Every project" label="Project" />
          <Input name="month" type="month" defaultValue={one(sp.month)} aria-label="Month earned" className="w-auto" />
        </Toolbar>
        <form id="bulk-fees" action={markFeesAction}>
          <input type="hidden" name="returnTo" value={here} />
        </form>
        {manage && rows.some((r) => r.status === "expected" || r.status === "invoiced") ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-canvas px-6 py-2.5">
            <span className="text-[13px] text-muted-foreground">With the ticked:</span>
            <ChoiceFields
              form="bulk-fees"
              name="to"
              placeholder="Mark..."
              options={[
                { value: "invoiced", label: "Invoiced" },
                { value: "paid", label: "Paid" },
                { value: "void", label: "Void" },
              ]}
              fields={{
                invoiced: (
                  <>
                    <Input form="bulk-fees" name="invoiceNumber" placeholder="Invoice number, e.g. FL/2026-27/007" className="h-8 w-60 text-small" aria-label="Invoice number" />
                    <Input form="bulk-fees" name="invoicedOn" type="date" defaultValue={todayIndia()} className="h-8 w-auto text-small" aria-label="Invoiced on" />
                    <Input form="bulk-fees" name="dueOn" type="date" className="h-8 w-auto text-small" aria-label="Due on (empty: the rule's payment terms)" title="Due on. Empty uses the fee rule's payment terms." />
                  </>
                ),
                paid: <Input form="bulk-fees" name="paidOn" type="date" defaultValue={todayIndia()} className="h-8 w-auto text-small" aria-label="Paid on" />,
                void: <Input form="bulk-fees" name="voidReason" placeholder="Why, e.g. already on the partner's platform" className="h-8 w-72 text-small" aria-label="Why" />,
              }}
            />
            <SubmitButton form="bulk-fees" size="sm" variant="secondary" pendingText="Saving...">
              Apply
            </SubmitButton>
            <span className="text-[13px] text-muted-foreground">Paid fees are locked.</span>
          </div>
        ) : null}
        {rows.length ? (
          <Table>
            <THead>
              {manage ? (
                <Th className="w-8">
                  <SelectAll form="bulk-fees" />
                </Th>
              ) : null}
              <Th>Person</Th>
              <Th>Project</Th>
              <Th>Payer</Th>
              <Th className="text-right">Amount</Th>
              <Th>Earned</Th>
              <Th>Invoice</Th>
              <Th>Due</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  {manage ? (
                    <Td>
                      <input type="checkbox" form="bulk-fees" name="ids" value={r.id} disabled={r.status === "paid" || r.status === "void"} aria-label={`Select fee for ${r.personName ?? "someone"}`} className="h-4 w-4 rounded-sm align-middle" />
                    </Td>
                  ) : null}
                  <Td>
                    <Link href={hrefWith("/admin/fees", sp, { f: r.id, ok: null, error: null })} scroll={false} className="font-medium text-foreground hover:text-primary">
                      {r.personName ?? "–"}
                    </Link>
                  </Td>
                  <Td>{r.projectCode ?? "–"}</Td>
                  <Td>{r.companyName ?? "–"}</Td>
                  <Td className="tabular text-right">{money(r.status === "paid" ? (r.paidAmount ?? r.amount) : r.amount, r.currency)}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(r.earnedOn)}</Td>
                  <Td className="text-small">{r.status === "void" ? r.voidReason : (r.invoiceNumber ?? "–")}</Td>
                  <Td className={r.overdue ? "py-2 whitespace-nowrap text-danger" : "py-2 whitespace-nowrap"}>{r.status === "paid" ? `paid ${fmtDate(r.paidOn)}` : fmtDate(r.dueOn)}</Td>
                  <Td>{r.overdue ? <Badge tone="danger" pill dot>Overdue</Badge> : <MapBadge value={r.status} labels={FEE_STATUS_LABELS} tones={FEE_STATUS_TONE} />}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState size="page" title={filtered || tab !== "all" ? "No fees in this view" : "No fees yet"} description={filtered || tab !== "all" ? "Change the tab or the filters." : "They appear when someone reaches a project's fee stage."} />
        )}
      </Section>
      {open ? <FeePanel fee={open} sp={sp} manage={manage} here={here} /> : null}
    </>
  );
}

function FeePanel({ fee, sp, manage, here }: { fee: FeeRow; sp: SearchParams; manage: boolean; here: string }) {
  const can = (to: string) => manage && (fee.status === "expected" || (fee.status === "invoiced" && to !== "invoiced"));
  return (
    <SlideOver
      title="Fee"
      closeHref={hrefWith("/admin/fees", sp, { f: null })}
      footer={
        fee.expertId ? (
          <ButtonLink href={`/admin/experts/${fee.expertId}?tab=earnings`} size="sm">
            Open person →
          </ButtonLink>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">{fee.personName ?? "Someone"}</div>
          <div className="tabular text-stat text-foreground">{money(fee.status === "paid" ? (fee.paidAmount ?? fee.amount) : fee.amount, fee.currency)}</div>
          {fee.overdue ? <Badge tone="danger" pill dot>Overdue</Badge> : <MapBadge value={fee.status} labels={FEE_STATUS_LABELS} tones={FEE_STATUS_TONE} />}
        </div>
        <PanelBlock title="Details">
          <Facts
            items={[
              { label: "Project", value: fee.projectCode ? `${fee.projectCode} · ${fee.projectName}` : null },
              { label: "Payer", value: fee.companyName },
              { label: "Job", value: fee.jobTitle },
              { label: "Earned", value: fmtDate(fee.earnedOn) },
              { label: "Invoice", value: fee.invoiceNumber ? `${fee.invoiceNumber} · ${fmtDate(fee.invoicedOn)}` : null },
              fee.status === "paid" ? { label: "Paid", value: fmtDate(fee.paidOn) } : { label: "Due", value: fmtDate(fee.dueOn) },
              fee.status === "void" ? { label: "Why void", value: fee.voidReason } : { label: "Fee", value: money(fee.amount, fee.currency) },
              { label: "Last change by", value: fee.updatedBy },
            ]}
          />
          {fee.notes ? <p className="text-sm whitespace-pre-line text-foreground/80">{fee.notes}</p> : null}
        </PanelBlock>
        {can("invoiced") ? (
          <PanelBlock title="Mark invoiced">
            <form action={markFeesAction} className="space-y-3">
              <input type="hidden" name="ids" value={fee.id} />
              <input type="hidden" name="to" value="invoiced" />
              <input type="hidden" name="returnTo" value={here} />
              <Field label="Invoice number" htmlFor="invoiceNumber" hint="From the GST invoice template, e.g. FL/2026-27/007.">
                <Input id="invoiceNumber" name="invoiceNumber" required maxLength={60} />
              </Field>
              <FieldRow>
                <Field label="Invoiced on" htmlFor="invoicedOn">
                  <Input id="invoicedOn" name="invoicedOn" type="date" defaultValue={todayIndia()} />
                </Field>
                <Field label="Due on" htmlFor="dueOn" hint="Empty uses the fee rule's payment terms.">
                  <Input id="dueOn" name="dueOn" type="date" />
                </Field>
              </FieldRow>
              <SubmitButton size="sm" pendingText="Saving...">
                Mark invoiced
              </SubmitButton>
            </form>
          </PanelBlock>
        ) : null}
        {can("paid") ? (
          <PanelBlock title="Mark paid">
            <form action={markFeesAction} className="space-y-3">
              <input type="hidden" name="ids" value={fee.id} />
              <input type="hidden" name="to" value="paid" />
              <input type="hidden" name="returnTo" value={here} />
              <FieldRow>
                <Field label="Paid on" htmlFor="paidOn">
                  <Input id="paidOn" name="paidOn" type="date" defaultValue={todayIndia()} />
                </Field>
                <Field label="Amount received" htmlFor="paidAmount" hint="Empty means the full fee.">
                  <Input id="paidAmount" name="paidAmount" inputMode="decimal" placeholder={String(fee.amount)} />
                </Field>
              </FieldRow>
              <SubmitButton size="sm" variant="secondary" pendingText="Saving...">
                Mark paid
              </SubmitButton>
            </form>
          </PanelBlock>
        ) : null}
        {can("void") ? (
          <PanelBlock title="Void">
            <form action={markFeesAction} className="space-y-3">
              <input type="hidden" name="ids" value={fee.id} />
              <input type="hidden" name="to" value="void" />
              <input type="hidden" name="returnTo" value={here} />
              <Field label="Why" htmlFor="voidReason">
                <Input id="voidReason" name="voidReason" required maxLength={300} placeholder="Already on the partner's platform" />
              </Field>
              <SubmitButton size="sm" variant="danger" pendingText="Saving...">
                Void
              </SubmitButton>
            </form>
          </PanelBlock>
        ) : null}
      </div>
    </SlideOver>
  );
}

function TotalsTable({ title, rows, first }: { title: string; rows: FeeTotal[]; first: string }) {
  return (
    <Section title={title} flush>
      {rows.length ? (
        <Table>
          <THead>
            <Th>{first}</Th>
            <Th className="text-right">Fees</Th>
            <Th className="text-right">Expected</Th>
            <Th className="text-right">Invoiced</Th>
            <Th className="text-right">Paid</Th>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={`${r.key}|${r.currency}`}>
                <Td className="font-medium text-foreground">{r.label}</Td>
                <Td className="tabular text-right">{r.count}</Td>
                <Td className="tabular text-right">{money(r.expected, r.currency)}</Td>
                <Td className="tabular text-right">{money(r.invoiced, r.currency)}</Td>
                <Td className="tabular text-right">{money(r.paid, r.currency)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState title="Nothing to total yet" />
      )}
    </Section>
  );
}

async function TotalsTab() {
  const db = await getDb();
  const t = await feeTotals(db);
  return (
    <Stack>
      <TotalsTable title="By project" first="Project" rows={t.byProject} />
      <TotalsTable title="By payer" first="Company" rows={t.byCompany} />
      <TotalsTable title="By month earned" first="Month" rows={t.byMonth} />
      <p className="text-[13px] text-muted-foreground">Per currency; void fees left out. Paid counts what was received.</p>
    </Stack>
  );
}

async function RulesTab({ sp, manage }: { sp: SearchParams; manage: boolean }) {
  const db = await getDb();
  const [rules, projects] = await Promise.all([listFeeRules(db), projectOptions(db)]);
  const ruleId = one(sp.rule);
  const editing = ruleId && ruleId !== "new" ? rules.find((r) => r.id === ruleId) : undefined;
  const newProject = one(sp.projectId) || one(sp.project) || editing?.projectId || "";
  const tracks = ruleId ? await trackOptions(db, newProject || null) : [];
  const missingFor = one(sp.missing);
  const missing = missingFor ? await missingFees(db, missingFor) : [];
  return (
    <>
      <Section flush>
        {rules.length ? (
          <Table>
            <THead>
              <Th>Project</Th>
              <Th className="text-right">Fee</Th>
              <Th>Earned at</Th>
              <Th>Terms</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {rules.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/admin/fees?tab=rules&rule=${r.id}`} scroll={false} className="font-medium text-foreground hover:text-primary">
                      {r.projectCode} · {r.trackName ?? "whole project"}
                    </Link>
                  </Td>
                  <Td className="tabular text-right">{money(r.amount, r.currency)}</Td>
                  <Td>{stageLabel(r.earnedAtStage)}</Td>
                  <Td>{r.paymentTermsDays} days</Td>
                  <Td>{r.active ? <Badge tone="success" pill dot>On</Badge> : <Badge tone="muted" pill dot>Off</Badge>}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState size="page" title="No fee rules yet" description="Add one per project (or per track) with the fee the partner pays." action={manage ? <ButtonLink href="/admin/fees?tab=rules&rule=new" size="sm" variant="primary">Fee rule</ButtonLink> : undefined} />
        )}
      </Section>
      {ruleId && manage ? (
        <SlideOver title={editing ? "Edit fee rule" : "New fee rule"} closeHref="/admin/fees?tab=rules">
          <form action={saveFeeRuleAction} className="space-y-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <p className="text-small text-muted-foreground">When someone on this project reaches the stage, an expected fee is added. A track&apos;s rule wins over the whole project&apos;s.</p>
            {editing ? (
              <p className="text-sm text-foreground">
                {editing.projectCode} · {editing.projectName} · {editing.trackName ?? "Whole project"}
              </p>
            ) : (
              <FieldRow>
                <Field label="Project" htmlFor="projectId" hint="Pick the project, then Load tracks to choose one.">
                  <Select id="projectId" name="projectId" defaultValue={newProject} options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} placeholder="Pick a project" required />
                </Field>
                <Field label="Track" htmlFor="trackId">
                  <Select id="trackId" name="trackId" defaultValue="" options={tracks.map((t) => ({ value: t.id, label: t.name }))} placeholder="Whole project" />
                </Field>
              </FieldRow>
            )}
            <FieldRow>
              <Field label="Fee per person" htmlFor="amount">
                <Input id="amount" name="amount" inputMode="decimal" defaultValue={editing ? String(editing.amount) : ""} required />
              </Field>
              <Field label="Currency" htmlFor="currency">
                <Input id="currency" name="currency" maxLength={3} defaultValue={editing?.currency ?? "USD"} className="uppercase" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Earned at" htmlFor="earnedAtStage">
                <Select id="earnedAtStage" name="earnedAtStage" defaultValue={editing?.earnedAtStage ?? "active"} options={DOCUMENT_STAGES.map((s) => ({ value: s, label: stageLabel(s) }))} />
              </Field>
              <Field label="Payment terms (days)" htmlFor="paymentTermsDays">
                <Input id="paymentTermsDays" name="paymentTermsDays" inputMode="numeric" defaultValue={String(editing?.paymentTermsDays ?? 30)} />
              </Field>
            </FieldRow>
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
            </Field>
            <Checkbox name="active" value="yes" defaultChecked={editing ? editing.active : true} label="On (new fees are added)" />
            <div className="flex items-center gap-3">
              <SubmitButton pendingText="Saving...">Save</SubmitButton>
              {!editing ? (
                <SubmitButton formMethod="get" formAction="/admin/fees" variant="ghost" name="tab" value="rules">
                  Load tracks
                </SubmitButton>
              ) : null}
            </div>
            {!editing ? <input type="hidden" name="rule" value="new" /> : null}
          </form>
        </SlideOver>
      ) : null}
      {missingFor && missing.length ? (
        <SlideOver title="Add fees for people already there?" closeHref="/admin/fees?tab=rules">
          <div className="space-y-4">
            <p className="text-sm text-foreground/85">
              {missing.length} {missing.length === 1 ? "person has" : "people have"} already reached the stage and {missing.length === 1 ? "has" : "have"} no fee.
            </p>
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {missing.slice(0, 100).map((m) => (
                <li key={m.applicationId} className="flex justify-between px-4 py-2">
                  <span>{m.name}</span>
                  <span className="tabular text-muted-foreground">{money(m.amount, m.currency)}</span>
                </li>
              ))}
            </ul>
            {missing.length > 100 ? <p className="text-[13px] text-muted-foreground">and {missing.length - 100} more</p> : null}
            <div className="flex gap-2">
              <form action={addMissingFeesAction}>
                <input type="hidden" name="ruleId" value={missingFor} />
                <SubmitButton pendingText="Adding...">Add {missing.length} fees</SubmitButton>
              </form>
              <ButtonLink href="/admin/fees?tab=rules&ok=Rule%20saved.">Not now</ButtonLink>
            </div>
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}

async function EarningsTab({ sp }: { sp: SearchParams }) {
  const db = await getDb();
  const month = one(sp.month);
  const [byMonth, rows, engs] = await Promise.all([earningsByMonth(db), listEarnings(db, { month }), activeEngagements(db)]);
  return (
    <Stack>
      <Section title="By month" description="What experts earned through their engagements (INR) and our commission." flush>
        {byMonth.length ? (
          <Table>
            <THead>
              <Th>Month</Th>
              <Th className="text-right">People</Th>
              <Th className="text-right">Gross (INR)</Th>
              <Th className="text-right">Commission (INR)</Th>
            </THead>
            <TBody>
              {byMonth.map((m) => (
                <Tr key={m.month}>
                  <Td>
                    <Link href={`/admin/fees?tab=earnings&month=${m.month}`} className="font-medium text-foreground hover:text-primary">
                      {m.month}
                    </Link>
                  </Td>
                  <Td className="tabular text-right">{m.people}</Td>
                  <Td className="tabular text-right">{m.gross.toLocaleString("en-IN")}</Td>
                  <Td className="tabular text-right">{m.commission.toLocaleString("en-IN")}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState size="page" title="No earnings recorded" description="Monthly earnings copied from the FynoLabs admin appear here." />
        )}
      </Section>
      {byMonth.length ? (
        <Section title={month ? `Earnings in ${month}` : "Every month"} flush actions={month ? <Link href="/admin/fees?tab=earnings" className="text-small text-muted-foreground hover:text-foreground">Every month</Link> : null}>
          {rows.length ? (
            <Table>
              <THead>
                <Th>Month</Th>
                <Th>Expert</Th>
                <Th>Platform</Th>
                <Th>Project</Th>
                <Th className="text-right">Gross (INR)</Th>
                <Th className="text-right">Commission (INR)</Th>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>{r.month.slice(0, 7)}</Td>
                    <Td>
                      <Link href={`/admin/experts/${r.expertId}?tab=earnings`} className="text-foreground hover:text-primary">
                        {r.expertName}
                      </Link>
                    </Td>
                    <Td>{r.platform}</Td>
                    <Td>{r.project ?? "–"}</Td>
                    <Td className="tabular text-right">{Number(r.grossInr).toLocaleString("en-IN")}</Td>
                    <Td className="tabular text-right">{Number(r.commissionInr).toLocaleString("en-IN")}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="No earnings that month" />
          )}
        </Section>
      ) : null}
      <Section title="Engagements" description="Where experts work through a platform or agency, with our commission." flush>
        {engs.length ? (
          <Table>
            <THead>
              <Th>Expert</Th>
              <Th>Platform</Th>
              <Th>Project</Th>
              <Th>Status</Th>
              <Th>Started</Th>
              <Th className="text-right">Commission</Th>
            </THead>
            <TBody>
              {engs.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <Link href={`/admin/experts/${g.expertId}?tab=earnings`} className="text-foreground hover:text-primary">
                      {g.expertName}
                    </Link>
                  </Td>
                  <Td>{g.platform}</Td>
                  <Td>{g.project ?? "–"}</Td>
                  <Td>{g.status === "active" ? <Badge tone="success" pill dot>Active</Badge> : <Badge tone="muted" pill dot>{g.status}</Badge>}</Td>
                  <Td>{fmtDate(g.startedOn)}</Td>
                  <Td className="tabular text-right">{g.commissionPercent != null ? `${g.commissionPercent}%` : "–"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="No engagements" />
        )}
      </Section>
    </Stack>
  );
}
