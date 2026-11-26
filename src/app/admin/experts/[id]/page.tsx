import Link from "next/link";
import { notFound } from "next/navigation";
import { AtSign, Briefcase, CheckSquare, Download, FileSignature, FileText, History, Link2, Mail, Pencil, Send, Shield, Shuffle, StickyNote, UserCheck, type LucideIcon } from "@/components/icons";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { experts } from "@/db/schema";
import { can, canSeeContact, canSeeMoney, fileDownloadAction, partnerScope, visibleExpert, visibleFiles } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { CV_CONSENT, DOCUMENT_STATUSES, OUTREACH_STATUSES, REFERRAL_OUTCOMES, SOURCE_CHANNELS, label } from "@/lib/constants";
import { one, type SearchParams } from "@/lib/filters";
import { bytes, fmtDate, fmtDateTime, place } from "@/lib/format";
import { valuesFromExpert } from "@/lib/forms/expert";
import { formatMoney, computeMoney } from "@/lib/money";
import {
  APPLICATION_CHANNEL_LABELS,
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONE,
  OUTREACH_LABELS,
  REFERRAL_METHOD_LABELS,
  REFERRAL_OUTCOME_LABELS,
  REFERRAL_OUTCOME_TONE,
  REJECT_REASON_LABELS,
  SOURCE_CHANNEL_LABELS,
  TIMELINE_KIND_LABELS,
  stageLabel,
} from "@/lib/talent";
import { currentCv, detailsFor, filesFor, getExpert, payoutFor, sourcesFor, type ExpertRow } from "@/lib/server/experts";
import { documentsOf, earningsOf, engagementsOf, mergedTimeline, type TimelineItem } from "@/lib/server/expert-records";
import { jobsApplicationsFor } from "@/lib/server/jobs-sync";
import { applicationsOf } from "@/lib/server/applications";
import { openDeletionRequest } from "@/lib/server/portal";
import { crmFieldsFor } from "@/lib/server/timeline";
import { jobOptions, ownerOptions, pipelinesOf, trackOptions, type PipelineRow } from "@/lib/server/pipelines";
import { referralsOf } from "@/lib/server/referrals";
import { listPlacements } from "@/lib/server/placements";
import { listRequirements } from "@/lib/server/requirements";
import { listSubmissions } from "@/lib/server/submissions";
import { ExpertForm } from "@/components/expert-form";
import { DueChip } from "@/components/crm/chips";
import { todayIST } from "@/lib/crm/dates";
import { Avatar, Person } from "@/components/ui/avatar";
import { Badge, Chips, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { AutoSubmitSelect, SubmitButton } from "@/components/ui/client";
import { cn } from "@/components/ui/cn";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, FlashFromParams, Notice } from "@/components/ui/feedback";
import { FileDrop } from "@/components/ui/file-drop";
import { Field, FieldRow, Input, Select, Textarea, Checkbox } from "@/components/ui/field";
import { DefinitionList, PageHeader, Section, Stack } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { FieldGroup, FieldSearch } from "@/components/record/client";
import { GroupExtra, Prop, RecordCenter, RecordFields, RecordIdentity, RecordLayout, SideBlock, SideCounts, SideItem, quickAction } from "@/components/record/panels";
import { MapBadge, SectionBlocked, StageBar } from "@/components/talent/bits";
import { StageForm } from "@/components/talent/client";
import { addSelectedToRequirement, appendNote, deleteExpert, recordConsent, uploadCv } from "../actions";
import { addExpertNote, addExpertsToJob, changeDocumentStatus, movePipelineStage, saveOutreach, savePipeline } from "../talent-actions";
import { changeReferralOutcome } from "../../send-referrals/actions";

// The centre panel's tabs. Activity (the timeline) comes first; the old ?tab=profile and
// ?tab=timeline open it too (the profile's fields now live in the left panel).
const TABS = ["activity", "pipelines", "documents", "referrals", "earnings", "applications", "work"] as const;
type Tab = (typeof TABS)[number];
const OPEN_STAGES = (s: string) => s !== "ended" && s !== "rejected";

export const metadata = { title: "Expert" };

export default async function ExpertPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "profiles")) return <SectionBlocked title="Experts" section="profiles" />;
  const db = await getDb();
  const raw = await getExpert(db, id);
  if (!raw) notFound();
  const e = visibleExpert(user.role, raw);
  const canEdit = can(user.role, "experts.edit");
  const base = `/admin/experts/${id}`;
  // One way in to editing the whole profile: the Edit button. ?tab=edit is the full edit form.
  if (one(sp.tab) === "edit" && canEdit) {
    return (
      <>
        <PageHeader title={e.fullName} back={{ href: base, label: "Back to profile" }} subtitle="Editing profile" actions={<ButtonLink href={base}>Cancel</ButtonLink>} />
        <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
        <EditView id={id} e={raw} user={user} />
      </>
    );
  }
  const asked = one(sp.tab);
  const tab: Tab = (TABS as readonly string[]).includes(asked) ? (asked as Tab) : "activity";
  const scope = partnerScope(user);
  const [subs, plcs, pipes, docs, refs, timeline, hubApps, owners, allFiles, deletion, details, payout, crm] = await Promise.all([
    listSubmissions(db, { expertId: id, partnerScope: scope }),
    listPlacements(db, { expertId: id, partnerScope: scope }),
    pipelinesOf(db, id),
    documentsOf(db, id),
    referralsOf(db, id),
    mergedTimeline(db, id),
    applicationsOf(db, id),
    ownerOptions(db),
    filesFor(db, id),
    openDeletionRequest(db, id),
    detailsFor(db, id, user.role),
    payoutFor(db, id, user.role),
    crmFieldsFor(db, id),
  ]);
  const today = todayIST();
  const tabHref = (t: Tab) => (t === "activity" ? base : `${base}?tab=${t}`);
  const here = tabHref(tab);
  const withParam = (href: string, q: string) => `${href}${href.includes("?") ? "&" : "?"}${q}`;
  const editingOutreach = one(sp.edit) === "outreach" && canEdit && crm;
  const signed = docs.filter((d) => d.status === "signed").length;
  const liveDocs = docs.filter((d) => d.status !== "void").length;
  const owner = (e.ownerTeamMemberId && owners.find((o) => o.id === e.ownerTeamMemberId)?.name) || e.ownerName;
  const cameFrom = e.sourceChannel ? (SOURCE_CHANNEL_LABELS[e.sourceChannel] ?? e.sourceChannel) : label(e.primarySource);
  const contact = canSeeContact(user.role);
  const money = canSeeMoney(user.role);
  // Tax forms are money: only admins and finance see them listed.
  const files = visibleFiles(user.role, allFiles);
  const cv = currentCv(e.cvRef, files.filter((f) => f.kind === "cv"));
  const dnc = e.status === "do_not_contact";

  const left = (
    <>
      <RecordIdentity
        back={{ href: "/admin/experts", label: "Experts" }}
        media={<Avatar name={e.fullName} size="2xl" />}
        title={e.fullName}
        subtitle={e.headline ?? `Expert · ${cameFrom}`}
        chips={
          <>
            <StatusBadge value={e.status} />
            <StatusBadge value={e.availability} />
            {e.domain ? <Badge tone="outline">{e.domain}</Badge> : null}
          </>
        }
        actions={
          <>
            {e.email && contact && !dnc ? (
              <a href={`mailto:${e.email}`} className={quickAction} title={`Email ${e.email}`}>
                <Mail aria-hidden /> Email
              </a>
            ) : null}
            {e.email && contact ? <CopyButton value={e.email} label="Copy" /> : null}
            {e.linkedinUrl ? (
              <a href={e.linkedinUrl} target="_blank" rel="noreferrer noopener" className={quickAction}>
                <Link2 aria-hidden /> LinkedIn
              </a>
            ) : null}
            {can(user.role, "referrals.manage") && canOpenSection(user, "send-referrals") ? (
              <Link href={`/admin/send-referrals?ids=${id}`} className={quickAction}>
                <Send aria-hidden /> Refer
              </Link>
            ) : null}
            {canEdit ? (
              <Link href={`${base}?tab=edit`} className={quickAction}>
                <Pencil aria-hidden /> Edit
              </Link>
            ) : null}
          </>
        }
      />
      <RecordFields>
        <FieldSearch />
        <FieldGroup title="Contact">
          <Prop label="Email">{e.email ? contact ? <a href={`mailto:${e.email}`} title={e.email} className="block truncate text-primary hover:underline">{e.email}</a> : <span title="Masked for your role">{e.email}</span> : null}</Prop>
          <Prop label="Phone">{e.phone ? <span className="tabular" title={contact ? undefined : "Masked for your role"}>{e.phone}</span> : null}</Prop>
          <Prop label="Lives in">{place(e) === "–" ? null : place(e)}</Prop>
          <Prop label="Based in">{[crm?.location, crm?.timezone].filter(Boolean).join(" · ") || null}</Prop>
          <Prop label="LinkedIn">{e.linkedinUrl ? <a href={e.linkedinUrl} target="_blank" rel="noreferrer noopener" title={e.linkedinUrl} className="block truncate text-primary hover:underline">{e.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}</a> : null}</Prop>
          <Prop label="Links" stack>{crm?.links ? <span className="whitespace-pre-line break-all">{crm.links}</span> : null}</Prop>
          {contact && details ? <Prop label="Address">{[details.addressLine1, details.addressLine2, details.postalCode].filter(Boolean).join(", ") || null}</Prop> : null}
          <Prop label="Bulk emails">{crm?.emailOptOut ? "Opted out" : "Subscribed"}</Prop>
        </FieldGroup>
        <FieldGroup
          title="Pipeline and outreach"
          actions={
            canEdit && crm ? (
              <Link href={withParam(here, "edit=outreach")} scroll={false} className="inline-flex h-7 items-center rounded-md px-2 text-xs text-primary hover:bg-accent">
                Edit
              </Link>
            ) : null
          }
        >
          <Prop label="Owner">{owner ? <Person name={owner} size="xs" /> : null}</Prop>
          <Prop label="Outreach">{crm?.outreachStatus ? OUTREACH_LABELS[crm.outreachStatus as keyof typeof OUTREACH_LABELS] : null}</Prop>
          <Prop label="Next action">{crm?.nextAction ?? null}</Prop>
          <Prop label="Due">{crm?.nextActionDue ? <DueChip due={crm.nextActionDue} today={today} /> : null}</Prop>
          <Prop label="Came from">{[crm?.sourceChannel ? (SOURCE_CHANNEL_LABELS[crm.sourceChannel] ?? crm.sourceChannel) : label(e.primarySource), crm?.sourceDetail].filter(Boolean).join(": ") || null}</Prop>
          <Prop label="Do not contact">{dnc ? <span className="text-destructive">Yes{crm?.dncReason ? `: ${crm.dncReason}` : ""}</span> : "No"}</Prop>
          <Prop label="Last contacted">{e.lastContactedAt ? fmtDate(e.lastContactedAt) : null}</Prop>
          <Prop label="Last activity">{crm?.lastActivityAt ? fmtDateTime(crm.lastActivityAt) : null}</Prop>
        </FieldGroup>
        <FieldGroup title="Profile and skills">
          <Prop label="Skills" stack>{e.skills.length ? <Chips items={e.skills} max={40} /> : null}</Prop>
          <Prop label="Experience">{e.yearsExperience != null ? `${e.yearsExperience} years` : null}</Prop>
          <Prop label="Seniority">{crm?.seniority ? label(crm.seniority) : null}</Prop>
          <Prop label="Degree">{e.highestDegree}</Prop>
          <Prop label="Field of study">{e.fieldOfStudy}</Prop>
          <Prop label="University">{e.university}</Prop>
          <Prop label="Hours / week">{e.hoursPerWeek ?? null}</Prop>
          <Prop label="Languages">{e.languages.length ? e.languages.join(", ") : null}</Prop>
          {money ? <Prop label="Rate (internal)">{e.rateExpectationUsd != null ? `$${e.rateExpectationUsd}/h` : null}</Prop> : null}
          <Prop label="Tags" stack>{e.tags.length ? <Chips items={e.tags} max={30} /> : null}</Prop>
          <Prop label="Source">{label(e.primarySource)}</Prop>
          {details ? (
            <>
              <Prop label="Work authorisation">{details.workAuthorized == null ? null : `${details.workAuthorized ? "Yes" : "No"}${details.workAuthorizedAt ? ` (${fmtDate(details.workAuthorizedAt)})` : ""}`}</Prop>
              <Prop label="Referral code">{details.referralCode}</Prop>
              <Prop label="Referred by">{details.referredByExpertId ? <Link href={`/admin/experts/${details.referredByExpertId}`} className="text-primary hover:underline">{details.referredByName ?? "Another expert"}</Link> : null}</Prop>
              <Prop label="Jobs-site login">{details.lastLoginAt ? fmtDateTime(details.lastLoginAt) : null}</Prop>
            </>
          ) : null}
          <Prop label="Added">{fmtDate(e.createdAt)}</Prop>
          <Prop label="Updated">{fmtDateTime(e.updatedAt)}</Prop>
        </FieldGroup>
        <FieldGroup title="CV" count={files.length}>
          <Prop label="CV consent" stack>
            <span className="block">{consentLine(e)}</span>
          </Prop>
          <GroupExtra>
            <ConsentControl e={e} canEdit={canEdit} returnTo={here} />
          </GroupExtra>
          {files.length ? (
            <ul className="space-y-2">
              {files.map((f) => (
                <li key={f.id} data-field className="flex min-w-0 items-start gap-2 text-[13px]">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-foreground">{f.filename}</span>
                      {cv?.id === f.id ? <Badge tone="success">Current</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {f.kind === "attachment" ? "Attachment · " : f.kind === "document" ? "Document · " : f.kind === "tax" ? "Tax form (admins and finance) · " : ""}
                      {bytes(f.size)} · {f.storage === "jobs_db" || f.externalRef?.startsWith("jobs:") ? "from jobs site" : f.storage === "fynolabs" ? "from the FynoLabs admin" : f.createdBy === "job-form" ? "from a job application" : f.createdBy === "expert-portal" ? "uploaded by the expert" : "uploaded"} · {fmtDate(f.createdAt)}
                    </div>
                  </div>
                  {can(user.role, fileDownloadAction(f.kind)) ? (
                    <a href={`/api/files/${f.id}`} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-primary hover:bg-accent" aria-label={`Download ${f.filename}`} title="Download">
                      <Download className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p data-field className="text-[13px] text-muted-foreground">
              No CV yet.{can(user.role, "experts.cv_upload") ? " Upload one below, or run the jobs-site sync if they applied there." : ""}
            </p>
          )}
          {can(user.role, "experts.cv_upload") ? (
            <GroupExtra>
              <form action={uploadCv}>
                <input type="hidden" name="id" value={e.id} />
                <FileDrop name="file" accept=".pdf,.doc,.docx,.txt,.rtf" label="Upload CV" hint="PDF or Word, up to 4 MB" submitLabel="Upload" />
              </form>
            </GroupExtra>
          ) : null}
        </FieldGroup>
        {details ? <ExperienceGroup d={details} /> : null}
        {payout ? (
          <FieldGroup title="Payout and tax">
            <p className="text-xs text-muted-foreground">Money: only admins and finance see this.</p>
            <Prop label="Payout method">{payout.payoutMethod}</Prop>
            <Prop label="Payout handle">{payout.payoutHandle}</Prop>
            <Prop label="Tax form">{[payout.taxFormType, payout.taxFormAt ? `sent ${fmtDate(payout.taxFormAt)}` : null].filter(Boolean).join(", ") || null}</Prop>
            <Prop label="Default commission">{payout.defaultCommissionPercent != null ? `${payout.defaultCommissionPercent}%` : null}</Prop>
          </FieldGroup>
        ) : null}
        <FieldGroup title="Internal notes">
          <p className="text-xs text-muted-foreground">Kept on the profile. For dated updates, add a note to the activity instead.</p>
          {e.notes ? (
            <div data-field>
              <pre className="max-h-72 overflow-y-auto rounded-md bg-canvas px-3 py-2 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/85">{e.notes}</pre>
            </div>
          ) : (
            <p data-field className="text-[13px] text-muted-foreground">No notes.</p>
          )}
          {can(user.role, "experts.notes") ? (
            <GroupExtra>
              <form action={appendNote} className="space-y-2">
                <input type="hidden" name="id" value={e.id} />
                <Textarea name="note" rows={2} placeholder="Add to the notes" aria-label="New internal note" className="text-[13px]" />
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton size="sm" variant="secondary">
                    Add
                  </SubmitButton>
                  <Checkbox name="contacted" value="yes" label="Contacted them today" className="text-[13px]" />
                </div>
              </form>
            </GroupExtra>
          ) : null}
        </FieldGroup>
      </RecordFields>
    </>
  );

  // ---- right panel: what's next, the jobs they're in, documents, numbers
  type Next = { key: string; title: string; sub: string; due: string | null; href: string; icon: LucideIcon };
  const nexts: Next[] = [];
  if (crm?.nextAction || crm?.nextActionDue) nexts.push({ key: "expert", title: crm.nextAction ?? "Next action", sub: owner ? `Expert · ${owner}` : "Expert", due: crm.nextActionDue ?? null, href: canEdit ? withParam(here, "edit=outreach") : here, icon: CheckSquare });
  for (const p of pipes)
    if (OPEN_STAGES(p.stage) && (p.nextAction || p.nextActionDue))
      nexts.push({ key: p.id, title: p.nextAction ?? "Next step", sub: `${p.projectCode ? `${p.projectCode} · ` : ""}${p.jobTitle}`, due: p.nextActionDue ?? null, href: `${base}?tab=pipelines`, icon: Briefcase });
  for (const d of docs) if (d.status === "draft" || d.status === "sent") nexts.push({ key: d.id, title: d.status === "draft" ? `Send ${d.title}` : `Signature: ${d.title}`, sub: DOCUMENT_STATUS_LABELS[d.status as keyof typeof DOCUMENT_STATUS_LABELS] ?? d.status, due: null, href: `${base}?tab=documents`, icon: FileSignature });
  nexts.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const openPipes = [...pipes].sort((a, b) => Number(OPEN_STAGES(b.stage)) - Number(OPEN_STAGES(a.stage)));

  const right = (
    <>
      <SideBlock title="Up next" action={nexts.length ? <span className="tabular text-muted-foreground">{nexts.length}</span> : null}>
        {nexts.length ? (
          <ul className="space-y-0.5">
            {nexts.slice(0, 8).map((n) => (
              <SideItem key={n.key} href={n.href} icon={<n.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />} title={n.title} sub={n.sub} aside={n.due ? <DueChip due={n.due} today={today} /> : null} />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Nothing planned.{" "}
            {canEdit && crm ? (
              <Link href={withParam(here, "edit=outreach")} scroll={false} className="text-primary hover:underline">
                Set a next action
              </Link>
            ) : null}
          </p>
        )}
      </SideBlock>
      <SideBlock title="Jobs" action={<Link href={`${base}?tab=pipelines`} className="text-primary hover:underline">{pipes.length ? `All ${pipes.length}` : "Add to a job"}</Link>}>
        {openPipes.length ? (
          <ul className="space-y-0.5">
            {openPipes.slice(0, 6).map((p) => (
              <SideItem key={p.id} href={`/admin/jobs/${p.jobId}?tab=applicants&app=${p.id}`} icon={<Briefcase className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />} title={`${p.projectCode ? `${p.projectCode} · ` : ""}${p.jobTitle}`} sub={`${stageLabel(p.stage)} · since ${fmtDate(p.stageChangedAt)}`} />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">Not in any job yet.</p>
        )}
      </SideBlock>
      <SideBlock title="Documents" action={<Link href={`${base}?tab=documents`} className="text-primary hover:underline">{`${signed} of ${liveDocs} signed`}</Link>}>
        {liveDocs ? (
          <ul className="space-y-0.5">
            {docs
              .filter((d) => d.status !== "void")
              .slice(0, 5)
              .map((d) => (
                <SideItem key={d.id} href={`${base}?tab=documents`} icon={<FileSignature className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />} title={d.title} sub={d.jobTitle ?? (DOCUMENT_KIND_LABELS[d.kind as keyof typeof DOCUMENT_KIND_LABELS] ?? d.kind)} aside={<MapBadge value={d.status} labels={DOCUMENT_STATUS_LABELS} tones={DOCUMENT_STATUS_TONE} />} />
              ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No documents yet.</p>
        )}
      </SideBlock>
      <SideBlock title="At a glance">
        <SideCounts
          items={[
            { label: "Applications", value: hubApps.length, href: `${base}?tab=applications` },
            { label: "Referrals", value: refs.length, href: `${base}?tab=referrals` },
            { label: "Submissions", value: subs.length, href: `${base}?tab=work` },
            { label: "Placements", value: plcs.length, href: `${base}?tab=work` },
            { label: "Activity", value: timeline.length, href: base },
            { label: "CV consent", value: label(e.cvConsent) },
          ]}
        />
      </SideBlock>
    </>
  );

  const center = (
    <RecordCenter
      tabs={
        <Tabs
          tabs={[
            { href: tabHref("activity"), label: "Activity", active: tab === "activity", count: timeline.length },
            { href: tabHref("pipelines"), label: "Pipelines", active: tab === "pipelines", count: pipes.length },
            { href: tabHref("documents"), label: "Documents", active: tab === "documents", count: liveDocs },
            { href: tabHref("referrals"), label: "Referrals", active: tab === "referrals", count: refs.length },
            { href: tabHref("earnings"), label: "Earnings", active: tab === "earnings" },
            { href: tabHref("applications"), label: "Applications", active: tab === "applications", count: hubApps.length },
            { href: tabHref("work"), label: "Submissions", active: tab === "work", count: subs.length + plcs.length },
          ]}
        />
      }
    >
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      {deletion ? (
        <Notice tone="warning" title="Asked us to delete their data">
          Requested on {fmtDate(deletion.createdAt)} from the expert portal. An admin should delete the profile (Edit → Delete on request) and confirm by email within 30 days.
        </Notice>
      ) : null}
      {dnc ? (
        <Notice tone="error" title="Do not contact">
          {crm?.dncReason ? `${crm.dncReason}. ` : ""}They won&apos;t be emailed, referred or added to jobs by any tool.
        </Notice>
      ) : null}
      {tab === "activity" ? <ActivityTab id={id} items={timeline} pipes={pipes} user={user} /> : null}
      {tab === "pipelines" ? <PipelinesTab id={id} pipes={pipes} user={user} /> : null}
      {tab === "documents" ? <DocumentsTab id={id} docs={docs} user={user} /> : null}
      {tab === "referrals" ? <ReferralsTab id={id} refs={refs} user={user} /> : null}
      {tab === "earnings" ? <EarningsTab id={id} user={user} /> : null}
      {tab === "applications" ? <ApplicationsTab e={e} apps={hubApps} /> : null}
      {tab === "work" ? <WorkTab id={id} subs={subs} plcs={plcs} user={user} /> : null}
    </RecordCenter>
  );

  return (
    <>
      <RecordLayout left={left} center={center} right={right} />
      {editingOutreach ? (
        <SlideOver title="Pipeline and outreach" subtitle={e.fullName} media={<Avatar name={e.fullName} size="xl" />} closeHref={here}>
          <OutreachForm c={editingOutreach} id={id} owners={owners} dnc={dnc} returnTo={here} />
        </SlideOver>
      ) : null}
    </>
  );
}

function consentLine(e: ExpertRow): string {
  const when = e.cvConsentAt ? ` on ${fmtDate(e.cvConsentAt)}` : "";
  if (e.cvConsent === "yes") return `Yes, recorded${when}. Their CV may go to partners.`;
  if (e.cvConsent === "no") return `No, recorded${when}. Never shared with partners.`;
  return "Not asked yet. Not shared with partners until the expert says yes.";
}

/** "CV consent: Yes" plus a small "Change to..." menu (roles that may edit). */
function ConsentControl({ e, canEdit, returnTo }: { e: ExpertRow; canEdit: boolean; returnTo: string }) {
  return (
    <form action={recordConsent} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={e.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <StatusBadge value={e.cvConsent} prefix="CV consent:" />
      {canEdit ? (
        <>
          <AutoSubmitSelect name="consent" defaultValue="" className="control h-8 w-auto text-[13px]" aria-label="Change CV consent">
            <option value="" disabled>
              Change to...
            </option>
            {CV_CONSENT.filter((v) => v !== e.cvConsent).map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </AutoSubmitSelect>
          <noscript>
            <button className="text-sm">Save</button>
          </noscript>
        </>
      ) : null}
    </form>
  );
}

type Crm = NonNullable<Awaited<ReturnType<typeof crmFieldsFor>>>;

/** Owner, outreach, next action, where they came from and do not contact (opened from the left panel). */
function OutreachForm({ c, id, owners, dnc, returnTo }: { c: Crm; id: string; owners: { id: string; name: string; active: boolean }[]; dnc: boolean; returnTo: string }) {
  return (
    <form action={saveOutreach} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="dncShown" value="yes" />
      <p className="text-[13px] text-muted-foreground">Owner, outreach and next action, as the FynoLabs admin keeps them. Changing outreach writes the timeline.</p>
      <FieldRow>
        <Field label="Owner" htmlFor="ownerTeamMemberId">
          <Select id="ownerTeamMemberId" name="ownerTeamMemberId" defaultValue={c.ownerTeamMemberId ?? ""} options={owners.filter((o) => o.active || o.id === c.ownerTeamMemberId).map((o) => ({ value: o.id, label: o.name }))} placeholder="No owner" />
        </Field>
        <Field label="Outreach" htmlFor="outreachStatus">
          <Select id="outreachStatus" name="outreachStatus" defaultValue={c.outreachStatus ?? ""} options={OUTREACH_STATUSES.map((o) => ({ value: o, label: OUTREACH_LABELS[o] }))} placeholder="Not set" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Next action" htmlFor="nextAction">
          <Input id="nextAction" name="nextAction" defaultValue={c.nextAction ?? ""} placeholder="Follow up on LinkedIn" maxLength={300} />
        </Field>
        <Field label="Due" htmlFor="nextActionDue">
          <Input id="nextActionDue" name="nextActionDue" type="date" defaultValue={c.nextActionDue ?? ""} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Came from" htmlFor="sourceChannel">
          <Select id="sourceChannel" name="sourceChannel" defaultValue={c.sourceChannel ?? ""} options={SOURCE_CHANNELS.map((s) => ({ value: s, label: SOURCE_CHANNEL_LABELS[s] }))} placeholder="Not set" />
        </Field>
        <Field label="Detail" htmlFor="sourceDetail" hint="Who referred them, which list, which agency.">
          <Input id="sourceDetail" name="sourceDetail" defaultValue={c.sourceDetail ?? ""} maxLength={300} />
        </Field>
      </FieldRow>
      <div className="space-y-2 rounded-md border border-border p-4">
        <Checkbox name="dnc" value="yes" defaultChecked={dnc} label="Do not contact" />
        <Input name="dncReason" defaultValue={c.dncReason ?? ""} placeholder="Reason, e.g. asked to stop by email" aria-label="Do-not-contact reason" maxLength={300} />
        <p className="text-[13px] text-muted-foreground">They won&apos;t be emailed, referred or added to jobs by any tool.{c.emailOptOut ? " They also opted out of bulk emails." : ""}</p>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton size="sm" pendingText="Saving…">
          Save
        </SubmitButton>
        <ButtonLink href={returnTo} size="sm" variant="ghost">
          Cancel
        </ButtonLink>
        {c.lastActivityAt ? <span className="text-[13px] text-muted-foreground">Last activity {fmtDateTime(c.lastActivityAt)}</span> : null}
      </div>
    </form>
  );
}

type Details = NonNullable<Awaited<ReturnType<typeof detailsFor>>>;
/** Experience and education are JSON typed by people on the old site: show only plain text and numbers. */
const txt = (v: unknown): string | null => (typeof v === "string" ? v.trim() || null : typeof v === "number" ? String(v) : null);

/** Experience and education the old jobs site kept (copied by npm run copy:engine), as a left-panel group. */
function ExperienceGroup({ d }: { d: Details }) {
  if (!Array.isArray(d.experience) || !Array.isArray(d.education)) return null;
  if (!d.experience.length && !d.education.length && !d.noExperience) return null;
  return (
    <FieldGroup title="Experience and education" count={d.experience.length + d.education.length}>
      {d.experience.length ? (
        d.experience.map((x, i) => (
          <div key={`x${i}`} data-field className="text-[13px]">
            <div className="font-medium text-foreground">{[txt(x.title), txt(x.company)].filter(Boolean).join(" at ") || "Role"}</div>
            <div className="text-xs text-muted-foreground">{[txt(x.location), [txt(x.start), x.current === true ? "now" : txt(x.end)].filter(Boolean).join(" to ")].filter(Boolean).join(" · ")}</div>
            {txt(x.description) ? <p className="mt-1 line-clamp-4 whitespace-pre-line text-foreground/80">{txt(x.description)}</p> : null}
          </div>
        ))
      ) : d.noExperience ? (
        <p data-field className="text-[13px] text-muted-foreground">
          No work experience yet (said so on the jobs site).
        </p>
      ) : null}
      {d.education.map((x, i) => (
        <div key={`e${i}`} data-field className="text-[13px]">
          <div className="font-medium text-foreground">{[txt(x.degree), txt(x.field)].filter(Boolean).join(", ") || "Education"}</div>
          <div className="text-xs text-muted-foreground">{[txt(x.school), [txt(x.start_year), txt(x.end_year)].filter(Boolean).join(" to "), txt(x.grade)].filter(Boolean).join(" · ")}</div>
        </div>
      ))}
    </FieldGroup>
  );
}

// ---------------------------------------------------------------- activity (the centre's main tab)

const dayKey = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

function dayLabel(key: string): string {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(key.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}), timeZone: "UTC" });
}

// One round icon per kind on the rail (as on the account activity).
const KIND_ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  note: { icon: StickyNote, tone: "bg-secondary text-foreground/70" },
  email: { icon: Mail, tone: "bg-info-soft text-info" },
  stage: { icon: Shuffle, tone: "bg-progress-soft text-progress" },
  application: { icon: Briefcase, tone: "bg-info-soft text-info" },
  document: { icon: FileSignature, tone: "bg-warning-soft text-warning" },
  referral: { icon: Send, tone: "bg-success-soft text-success" },
  outreach: { icon: AtSign, tone: "bg-info-soft text-info" },
  consent: { icon: Shield, tone: "bg-success-soft text-success" },
  history: { icon: History, tone: "bg-secondary text-foreground/70" },
  system: { icon: UserCheck, tone: "bg-secondary text-foreground/70" },
};

function ActivityTab({ id, items, pipes, user }: { id: string; items: TimelineItem[]; pipes: PipelineRow[]; user: CurrentUser }) {
  const days = new Map<string, TimelineItem[]>();
  for (const t of items) {
    const k = dayKey(t.at);
    days.set(k, [...(days.get(k) ?? []), t]);
  }
  return (
    <>
      {can(user.role, "experts.notes") ? (
        <form action={addExpertNote} className="rounded-lg border border-border bg-card focus-within:border-ring">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="returnTo" value={`/admin/experts/${id}`} />
          <Textarea name="note" rows={3} placeholder={"Add a note: a call, a trial task result, anything worth remembering.\nThe first line becomes the title on the timeline."} aria-label="Note" className="block min-h-20 resize-y rounded-b-none border-0 bg-transparent px-4 py-3 shadow-none focus:ring-0 focus-visible:ring-0" />
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-canvas/60 px-3 py-2">
            {pipes.length ? <Select name="applicationId" defaultValue="" options={pipes.map((p) => ({ value: p.id, label: p.jobTitle }))} placeholder="Not tied to a job" className="h-8 w-auto max-w-56 text-[13px]" aria-label="Job" /> : null}
            <SubmitButton size="sm" pendingText="Adding…">
              Add note
            </SubmitButton>
          </div>
        </form>
      ) : null}
      <section className="rounded-lg border border-border bg-card" aria-label="Timeline">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-5 py-3">
          <h2 className="text-sm font-medium text-foreground">Timeline</h2>
          <span className="text-xs text-muted-foreground">Applications, stages, documents, emails, referrals, notes and changes, newest first</span>
        </div>
        {items.length ? (
          <div className="divide-y divide-border">
            {[...days.entries()].map(([k, list]) => (
              <div key={k} className="px-5 py-4">
                <div className="mb-3 text-[13px] font-medium text-muted-foreground">{dayLabel(k)}</div>
                <ol>
                  {list.map((t, i) => {
                    const k2 = t.source === "audit" ? { icon: Pencil, tone: "bg-secondary text-foreground/70" } : (KIND_ICON[t.kind] ?? KIND_ICON.note);
                    const last = i === list.length - 1;
                    return (
                      <li key={t.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                        {!last ? <span className="absolute top-8 bottom-0 left-[13.5px] w-px bg-border" aria-hidden /> : null}
                        <span className={cn("relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card", k2.tone)}>
                          <k2.icon className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5 text-sm">
                          <p className="text-foreground">
                            {t.summary}
                            {t.jobTitle && t.kind !== "stage" && t.kind !== "application" ? <span className="text-muted-foreground"> · {t.jobTitle}</span> : null}
                          </p>
                          <p className="mt-0.5 text-[13px] text-muted-foreground">
                            {t.source === "audit" ? "Change" : (TIMELINE_KIND_LABELS[t.kind] ?? t.kind)} · {new Date(t.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                            {t.by ? ` · ${t.by}` : ""}
                          </p>
                          {t.detail ? <p className="mt-2 line-clamp-6 rounded-md bg-canvas px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line text-foreground/80">{t.detail}</p> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing yet" description="Applications, stage changes, documents, emails and notes appear here." />
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------- pipelines

async function PipelinesTab({ id, pipes, user }: { id: string; pipes: PipelineRow[]; user: CurrentUser }) {
  const db = await getDb();
  const manage = can(user.role, "applications.manage");
  const [jobs, owners, tracks] = manage ? await Promise.all([jobOptions(db), ownerOptions(db), trackOptions(db)]) : [[], [], []];
  const on = new Set(pipes.map((p) => p.jobId));
  const addable = jobs.filter((j) => !on.has(j.id) && j.status !== "closed");
  const back = `/admin/experts/${id}?tab=pipelines`;
  return (
    <Stack>
      {manage ? (
        <Section title="Add to a job" description="They start at Applied (or Shortlisted). Do-not-contact people are never added.">
          {addable.length ? (
            <form action={addExpertsToJob} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="ids" value={id} />
              <input type="hidden" name="returnTo" value={back} />
              <Field label="Job" htmlFor="jobId" className="min-w-64 flex-1">
                <Select id="jobId" name="jobId" defaultValue="" options={addable.map((j) => ({ value: j.id, label: `${j.projectCode ? `${j.projectCode} · ` : ""}${j.title}${j.visibility === "internal" ? " (internal)" : ""}${j.status === "open" ? "" : ` · ${label(j.status)}`}` }))} placeholder="Pick a job" />
              </Field>
              <Field label="Starting stage" htmlFor="startStage">
                <Select id="startStage" name="startStage" defaultValue="new" options={[{ value: "new", label: "Applied" }, { value: "shortlisted", label: "Shortlisted" }]} />
              </Field>
              <SubmitButton size="md" variant="secondary" pendingText="Adding…">
                Add to job
              </SubmitButton>
            </form>
          ) : (
            <EmptyState padded={false} title="They're already on every job" />
          )}
        </Section>
      ) : null}
      {pipes.length ? (
        pipes.map((p) => (
          <Section
            key={p.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/jobs/${p.jobId}?tab=applicants&app=${p.id}`} className="hover:text-primary">
                  {p.projectCode ? `${p.projectCode} · ` : ""}
                  {p.jobTitle}
                </Link>
                {p.jobVisibility === "internal" ? <span className="text-[13px] font-normal text-muted-foreground">(internal)</span> : null}
              </span>
            }
            description={`${p.channel === "applied" ? "Applied" : "Added by us"} ${fmtDate(p.createdAt)}${p.channel === "applied" || p.channel === "manual" ? "" : ` · ${APPLICATION_CHANNEL_LABELS[p.channel] ?? p.channel}`} · in this stage since ${fmtDate(p.stageChangedAt)}${p.consentAt ? ` · consent ${fmtDate(p.consentAt)}` : " · no consent on file: ask before sharing"}`}
          >
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <StageBar stage={p.stage} className="w-56" />
                {manage ? <StageForm action={movePipelineStage} id={p.id} stage={p.stage} rejectReason={p.rejectReason} returnTo={back} /> : null}
                {p.stage === "rejected" && p.rejectReason ? <span className="text-small text-muted-foreground">Why: {REJECT_REASON_LABELS[p.rejectReason as keyof typeof REJECT_REASON_LABELS] ?? p.rejectReason}</span> : null}
              </div>
              {manage ? (
                <form action={savePipeline} className="space-y-4">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="currentStage" value={p.stage} />
                  <input type="hidden" name="returnTo" value={back} />
                  <FieldRow>
                    <Field label="Owner" htmlFor={`owner-${p.id}`}>
                      <Select id={`owner-${p.id}`} name="ownerTeamMemberId" defaultValue={p.ownerTeamMemberId ?? ""} options={owners.filter((o) => o.active || o.id === p.ownerTeamMemberId).map((o) => ({ value: o.id, label: o.name }))} placeholder="No owner" />
                    </Field>
                    <Field label="Track" htmlFor={`track-${p.id}`} hint={p.projectId ? undefined : "The job has no project, so no tracks."}>
                      <Select id={`track-${p.id}`} name="trackId" defaultValue={p.trackId ?? ""} options={tracks.filter((t) => t.projectId === p.projectId).map((t) => ({ value: t.id, label: t.name }))} placeholder="No track" disabled={!p.projectId} />
                    </Field>
                  </FieldRow>
                  <FieldRow>
                    <Field label="Next action" htmlFor={`next-${p.id}`}>
                      <Input id={`next-${p.id}`} name="nextAction" defaultValue={p.nextAction ?? ""} placeholder="Send the trial task" maxLength={300} />
                    </Field>
                    <Field label="Due" htmlFor={`due-${p.id}`}>
                      <Input id={`due-${p.id}`} name="nextActionDue" type="date" defaultValue={p.nextActionDue ?? ""} />
                    </Field>
                  </FieldRow>
                  {["selected", "documents", "signed", "active", "ended"].includes(p.stage) ? (
                    <FieldRow>
                      <Field label="Contract starts" htmlFor={`start-${p.id}`}>
                        <Input id={`start-${p.id}`} name="startedOn" type="date" defaultValue={p.startedOn ?? ""} />
                      </Field>
                      <Field label="Contract ends" htmlFor={`end-${p.id}`} hint="Can't be before the start.">
                        <Input id={`end-${p.id}`} name="endedOn" type="date" defaultValue={p.endedOn ?? ""} />
                      </Field>
                    </FieldRow>
                  ) : null}
                  <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
                    Save
                  </SubmitButton>
                </form>
              ) : (
                <DefinitionList
                  items={[
                    { label: "Owner", value: p.ownerMemberName ?? p.ownerName },
                    { label: "Track", value: p.trackName },
                    { label: "Next action", value: [p.nextAction, p.nextActionDue ? `by ${fmtDate(p.nextActionDue)}` : null].filter(Boolean).join(" ") || null },
                    { label: "Contract", value: p.startedOn ? `${fmtDate(p.startedOn)}${p.endedOn ? ` – ${fmtDate(p.endedOn)}` : " onwards"}` : null },
                  ]}
                />
              )}
            </div>
          </Section>
        ))
      ) : (
        <Section>
          <EmptyState padded={false} title="No job applied for" description={manage ? "Add them to a job above." : "Nobody has added them to a job yet."} />
        </Section>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------- documents

function DocumentsTab({ id, docs, user }: { id: string; docs: Awaited<ReturnType<typeof documentsOf>>; user: CurrentUser }) {
  const manage = can(user.role, "experts.edit");
  const download = can(user.role, "experts.cv_download");
  return (
    <Section title="Documents" description="NDAs, agreements and compliance papers, with where they are. Files come from the agreement script or the FynoLabs admin." flush>
      {docs.length ? (
        <Table>
          <THead>
            <Th>Document</Th>
            <Th>Job</Th>
            <Th>Status</Th>
            <Th>Sent</Th>
            <Th>Signed</Th>
            <Th>Files</Th>
          </THead>
          <TBody>
            {docs.map((d) => (
              <Tr key={d.id} className={d.status === "void" ? "opacity-60" : undefined}>
                <Td>
                  <div className="font-medium text-foreground">{d.title}</div>
                  <div className="text-[13px] text-muted-foreground">{DOCUMENT_KIND_LABELS[d.kind as keyof typeof DOCUMENT_KIND_LABELS] ?? d.kind}</div>
                </Td>
                <Td className="text-muted-foreground">{d.jobTitle ?? "Not tied to a job"}</Td>
                <Td>
                  {manage ? (
                    <form action={changeDocumentStatus}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="returnTo" value={`/admin/experts/${id}?tab=documents`} />
                      <AutoSubmitSelect name="status" defaultValue={d.status} className="control h-8 w-auto text-small" aria-label={`Status of ${d.title}`}>
                        {DOCUMENT_STATUSES.map((s) => (
                          <option key={s} value={s} disabled={d.status === "signed" && s !== "void" && s !== "signed"}>
                            {DOCUMENT_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                    </form>
                  ) : (
                    <MapBadge value={d.status} labels={DOCUMENT_STATUS_LABELS} tones={DOCUMENT_STATUS_TONE} />
                  )}
                </Td>
                <Td className="whitespace-nowrap">{fmtDate(d.sentAt)}</Td>
                <Td className="whitespace-nowrap">{fmtDate(d.signedAt)}</Td>
                <Td className="text-small">
                  {download && d.fileId ? (
                    <a href={`/api/files/${d.fileId}`} className="text-primary hover:underline">
                      Open
                    </a>
                  ) : null}
                  {download && d.signedFileId ? (
                    <a href={`/api/files/${d.signedFileId}`} className="ml-3 text-primary hover:underline">
                      Signed copy
                    </a>
                  ) : null}
                  {!d.fileId && !d.signedFileId ? <span className="text-muted-foreground/70">–</span> : null}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState title="No documents yet" description="Add the NDA and agreement, then send them for signing." />
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- referrals

function ReferralsTab({ id, refs, user }: { id: string; refs: Awaited<ReturnType<typeof referralsOf>>; user: CurrentUser }) {
  const manage = can(user.role, "referrals.manage") && canOpenSection(user, "send-referrals");
  return (
    <Section
      title="Referrals"
      description="Where they were sent (platforms, projects, partners), how, and what came of it."
      flush
      actions={
        manage && canOpenSection(user, "send-referrals") ? (
          <ButtonLink href={`/admin/send-referrals?ids=${id}`} size="sm" variant="secondary">
            <Send className="h-3.5 w-3.5" /> Refer them
          </ButtonLink>
        ) : null
      }
    >
      {refs.length ? (
        <Table>
          <THead>
            <Th>Platform</Th>
            <Th>How</Th>
            <Th>Outcome</Th>
            <Th>Sent</Th>
            <Th className="text-right">Opens / clicks</Th>
            <Th>By</Th>
          </THead>
          <TBody>
            {refs.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <div className="font-medium text-foreground">{r.platform}</div>
                  {r.projectCode ? <div className="text-[13px] text-muted-foreground">{r.projectCode}</div> : null}
                </Td>
                <Td>{REFERRAL_METHOD_LABELS[r.method as keyof typeof REFERRAL_METHOD_LABELS] ?? r.method}</Td>
                <Td>
                  {manage ? (
                    <form action={changeReferralOutcome}>
                      <input type="hidden" name="ids" value={r.id} />
                      <input type="hidden" name="returnTo" value={`/admin/experts/${id}?tab=referrals`} />
                      <AutoSubmitSelect name="outcome" defaultValue={r.outcome} className="control h-8 w-auto text-small" aria-label="Outcome">
                        {REFERRAL_OUTCOMES.map((o) => (
                          <option key={o} value={o}>
                            {REFERRAL_OUTCOME_LABELS[o]}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                    </form>
                  ) : (
                    <MapBadge value={r.outcome} labels={REFERRAL_OUTCOME_LABELS} tones={REFERRAL_OUTCOME_TONE} />
                  )}
                </Td>
                <Td className="whitespace-nowrap">{fmtDate(r.sentAt)}</Td>
                <Td className="tabular text-right">
                  {r.openCount} / {r.clickCount}
                </Td>
                <Td className="text-[13px] text-muted-foreground">{r.submittedBy ?? "–"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState title="No referrals yet" description="Send them a platform's referral link, or share their profile (with consent) from Send referrals." />
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- engagements and earnings

async function EarningsTab({ id, user }: { id: string; user: CurrentUser }) {
  const db = await getDb();
  const money = canSeeMoney(user.role);
  const [engs, earnings] = await Promise.all([engagementsOf(db, id, user.role), earningsOf(db, id, user.role)]);
  return (
    <Stack>
      <Section title="Engagements" description="Where they work through a platform or agency." flush>
        {engs.length ? (
          <Table>
            <THead>
              <Th>Platform</Th>
              <Th>Agency</Th>
              <Th>Project</Th>
              <Th>Status</Th>
              <Th>Started</Th>
              <Th>Ended</Th>
              {money ? <Th className="text-right">Commission</Th> : null}
            </THead>
            <TBody>
              {engs.map((g) => (
                <Tr key={g.id}>
                  <Td className="font-medium text-foreground">{g.platform}</Td>
                  <Td>{g.agency ?? "–"}</Td>
                  <Td>{g.project ?? "–"}</Td>
                  <Td>
                    <StatusBadge value={g.status} />
                  </Td>
                  <Td>{fmtDate(g.startedOn)}</Td>
                  <Td>{fmtDate(g.endedOn)}</Td>
                  {money ? <Td className="tabular text-right">{g.commissionPercent != null ? `${g.commissionPercent}%` : "–"}</Td> : null}
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="No engagements" />
        )}
      </Section>
      <Section title="Monthly earnings" description="Money: only admins and finance see this. What they earned per month (INR) and our commission." flush>
        {!money ? (
          <EmptyState title="Earnings are for admins and finance" description="Your role doesn't see money." />
        ) : earnings.length ? (
          <Table>
            <THead>
              <Th>Month</Th>
              <Th>Platform</Th>
              <Th>Project</Th>
              <Th className="text-right">Gross (INR)</Th>
              <Th className="text-right">Commission (INR)</Th>
            </THead>
            <TBody>
              {earnings.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.month.slice(0, 7)}</Td>
                  <Td>{r.platform}</Td>
                  <Td>{r.project ?? "–"}</Td>
                  <Td className="tabular text-right">{Number(r.grossInr).toLocaleString("en-IN")}</Td>
                  <Td className="tabular text-right">
                    {Number(r.commissionInr).toLocaleString("en-IN")}
                    {r.commissionPercent != null ? <span className="text-[13px] text-muted-foreground"> ({r.commissionPercent}%)</span> : null}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="No earnings recorded" />
        )}
      </Section>
    </Stack>
  );
}

// ---------------------------------------------------------------- applications and sources

async function ApplicationsTab({ e, apps }: { e: ExpertRow; apps: Awaited<ReturnType<typeof applicationsOf>> }) {
  const db = await getDb();
  const [sources, jobsSite, portal] = await Promise.all([sourcesFor(db, e.id), jobsApplicationsFor(db, e.id), db.select({ joined: experts.portalJoinedAt }).from(experts).where(eq(experts.id, e.id)).limit(1)]);
  const joined = portal[0]?.joined ?? null;
  return (
    <Stack>
      <Section title="Job applications" description={joined ? `Has an expert portal account (since ${fmtDate(joined)}).` : "No expert portal account yet."} flush>
        {apps.length ? (
          <Table>
            <THead>
              <Th>Job</Th>
              <Th>Pipeline stage</Th>
              <Th>Status</Th>
              <Th>Next action</Th>
              <Th>Applied</Th>
            </THead>
            <TBody>
              {apps.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <Link href={`/admin/jobs/${a.jobId}?tab=applicants&app=${a.id}`} className="font-medium text-foreground hover:text-primary">
                      {a.jobTitle}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <StageBar stage={a.stage} />
                  </Td>
                  <Td>
                    <StatusBadge value={a.status} />
                  </Td>
                  <Td className="text-[13px] text-muted-foreground">{[a.nextAction, a.nextActionDue ? `by ${fmtDate(a.nextActionDue)}` : null].filter(Boolean).join(" ") || "–"}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(a.createdAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="No applications through the job board" />
        )}
      </Section>
      <Section title="Sources" description="Where this record came from. Imports and job forms only fill empty fields; edits made here are kept." flush>
        {sources.length ? (
          <Table>
            <THead>
              <Th>Source</Th>
              <Th>External id</Th>
              <Th>Last synced</Th>
            </THead>
            <TBody>
              {sources.map((s) => (
                <Tr key={s.id}>
                  <Td>{label(s.source)}</Td>
                  <Td className="font-mono text-xs">{s.externalId}</Td>
                  <Td>{fmtDateTime(s.lastSyncedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={Link2} title={`Added by hand (${label(e.primarySource)})`} description="No import has matched this person yet." />
        )}
        {jobsSite.length ? (
          <div className="border-t border-border px-6 py-5">
            <div className="mb-2 text-sm font-medium text-foreground">Jobs-site applications (live, read only)</div>
            <ul className="space-y-1 text-sm">
              {jobsSite.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="text-foreground">{a.title}</span>
                  <span className="text-[13px] text-muted-foreground">{a.status.replace(/_/g, " ")}</span>
                  <span className="text-[13px] text-muted-foreground/70">{fmtDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>
    </Stack>
  );
}

// ---------------------------------------------------------------- submissions and placements

async function WorkTab({
  id,
  subs,
  plcs,
  user,
}: {
  id: string;
  subs: Awaited<ReturnType<typeof listSubmissions>>;
  plcs: Awaited<ReturnType<typeof listPlacements>>;
  user: CurrentUser;
}) {
  const db = await getDb();
  const shortlist = can(user.role, "matching.shortlist");
  const reqs = shortlist ? await listRequirements(db, { status: "active" }) : [];
  const onReqs = new Set(subs.map((s) => s.sub.requirementId));
  const options = reqs.filter((r) => !onReqs.has(r.req.id));
  const money = canSeeMoney(user.role);
  const scoped = user.role === "pod_lead";
  return (
    <Stack>
      {scoped ? <Notice tone="info">Showing submissions and placements for your partners only.</Notice> : null}
      <Section
        title="Submissions"
        flush
        actions={
          options.length ? (
            <form action={addSelectedToRequirement} className="flex items-center gap-2">
              <input type="hidden" name="ids" value={id} />
              <input type="hidden" name="returnTo" value={`/admin/experts/${id}?tab=work`} />
              <Select name="requirementId" defaultValue="" options={options.map((r) => ({ value: r.req.id, label: `${r.req.title} · ${r.partnerName}` }))} placeholder="Add to requirement..." className="w-auto max-w-xs" aria-label="Requirement" />
              <SubmitButton size="sm" variant="secondary">
                Add
              </SubmitButton>
            </form>
          ) : null
        }
      >
        {subs.length ? (
          <Table>
            <THead>
              <Th>Requirement</Th>
              <Th>Partner</Th>
              <Th>Status</Th>
              <Th>Score</Th>
              <Th>Submitted</Th>
              <Th>Partner note</Th>
            </THead>
            <TBody>
              {subs.map((s) => (
                <Tr key={s.sub.id}>
                  <Td>
                    <Link href={`/admin/requirements/${s.sub.requirementId}?tab=submissions`} className="font-medium text-foreground hover:text-primary">
                      {s.reqTitle}
                    </Link>
                  </Td>
                  <Td>{s.partnerName}</Td>
                  <Td>
                    <StatusBadge value={s.sub.status} />
                  </Td>
                  <Td className="tabular">{s.sub.score ?? "–"}</Td>
                  <Td>{fmtDate(s.sub.submittedAt)}</Td>
                  <Td className="max-w-xs text-[13px] text-muted-foreground">{s.sub.partnerNote ?? "–"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="Not on any requirement yet" />
        )}
      </Section>
      <Section
        title="Placements"
        flush
        actions={
          can(user.role, "placements.create") ? (
            <ButtonLink href={`/admin/placements/new?expert=${id}`} size="sm">
              New placement
            </ButtonLink>
          ) : null
        }
      >
        {plcs.length ? (
          <Table>
            <THead>
              <Th>Project</Th>
              <Th>Partner</Th>
              <Th>Status</Th>
              <Th>Start</Th>
              <Th className="text-right">Hours / tasks</Th>
              {money ? <Th className="text-right">Earned by expert</Th> : null}
            </THead>
            <TBody>
              {plcs.map((p) => (
                <Tr key={p.p.id}>
                  <Td>
                    <Link href={`/admin/placements/${p.p.id}`} className="font-medium text-foreground hover:text-primary">
                      {p.p.projectName}
                    </Link>
                  </Td>
                  <Td>{p.partnerName}</Td>
                  <Td>
                    <StatusBadge value={p.p.status} />
                  </Td>
                  <Td>{fmtDate(p.p.startDate)}</Td>
                  <Td className="tabular text-right">{p.p.basis === "per_task" ? `${p.p.tasksAccepted ?? 0} tasks` : `${p.p.hoursApproved ?? 0} h`}</Td>
                  {money ? <Td className="tabular text-right">{formatMoney(computeMoney(p.p).earned, p.p.currency)}</Td> : null}
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="No placements" />
        )}
      </Section>
    </Stack>
  );
}

function EditView({ id, e, user }: { id: string; e: ExpertRow; user: CurrentUser }) {
  const money = canSeeMoney(user.role);
  const initial = valuesFromExpert(money ? e : { ...e, rateExpectationUsd: null });
  return (
    <Stack>
      <Section>
        <ExpertForm id={id} initial={initial} cancelHref={`/admin/experts/${id}`} showRate={money} />
      </Section>
      {can(user.role, "experts.delete") ? (
        <Section title="Delete on request" description="Use when someone asks us to remove their data.">
          <form action={deleteExpert} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <Notice tone="warning">
              Deletes the profile, sources, uploaded CVs, submissions and their activity history. Placement money rows stay, without the person. Only a one-way hash of the email is kept so imports don&apos;t add them back. Also remove them from the jobs site and the admin CRM.
            </Notice>
            <Field label='Type "DELETE" to confirm' htmlFor="confirm">
              <Input id="confirm" name="confirm" autoComplete="off" className="max-w-xs" />
            </Field>
            <Button type="submit" variant="danger" size="sm">
              Delete permanently
            </Button>
          </form>
        </Section>
      ) : null}
    </Stack>
  );
}
