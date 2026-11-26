import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { TEMPLATE_KINDS } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_TONE, MERGE_FIELDS, RECIPIENT_STATUS_LABELS, SAMPLE_MERGE, TEMPLATE_KIND_LABELS, renderMerge, skipSummary } from "@/lib/talent";
import { campaignStats, getCampaign, listCampaigns, listEmailTemplates, listRecipients, listSuppressed, recipientCounts, sendLog } from "@/lib/server/campaigns";
import { emailConfigured } from "@/lib/server/email";
import { projectOptions } from "@/lib/server/pipelines";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, Notice } from "@/components/ui/feedback";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { CountTabs, Email, Facts, MapBadge, PanelBlock, SectionBlocked } from "@/components/talent/bits";
import { approveCampaignAction, cancelCampaignAction, deleteTemplateAction, saveTemplateAction, sendCampaignAction } from "./actions";

export const metadata = { title: "Send emails" };
const TABS = ["campaigns", "templates", "log", "suppressed"] as const;
type Tab = (typeof TABS)[number];

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "referrals")) return <SectionBlocked title="Send emails" section="referrals" />;
  const db = await getDb();
  const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab)) ? (one(sp.tab) as Tab) : "campaigns";
  const manage = can(user.role, "campaigns.manage");
  const contact = canSeeContact(user.role);
  const stats = await campaignStats(db);
  const email = emailConfigured();
  return (
    <>
      <PageHeader
        title="Send emails"
        subtitle="Bulk emails to experts: prepared as a draft (you see who's skipped and why), approved, then sent with an optional follow-up."
        actions={
          manage ? (
            tab === "templates" ? (
              <ButtonLink href="/admin/campaigns?tab=templates&t=new" variant="primary">
                <Plus className="h-4 w-4" /> New template
              </ButtonLink>
            ) : (
              <ButtonLink href="/admin/campaigns/new" variant="primary">
                <Plus className="h-4 w-4" /> New campaign
              </ButtonLink>
            )
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      {!email ? (
        <Notice tone="info" title="Email isn't set up yet" className="mb-6">
          You can write templates, prepare and approve campaigns; nothing is sent until email (Resend or SMTP) is set up. Do-not-contact, unsubscribed and suppressed addresses are always left out.
        </Notice>
      ) : null}
      <div className="mb-6">
        <StatGrid>
          <Stat label="Drafts" value={stats.drafts} />
          <Stat label="Sending" value={stats.sending} hint="Approved or sending" />
          <Stat label="Done" value={stats.done} />
          <Stat label="Templates" value={stats.templates} href="/admin/campaigns?tab=templates" />
        </StatGrid>
      </div>
      <CountTabs
        tabs={[
          { href: "/admin/campaigns", label: "Campaigns", active: tab === "campaigns", count: stats.all },
          { href: "/admin/campaigns?tab=templates", label: "Templates", active: tab === "templates", count: stats.templates },
          { href: "/admin/campaigns?tab=log", label: "Send log", active: tab === "log" },
          { href: "/admin/campaigns?tab=suppressed", label: "Suppressed", active: tab === "suppressed" },
        ]}
      />
      {tab === "campaigns" ? <CampaignsTab sp={sp} manage={manage} approve={can(user.role, "campaigns.approve")} /> : null}
      {tab === "templates" ? <TemplatesTab sp={sp} manage={manage} /> : null}
      {tab === "log" ? <LogTab contact={contact} /> : null}
      {tab === "suppressed" ? <SuppressedTab contact={contact} /> : null}
    </>
  );
}

async function CampaignsTab({ sp, manage, approve }: { sp: SearchParams; manage: boolean; approve: boolean }) {
  const db = await getDb();
  const rows = await listCampaigns(db);
  const openId = one(sp.c);
  const camp = openId ? await getCampaign(db, openId) : null;
  const [counts, skipped] = camp ? await Promise.all([recipientCounts(db, camp.id), listRecipients(db, camp.id, { status: "skipped", limit: 2000, offset: 0 })]) : [{}, { rows: [], total: 0 }];
  const sample = { ...SAMPLE_MERGE, job_title: camp?.jobTitle ?? SAMPLE_MERGE.job_title, project: camp?.projectName ?? SAMPLE_MERGE.project };
  const back = hrefWith("/admin/campaigns", sp, { ok: null, error: null });
  return (
    <>
      <Section flush>
        {rows.length ? (
          <Table>
            <THead>
              <Th>Campaign</Th>
              <Th>Type</Th>
              <Th>Role</Th>
              <Th className="text-right">People</Th>
              <Th>Made</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={hrefWith("/admin/campaigns", sp, { c: c.id, ok: null, error: null })} scroll={false} className="font-medium text-foreground hover:text-primary">
                      {c.name}
                    </Link>
                    {c.followUpAfterDays ? <div className="text-[13px] text-muted-foreground">Follow-up after {c.followUpAfterDays} days</div> : null}
                  </Td>
                  <Td>{c.kind === "outreach" ? "Outreach" : "Update"}</Td>
                  <Td className="text-muted-foreground">{c.jobTitle ?? (c.projectCode ? c.projectCode : "–")}</Td>
                  <Td className="tabular text-right">{c.recipientCount}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(c.createdAt)}</Td>
                  <Td>
                    <MapBadge value={c.status} labels={CAMPAIGN_STATUS_LABELS} tones={CAMPAIGN_STATUS_TONE} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState size="page" title="No campaigns yet" description="Tick people on Experts and choose Email them, or use New campaign with a saved view, a job, a project or a group." action={manage ? <ButtonLink href="/admin/campaigns/new" variant="primary" size="sm">New campaign</ButtonLink> : undefined} />
        )}
      </Section>
      {camp ? (
        <SlideOver
          title={camp.name}
          closeHref={hrefWith("/admin/campaigns", sp, { c: null })}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href={`/admin/campaigns/${camp.id}`} variant="primary" size="sm">
                Open full campaign →
              </ButtonLink>
              {approve && camp.status === "draft" ? (
                <form action={approveCampaignAction}>
                  <input type="hidden" name="id" value={camp.id} />
                  <input type="hidden" name="returnTo" value={back} />
                  <SubmitButton size="sm" variant="secondary" disabled={!counts.pending || !camp.subject.trim()} pendingText="Approving…">
                    Approve
                  </SubmitButton>
                </form>
              ) : null}
              {approve && (camp.status === "approved" || camp.status === "sending") ? (
                <form action={sendCampaignAction}>
                  <input type="hidden" name="id" value={camp.id} />
                  <input type="hidden" name="returnTo" value={back} />
                  <SubmitButton size="sm" variant="secondary" pendingText="Checking…">
                    Send {Math.min(50, counts.pending ?? 0)} now
                  </SubmitButton>
                </form>
              ) : null}
              {manage && camp.status !== "done" && camp.status !== "cancelled" ? (
                <form action={cancelCampaignAction} className="ml-auto">
                  <input type="hidden" name="id" value={camp.id} />
                  <input type="hidden" name="returnTo" value={back} />
                  <SubmitButton size="sm" variant="ghost" confirm="Cancel this campaign? Nothing more goes out." pendingText="Cancelling…">
                    Cancel campaign
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          }
        >
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <MapBadge value={camp.status} labels={CAMPAIGN_STATUS_LABELS} tones={CAMPAIGN_STATUS_TONE} />
              <span>
                {camp.kind === "outreach" ? "Outreach" : "Update"}
                {camp.jobTitle ? ` for ${camp.jobTitle}` : ""}. Made {fmtDate(camp.createdAt)}
                {camp.createdBy ? ` by ${camp.createdBy}` : ""}.
              </span>
            </div>
            <PanelBlock title="People">
              <Facts
                items={[
                  { label: RECIPIENT_STATUS_LABELS.pending, value: counts.pending ?? 0 },
                  { label: RECIPIENT_STATUS_LABELS.sent, value: counts.sent ?? 0 },
                  ...(["followed_up", "skipped", "failed", "stopped"] as const).filter((s) => (counts as Record<string, number>)[s]).map((s) => ({ label: RECIPIENT_STATUS_LABELS[s], value: (counts as Record<string, number>)[s] })),
                ]}
              />
              {skipSummary(skipped.rows.map((r) => r.reason)) ? <p className="text-small text-muted-foreground">{skipSummary(skipped.rows.map((r) => r.reason))}</p> : null}
              {camp.approvedAt ? <p className="text-[13px] text-muted-foreground">Approved {fmtDateTime(camp.approvedAt)} by {camp.approvedBy}.</p> : null}
            </PanelBlock>
            <PanelBlock title="The email (merge fields shown with sample values)">
              {camp.subject.trim() || camp.body.trim() ? (
                <div className="space-y-2 rounded-md border border-border p-4 text-sm">
                  <div className="font-medium text-foreground">{renderMerge(camp.subject, sample) || "(no subject yet)"}</div>
                  <pre className="font-sans whitespace-pre-wrap text-foreground/85">{renderMerge(camp.body, sample)}</pre>
                  <p className="text-[13px] text-muted-foreground">Don&apos;t want these emails? Unsubscribe (added to every email).</p>
                </div>
              ) : (
                <EmptyState padded={false} title="No wording yet" description="Write the subject and message on the campaign's page." />
              )}
              {camp.followUpBody ? (
                <div className="space-y-2 rounded-md border border-dashed border-border p-4 text-sm">
                  <p className="text-[13px] text-muted-foreground">Follow-up after {camp.followUpAfterDays} days, to anyone who hasn&apos;t answered:</p>
                  <div className="font-medium text-foreground">{renderMerge(camp.followUpSubject || `Re: ${camp.subject}`, sample)}</div>
                  <pre className="font-sans whitespace-pre-wrap text-foreground/85">{renderMerge(camp.followUpBody, sample)}</pre>
                </div>
              ) : null}
            </PanelBlock>
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}

async function TemplatesTab({ sp, manage }: { sp: SearchParams; manage: boolean }) {
  const db = await getDb();
  const [rows, projects] = await Promise.all([listEmailTemplates(db), projectOptions(db)]);
  const t = one(sp.t);
  const editing = t && t !== "new" ? rows.find((r) => r.id === t) : undefined;
  const open = Boolean(manage && (t === "new" || editing));
  const viewing = !manage && t ? rows.find((r) => r.id === t) : undefined;
  return (
    <>
      <Section flush>
        {rows.length ? (
          <Table>
            <THead>
              <Th>Template</Th>
              <Th>For</Th>
              <Th>Subject</Th>
              <Th>Project</Th>
              <Th>Updated</Th>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/admin/campaigns?tab=templates&t=${r.id}`} scroll={false} className="font-medium text-foreground hover:text-primary">
                      {r.name}
                    </Link>
                  </Td>
                  <Td>{TEMPLATE_KIND_LABELS[r.kind as keyof typeof TEMPLATE_KIND_LABELS] ?? r.kind}</Td>
                  <Td className="max-w-md truncate text-muted-foreground">{r.subject}</Td>
                  <Td>{r.projectCode ?? "–"}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(r.updatedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState size="page" title="No templates yet" description="Save the emails you send often, with merge fields like {{first_name}}." action={manage ? <ButtonLink href="/admin/campaigns?tab=templates&t=new" variant="primary" size="sm">New template</ButtonLink> : undefined} />
        )}
      </Section>
      {open ? (
        <SlideOver title={editing ? "Edit template" : "New template"} closeHref="/admin/campaigns?tab=templates">
          <div className="space-y-6">
            <form action={saveTemplateAction} className="space-y-4">
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
              <input type="hidden" name="returnTo" value={`/admin/campaigns?tab=templates&t=${editing?.id ?? "new"}`} />
              <FieldRow>
                <Field label="Name" htmlFor="name">
                  <Input id="name" name="name" defaultValue={editing?.name ?? ""} maxLength={100} required />
                </Field>
                <Field label="For" htmlFor="kind">
                  <Select id="kind" name="kind" defaultValue={editing?.kind ?? "outreach"} options={TEMPLATE_KINDS.map((k) => ({ value: k, label: TEMPLATE_KIND_LABELS[k] }))} />
                </Field>
              </FieldRow>
              <Field label="Project (optional)" htmlFor="projectId">
                <Select id="projectId" name="projectId" defaultValue={editing?.projectId ?? ""} options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} placeholder="Any project" />
              </Field>
              <Field label="Subject" htmlFor="subject">
                <Input id="subject" name="subject" defaultValue={editing?.subject ?? ""} maxLength={200} required />
              </Field>
              <Field label="Message" htmlFor="body" hint={`Merge fields: ${MERGE_FIELDS.map((m) => `{{${m}}}`).join(" ")}`}>
                <Textarea id="body" name="body" rows={10} defaultValue={editing?.body ?? ""} maxLength={10000} required />
              </Field>
              <SubmitButton pendingText="Saving…">Save</SubmitButton>
            </form>
            {editing ? (
              <form action={deleteTemplateAction} className="border-t border-border pt-4">
                <input type="hidden" name="id" value={editing.id} />
                <SubmitButton size="sm" variant="ghost" confirm="Delete this template? Campaigns made from it keep their copy." className="text-danger">
                  Delete template
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </SlideOver>
      ) : null}
      {viewing ? (
        <SlideOver title={viewing.name} closeHref="/admin/campaigns?tab=templates">
          <div className="space-y-3 text-sm">
            <div className="font-medium text-foreground">{viewing.subject}</div>
            <pre className="font-sans whitespace-pre-wrap text-foreground/85">{viewing.body}</pre>
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}

async function LogTab({ contact }: { contact: boolean }) {
  const db = await getDb();
  const rows = await sendLog(db);
  return (
    <Section title="Send log" description="Every email sent (or not) and why, newest first: bounces, complaints and unsubscribes too." flush>
      {rows.length ? (
        <Table>
          <THead>
            <Th>When</Th>
            <Th>To</Th>
            <Th>Template</Th>
            <Th>Status</Th>
            <Th>Why</Th>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</Td>
                <Td className="text-small">
                  <Email value={r.recipientEmail} contact={contact} />
                </Td>
                <Td>{r.templateName}</Td>
                <Td>
                  <Badge tone={r.status === "sent" ? "success" : r.status === "pending" ? "info" : "danger"} pill dot>{r.status}</Badge>
                </Td>
                <Td className="max-w-md text-[13px] text-muted-foreground">{r.errorMessage ?? "–"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState size="page" title="Nothing sent yet" description="Emails appear here once email is set up and something goes out." />
      )}
    </Section>
  );
}

async function SuppressedTab({ contact }: { contact: boolean }) {
  const db = await getDb();
  const rows = await listSuppressed(db);
  return (
    <Section title="Suppressed addresses" description="Bounced, complained or unsubscribed at the sender: never emailed, and left out of every campaign." flush>
      {rows.length ? (
        <Table>
          <THead>
            <Th>Email</Th>
            <Th>Why</Th>
            <Th>Since</Th>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="text-small">
                  <Email value={r.email} contact={contact} />
                </Td>
                <Td>{r.reason}</Td>
                <Td className="whitespace-nowrap">{fmtDate(r.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState size="page" title="No suppressed addresses" />
      )}
    </Section>
  );
}
