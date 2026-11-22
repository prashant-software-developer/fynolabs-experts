import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Upload } from "lucide-react";
import { getDb } from "@/db/client";
import { label } from "@/lib/constants";
import { one, type SearchParams } from "@/lib/filters";
import { bytes, fmtDate, fmtDateTime } from "@/lib/format";
import { valuesFromExpert } from "@/lib/forms/expert";
import { formatMoney, computeMoney } from "@/lib/money";
import { activityFor } from "@/lib/server/activity";
import { currentCv, filesFor, getExpert, sourcesFor } from "@/lib/server/experts";
import { jobsApplicationsFor } from "@/lib/server/jobs-sync";
import { listPlacements } from "@/lib/server/placements";
import { listRequirements } from "@/lib/server/requirements";
import { listSubmissions } from "@/lib/server/submissions";
import { ActivityList } from "@/components/activity-list";
import { ExpertForm } from "@/components/expert-form";
import { ExpertSummary } from "@/components/expert-summary";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, Notice } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/field";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { addSelectedToRequirement, appendNote, deleteExpert, recordConsent, uploadCv } from "../actions";

export default async function ExpertPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const e = await getExpert(db, id);
  if (!e) notFound();
  const tab = ["edit", "work", "activity"].includes(one(sp.tab)) ? one(sp.tab) : "profile";
  const [subs, plcs] = await Promise.all([listSubmissions(db, { expertId: id }), listPlacements(db, { expertId: id })]);
  const base = `/experts/${id}`;

  return (
    <>
      <PageHeader
        title={e.fullName}
        back={{ href: "/experts", label: "Experts" }}
        actions={
          <>
            <ButtonLink href={`${base}?tab=edit`}>Edit</ButtonLink>
          </>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Tabs
        tabs={[
          { href: base, label: "Profile", active: tab === "profile" },
          { href: `${base}?tab=work`, label: "Submissions & placements", active: tab === "work", count: subs.length + plcs.length },
          { href: `${base}?tab=activity`, label: "Activity", active: tab === "activity" },
          { href: `${base}?tab=edit`, label: "Edit", active: tab === "edit" },
        ]}
      />
      {tab === "profile" ? <ProfileTab id={id} /> : null}
      {tab === "work" ? <WorkTab id={id} subs={subs} plcs={plcs} /> : null}
      {tab === "activity" ? <ActivityTab id={id} /> : null}
      {tab === "edit" ? <EditTab id={id} /> : null}
    </>
  );
}

async function ProfileTab({ id }: { id: string }) {
  const db = await getDb();
  const e = (await getExpert(db, id))!;
  const [files, sources, apps] = await Promise.all([filesFor(db, id), sourcesFor(db, id), jobsApplicationsFor(db, id)]);
  const cv = currentCv(e.cvRef, files);
  return (
    <Stack>
      <Section>
        <ExpertSummary e={e} />
      </Section>

      <Section
        title="CV"
        description={e.cvConsent === "yes" ? `Consent to share recorded${e.cvConsentAt ? ` on ${fmtDate(e.cvConsentAt)}` : ""}.` : "Not shared with partners until the expert says yes."}
        actions={
          <form action={recordConsent} className="flex items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <span className="text-[13px] text-muted-foreground">Consent to share CV:</span>
            <StatusBadge value={e.cvConsent} />
            {e.cvConsent !== "yes" ? (
              <SubmitButton size="sm" variant="secondary" name="consent" value="yes">
                Record yes
              </SubmitButton>
            ) : null}
            {e.cvConsent !== "no" ? (
              <SubmitButton size="sm" variant="ghost" name="consent" value="no">
                Record no
              </SubmitButton>
            ) : null}
          </form>
        }
      >
        <div className="space-y-4">
          {files.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                    <span className="truncate text-foreground">{f.filename}</span>
                    {cv?.id === f.id ? <StatusBadge value="active" prefix="Current ·" /> : null}
                    <span className="text-xs text-muted-foreground/70">
                      {bytes(f.size)} · {f.storage === "jobs_db" ? "from jobs site" : "uploaded"} · {fmtDate(f.createdAt)}
                    </span>
                  </div>
                  <a href={`/api/files/${f.id}`} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary underline-offset-4 hover:underline">
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No CV yet" description="Upload one below, or run the jobs-site sync if they applied there." />
          )}
          <form action={uploadCv} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <input type="file" name="file" accept=".pdf,.doc,.docx,.txt,.rtf" required className="file-control" />
            <SubmitButton size="sm" variant="secondary" pendingText="Uploading...">
              <Upload className="h-3.5 w-3.5" /> Upload CV
            </SubmitButton>
            <span className="text-xs text-muted-foreground/70">PDF or Word, up to 10 MB. Becomes the current CV.</span>
          </form>
        </div>
      </Section>

      <Section title="Notes" description="Internal only. Newest first.">
        <div className="space-y-4">
          <form action={appendNote} className="space-y-2">
            <input type="hidden" name="id" value={id} />
            <Textarea name="note" rows={2} placeholder="Add a note (call summary, next step...)" aria-label="New note" />
            <div className="flex items-center gap-4">
              <SubmitButton size="sm" variant="secondary">
                Add note
              </SubmitButton>
              <Checkbox name="contacted" value="yes" label="We contacted them today" />
            </div>
          </form>
          {e.notes ? <pre className="prose-box">{e.notes}</pre> : null}
          <p className="text-xs text-muted-foreground/70">
            Last contacted: {fmtDate(e.lastContactedAt)} · Added {fmtDate(e.createdAt)} · Updated {fmtDateTime(e.updatedAt)}
          </p>
        </div>
      </Section>

      <Section title="Sources" description="Where this record came from. Imports only fill empty fields; edits made here are kept." flush>
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
          <EmptyState title={`Added by hand (${label(e.primarySource)})`} description="No import has matched this person yet." />
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

async function WorkTab({ id, subs, plcs }: { id: string; subs: Awaited<ReturnType<typeof listSubmissions>>; plcs: Awaited<ReturnType<typeof listPlacements>> }) {
  const db = await getDb();
  const reqs = await listRequirements(db, { status: "active" });
  const onReqs = new Set(subs.map((s) => s.sub.requirementId));
  const options = reqs.filter((r) => !onReqs.has(r.req.id));
  return (
    <Stack>
      <Section
        title="Submissions"
        flush
        actions={
          options.length ? (
            <form action={addSelectedToRequirement} className="flex items-center gap-2">
              <input type="hidden" name="ids" value={id} />
              <input type="hidden" name="returnTo" value={`/experts/${id}?tab=work`} />
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
                    <Link href={`/requirements/${s.sub.requirementId}?tab=submissions`} className="font-medium text-foreground hover:text-primary">
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
      <Section title="Placements" flush actions={<ButtonLink href={`/placements/new?expert=${id}`} size="sm">New placement</ButtonLink>}>
        {plcs.length ? (
          <Table>
            <THead>
              <Th>Project</Th>
              <Th>Partner</Th>
              <Th>Status</Th>
              <Th>Start</Th>
              <Th className="text-right">Earned by expert</Th>
            </THead>
            <TBody>
              {plcs.map((p) => (
                <Tr key={p.p.id}>
                  <Td>
                    <Link href={`/placements/${p.p.id}`} className="font-medium text-foreground hover:text-primary">
                      {p.p.projectName}
                    </Link>
                  </Td>
                  <Td>{p.partnerName}</Td>
                  <Td>
                    <StatusBadge value={p.p.status} />
                  </Td>
                  <Td>{fmtDate(p.p.startDate)}</Td>
                  <Td className="tabular text-right">{formatMoney(computeMoney(p.p).earned, p.p.currency)}</Td>
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

async function EditTab({ id }: { id: string }) {
  const db = await getDb();
  const e = (await getExpert(db, id))!;
  return (
    <Stack>
      <Section>
        <ExpertForm id={id} initial={valuesFromExpert(e)} cancelHref={`/experts/${id}`} />
      </Section>
      <Section title="Delete on request" description="Use when someone asks us to remove their data.">
        <form action={deleteExpert} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <Notice tone="warning">
            Deletes the profile, sources, uploaded CVs, submissions and their activity history. Placement money rows stay, without the person. Only a one-way hash of the email is kept so imports don't add them back. Also remove them from the jobs site and the admin CRM.
          </Notice>
          <Field label='Type "DELETE" to confirm' htmlFor="confirm">
            <Input id="confirm" name="confirm" autoComplete="off" className="max-w-xs" />
          </Field>
          <Button type="submit" variant="danger" size="sm">
            Delete permanently
          </Button>
        </form>
      </Section>
    </Stack>
  );
}
