import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Link2 } from "lucide-react";
import { getDb } from "@/db/client";
import { can, canSeeContact, canSeeMoney, partnerScope, visibleExpert } from "@/lib/auth/permissions";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { CV_CONSENT, label } from "@/lib/constants";
import { one, type SearchParams } from "@/lib/filters";
import { bytes, fmtDate, fmtDateTime } from "@/lib/format";
import { valuesFromExpert } from "@/lib/forms/expert";
import { formatMoney, computeMoney } from "@/lib/money";
import { activityFor } from "@/lib/server/activity";
import { currentCv, filesFor, getExpert, sourcesFor, type ExpertRow } from "@/lib/server/experts";
import { jobsApplicationsFor } from "@/lib/server/jobs-sync";
import { applicationsOf } from "@/lib/server/applications";
import { openDeletionRequest } from "@/lib/server/portal";
import { experts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listPlacements } from "@/lib/server/placements";
import { listRequirements } from "@/lib/server/requirements";
import { listSubmissions } from "@/lib/server/submissions";
import { ActivityList } from "@/components/activity-list";
import { ExpertForm } from "@/components/expert-form";
import { ExpertSummary } from "@/components/expert-summary";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { AutoSubmitSelect, SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, Notice } from "@/components/ui/feedback";
import { FileDrop } from "@/components/ui/file-drop";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/field";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { addSelectedToRequirement, appendNote, deleteExpert, recordConsent, uploadCv } from "../actions";

export default async function ExpertPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const raw = await getExpert(db, id);
  if (!raw) notFound();
  const e = visibleExpert(user.role, raw);
  const canEdit = can(user.role, "experts.edit");
  // One way in to editing: the Edit button. ?tab=edit is the edit form (no separate tab).
  const editing = one(sp.tab) === "edit" && canEdit;
  const tab = ["work", "activity"].includes(one(sp.tab)) ? one(sp.tab) : "profile";
  const scope = partnerScope(user);
  const [subs, plcs] = await Promise.all([listSubmissions(db, { expertId: id, partnerScope: scope }), listPlacements(db, { expertId: id, partnerScope: scope })]);
  const base = `/admin/experts/${id}`;

  return (
    <>
      <PageHeader
        title={e.fullName}
        back={editing ? { href: base, label: "Back to profile" } : { href: "/admin/experts", label: "Experts" }}
        subtitle={editing ? "Editing profile" : undefined}
        actions={
          editing ? (
            <ButtonLink href={base}>Cancel</ButtonLink>
          ) : canEdit ? (
            <ButtonLink href={`${base}?tab=edit`}>Edit</ButtonLink>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      {editing ? (
        <EditView id={id} e={raw} user={user} />
      ) : (
        <>
          <Tabs
            tabs={[
              { href: base, label: "Profile", active: tab === "profile" },
              { href: `${base}?tab=work`, label: "Submissions & placements", active: tab === "work", count: subs.length + plcs.length },
              { href: `${base}?tab=activity`, label: "Activity", active: tab === "activity" },
            ]}
          />
          {tab === "profile" ? <ProfileTab e={e} user={user} /> : null}
          {tab === "work" ? <WorkTab id={id} subs={subs} plcs={plcs} user={user} /> : null}
          {tab === "activity" ? <ActivityTab id={id} /> : null}
        </>
      )}
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
function ConsentControl({ e, canEdit }: { e: ExpertRow; canEdit: boolean }) {
  return (
    <form action={recordConsent} className="flex items-center gap-2">
      <input type="hidden" name="id" value={e.id} />
      <span className="text-[13px] text-muted-foreground">CV consent:</span>
      <StatusBadge value={e.cvConsent} />
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

async function ProfileTab({ e, user }: { e: ExpertRow; user: CurrentUser }) {
  const db = await getDb();
  const [files, sources, apps, hubApps, deletion, portal] = await Promise.all([
    filesFor(db, e.id),
    sourcesFor(db, e.id),
    jobsApplicationsFor(db, e.id),
    applicationsOf(db, e.id),
    openDeletionRequest(db, e.id),
    db.select({ joined: experts.portalJoinedAt }).from(experts).where(eq(experts.id, e.id)).limit(1),
  ]);
  const cv = currentCv(e.cvRef, files.filter((f) => f.kind === "cv"));
  const canDownload = can(user.role, "experts.cv_download");
  const joined = portal[0]?.joined ?? null;
  return (
    <Stack>
      {deletion ? (
        <Notice tone="warning" title="Asked us to delete their data">
          Requested on {fmtDate(deletion.createdAt)} from the expert portal. An admin should delete the profile (Edit → Delete on request) and confirm by email within 30 days.
        </Notice>
      ) : null}
      <Section>
        <ExpertSummary e={e} money={canSeeMoney(user.role)} contact={canSeeContact(user.role)} />
      </Section>

      <Section title="CV" description={consentLine(e)} actions={<ConsentControl e={e} canEdit={can(user.role, "experts.edit")} />}>
        <div className="space-y-4">
          {files.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                    <span className="truncate text-foreground">{f.filename}</span>
                    {cv?.id === f.id ? <StatusBadge value="active" prefix="Current ·" /> : null}
                    {f.kind === "attachment" ? <span className="text-xs text-muted-foreground">attachment</span> : null}
                    <span className="text-xs text-muted-foreground/70">
                      {bytes(f.size)} · {f.storage === "jobs_db" ? "from jobs site" : f.createdBy === "job-form" ? "from a job application" : f.createdBy === "expert-portal" ? "uploaded by the expert" : "uploaded"} · {fmtDate(f.createdAt)}
                    </span>
                  </div>
                  {canDownload ? (
                    <a href={`/api/files/${f.id}`} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary underline-offset-4 hover:underline">
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState padded={false} icon={FileText} title="No CV yet" description={can(user.role, "experts.cv_upload") ? "Upload one below, or run the jobs-site sync if they applied there." : "Nobody has uploaded one."} />
          )}
          {can(user.role, "experts.cv_upload") ? (
            <form action={uploadCv}>
              <input type="hidden" name="id" value={e.id} />
              <FileDrop name="file" accept=".pdf,.doc,.docx,.txt,.rtf" label="Upload CV" hint="PDF or Word, up to 10 MB. Click or drop a file; it becomes the current CV." submitLabel="Upload" />
            </form>
          ) : null}
        </div>
      </Section>

      <Section title="Notes" description="Internal only. Newest first.">
        <div className="space-y-4">
          {can(user.role, "experts.notes") ? (
            <form action={appendNote} className="space-y-2">
              <input type="hidden" name="id" value={e.id} />
              <Textarea name="note" rows={2} placeholder="Add a note (call summary, next step...)" aria-label="New note" />
              <div className="flex items-center gap-4">
                <SubmitButton size="sm" variant="secondary">
                  Add note
                </SubmitButton>
                <Checkbox name="contacted" value="yes" label="We contacted them today" />
              </div>
            </form>
          ) : null}
          {e.notes ? <pre className="prose-box">{e.notes}</pre> : !can(user.role, "experts.notes") ? <EmptyState padded={false} title="No notes" /> : null}
          <p className="text-xs text-muted-foreground/70">
            Last contacted: {fmtDate(e.lastContactedAt)} · Added {fmtDate(e.createdAt)} · Updated {fmtDateTime(e.updatedAt)}
          </p>
        </div>
      </Section>

      <Section title="Job applications" description={joined ? `Has an expert portal account (since ${fmtDate(joined)}).` : "No expert portal account yet."} flush>
        {hubApps.length ? (
          <Table>
            <THead>
              <Th>Job</Th>
              <Th>Status</Th>
              <Th>Applied</Th>
            </THead>
            <TBody>
              {hubApps.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <Link href={`/admin/jobs/${a.jobId}?tab=applicants&app=${a.id}`} className="font-medium text-foreground hover:text-primary">
                      {a.jobTitle}
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge value={a.status} />
                  </Td>
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
        {apps.length ? (
          <div className="border-t border-border px-5 py-4">
            <div className="eyebrow mb-2 text-muted-foreground">Jobs-site applications (live, read only)</div>
            <ul className="space-y-1 text-sm">
              {apps.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="text-foreground">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{a.status.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground/70">{fmtDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>
    </Stack>
  );
}

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
                  <Td className="max-w-xs text-xs text-muted-foreground">{s.sub.partnerNote ?? "–"}</Td>
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

async function ActivityTab({ id }: { id: string }) {
  const db = await getDb();
  const items = await activityFor(db, "expert", id);
  return (
    <Section title="Activity" description="Every change to this record. Values aren't stored here, only what changed.">
      <ActivityList items={items} showEntity={false} />
    </Section>
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
