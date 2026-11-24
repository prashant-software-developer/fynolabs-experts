import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { RECIPIENT_STATUSES } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_TONE, MERGE_FIELDS, RECIPIENT_STATUS_LABELS, RECIPIENT_STATUS_TONE, SAMPLE_MERGE, renderMerge, skipSummary } from "@/lib/talent";
import { getCampaign, listRecipients, recipientCounts } from "@/lib/server/campaigns";
import { emailConfigured } from "@/lib/server/email";
import { jobOptions, projectOptions } from "@/lib/server/pipelines";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, Notice } from "@/components/ui/feedback";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Section, Stack, Stat, StatGrid } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { CountTabs, Email, MapBadge, SectionBlocked } from "@/components/talent/bits";
import { approveCampaignAction, cancelCampaignAction, sendCampaignAction, updateDraftAction } from "../actions";

const PAGE = 100;


export const metadata = { title: "Campaign" };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "referrals")) return <SectionBlocked title="Send emails" section="referrals" />;
  const db = await getDb();
  const camp = await getCampaign(db, id);
  if (!camp) notFound();
  const manage = can(user.role, "campaigns.manage");
  const approve = can(user.role, "campaigns.approve");
  const contact = canSeeContact(user.role);
  const status = (RECIPIENT_STATUSES as readonly string[]).includes(one(sp.status)) ? one(sp.status) : "";
  const page = Math.max(1, Math.floor(Number(one(sp.page)) || 1));
  const [counts, recips, skipped, jobs, projects] = await Promise.all([
    recipientCounts(db, id),
    listRecipients(db, id, { status, limit: PAGE, offset: (page - 1) * PAGE }),
    listRecipients(db, id, { status: "skipped", limit: 2000, offset: 0 }),
    manage && camp.status === "draft" ? jobOptions(db) : Promise.resolve([]),
    manage && camp.status === "draft" ? projectOptions(db) : Promise.resolve([]),
  ]);
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const sample = { ...SAMPLE_MERGE, job_title: camp.jobTitle ?? SAMPLE_MERGE.job_title, project: camp.projectName ?? SAMPLE_MERGE.project };
  const base = `/admin/campaigns/${id}`;
  const draft = camp.status === "draft";
  const ready = Boolean(camp.subject.trim() && camp.body.trim());
  return (
    <>
      <PageHeader
        title={camp.name}
        back={{ href: "/admin/campaigns", label: "Send emails" }}
        meta={
          <>
            <MapBadge value={camp.status} labels={CAMPAIGN_STATUS_LABELS} tones={CAMPAIGN_STATUS_TONE} />
            <span className="text-muted-foreground">
              {camp.kind === "outreach" ? "Outreach" : "Update"}
              {camp.jobTitle ? ` for ${camp.jobTitle}` : ""} · made {fmtDate(camp.createdAt)}
              {camp.createdBy ? ` by ${camp.createdBy}` : ""}
              {camp.approvedAt ? ` · approved ${fmtDateTime(camp.approvedAt)} by ${camp.approvedBy}` : ""}
            </span>
          </>
        }
        actions={
          <>
            {approve && draft ? (
              <form action={approveCampaignAction}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton size="sm" disabled={!counts.pending || !ready} pendingText="Approving...">
                  Approve
                </SubmitButton>
              </form>
            ) : null}
            {approve && (camp.status === "approved" || camp.status === "sending") ? (
              <form action={sendCampaignAction}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton size="sm" pendingText="Checking...">
                  Send {Math.min(50, counts.pending ?? 0)} now
                </SubmitButton>
              </form>
            ) : null}
            {manage && camp.status !== "done" && camp.status !== "cancelled" ? (
              <form action={cancelCampaignAction}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton size="sm" variant="ghost" confirm="Cancel this campaign? Nothing more goes out." pendingText="Cancelling...">
                  Cancel campaign
                </SubmitButton>
              </form>
            ) : null}
          </>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        {!emailConfigured() && (camp.status === "approved" || camp.status === "sending") ? (
          <Notice tone="info" title="Email isn't set up yet">
            The campaign stays approved; nothing goes out until email is set up. Do-not-contact and unsubscribes are checked again just before each email.
          </Notice>
        ) : null}
        {draft && !ready ? <Notice tone="warning">Write the subject and the message below, then approve.</Notice> : null}
        <StatGrid>
          <Stat label={RECIPIENT_STATUS_LABELS.pending} value={counts.pending ?? 0} />
          <Stat label={RECIPIENT_STATUS_LABELS.sent} value={(counts.sent ?? 0) + (counts.followed_up ?? 0)} hint={counts.followed_up ? `${counts.followed_up} followed up` : undefined} />
          <Stat label={RECIPIENT_STATUS_LABELS.skipped} value={counts.skipped ?? 0} hint={skipSummary(skipped.rows.map((r) => r.reason))?.replace(/^Skipped: /, "") ?? undefined} />
          <Stat label="Failed or stopped" value={(counts.failed ?? 0) + (counts.stopped ?? 0)} />
        </StatGrid>

        {manage && draft ? (
          <Section title="The email" description={`Merge fields: ${MERGE_FIELDS.map((m) => `{{${m}}}`).join(" ")}. An unsubscribe link is added at the end.`}>
            <form action={updateDraftAction} className="space-y-4">
              <input type="hidden" name="id" value={id} />
              <FieldRow>
                <Field label="Name (only we see it)" htmlFor="name">
                  <Input id="name" name="name" defaultValue={camp.name} maxLength={120} />
                </Field>
                <Field label="Type" htmlFor="kind">
                  <Select id="kind" name="kind" defaultValue={camp.kind} options={[{ value: "outreach", label: "Outreach" }, { value: "update", label: "Update" }]} />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Role" htmlFor="jobId">
                  <Select id="jobId" name="jobId" defaultValue={camp.jobId ?? ""} options={jobs.map((j) => ({ value: j.id, label: j.title }))} placeholder="No role" />
                </Field>
                <Field label="Project" htmlFor="projectId">
                  <Select id="projectId" name="projectId" defaultValue={camp.projectId ?? ""} options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} placeholder="No project" />
                </Field>
              </FieldRow>
              <Field label="Subject" htmlFor="subject">
                <Input id="subject" name="subject" defaultValue={camp.subject} maxLength={200} />
              </Field>
              <Field label="Message" htmlFor="body">
                <Textarea id="body" name="body" rows={10} defaultValue={camp.body} maxLength={10000} />
              </Field>
              <div className="space-y-3 rounded-md border border-border p-4">
                <Checkbox name="followUp" value="yes" defaultChecked={Boolean(camp.followUpBody)} label="Follow up if they don't answer (outreach only)" />
                <FieldRow>
                  <Field label="Follow-up subject" htmlFor="followUpSubject" hint="Empty uses “Re:” and the first subject.">
                    <Input id="followUpSubject" name="followUpSubject" defaultValue={camp.followUpSubject ?? ""} maxLength={200} />
                  </Field>
                  <Field label="After (days)" htmlFor="followUpAfterDays">
                    <Input id="followUpAfterDays" name="followUpAfterDays" type="number" min={1} max={30} defaultValue={camp.followUpAfterDays ?? 4} />
                  </Field>
                </FieldRow>
                <Field label="Follow-up message" htmlFor="followUpBody">
                  <Textarea id="followUpBody" name="followUpBody" rows={4} defaultValue={camp.followUpBody ?? ""} maxLength={10000} />
                </Field>
              </div>
              <SubmitButton size="sm" variant="secondary" pendingText="Saving...">
                Save draft
              </SubmitButton>
            </form>
          </Section>
        ) : null}

        <Section title="Preview" description="Merge fields shown with sample values.">
          {ready ? (
            <div className="space-y-4">
              <div className="space-y-2 rounded-md border border-border p-4 text-sm">
                <div className="font-normal text-foreground">{renderMerge(camp.subject, sample)}</div>
                <pre className="font-sans whitespace-pre-wrap text-foreground/85">{renderMerge(camp.body, sample)}</pre>
                <p className="text-xs text-muted-foreground">Don&apos;t want these emails? Unsubscribe</p>
              </div>
              {camp.followUpBody ? (
                <div className="space-y-2 rounded-md border border-dashed border-border p-4 text-sm">
                  <p className="text-xs text-muted-foreground">Follow-up after {camp.followUpAfterDays} days, to anyone who hasn&apos;t answered:</p>
                  <div className="font-normal text-foreground">{renderMerge(camp.followUpSubject || `Re: ${camp.subject}`, sample)}</div>
                  <pre className="font-sans whitespace-pre-wrap text-foreground/85">{renderMerge(camp.followUpBody, sample)}</pre>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState padded={false} title="No wording yet" />
          )}
        </Section>

        <Section title={`Recipients (${all})`} flush>
          <div className="px-4 pt-2">
            <CountTabs
              label="Recipient status"
              tabs={[
                { href: hrefWith(base, sp, { status: null, page: null, ok: null, error: null }), label: "All", active: !status, count: all },
                ...RECIPIENT_STATUSES.filter((s) => counts[s]).map((s) => ({ href: hrefWith(base, sp, { status: s, page: null, ok: null, error: null }), label: RECIPIENT_STATUS_LABELS[s], active: status === s, count: counts[s] })),
              ]}
            />
          </div>
          {recips.rows.length ? (
            <>
              <Table>
                <THead>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Status</Th>
                  <Th>Why</Th>
                  <Th>Sent</Th>
                </THead>
                <TBody>
                  {recips.rows.map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <Link href={`/admin/experts/${r.expertId}`} className="font-normal text-foreground hover:text-primary">
                          {r.name}
                        </Link>
                      </Td>
                      <Td className="text-small">
                        <Email value={r.email || null} contact={contact} />
                      </Td>
                      <Td>
                        <MapBadge value={r.status} labels={RECIPIENT_STATUS_LABELS} tones={RECIPIENT_STATUS_TONE} />
                      </Td>
                      <Td className="text-xs text-muted-foreground">{r.reason ?? "–"}</Td>
                      <Td className="whitespace-nowrap">{r.followedUpAt ? `followed up ${fmtDate(r.followedUpAt)}` : fmtDate(r.sentAt)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination page={page} pageSize={PAGE} total={recips.total} hrefFor={(p) => hrefWith(base, sp, { page: p, ok: null, error: null })} />
            </>
          ) : (
            <EmptyState title="Nobody with this status" />
          )}
        </Section>
      </Stack>
    </>
  );
}
