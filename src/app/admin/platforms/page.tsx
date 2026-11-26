import { ArrowRight, Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { crmLabel } from "@/lib/crm/labels";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { ago } from "@/lib/format";
import { PLATFORM_TABS, PLATFORM_TAB_LABELS, allPlatforms, getPlatform, platformLinks, platformView, referenceLinksOf, type PlatformTab } from "@/lib/server/platforms";
import { Facts, StatusChip } from "@/components/crm/chips";
import { OrgLogo } from "@/components/crm/org-logo";
import { RowLink } from "@/components/crm/row-link";
import { ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { PageHeader, Section } from "@/components/ui/layout";
import { PanelSection, SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { ResultCount, SearchField, Toolbar } from "@/components/ui/toolbar";

export const metadata = { title: "Platforms" };

const updatedText = (p: { updatedAt: Date; updatedBy: string | null }) => (p.updatedBy ? `Updated ${ago(p.updatedAt)}` : "Not updated yet");

export default async function PlatformsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("platforms");
  if (!allowed)
    return (
      <>
        <PageHeader title="Platforms" />
        <Section>
          <NoAccess what="Platforms" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const all = await allPlatforms(db);
  const tabRaw = one(sp.tab);
  const tab: PlatformTab = (PLATFORM_TABS as readonly string[]).includes(tabRaw) ? (tabRaw as PlatformTab) : "all";
  const q = one(sp.q);
  const view = platformView(all, tab, q);
  const close = hrefWith("/admin/platforms", sp, { view: null, ok: null, error: null });
  const viewing = one(sp.view) ? await getPlatform(db, one(sp.view)) : null;
  const links = viewing ? await platformLinks(db, viewing, user.role) : null;
  const totalReferred = all.reduce((n, p) => n + p.referred, 0);

  return (
    <>
      <PageHeader
        title="Platforms"
        subtitle={`${all.length} platforms and agencies with our referral links · ${totalReferred} people referred`}
        actions={
          can(user.role, "platforms.manage") ? (
            <ButtonLink href="/admin/platforms/new" variant="primary">
              <Plus className="h-4 w-4" aria-hidden /> New platform
            </ButtonLink>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Tabs tabs={PLATFORM_TABS.map((t) => ({ href: hrefWith("/admin/platforms", sp, { tab: t === "all" ? null : t, view: null, ok: null, error: null }), label: PLATFORM_TAB_LABELS[t], active: tab === t, count: view.counts[t] }))} />
      <Section flush>
        <Toolbar hidden={{ tab: tab !== "all" ? tab : null }} clearHref={q ? hrefWith("/admin/platforms", sp, { q: null }) : null} end={<ResultCount n={view.rows.length} noun="platform" />}>
          <SearchField defaultValue={q} placeholder="Search platforms" />
        </Toolbar>
        {view.rows.length ? (
          <Table sticky>
            <THead>
              <Th>Platform</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Website</Th>
              <Th>Referral link</Th>
              <Th className="text-right">Referred</Th>
              <Th>Updated</Th>
            </THead>
            <TBody>
              {view.rows.map((p) => (
                <tr key={p.id} className="row-hover relative">
                  <Td>
                    <div className="flex items-center gap-3">
                      <OrgLogo name={p.name} logoUrl={p.logoUrl} domain={p.domain} size={32} />
                      <RowLink href={hrefWith("/admin/platforms", sp, { view: p.id, ok: null, error: null })} className="max-w-56 truncate">
                        {p.name}
                      </RowLink>
                    </div>
                  </Td>
                  <Td>{crmLabel(p.kind)}</Td>
                  <Td>
                    <StatusChip value={p.status} ctx="platform_status" />
                  </Td>
                  <Td className="text-foreground/80">{p.domain ?? <span className="text-muted-foreground/70">No website yet</span>}</Td>
                  <Td>{p.referralUrl ? <span className="text-foreground/85">Referral link saved</span> : <span className="text-muted-foreground/70">No referral link</span>}</Td>
                  <Td className="tabular">{p.referred}</Td>
                  <Td className="text-[13px] whitespace-nowrap text-muted-foreground">{updatedText(p)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            size="page"
            title={all.length ? "No platforms match this view." : "No platforms yet."}
            description={all.length ? "Try another tab or a shorter search." : "Add the expert platforms and agencies we refer people to, with our referral link."}
            action={all.length ? <ButtonLink href="/admin/platforms">Show all</ButtonLink> : can(user.role, "platforms.manage") ? <ButtonLink href="/admin/platforms/new" variant="primary">New platform</ButtonLink> : undefined}
          />
        )}
      </Section>

      {viewing && links ? (
        <SlideOver
          title={viewing.name}
          media={<OrgLogo name={viewing.name} logoUrl={viewing.logoUrl} domain={viewing.domain} size={44} />}
          subtitle={crmLabel(viewing.kind)}
          addon={<StatusChip value={viewing.status} ctx="platform_status" />}
          closeHref={close}
          footer={
            <ButtonLink href={`/admin/platforms/${viewing.id}`} variant="primary">
              Open full platform <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          }
        >
          <div>
            <PanelSection title="Details">
              <Facts
                items={[
                  { label: "Website", value: viewing.websiteUrl ? <a href={viewing.websiteUrl} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">{viewing.domain ?? viewing.websiteUrl}</a> : null },
                  { label: "Jobs page", value: viewing.jobsUrl ? <a href={viewing.jobsUrl} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">Open</a> : null },
                  { label: "People referred", value: String(links.people.length) },
                  { label: "Accounts", value: links.companies.map((c) => c.name).join(", ") || null },
                  { label: "Projects", value: links.projects.map((p) => p.code).join(", ") || null },
                ]}
              />
            </PanelSection>
            <PanelSection title="Referral link">
              {viewing.referralUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-canvas px-3 py-2 text-[13px]">{viewing.referralUrl}</code>
                  <CopyButton value={viewing.referralUrl} label="Copy" />
                </div>
              ) : (
                <EmptyState title="No referral link" description="Add it on the platform's page." padded={false} />
              )}
            </PanelSection>
            {referenceLinksOf(viewing.referenceLinks).length ? (
              <PanelSection title="Reference links">
                <ul className="space-y-1.5 text-sm">
                  {referenceLinksOf(viewing.referenceLinks).map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </PanelSection>
            ) : null}
            {viewing.notes ? (
              <PanelSection title="Notes">
                <p className="text-sm whitespace-pre-line text-foreground/85">{viewing.notes}</p>
              </PanelSection>
            ) : null}
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}
