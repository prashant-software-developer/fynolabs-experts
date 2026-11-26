import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Send } from "@/components/icons";
import { getDb } from "@/db/client";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { one, parseExpertFilters, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { listExperts } from "@/lib/server/experts";
import { getGroup, groupMembers } from "@/lib/server/referrals";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectAll, SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Email, SectionBlocked } from "@/components/talent/bits";
import { addMembers, removeGroup, removeMembers, saveGroup } from "../actions";


export const metadata = { title: "Group" };

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "profiles")) return <SectionBlocked title="Groups" section="profiles" />;
  const db = await getDb();
  const g = await getGroup(db, id);
  if (!g) notFound();
  const manage = can(user.role, "groups.manage");
  const contact = canSeeContact(user.role);
  const members = await groupMembers(db, id);
  const q = one(sp.q).slice(0, 100);
  const inGroup = new Set(members.map((m) => m.expertId).filter(Boolean));
  const found = manage && q ? (await listExperts(db, parseExpertFilters({ q }), { limit: 30, offset: 0, contact })).rows : [];
  const base = `/admin/groups/${id}`;
  return (
    <>
      <PageHeader
        title={g.name}
        back={{ href: "/admin/groups", label: "Groups" }}
        meta={
          <>
            {g.status === "active" ? <Badge tone="success" pill dot>Active</Badge> : <Badge tone="muted" pill dot>Inactive</Badge>}
            <span className="text-muted-foreground">
              {members.length} {members.length === 1 ? "person" : "people"} · created {fmtDate(g.createdAt)}
              {g.updatedBy ? ` · last change by ${g.updatedBy}` : ""}
            </span>
          </>
        }
        actions={
          <>
            {can(user.role, "campaigns.manage") && canOpenSection(user, "referrals") ? (
              <ButtonLink href={`/admin/campaigns/new?source=group&group=${id}`} size="sm">
                <Mail className="h-3.5 w-3.5" /> Email them
              </ButtonLink>
            ) : null}
            {can(user.role, "referrals.manage") && canOpenSection(user, "send-referrals") ? (
              <ButtonLink href={`/admin/send-referrals?group=${id}`} size="sm">
                <Send className="h-3.5 w-3.5" /> Refer them
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        {manage ? (
          <Section title="Group">
            <form action={saveGroup} className="space-y-4">
              <input type="hidden" name="id" value={id} />
              <FieldRow>
                <Field label="Group name" htmlFor="name">
                  <Input id="name" name="name" defaultValue={g.name} maxLength={100} required />
                </Field>
                <Field label="Status" htmlFor="status" hint="Send referrals lists active groups only.">
                  <Select id="status" name="status" defaultValue={g.status} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
                </Field>
              </FieldRow>
              <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
                Save changes
              </SubmitButton>
            </form>
          </Section>
        ) : null}

        {manage ? (
          <Section title="Add people" description="Paste emails (one per line, or separated by commas; “Name <email>” works too), or find experts below. An email that belongs to an expert is linked to them.">
            <div className="space-y-6">
              <form action={addMembers} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <Textarea name="emails" rows={3} placeholder={"asha@example.com\nMarco Sample <marco@example.org>"} aria-label="Emails" />
                <SubmitButton size="sm" variant="secondary" pendingText="Adding…">
                  Add emails
                </SubmitButton>
              </form>
              <div className="space-y-3 border-t border-border pt-5">
                <form method="get" className="flex items-center gap-2">
                  <Input name="q" defaultValue={q} placeholder="Find experts by name, skill or email" aria-label="Find experts" />
                  <Button type="submit" variant="secondary">
                    Find
                  </Button>
                </form>
                {q ? (
                  found.length ? (
                    <form action={addMembers} className="space-y-3">
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="returnTo" value={`${base}?q=${encodeURIComponent(q)}`} />
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {found.map((e) => (
                          <li key={e.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm">
                            <input type="checkbox" name="expertIds" value={e.id} disabled={inGroup.has(e.id) || !e.email} aria-label={`Add ${e.fullName}`} className="h-4 w-4" />
                            <span className="min-w-0 flex-1 truncate text-foreground">{e.fullName}</span>
                            <span className="text-[13px] text-muted-foreground">{inGroup.has(e.id) ? "In the group" : !e.email ? "No email" : <Email value={e.email} contact={contact} />}</span>
                          </li>
                        ))}
                      </ul>
                      <SubmitButton size="sm" variant="secondary" pendingText="Adding…">
                        Add selected
                      </SubmitButton>
                    </form>
                  ) : (
                    <EmptyState padded={false} title="No experts match that search" />
                  )
                ) : null}
              </div>
            </div>
          </Section>
        ) : null}

        <Section title={`People (${members.length} in group)`} flush>
          {members.length ? (
            <>
              {manage ? (
                <form id="remove" action={removeMembers}>
                  <input type="hidden" name="id" value={id} />
                </form>
              ) : null}
              <Table>
                <THead>
                  {manage ? (
                    <Th className="w-8">
                      <SelectAll form="remove" label="Select everyone" />
                    </Th>
                  ) : null}
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Expert</Th>
                  <Th>Added</Th>
                </THead>
                <TBody>
                  {members.map((m) => (
                    <Tr key={m.id}>
                      {manage ? (
                        <Td>
                          <input type="checkbox" form="remove" name="ids" value={m.id} aria-label={`Select ${m.name ?? m.email}`} className="h-4 w-4 rounded-sm align-middle" />
                        </Td>
                      ) : null}
                      <Td className="font-medium text-foreground">{m.expertName ?? m.name ?? "–"}</Td>
                      <Td className="text-small">
                        <Email value={m.email} contact={contact} />
                      </Td>
                      <Td>
                        {m.expertId ? (
                          <Link href={`/admin/experts/${m.expertId}`} className="inline-flex items-center gap-2 text-primary hover:underline">
                            Open <StatusBadge value={m.expertStatus} />
                          </Link>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">Not an expert yet</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(m.createdAt)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              {manage ? (
                <div className="border-t border-border px-4 py-3">
                  <SubmitButton form="remove" size="sm" variant="ghost" pendingText="Removing…" confirm="Remove the ticked people from this group? Their expert records stay as they are.">
                    Remove selected
                  </SubmitButton>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState title="Nobody in this group yet" description={manage ? "Paste emails or find experts above." : undefined} />
          )}
        </Section>

        {can(user.role, "groups.delete") ? (
          <Section title="Delete group" description="Removes the group and its member list. Experts stay as they are.">
            <form action={removeGroup}>
              <input type="hidden" name="id" value={id} />
              <SubmitButton size="sm" variant="danger" confirm={`Delete "${g.name}"?`}>
                Delete group
              </SubmitButton>
            </form>
          </Section>
        ) : null}
      </Stack>
    </>
  );
}
