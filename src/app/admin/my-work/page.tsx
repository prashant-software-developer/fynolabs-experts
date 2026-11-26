import Link from "next/link";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { shortDay, todayIST } from "@/lib/crm/dates";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { myTeamMemberId, teamOptions } from "@/lib/server/companies";
import { WORK_EMPTY, WORK_TABS, WORK_TAB_LABELS, myWork, type WorkItem, type WorkTab } from "@/lib/server/my-work";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Person } from "@/components/ui/avatar";
import { FilterSelect } from "@/components/ui/toolbar";
import { DueChip } from "@/components/crm/chips";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { Tabs } from "@/components/ui/tabs";
import { markProspectContacted } from "./actions";

export const metadata = { title: "My work" };

const TYPE_LABEL: Record<WorkItem["type"], string> = {
  company: "Account",
  contact: "Lead",
  expert: "Expert",
  pipeline: "Pipeline",
  event: "Calendar",
  screen: "Applicant",
  prospect: "Prospect",
  no_reply: "No reply",
  link: "Referral",
  document: "Document",
};

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user } = await requireSection("my-work");
  const db = await getDb();
  const today = todayIST();
  const isAdmin = user.role === "admin";
  const [meId, team] = await Promise.all([myTeamMemberId(db, user.email), isAdmin ? teamOptions(db) : Promise.resolve([])]);
  // Admins can open anyone's list (?user=<team member id>) or everyone's (?user=all); others see their own.
  const pick = isAdmin ? one(sp.user) : "";
  const picked = pick && pick !== "all" ? team.find((t) => t.id === pick) : null;
  const who = pick === "all" ? null : picked ? { id: picked.id, email: picked.email } : { id: meId, email: user.email };
  const whose = pick === "all" ? "Everyone's" : picked ? `${picked.name ?? picked.email.split("@")[0]}'s` : "Your";
  const work = await myWork(db, who, today);
  const tabRaw = one(sp.tab);
  const firstWithItems = WORK_TABS.find((t) => work.tabs[t].length) ?? "follow_ups";
  const tab: WorkTab = (WORK_TABS as readonly string[]).includes(tabRaw) ? (tabRaw as WorkTab) : firstWithItems;
  const items = work.tabs[tab];
  const here = hrefWith("/admin/my-work", sp, { ok: null, error: null });
  const canContact = can(user.role, "experts.edit");
  const showOwner = pick === "all";

  return (
    <>
      <PageHeader
        title="My work"
        subtitle={`${whose} list for today, ${shortDay(today)} (India time) · ${work.openPipelines} open ${work.openPipelines === 1 ? "pipeline" : "pipelines"}`}
        actions={
          isAdmin && team.length ? (
            <form method="get" role="search" aria-label="Whose list" className="flex items-center gap-2">
              {one(sp.tab) ? <input type="hidden" name="tab" value={tab} /> : null}
              <FilterSelect
                name="user"
                defaultValue={pick}
                label="Whose list"
                options={[...team.filter((t) => t.id !== meId && t.active).map((t) => ({ value: t.id, label: t.name || t.email.split("@")[0] })), { value: "all", label: "Everyone" }]}
                placeholder="My list"
              />
              <button type="submit" className="sr-only">
                Show
              </button>
            </form>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="mb-8">
        <StatGrid>
          <Stat label="Follow-ups due" value={work.tabs.follow_ups.length} hint={`${work.tabs.follow_ups.filter((i) => i.late).length} late`} href={hrefWith("/admin/my-work", sp, { tab: "follow_ups" })} />
          <Stat label="Calendar today" value={work.tabs.calendar.length} hint={`${work.tabs.calendar.filter((i) => i.late).length} overdue`} href={hrefWith("/admin/my-work", sp, { tab: "calendar" })} />
          <Stat label="To screen" value={work.tabs.to_screen.length} href={hrefWith("/admin/my-work", sp, { tab: "to_screen" })} />
          <Stat label="Prospects" value={work.tabs.prospects.length + work.tabs.no_reply.length} hint="To contact or chase" href={hrefWith("/admin/my-work", sp, { tab: "prospects" })} />
        </StatGrid>
      </div>
      <Tabs tabs={WORK_TABS.map((t) => ({ href: hrefWith("/admin/my-work", sp, { tab: t, ok: null, error: null }), label: WORK_TAB_LABELS[t], active: tab === t, count: work.tabs[t].length }))} />
      <Section flush>
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.key} className="row-hover relative flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5 sm:flex-nowrap">
                <Badge tone="outline" pill className="w-24 shrink-0 justify-center font-normal">
                  {TYPE_LABEL[i.type]}
                </Badge>
                <div className="min-w-0 flex-1 basis-56">
                  <Link href={i.href} className="text-[15px] font-medium text-foreground after:absolute after:inset-0 hover:text-primary">
                    {i.title}
                  </Link>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground" title={i.detail}>
                    {i.detail}
                  </p>
                </div>
                {showOwner && i.owner ? <Person name={i.owner} className="hidden w-40 shrink-0 text-[13px] text-foreground/80 md:inline-flex" /> : null}
                {i.due ? <span className="shrink-0">{i.late ? <DueChip due={i.due} today={today} /> : <DueChip due={today} today={today} />}</span> : null}
                {i.type === "prospect" && canContact && i.expertId ? (
                  <form action={markProspectContacted} className="relative z-10">
                    <input type="hidden" name="expertId" value={i.expertId} />
                    <input type="hidden" name="name" value={i.title} />
                    <input type="hidden" name="returnTo" value={here} />
                    <SubmitButton size="sm" variant="secondary" pendingText="…">
                      Contacted
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState size="page" title={WORK_EMPTY[tab]} description={tab === "follow_ups" ? "Next steps, follow-ups and next actions due today or late show here." : undefined} />
        )}
      </Section>
    </>
  );
}
