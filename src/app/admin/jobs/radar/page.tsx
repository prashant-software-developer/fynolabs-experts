import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getDb } from "@/db/client";
import { can, canSeeMoney } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { RADAR_STATUS_LABELS } from "@/lib/talent";
import { listRadar, radarCounts, radarPlatforms, scanInfo, type RadarRow, type RadarTab } from "@/lib/server/radar";
import { Badge, Chips } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectAll, SubmitButton } from "@/components/ui/client";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { DefinitionList, PageHeader, Section } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { CountTabs, Facts, PanelBlock, SectionBlocked } from "@/components/talent/bits";
import { PendingButton } from "@/components/talent/client";
import { publishRadarAction, setRadarStatusAction } from "./actions";

export const metadata = { title: "Job radar" };
const TABS: RadarTab[] = ["new", "approved", "discarded", "published"];

const pay = (r: RadarRow) => {
  if (r.payMin == null && r.payMax == null) return null;
  const range = r.payMin != null && r.payMax != null && r.payMin !== r.payMax ? `${r.payMin}–${r.payMax}` : String(r.payMin ?? r.payMax);
  return `${range}${r.payPeriod === "hour" || r.payPeriod === "hourly" ? "/hr" : r.payPeriod ? ` per ${r.payPeriod}` : ""}`;
};
const posted = (d: Date | null) => {
  if (!d) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days < 1 ? "Today" : days < 30 ? `${days} d ago` : fmtDate(d);
};

export default async function JobRadarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "job-radar")) return <SectionBlocked title="Job radar" section="job-radar" />;
  const db = await getDb();
  const tab: RadarTab = (TABS as string[]).includes(one(sp.tab)) ? (one(sp.tab) as RadarTab) : "new";
  const money = canSeeMoney(user.role);
  const manage = can(user.role, "radar.manage");
  const publish = manage && can(user.role, "jobs.manage");
  const f = { q: one(sp.q).slice(0, 100), platform: one(sp.platform), keyword: one(sp.keyword) };
  const [rows, counts, platforms, info] = await Promise.all([listRadar(db, { ...f, tab, money }), radarCounts(db, f), radarPlatforms(db), scanInfo(db, money)]);
  const open = one(sp.r) ? rows.find((r) => r.id === one(sp.r)) : undefined;
  const here = hrefWith("/admin/jobs/radar", sp, { ok: null, error: null, r: null });
  const filtered = Boolean(f.q || f.platform || f.keyword);

  const actions = (r: RadarRow, compact = true) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {manage && r.status !== "discarded" ? (
        <form action={setRadarStatusAction}>
          <input type="hidden" name="ids" value={r.id} />
          <input type="hidden" name="status" value="discarded" />
          <input type="hidden" name="returnTo" value={here} />
          <SubmitButton size="sm" variant="ghost" pendingText="...">
            Discard
          </SubmitButton>
        </form>
      ) : null}
      {manage && r.status === "new" ? (
        <form action={setRadarStatusAction}>
          <input type="hidden" name="ids" value={r.id} />
          <input type="hidden" name="status" value="approved" />
          <input type="hidden" name="returnTo" value={here} />
          <SubmitButton size="sm" variant="secondary" pendingText="...">
            Approve
          </SubmitButton>
        </form>
      ) : null}
      {manage && r.status === "discarded" ? (
        <form action={setRadarStatusAction}>
          <input type="hidden" name="ids" value={r.id} />
          <input type="hidden" name="status" value="new" />
          <input type="hidden" name="returnTo" value={here} />
          <SubmitButton size="sm" variant="secondary" pendingText="...">
            Restore
          </SubmitButton>
        </form>
      ) : null}
      {r.publishedJobId ? (
        <ButtonLink href={`/admin/jobs/${r.publishedJobId}`} size="sm" variant="secondary">
          View job
        </ButtonLink>
      ) : publish && r.status !== "discarded" ? (
        <form action={publishRadarAction}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="returnTo" value={here} />
          <SubmitButton size="sm" variant={compact ? "secondary" : "primary"} pendingText="Publishing...">
            Publish as job
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );

  return (
    <>
      <PageHeader title="Job radar" subtitle="Roles found on other platforms' jobs pages. Approve the good ones; publish one as a hub job (an internal draft) to staff it or share it." actions={<ButtonLink href="/admin/jobs" variant="secondary">Jobs</ButtonLink>} />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Section className="mb-6" title="Scan" description="Scanning runs in the FynoLabs admin for now (Scan now there); the hub shows what it found. These are the settings the scans use.">
        <DefinitionList
          items={[
            { label: "Keywords", value: info.keywords.length ? <Chips items={info.keywords} max={20} /> : "None (every role is kept)" },
            ...(money ? [{ label: "Minimum pay", value: info.minPay != null ? `$${info.minPay} / hr` : "None" }] : []),
            { label: "Last role found", value: info.lastFoundAt ? fmtDateTime(info.lastFoundAt) : "No scan yet" },
            { label: "Roles on the radar", value: info.total },
            { label: "Settings saved", value: info.settingsUpdatedAt ? `${fmtDateTime(info.settingsUpdatedAt)}${info.settingsUpdatedBy ? ` by ${info.settingsUpdatedBy}` : ""}` : null },
          ]}
        />
      </Section>
      <CountTabs tabs={TABS.map((t) => ({ href: hrefWith("/admin/jobs/radar", sp, { tab: t === "new" ? null : t, r: null, ok: null, error: null }), label: RADAR_STATUS_LABELS[t], active: tab === t, count: counts[t as keyof typeof counts] }))} />
      <Section className="mb-6">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          {tab !== "new" ? <input type="hidden" name="tab" value={tab} /> : null}
          <Input name="q" defaultValue={f.q} placeholder="Search roles" aria-label="Search roles" />
          <Select name="platform" defaultValue={f.platform} options={platforms.map((p) => ({ value: p.platform, label: `${p.platform} · ${p.n}` }))} placeholder="Every platform" aria-label="Platform" className="sm:w-48" />
          <Select name="keyword" defaultValue={f.keyword} options={info.keywords.map((k) => ({ value: k, label: k }))} placeholder="Any keyword" aria-label="Keyword" className="sm:w-44" />
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            {filtered ? (
              <Link href={tab === "new" ? "/admin/jobs/radar" : `/admin/jobs/radar?tab=${tab}`} className="text-sm text-muted-foreground hover:text-foreground">
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </Section>
      <Section flush>
        <form id="bulk-radar" action={setRadarStatusAction}>
          <input type="hidden" name="returnTo" value={here} />
        </form>
        {manage && rows.length && tab !== "published" ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <SelectAll form="bulk-radar" />
            <span className="text-small text-muted-foreground">Ticked:</span>
            {tab !== "approved" ? (
              <PendingButton form="bulk-radar" name="status" value="approved">
                Approve
              </PendingButton>
            ) : null}
            {tab !== "discarded" ? (
              <PendingButton form="bulk-radar" name="status" value="discarded" variant="ghost">
                Discard
              </PendingButton>
            ) : (
              <PendingButton form="bulk-radar" name="status" value="new">
                Restore
              </PendingButton>
            )}
          </div>
        ) : null}
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const p = pay(r);
              return (
                <li key={r.id} className="row-hover flex flex-wrap items-start gap-3 px-4 py-3">
                  {manage && tab !== "published" ? <input type="checkbox" form="bulk-radar" name="ids" value={r.id} aria-label={`Select ${r.title}`} className="mt-1 h-4 w-4 rounded-sm" /> : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link href={hrefWith("/admin/jobs/radar", sp, { r: r.id, ok: null, error: null })} scroll={false} className="font-normal text-foreground hover:text-primary">
                      {r.title}
                    </Link>
                    <p className="text-small text-muted-foreground">
                      {[r.company && r.company !== r.platform ? `${r.platform} · ${r.company}` : r.platform, r.location, p, posted(r.postedAt), r.applyUrl ? "Referral link" : "No referral"].filter(Boolean).join(" · ")}
                    </p>
                    {r.matchedKeywords.length ? <Chips items={r.matchedKeywords} max={6} /> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.publishedJobId ? <Badge tone="success">Published</Badge> : <Badge tone={r.status === "new" ? "info" : r.status === "approved" ? "progress" : "muted"}>{RADAR_STATUS_LABELS[r.status] ?? r.status}</Badge>}
                    {actions(r)}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            size="page"
            title={filtered ? "No roles match" : tab === "new" ? "Nothing waiting" : `No ${RADAR_STATUS_LABELS[tab].toLowerCase()} roles yet`}
            description={filtered ? "Change the search or the filters." : tab === "new" ? "Run a scan in the FynoLabs admin to pull the latest openings; the next copy brings them here." : undefined}
          />
        )}
      </Section>
      {open ? (
        <SlideOver
          title="Role"
          closeHref={hrefWith("/admin/jobs/radar", sp, { r: null })}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {actions(open, false)}
              <a href={open.url} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1 text-small text-muted-foreground hover:text-foreground">
                Original job page <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          }
        >
          <div className="space-y-6">
            <div className="space-y-1">
              <div className="text-lg font-light text-foreground">{open.title}</div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {open.platform}
                {open.publishedJobId ? <Badge tone="success">Published</Badge> : <Badge tone="info">{RADAR_STATUS_LABELS[open.status] ?? open.status}</Badge>}
              </div>
            </div>
            <PanelBlock title="Details">
              <Facts
                items={[
                  { label: "Company", value: open.company ?? open.platform },
                  { label: "Location", value: open.location },
                  ...(money ? [{ label: "Pay (internal)", value: pay(open) }] : []),
                  { label: "Posted", value: open.postedAt ? fmtDate(open.postedAt) : null },
                  { label: "Found", value: fmtDateTime(open.createdAt) },
                  { label: "Last change by", value: open.updatedBy },
                ]}
              />
            </PanelBlock>
            <PanelBlock title="Apply link">
              <p className="text-small text-muted-foreground">The link used when you publish or share this role. Your referral code is added from the platform&apos;s saved referral link.</p>
              {open.applyUrl ? (
                <div className="space-y-2">
                  <p className="text-sm text-foreground">Includes your {open.platform} referral</p>
                  <p className="break-all text-small text-muted-foreground">{open.applyUrl}</p>
                  <CopyButton value={open.applyUrl} label="Copy link" />
                </div>
              ) : (
                <p className="text-sm text-foreground/85">No referral code could be added. {open.platformId ? "Save a referral link with a code on the platform." : "This role is not linked to a saved platform."}</p>
              )}
            </PanelBlock>
            {open.matchedKeywords.length ? (
              <PanelBlock title="Matched keywords">
                <Chips items={open.matchedKeywords} max={20} />
              </PanelBlock>
            ) : null}
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}
