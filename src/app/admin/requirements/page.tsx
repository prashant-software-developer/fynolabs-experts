import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { listPartners, listRequirements } from "@/lib/server/requirements";
import { Chips, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { FilterSelect, ResultCount, Toolbar } from "@/components/ui/toolbar";
import { OrgLogo } from "@/components/crm/org-logo";
import { PageHeader, Section } from "@/components/ui/layout";
import { CellStack, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";

export const metadata = { title: "Requirements" };

const VIEWS = [
  { key: "active", label: "Open & filling" },
  { key: "filled", label: "Filled" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export default async function RequirementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === one(sp.view)) ? one(sp.view) : "active";
  const partnerId = one(sp.partner);
  const user = await requireUser();
  const canCreate = can(user.role, "requirements.create");
  const db = await getDb();
  const [rows, partners] = await Promise.all([listRequirements(db, { status: view === "all" ? undefined : view, partnerId }), listPartners(db)]);
  return (
    <>
      <PageHeader
        title="Requirements"
        subtitle="What partners asked for, and how full each one is."
        actions={
          canCreate ? (
            <ButtonLink href="/admin/requirements/new" variant="primary">
              <Plus className="h-4 w-4" /> New requirement
            </ButtonLink>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Tabs tabs={VIEWS.map((v) => ({ href: hrefWith("/admin/requirements", sp, { view: v.key === "active" ? null : v.key, ok: null }), label: v.label, active: v.key === view }))} />
      <Section flush>
        <Toolbar hidden={{ view: view !== "active" ? view : null }} clearHref={partnerId ? hrefWith("/admin/requirements", {}, { view: view === "active" ? null : view }) : null} end={<ResultCount n={rows.length} noun="requirement" />}>
          <FilterSelect name="partner" defaultValue={partnerId} options={partners.map((p) => ({ value: p.id, label: p.name }))} placeholder="All partners" label="Partner" />
        </Toolbar>
        {rows.length ? (
          <Table>
            <THead>
              <Th>Requirement</Th>
              <Th>Partner</Th>
              <Th>Status</Th>
              <Th>Filled</Th>
              <Th>With partner</Th>
              <Th>Must-have</Th>
              <Th>Deadline</Th>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.req.id}>
                  <Td className="min-w-56">
                    <CellStack primary={<Link href={`/admin/requirements/${r.req.id}`} className="font-medium text-foreground hover:text-primary">{r.req.title}</Link>} secondary={r.req.externalRef} />
                  </Td>
                  <Td>
                    <span className="inline-flex max-w-56 items-center gap-2">
                      <OrgLogo name={r.partnerName ?? ""} size={22} />
                      <span className="truncate">{r.partnerName}</span>
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge value={r.req.status} />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <FillMeter filled={r.filled} slots={r.req.slots} />
                  </Td>
                  <Td className="tabular">{r.sent}</Td>
                  <Td>
                    <Chips items={r.req.mustSkills} max={3} />
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDate(r.req.deadline)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            size="page"
            title={view === "active" ? "No open requirements" : "Nothing here"}
            description="When a partner sends a new need, paste it in and the hub finds matching experts."
            action={
              canCreate ? (
                <ButtonLink href="/admin/requirements/new" variant="primary">
                  New requirement
                </ButtonLink>
              ) : undefined
            }
          />
        )}
      </Section>
    </>
  );
}

/** "2 / 3" with a thin bar: how full a requirement is. */
function FillMeter({ filled, slots }: { filled: number; slots: number }) {
  const pct = slots > 0 ? Math.min(100, Math.round((filled / slots) * 100)) : 0;
  return (
    <span className="flex w-24 flex-col gap-1.5">
      <span className="tabular text-sm text-foreground">
        {filled} <span className="text-muted-foreground">/ {slots}</span>
      </span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]" aria-hidden>
        <span className={pct >= 100 ? "block h-full rounded-full bg-success" : "block h-full rounded-full bg-foreground/70"} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
