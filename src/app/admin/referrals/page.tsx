import Link from "next/link";
import { getDb } from "@/db/client";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { REFERRAL_METHODS, REFERRAL_OUTCOMES } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { REFERRAL_METHOD_LABELS, REFERRAL_OUTCOME_LABELS, REFERRAL_OUTCOME_TONE } from "@/lib/talent";
import { projectOptions } from "@/lib/server/pipelines";
import { listReferrals, platformOptions, referralCounts } from "@/lib/server/referrals";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectAll, SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { FilterSelect, ResultCount, SearchField, Toolbar } from "@/components/ui/toolbar";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { CountTabs, Email, Facts, MapBadge, PanelBlock, SectionBlocked } from "@/components/talent/bits";
import { changeReferralOutcome } from "../send-referrals/actions";

export const metadata = { title: "Sent referrals" };
const PAGE = 50;

export default async function ReferralsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "send-referrals")) return <SectionBlocked title="Sent referrals" section="send-referrals" />;
  const db = await getDb();
  const manage = can(user.role, "referrals.manage");
  const contact = canSeeContact(user.role);
  const f = { q: one(sp.q).slice(0, 100), platformId: one(sp.platform), projectId: one(sp.project), outcome: one(sp.outcome), method: one(sp.method) };
  const page = Math.max(1, Math.floor(Number(one(sp.page)) || 1));
  const [{ rows, total }, counts, platforms, projects] = await Promise.all([listReferrals(db, { ...f, limit: PAGE, offset: (page - 1) * PAGE }), referralCounts(db, f), platformOptions(db), projectOptions(db)]);
  const shownCount = (o: string) => counts.byOutcome[o] ?? 0;
  const here = hrefWith("/admin/referrals", sp, { ok: null, error: null, r: null });
  const openId = one(sp.r);
  const open = openId ? rows.find((r) => r.id === openId) : undefined;
  const filtered = Boolean(f.q || f.platformId || f.projectId || f.method);
  return (
    <>
      <PageHeader title="Send referrals" subtitle="Everyone we sent to a platform, project or partner, how, and what came of it." actions={manage ? <ButtonLink href="/admin/send-referrals" variant="primary">New referral</ButtonLink> : null} />
      <CountTabs
        label="Referrals"
        tabs={[
          { href: "/admin/send-referrals", label: "Send", active: false },
          { href: "/admin/referrals", label: "Sent referrals", active: true, count: counts.all },
        ]}
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="mb-6">
        <StatGrid>
          <Stat label="Sent" value={counts.all} />
          <Stat label="Opened" value={counts.opened} hint="Opened the referral email" />
          <Stat label="Clicked" value={counts.clicked} hint="Clicked the link" />
          <Stat label="Working" value={shownCount("active")} hint={`${shownCount("signed_up") + shownCount("qualified")} signed up or qualified`} />
        </StatGrid>
      </div>
      <CountTabs
        label="Outcomes"
        tabs={[
          { href: hrefWith("/admin/referrals", sp, { outcome: null, page: null, r: null, ok: null, error: null }), label: "All", active: !f.outcome, count: counts.all },
          ...REFERRAL_OUTCOMES.map((o) => ({ href: hrefWith("/admin/referrals", sp, { outcome: o, page: null, r: null, ok: null, error: null }), label: REFERRAL_OUTCOME_LABELS[o], active: f.outcome === o, count: shownCount(o) })),
        ]}
      />
      <Section flush>
        <Toolbar hidden={{ outcome: f.outcome }} clearHref={filtered ? (f.outcome ? `/admin/referrals?outcome=${f.outcome}` : "/admin/referrals") : null} end={<ResultCount n={rows.length} noun="referral" />}>
          <SearchField defaultValue={f.q} placeholder="Search name, email or platform" label="Search" />
          <FilterSelect name="platform" defaultValue={f.platformId} options={platforms.map((p) => ({ value: p.id, label: p.name }))} placeholder="Any platform" label="Platform" />
          <FilterSelect name="project" defaultValue={f.projectId} options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} placeholder="Any project" label="Project" />
          <FilterSelect name="method" defaultValue={f.method} options={REFERRAL_METHODS.map((m) => ({ value: m, label: REFERRAL_METHOD_LABELS[m] }))} placeholder="Any method" label="Method" />
        </Toolbar>
        <form id="bulk-ref" action={changeReferralOutcome}>
          <input type="hidden" name="returnTo" value={here} />
        </form>
        {manage && rows.length ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-canvas px-6 py-2.5">
            <span className="text-[13px] text-muted-foreground">With the ticked:</span>
            <Select form="bulk-ref" name="outcome" defaultValue="" options={REFERRAL_OUTCOMES.map((o) => ({ value: o, label: REFERRAL_OUTCOME_LABELS[o] }))} placeholder="Set outcome..." className="w-auto" aria-label="Outcome" />
            <Input form="bulk-ref" name="at" type="date" className="w-auto" aria-label="When (the partner's date)" title="When (the partner's date). Empty: today." />
            <SubmitButton form="bulk-ref" size="sm" variant="secondary" pendingText="Saving...">
              Apply
            </SubmitButton>
          </div>
        ) : null}
        {rows.length ? (
          <>
            <Table>
              <THead>
                {manage ? (
                  <Th className="w-8">
                    <SelectAll form="bulk-ref" />
                  </Th>
                ) : null}
                <Th>Person</Th>
                <Th>Platform</Th>
                <Th>How</Th>
                <Th>Outcome</Th>
                <Th>Sent</Th>
                <Th className="text-right">Opens / clicks</Th>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    {manage ? (
                      <Td>
                        <input type="checkbox" form="bulk-ref" name="ids" value={r.id} aria-label={`Select ${r.name ?? "referral"}`} className="h-4 w-4 rounded-sm align-middle" />
                      </Td>
                    ) : null}
                    <Td>
                      <Link href={hrefWith("/admin/referrals", sp, { r: r.id, ok: null, error: null })} scroll={false} className="font-medium text-foreground hover:text-primary">
                        {r.name ?? "Someone"}
                      </Link>
                      <div className="text-[13px] text-muted-foreground">
                        <Email value={r.email} contact={contact} />
                      </div>
                    </Td>
                    <Td>
                      {r.platform}
                      {r.projectCode ? <div className="text-[13px] text-muted-foreground">{r.projectCode}</div> : null}
                    </Td>
                    <Td>{REFERRAL_METHOD_LABELS[r.method as keyof typeof REFERRAL_METHOD_LABELS] ?? r.method}</Td>
                    <Td>
                      <MapBadge value={r.outcome} labels={REFERRAL_OUTCOME_LABELS} tones={REFERRAL_OUTCOME_TONE} />
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.sentAt)}</Td>
                    <Td className="tabular text-right">
                      {r.openCount} / {r.clickCount}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE} total={total} hrefFor={(p) => hrefWith("/admin/referrals", sp, { page: p, r: null, ok: null, error: null })} />
          </>
        ) : (
          <EmptyState
            size="page"
            title={filtered || f.outcome ? "No referrals in this view" : "No referrals yet"}
            description={filtered || f.outcome ? "Change the filters or the outcome." : "Referrals you record on Send referrals (and the ones copied from the FynoLabs admin) appear here."}
            action={manage && !filtered && !f.outcome ? <ButtonLink href="/admin/send-referrals" variant="primary" size="sm">New referral</ButtonLink> : undefined}
          />
        )}
      </Section>
      {open ? (
        <SlideOver
          title={open.name ?? "Referral"}
          closeHref={hrefWith("/admin/referrals", sp, { r: null })}
          footer={
            open.expertId ? (
              <ButtonLink href={`/admin/experts/${open.expertId}?tab=referrals`} variant="primary" size="sm">
                Open full expert →
              </ButtonLink>
            ) : undefined
          }
        >
          <div className="space-y-6">
            <PanelBlock title="Referral">
              <Facts
                items={[
                  { label: "Platform", value: open.platform },
                  { label: "Project", value: open.projectCode },
                  { label: "How", value: REFERRAL_METHOD_LABELS[open.method as keyof typeof REFERRAL_METHOD_LABELS] ?? open.method },
                  { label: "Outcome", value: <MapBadge value={open.outcome} labels={REFERRAL_OUTCOME_LABELS} tones={REFERRAL_OUTCOME_TONE} /> },
                  { label: "Sent", value: fmtDateTime(open.sentAt) },
                  { label: "Outcome since", value: open.outcomeAt ? fmtDateTime(open.outcomeAt) : null },
                  { label: "Opened", value: open.openCount ? `${open.openCount} times, last ${fmtDateTime(open.lastOpenedAt)}` : "Not yet" },
                  { label: "Clicked", value: open.clickCount ? `${open.clickCount} times, last ${fmtDateTime(open.lastClickedAt)}` : "Not yet" },
                  { label: "Sent by", value: open.submittedBy },
                  { label: "Their reference", value: open.externalRef },
                ]}
              />
              {open.referralUrl ? <p className="break-all text-small text-muted-foreground">{open.referralUrl}</p> : null}
              {open.personalNote ? <p className="border-l-2 border-border pl-3 text-sm whitespace-pre-line text-foreground/80">{open.personalNote}</p> : null}
            </PanelBlock>
            {manage ? (
              <PanelBlock title="Change the outcome">
                <form action={changeReferralOutcome} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="ids" value={open.id} />
                  <input type="hidden" name="returnTo" value={hrefWith("/admin/referrals", sp, { ok: null, error: null })} />
                  <Select name="outcome" defaultValue={open.outcome} options={REFERRAL_OUTCOMES.map((o) => ({ value: o, label: REFERRAL_OUTCOME_LABELS[o] }))} className="w-auto" aria-label="Outcome" />
                  <Input name="at" type="date" className="w-auto" aria-label="When" />
                  <SubmitButton size="sm" variant="secondary" pendingText="Saving...">
                    Save
                  </SubmitButton>
                </form>
                <p className="text-[13px] text-muted-foreground">Working moves their pipeline to Active, stopped working to Ended, not a fit or already a member to Rejected; anything else to at least Proposed to client.</p>
              </PanelBlock>
            ) : null}
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}
