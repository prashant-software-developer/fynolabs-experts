import Link from "next/link";
import { getDb } from "@/db/client";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { ago, fmtDateTime } from "@/lib/format";
import { isOpenInbound } from "@/lib/talent";
import { INBOUND_KINDS, INBOUND_STATES, inboundAnswers, inboundCounts, listInbound, type InboundKind, type InboundState } from "@/lib/server/inbound";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Segments } from "@/components/crm/segments";
import { ResultCount, SearchField, Toolbar } from "@/components/ui/toolbar";
import { SelectAll, SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { PageHeader, Section } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { CountTabs, Email, Facts, PanelBlock, SectionBlocked, StageBadge } from "@/components/talent/bits";
import { PendingButton } from "@/components/talent/client";
import { markHandled } from "./actions";

export const metadata = { title: "Applications" };
const PAGE = 50;
const KIND_LABEL: Record<InboundKind, string> = { talent: "Talent call", jobs: "Job applications", all: "All" };
const STATE_LABEL: Record<InboundState, string> = { open: "New", handled: "Handled", all: "All" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "profiles")) return <SectionBlocked title="Applications" section="profiles" />;
  const db = await getDb();
  const kind: InboundKind = (INBOUND_KINDS as readonly string[]).includes(one(sp.kind)) ? (one(sp.kind) as InboundKind) : "talent";
  const state: InboundState = (INBOUND_STATES as readonly string[]).includes(one(sp.state)) ? (one(sp.state) as InboundState) : "open";
  const q = one(sp.q).slice(0, 100);
  const page = Math.max(1, Math.floor(Number(one(sp.page)) || 1));
  const manage = can(user.role, "applications.manage");
  const contact = canSeeContact(user.role);
  const [{ rows, total }, counts, talentCounts, jobCounts] = await Promise.all([
    listInbound(db, { kind, state, q, limit: PAGE, offset: (page - 1) * PAGE }),
    inboundCounts(db, kind),
    inboundCounts(db, "talent"),
    inboundCounts(db, "jobs"),
  ]);
  const openId = one(sp.a);
  const open = openId ? rows.find((r) => r.id === openId) : undefined;
  const answers = open ? await inboundAnswers(db, open.id) : [];
  const here = hrefWith("/admin/applications", sp, { ok: null, error: null, a: null });
  const tab = (k: string, v: string) => hrefWith("/admin/applications", sp, { [k]: v, page: null, a: null, ok: null, error: null });

  return (
    <>
      <PageHeader title="Applications" subtitle="What came in through the talent form and the job forms. Mark each one handled once someone has looked at it." />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <CountTabs
        label="Kind"
        tabs={[
          { href: tab("kind", "talent"), label: KIND_LABEL.talent, active: kind === "talent", count: talentCounts.open },
          { href: tab("kind", "jobs"), label: KIND_LABEL.jobs, active: kind === "jobs", count: jobCounts.open },
          { href: tab("kind", "all"), label: KIND_LABEL.all, active: kind === "all", count: talentCounts.open + jobCounts.open },
        ]}
      />
      <Section flush>
        <Toolbar
          hidden={{ kind, state }}
          clearHref={q ? hrefWith("/admin/applications", sp, { q: null, page: null, a: null, ok: null, error: null }) : null}
          end={
            <>
              <ResultCount n={total} noun="application" />
              <Segments label="New or handled" items={INBOUND_STATES.map((s) => ({ href: tab("state", s), active: state === s, label: <>{STATE_LABEL[s]} <span className="tabular text-muted-foreground">{s === "open" ? counts.open : s === "handled" ? counts.handled : counts.all}</span></> }))} />
            </>
          }
        >
          <SearchField defaultValue={q} placeholder="Search name, email, headline or job" label="Search applications" />
        </Toolbar>
        <form id="bulk-app" action={markHandled}>
          <input type="hidden" name="returnTo" value={here} />
        </form>
        {manage && rows.length ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-canvas px-6 py-2.5">
            <span className="text-[13px] text-muted-foreground">With the ticked:</span>
            <PendingButton form="bulk-app" name="handled" value="yes">
              Mark handled
            </PendingButton>
            <PendingButton form="bulk-app" name="handled" value="no" variant="ghost">
              Mark as open
            </PendingButton>
          </div>
        ) : null}
        {rows.length ? (
          <>
            <Table>
              <THead>
                {manage ? (
                  <Th className="w-8">
                    <SelectAll form="bulk-app" />
                  </Th>
                ) : null}
                <Th>Name</Th>
                <Th>Came in for</Th>
                <Th>Stage</Th>
                <Th>Received</Th>
                <Th>Status</Th>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const isOpen = isOpenInbound(r);
                  return (
                    <Tr key={r.id}>
                      {manage ? (
                        <Td>
                          <input type="checkbox" form="bulk-app" name="ids" value={r.id} aria-label={`Select ${r.name}`} className="h-4 w-4 rounded-sm align-middle" />
                        </Td>
                      ) : null}
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={r.name} />
                          <div className="min-w-0">
                            <Link href={hrefWith("/admin/applications", sp, { a: r.id, ok: null, error: null })} scroll={false} className="font-medium text-foreground hover:text-primary">
                              {r.name}
                            </Link>
                            <div className="max-w-xs truncate text-[13px] text-muted-foreground">
                              <Email value={r.email} contact={contact} />
                              {r.headline ? ` · ${r.headline}` : ""}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td>{r.isTalentCall ? "Talent form" : r.jobTitle}</Td>
                      <Td>
                        <StageBadge stage={r.stage} />
                      </Td>
                      <Td className="whitespace-nowrap" title={fmtDateTime(r.createdAt)}>
                        {ago(r.createdAt)}
                      </Td>
                      <Td>
                        {isOpen ? <Badge tone="info" pill dot>New</Badge> : <Badge tone="muted" pill dot title={r.handledBy ? `Handled by ${r.handledBy}` : "In the pipeline"}>Handled</Badge>}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE} total={total} hrefFor={(p) => hrefWith("/admin/applications", sp, { page: p, a: null, ok: null, error: null })} />
          </>
        ) : (
          <EmptyState
            size="page"
            title={q ? "No applications match that search" : state === "open" ? "Nothing waiting" : "No applications in this view"}
            description={q ? "Try a shorter search." : state === "open" ? "New talent-form and job applications appear here until someone marks them handled." : kind === "talent" ? "Applications from the FynoLabs talent form land here (copied by the FynoLabs sync)." : "Change the tab to see the others."}
          />
        )}
      </Section>
      {open ? (
        <SlideOver
          title={open.name}
          media={<Avatar name={open.name} size="2xl" />}
          subtitle={open.isTalentCall ? "Talent form" : open.jobTitle ?? undefined}
          addon={isOpenInbound(open) ? <Badge tone="info" pill dot>New</Badge> : <Badge tone="muted" pill dot>Handled</Badge>}
          meta={<StageBadge stage={open.stage} />}
          closeHref={hrefWith("/admin/applications", sp, { a: null })}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href={`/admin/experts/${open.expertId}`} variant="primary" size="sm">
                Open full expert →
              </ButtonLink>
              {!open.isTalentCall ? (
                <ButtonLink href={`/admin/jobs/${open.jobId}?tab=applicants&app=${open.id}`} size="sm">
                  Open in the job
                </ButtonLink>
              ) : null}
              {manage ? (
                <form action={markHandled} className="ml-auto">
                  <input type="hidden" name="ids" value={open.id} />
                  <input type="hidden" name="returnTo" value={here} />
                  <input type="hidden" name="handled" value={open.handledAt ? "no" : "yes"} />
                  <SubmitButton size="sm" variant="secondary" pendingText="Saving...">
                    {open.handledAt ? "Mark as open" : "Mark as handled"}
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          }
        >
          <div className="space-y-6">
            <PanelBlock title={open.isTalentCall ? "Talent form" : "Job application"}>
              <Facts
                items={[
                  { label: "Email", value: <Email value={open.email} contact={contact} /> },
                  { label: "Received", value: fmtDateTime(open.createdAt) },
                  { label: "Came in for", value: open.isTalentCall ? "Talent form (join the expert pool)" : open.jobTitle },
                  { label: "Stage", value: <StageBadge stage={open.stage} /> },
                  { label: "Consent", value: open.consentAt ? `Given ${fmtDateTime(open.consentAt)}` : <span className="text-danger">None on file: ask before sharing their profile.</span> },
                  { label: "Handled", value: open.handledAt ? `${fmtDateTime(open.handledAt)}${open.handledBy ? ` by ${open.handledBy}` : ""}` : "Not yet" },
                ]}
              />
            </PanelBlock>
            <PanelBlock title="What they sent">
              {answers.length ? (
                <dl className="space-y-3">
                  {answers
                    .filter((a) => contact || !/e-?mail|phone/i.test(a.label))
                    .map((a) => (
                      <div key={a.label}>
                        <dt className="text-[13px] text-muted-foreground">{a.label}</dt>
                        <dd className="text-sm whitespace-pre-line text-foreground">{a.value}</dd>
                      </div>
                    ))}
                </dl>
              ) : (
                <EmptyState padded={false} title="No answers copied" description="The FynoLabs record had no form answers." />
              )}
            </PanelBlock>
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}
