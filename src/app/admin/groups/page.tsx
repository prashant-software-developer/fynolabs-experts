import Link from "next/link";
import { getDb } from "@/db/client";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { groupMembers, listGroups } from "@/lib/server/referrals";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { PageHeader, Section } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { CountTabs, Email, PeopleTabs, SectionBlocked } from "@/components/talent/bits";
import { newGroup } from "./actions";

export const metadata = { title: "Groups" };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "profiles")) return <SectionBlocked title="Groups" section="profiles" />;
  const db = await getDb();
  const q = one(sp.q).slice(0, 100);
  const status = one(sp.status) === "inactive" ? "inactive" : one(sp.status) === "all" ? "" : "active";
  const [groups, all] = await Promise.all([listGroups(db, { q, status }), listGroups(db)]);
  const manage = can(user.role, "groups.manage");
  const contact = canSeeContact(user.role);
  const openId = one(sp.g);
  const open = openId ? all.find((g) => g.id === openId) : undefined;
  const members = open ? await groupMembers(db, open.id) : [];
  const tab = (s: string) => hrefWith("/admin/groups", sp, { status: s === "active" ? null : s, g: null, ok: null, error: null });
  return (
    <>
      <PageHeader title="Experts" subtitle="Groups: lists of people a referral or an email goes to in one go." />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <PeopleTabs value="groups" counts={{ groups: all.length }} />
      <CountTabs
        tabs={[
          { href: tab("active"), label: "Active", active: status === "active", count: all.filter((g) => g.status === "active").length },
          { href: tab("inactive"), label: "Inactive", active: status === "inactive", count: all.filter((g) => g.status !== "active").length },
          { href: tab("all"), label: "All", active: status === "", count: all.length },
        ]}
      />
      <Section className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <form method="get" className="flex min-w-0 flex-1 items-center gap-2">
            {status !== "active" ? <input type="hidden" name="status" value={status || "all"} /> : null}
            <Input name="q" defaultValue={q} placeholder="Search groups" aria-label="Search groups" className="h-9" />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          {manage ? (
            <form action={newGroup} className="flex items-center gap-2">
              <Input name="name" placeholder="New group name" maxLength={100} aria-label="New group name" className="h-9 w-56" />
              <SubmitButton pendingText="Creating...">New group</SubmitButton>
            </form>
          ) : null}
        </div>
      </Section>
      <Section flush>
        {groups.length ? (
          <Table>
            <THead>
              <Th>Group</Th>
              <Th className="text-right">People</Th>
              <Th className="text-right">Linked to experts</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </THead>
            <TBody>
              {groups.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <Link href={hrefWith("/admin/groups", sp, { g: g.id, ok: null, error: null })} scroll={false} className="font-medium text-foreground hover:text-primary">
                      {g.name}
                    </Link>
                  </Td>
                  <Td className="tabular text-right">{g.members}</Td>
                  <Td className="tabular text-right">{g.linked}</Td>
                  <Td>{g.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(g.createdAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState size="page" title={q || status !== "active" ? "No groups match this view" : "No groups yet"} description={q || status !== "active" ? "Change the search or the tab." : 'Use "New group" to make one, then add people by email or from Experts.'} />
        )}
      </Section>
      {open ? (
        <SlideOver
          title={open.name}
          closeHref={hrefWith("/admin/groups", sp, { g: null })}
          footer={
            <ButtonLink href={`/admin/groups/${open.id}`} variant="primary" size="sm">
              Open full group →
            </ButtonLink>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {open.members} {open.members === 1 ? "person" : "people"}, {open.linked} linked to an expert record · {open.status === "active" ? "Active" : "Inactive"}
            </p>
            {members.length ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {members.slice(0, 30).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0 truncate text-foreground">{m.expertName ?? m.name ?? m.email}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      <Email value={m.email} contact={contact} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState padded={false} title="Nobody in this group yet" />
            )}
            {members.length > 30 ? <p className="text-xs text-muted-foreground">and {members.length - 30} more on the group&apos;s page.</p> : null}
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}
