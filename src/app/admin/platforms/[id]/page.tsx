import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { REFERRAL_OUTCOMES, label } from "@/lib/constants";
import { todayIST } from "@/lib/crm/dates";
import { PLATFORM_KINDS, PLATFORM_STATUSES, crmLabel } from "@/lib/crm/labels";
import { one, type SearchParams } from "@/lib/filters";
import { ago, fmtDate } from "@/lib/format";
import { getPlatform, platformLinks, referenceLinksOf } from "@/lib/server/platforms";
import { DueChip, StageChip, StatusChip } from "@/components/crm/chips";
import { OrgLogo } from "@/components/crm/org-logo";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { DefinitionList, PageHeader, Section, Stack, Stat, StatGrid } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { removePlatform, savePlatformForm } from "../actions";

export const metadata = { title: "Platform" };

export default async function PlatformPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user, allowed } = await requireSection("platforms");
  if (!allowed)
    return (
      <>
        <PageHeader title="Platform" back={{ href: "/admin/platforms", label: "Platforms" }} />
        <Section>
          <NoAccess what="Platforms" role={user.role} />
        </Section>
      </>
    );
  const isNew = id === "new";
  const manage = can(user.role, "platforms.manage");
  if (isNew && !manage) notFound();
  const db = await getDb();
  const p = isNew ? null : await getPlatform(db, id);
  if (!isNew && !p) notFound();
  const links = p ? await platformLinks(db, p, user.role) : null;
  const refs = referenceLinksOf(p?.referenceLinks);
  const today = todayIST();
  const self = p ? `/admin/platforms/${p.id}` : "/admin/platforms/new";
  const outcomes = links ? REFERRAL_OUTCOMES.filter((o) => links.outcomes[o]) : [];
  const sent = links ? Object.values(links.outcomes).reduce((n, v) => n + v, 0) : 0;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/platforms", label: "Platforms" }}
        media={p ? <OrgLogo name={p.name} logoUrl={p.logoUrl} domain={p.domain} size={48} /> : undefined}
        title={
          <span>
            <span>
              {p ? (
                p.websiteUrl ? (
                  <a href={p.websiteUrl} target="_blank" rel="noreferrer noopener" className="hover:text-primary">
                    {p.name}
                  </a>
                ) : (
                  p.name
                )
              ) : (
                "New platform"
              )}
            </span>
          </span>
        }
        badge={p ? <StatusChip value={p.status} ctx="platform_status" /> : undefined}
        subtitle={p ? [crmLabel(p.kind), p.domain].filter(Boolean).join(" · ") : "A platform or agency we refer people to."}
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        {p && links ? (
          <StatGrid>
            <Stat label="People referred" value={links.people.length} />
            <Stat label="Referrals sent" value={sent} />
            <Stat label="Active" value={links.outcomes.active ?? 0} hint="Outcome active" />
            <Stat label="Updated" value={p.updatedBy ? ago(p.updatedAt) : "Not yet"} />
          </StatGrid>
        ) : null}

        {manage ? (
          <form action={savePlatformForm} className="space-y-6">
            {p ? <input type="hidden" name="id" value={p.id} /> : null}
            <input type="hidden" name="returnTo" value={self} />
            <Section title="Details">
              <div className="space-y-4">
                <FieldRow>
                  <Field label="Name" htmlFor="pl-name">
                    <Input id="pl-name" name="name" defaultValue={p?.name ?? ""} required placeholder="Mercor" />
                  </Field>
                  <Field label="Type" htmlFor="pl-kind">
                    <Select id="pl-kind" name="kind" defaultValue={p?.kind && (PLATFORM_KINDS as readonly string[]).includes(p.kind) ? p.kind : "platform"} options={PLATFORM_KINDS.map((k) => ({ value: k, label: crmLabel(k) }))} />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Company domain" htmlFor="pl-domain" hint="Optional · used for the logo">
                    <Input id="pl-domain" name="domain" defaultValue={p?.domain ?? ""} placeholder="mercor.com" />
                  </Field>
                  <Field label="Status" htmlFor="pl-status">
                    <Select id="pl-status" name="status" defaultValue={p?.status ?? "active"} options={PLATFORM_STATUSES.map((s) => ({ value: s, label: crmLabel(s, "platform_status") }))} />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Platform link" htmlFor="pl-web" hint="Where the work happens: tasking, dashboard, or the company site. The name links here.">
                    <Input id="pl-web" name="websiteUrl" defaultValue={p?.websiteUrl ?? ""} />
                  </Field>
                  <Field label="Jobs page" htmlFor="pl-jobs" hint="Optional · used by Job radar (Greenhouse, Lever, Ashby, Workable, Mercor and most careers pages).">
                    <Input id="pl-jobs" name="jobsUrl" defaultValue={p?.jobsUrl ?? ""} />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Logo" htmlFor="pl-logo" hint="PNG, JPG, WebP or SVG, up to 200 KB. Without one, the site's icon is used.">
                    <input id="pl-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="control py-1.5 text-small" />
                  </Field>
                  <Field label="Or a logo address" htmlFor="pl-logoUrl">
                    <Input id="pl-logoUrl" name="logoUrl" defaultValue={p?.logoUrl && !p.logoUrl.startsWith("data:") ? p.logoUrl : ""} placeholder="https://…/logo.png" />
                  </Field>
                </FieldRow>
                {p?.logoUrl ? <Checkbox name="removeLogo" value="yes" label="Remove the saved logo" /> : null}
              </div>
            </Section>
            <Section title="Referral link" description="The link you share with people you refer to this platform.">
              <div className="flex flex-wrap items-center gap-2">
                <Input name="referralUrl" defaultValue={p?.referralUrl ?? ""} placeholder="https://mercor.com/invite/..." className="min-w-64 flex-1" aria-label="Referral link" />
                {p?.referralUrl ? <CopyButton value={p.referralUrl} label="Copy" /> : null}
              </div>
            </Section>
            <Section title="Reference links" description="Docs, dashboards, payout pages, recruiter contacts: anything you want one click away. Clear a line's address to remove it.">
              <div className="space-y-2">
                {[...refs, { label: "", url: "" }, { label: "", url: "" }].map((r, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                    <Input name="refLabel" defaultValue={r.label} placeholder="Payout dashboard" aria-label={`Link ${i + 1} label`} />
                    <Input name="refUrl" defaultValue={r.url} placeholder="https://..." aria-label={`Link ${i + 1} address`} />
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Notes">
              <Textarea name="notes" rows={4} defaultValue={p?.notes ?? ""} placeholder="Rates, payment cycle, who to contact, how onboarding works." aria-label="Notes" />
            </Section>
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton pendingText="Saving...">{p ? "Save changes" : "Create platform"}</SubmitButton>
              <ButtonLink href="/admin/platforms">Cancel</ButtonLink>
            </div>
          </form>
        ) : p ? (
          <Section title="Details">
            <DefinitionList
              items={[
                { label: "Type", value: crmLabel(p.kind) },
                { label: "Status", value: crmLabel(p.status, "platform_status") },
                { label: "Website", value: p.websiteUrl },
                { label: "Jobs page", value: p.jobsUrl },
                { label: "Referral link", value: p.referralUrl ? <span className="flex flex-wrap items-center gap-2"><span className="break-all">{p.referralUrl}</span><CopyButton value={p.referralUrl} /></span> : null },
                { label: "Reference links", value: refs.length ? refs.map((r) => <a key={r.url} href={r.url} target="_blank" rel="noreferrer noopener" className="block text-primary hover:underline">{r.label}</a>) : null },
                { label: "Notes", value: p.notes },
              ]}
            />
          </Section>
        ) : null}

        {p && links ? (
          <>
            <Section title="Account" flush>
              {links.companies.length ? (
                <ul className="divide-y divide-border">
                  {links.companies.map((c) => (
                    <li key={c.id}>
                      <Link href={`/admin/accounts/${c.id}`} className="row-hover flex items-center gap-3 px-5 py-3">
                        <OrgLogo name={c.name} size={24} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                          <span className="block text-[13px] text-muted-foreground">
                            {label(c.kind)}
                            {c.nextStepDue ? (
                              <>
                                {" "}
                                · next step <DueChip due={c.nextStepDue} today={today} stage={c.stage} />
                              </>
                            ) : null}
                          </span>
                        </span>
                        <StageChip stage={c.stage} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Not on Accounts." description="To track outreach with this company, link it from the account's Details." />
              )}
            </Section>
            <Section title={`Projects (${links.projects.length})`} flush>
              {links.projects.length ? (
                <Table>
                  <THead>
                    <Th>Project</Th>
                    <Th>Code</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                  </THead>
                  <TBody>
                    {links.projects.map((x) => (
                      <Tr key={x.id}>
                        <Td>
                          <Link href={`/admin/projects/${x.id}`} className="font-medium text-foreground hover:text-primary">
                            {x.name}
                          </Link>
                        </Td>
                        <Td>
                          <code className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs">{x.code}</code>
                        </Td>
                        <Td>{crmLabel(x.kind)}</Td>
                        <Td>
                          <StatusChip value={x.status} />
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState title="No projects on this platform." />
              )}
            </Section>
            <Section title="Referrals by outcome" description="Sent through this platform (by its link or its name). Sending happens on Send referrals.">
              {outcomes.length ? (
                <div className="flex flex-wrap gap-x-8 gap-y-4">
                  {outcomes.map((o) => (
                    <div key={o}>
                      <div className="eyebrow text-muted-foreground">{crmLabel(o)}</div>
                      <div className="tabular text-xl font-light text-foreground">{links.outcomes[o]}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Nobody has been referred here yet." padded={false} />
              )}
            </Section>
            <Section title={`People referred here (${links.people.length})`} flush>
              {links.people.length ? (
                <Table>
                  <THead>
                    <Th>Person</Th>
                    <Th>Referred</Th>
                    <Th>Latest outcome</Th>
                  </THead>
                  <TBody>
                    {links.people.map((r) => (
                      <Tr key={r.key}>
                        <Td>
                          {r.expertId ? (
                            <Link href={`/admin/experts?view=${r.expertId}`} className="font-medium text-foreground hover:text-primary">
                              {r.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-foreground">{r.name}</span>
                          )}
                        </Td>
                        <Td className="text-small text-foreground/80">{r.times > 1 ? `Referred ${r.times} times, last ${fmtDate(r.last)}` : `Referred ${fmtDate(r.last)}`}</Td>
                        <Td>{crmLabel(r.outcome)}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState title="Nobody has been referred here yet." />
              )}
            </Section>
            {can(user.role, "crm.delete") ? (
              <Section title="Delete platform" description="Past referrals and job listings stay, but lose their link to it.">
                <form action={removePlatform}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="returnTo" value={self} />
                  <SubmitButton variant="danger" size="sm" confirm={`Delete ${p.name}? This permanently removes the platform.`}>
                    Delete platform
                  </SubmitButton>
                </form>
              </Section>
            ) : null}
          </>
        ) : null}
      </Stack>
    </>
  );
}
