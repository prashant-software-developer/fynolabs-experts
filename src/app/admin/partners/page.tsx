import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { partners, placements, requirements } from "@/db/schema";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { PARTNER_KINDS, label } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { savePartner } from "./actions";

export const metadata = { title: "Partners" };

type PartnerRow = typeof partners.$inferSelect & { openReqs: number; activePlacements: number };

function PartnerFields({ p }: { p?: PartnerRow }) {
  return (
    <div className="space-y-4">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <FieldRow>
        <Field label="Name" htmlFor={`name-${p?.id ?? "new"}`} hint="Internal. Partner names are never shown publicly.">
          <Input id={`name-${p?.id ?? "new"}`} name="name" defaultValue={p?.name} required />
        </Field>
        <Field label="Type" htmlFor={`kind-${p?.id ?? "new"}`}>
          <Select id={`kind-${p?.id ?? "new"}`} name="kind" defaultValue={p?.kind ?? "data_partner"} options={PARTNER_KINDS.map((k) => ({ value: k, label: label(k) }))} />
        </Field>
      </FieldRow>
      <Field label="Website" htmlFor={`web-${p?.id ?? "new"}`}>
        <Input id={`web-${p?.id ?? "new"}`} name="website" defaultValue={p?.website ?? ""} />
      </Field>
      <Field label="Notes" htmlFor={`notes-${p?.id ?? "new"}`}>
        <Textarea id={`notes-${p?.id ?? "new"}`} name="notes" rows={3} defaultValue={p?.notes ?? ""} />
      </Field>
    </div>
  );
}

export default async function PartnersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const manage = can(user.role, "partners.manage");
  const db = await getDb();
  const rows = (await db
    .select({
      id: partners.id,
      name: partners.name,
      kind: partners.kind,
      website: partners.website,
      notes: partners.notes,
      createdAt: partners.createdAt,
      openReqs: sql<number>`(select count(*) from ${requirements} r where r.partner_id = ${partners.id} and r.status in ('open','filling'))`.mapWith(Number),
      activePlacements: sql<number>`(select count(*) from ${placements} p where p.partner_id = ${partners.id} and p.status = 'active')`.mapWith(Number),
    })
    .from(partners)
    .orderBy(partners.name)) as PartnerRow[];
  const editing = manage ? rows.find((r) => r.id === one(sp.edit)) : undefined;
  return (
    <>
      <PageHeader title="Partners" subtitle={manage ? "Companies that send us requirements." : "Companies that send us requirements. Admins add and edit them."} />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        <Section flush>
          {rows.length ? (
            <Table>
              <THead>
                <Th>Partner</Th>
                <Th>Type</Th>
                <Th>Open requirements</Th>
                <Th>Active placements</Th>
                <Th />
              </THead>
              <TBody>
                {rows.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium text-foreground">
                      {p.name}
                      {p.website ? (
                        <a href={p.website} target="_blank" rel="noreferrer noopener" className="ml-2 text-xs font-normal text-muted-foreground/70 hover:text-primary">
                          {p.website.replace(/^https?:\/\//, "")}
                        </a>
                      ) : null}
                    </Td>
                    <Td>{label(p.kind)}</Td>
                    <Td className="tabular">
                      <Link href={`/admin/requirements?partner=${p.id}`} className="hover:text-primary">
                        {p.openReqs}
                      </Link>
                    </Td>
                    <Td className="tabular">
                      <Link href={`/admin/placements?partner=${p.id}`} className="hover:text-primary">
                        {p.activePlacements}
                      </Link>
                    </Td>
                    <Td className="text-right">
                      {manage ? (
                        <Link href={hrefWith("/admin/partners", sp, { edit: p.id, ok: null, error: null })} scroll={false} className="text-[13px] font-medium text-primary underline-offset-4 hover:underline">
                          Edit
                        </Link>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState size="page" title="No partners yet" description={manage ? "Add one below, or type a new partner's name when you create a requirement." : "An admin adds partners."} />
          )}
        </Section>
        {manage ? (
          <Section title="Add partner">
            <form action={savePartner} className="space-y-4">
              <PartnerFields />
              <SubmitButton>Add partner</SubmitButton>
            </form>
          </Section>
        ) : null}
      </Stack>
      {editing ? (
        <SlideOver title={`Edit ${editing.name}`} closeHref="/admin/partners">
          <form action={savePartner} className="space-y-4">
            <PartnerFields p={editing} />
            <SubmitButton>Save</SubmitButton>
          </form>
        </SlideOver>
      ) : null}
    </>
  );
}
