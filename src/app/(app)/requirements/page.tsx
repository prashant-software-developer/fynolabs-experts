import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { listPartners, listRequirements } from "@/lib/server/requirements";
import { Chips, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { PageHeader, Section } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

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
  const db = await getDb();
  const [rows, partners] = await Promise.all([listRequirements(db, { status: view === "all" ? undefined : view, partnerId }), listPartners(db)]);
  return (
    <>
      <PageHeader
        title="Requirements"
        subtitle="What partners asked for, and how full each one is."
        actions={
          <ButtonLink href="/requirements/new" variant="primary">
            <Plus className="h-4 w-4" /> New requirement
          </ButtonLink>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Tabs tabs={VIEWS.map((v) => ({ href: hrefWith("/requirements", sp, { view: v.key === "active" ? null : v.key, ok: null }), label: v.label, active: v.key === view }))} />
      <Section flush>
        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          {view !== "active" ? <input type="hidden" name="view" value={view} /> : null}
          <Select name="partner" defaultValue={partnerId} options={partners.map((p) => ({ value: p.id, label: p.name }))} placeholder="All partners" className="w-auto" aria-label="Partner" />
          <Button type="submit" variant="secondary" size="sm">
            Filter
          </Button>
        </form>
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
                    <Link href={`/requirements/${r.req.id}`} className="font-medium text-foreground hover:text-primary">
                      {r.req.title}
                    </Link>
                    {r.req.externalRef ? <div className="text-xs text-muted-foreground">{r.req.externalRef}</div> : null}
                  </Td>
                  <Td>{r.partnerName}</Td>
                  <Td>
                    <StatusBadge value={r.req.status} />
                  </Td>
                  <Td className="tabular whitespace-nowrap">
                    {r.filled} / {r.req.slots}
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
              <ButtonLink href="/requirements/new" variant="primary">
                New requirement
              </ButtonLink>
            }
          />
        )}
      </Section>
    </>
  );
}
