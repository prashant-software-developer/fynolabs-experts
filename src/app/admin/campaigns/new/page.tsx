import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { PIPELINE_STAGES } from "@/lib/constants";
import { one, type SearchParams } from "@/lib/filters";
import { MERGE_FIELDS, skipSummary, stageLabel } from "@/lib/talent";
import { expertIdsFor, listEmailTemplates, MAX_RECIPIENTS, planRecipients, type RecipientSource } from "@/lib/server/campaigns";
import { jobOptions, projectOptions } from "@/lib/server/pipelines";
import { listGroups } from "@/lib/server/referrals";
import { listViews } from "@/lib/server/views";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess, Notice } from "@/components/ui/feedback";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { SectionBlocked } from "@/components/talent/bits";
import { roleLabel } from "@/lib/auth/permissions";
import { prepareCampaignAction } from "../actions";

export const metadata = { title: "New campaign" };
const SOURCES = [
  { value: "view", label: "A saved view of Experts" },
  { value: "filters", label: "Experts filters (from the Experts page)" },
  { value: "job", label: "Everyone on a job" },
  { value: "project", label: "Everyone on a project's jobs" },
  { value: "group", label: "A group" },
  { value: "experts", label: "People picked on Experts" },
] as const;

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "referrals")) return <SectionBlocked title="New campaign" section="referrals" />;
  if (!can(user.role, "campaigns.manage")) {
    return (
      <>
        <PageHeader title="New campaign" back={{ href: "/admin/campaigns", label: "Send emails" }} />
        <Section flush>
          <NoAccess what="Preparing campaigns" role={roleLabel(user.role)} />
        </Section>
      </>
    );
  }
  const db = await getDb();
  const [views, jobs, projects, groups, templates] = await Promise.all([listViews(db, user), jobOptions(db), projectOptions(db), listGroups(db), listEmailTemplates(db)]);
  const source = SOURCES.some((s) => s.value === one(sp.source)) ? one(sp.source) : one(sp.group) ? "group" : one(sp.ids) ? "experts" : "view";
  const f = { viewId: one(sp.viewId), params: one(sp.params), job: one(sp.sourceJobId), project: one(sp.sourceProjectId), stage: one(sp.stage), group: one(sp.group), ids: one(sp.ids) };
  const src: RecipientSource | null =
    source === "view" && f.viewId
      ? { kind: "view", viewId: f.viewId, viewerEmail: user.email }
      : source === "filters" && f.params
        ? { kind: "filters", params: f.params, viewerEmail: user.email }
        : source === "job" && f.job
          ? { kind: "job", jobId: f.job, stage: f.stage || undefined }
          : source === "project" && f.project
            ? { kind: "project", projectId: f.project, stage: f.stage || undefined }
            : source === "group" && f.group
              ? { kind: "group", groupId: f.group }
              : source === "experts" && f.ids
                ? { kind: "experts", ids: f.ids.split(",") }
                : null;
  const people = src ? await expertIdsFor(db, src) : [];
  const plan = people.length && people.length <= MAX_RECIPIENTS ? await planRecipients(db, people) : [];
  const toSend = plan.filter((p) => !p.block).length;
  const template = templates.find((t) => t.id === one(sp.templateId));
  return (
    <>
      <PageHeader title="New campaign" back={{ href: "/admin/campaigns", label: "Send emails" }} subtitle="Nothing is sent yet: you'll see who's skipped, then approve." />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        <Section title="1. Who" description="Pick the people, then check who gets it. Do-not-contact, unsubscribed and suppressed addresses (and anyone without an email) are always skipped.">
          <form method="get" className="space-y-4">
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Who</legend>
              {SOURCES.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-sm text-foreground/85">
                  <input type="radio" name="source" value={s.value} defaultChecked={source === s.value} className="h-4 w-4" />
                  {s.label}
                </label>
              ))}
            </fieldset>
            <FieldRow>
              <Field label="Saved view" htmlFor="viewId">
                <Select id="viewId" name="viewId" defaultValue={f.viewId} options={views.map((v) => ({ value: v.id, label: `${v.name}${v.shared ? " (shared)" : ""}` }))} placeholder={views.length ? "Pick a view" : "No saved views yet"} />
              </Field>
              <Field label="Group" htmlFor="group">
                <Select id="group" name="group" defaultValue={f.group} options={groups.map((g) => ({ value: g.id, label: `${g.name} · ${g.members}` }))} placeholder="Pick a group" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Job" htmlFor="sourceJobId">
                <Select id="sourceJobId" name="sourceJobId" defaultValue={f.job} options={jobs.map((j) => ({ value: j.id, label: j.title }))} placeholder="Pick a job" />
              </Field>
              <Field label="Project" htmlFor="sourceProjectId">
                <Select id="sourceProjectId" name="sourceProjectId" defaultValue={f.project} options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} placeholder="Pick a project" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Only at this stage (job or project)" htmlFor="stage">
                <Select id="stage" name="stage" defaultValue={f.stage} options={PIPELINE_STAGES.map((s) => ({ value: s, label: stageLabel(s) }))} placeholder="Any stage" />
              </Field>
              <Field label="Experts filters" htmlFor="params" hint="Filled in when you come from Experts; e.g. status=bench&domain=Mathematics.">
                <Input id="params" name="params" defaultValue={f.params} />
              </Field>
            </FieldRow>
            {f.ids ? <input type="hidden" name="ids" value={f.ids} /> : null}
            <Field label="Start from a template" htmlFor="templateId">
              <Select id="templateId" name="templateId" defaultValue={template?.id ?? ""} options={templates.map((t) => ({ value: t.id, label: t.name }))} placeholder="None" />
            </Field>
            <Button type="submit" variant="secondary">
              Check who gets it
            </Button>
          </form>
          {src ? (
            people.length > MAX_RECIPIENTS ? (
              <Notice tone="warning" className="mt-5">
                That&apos;s more than {MAX_RECIPIENTS.toLocaleString("en-US")} people. Narrow it down (a saved view with more filters, a stage).
              </Notice>
            ) : plan.length ? (
              <Notice tone={toSend ? "success" : "warning"} className="mt-5" title={`${toSend} will get it, ${plan.length - toSend} skipped`}>
                {skipSummary(plan.map((p) => p.block)) ?? "Nobody is skipped."}
              </Notice>
            ) : (
              <div className="mt-5">
                <EmptyState padded={false} title="Nobody there" description="That view, job, project or group has no experts." />
              </div>
            )
          ) : null}
        </Section>

        <Section title="2. The email" description={`Merge fields: ${MERGE_FIELDS.map((m) => `{{${m}}}`).join(" ")}. An unsubscribe link is added at the end.`}>
          {src && toSend ? (
            <form action={prepareCampaignAction} className="space-y-4">
              <input type="hidden" name="source" value={source} />
              <input type="hidden" name="viewId" value={f.viewId} />
              <input type="hidden" name="params" value={f.params} />
              <input type="hidden" name="sourceJobId" value={f.job} />
              <input type="hidden" name="sourceProjectId" value={f.project} />
              <input type="hidden" name="stage" value={f.stage} />
              <input type="hidden" name="groupId" value={f.group} />
              <input type="hidden" name="expertIds" value={f.ids} />
              <input type="hidden" name="templateId" value={template?.id ?? ""} />
              <input type="hidden" name="returnTo" value={`/admin/campaigns/new?${new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "ok" && k !== "error" ? [[k, v]] : []))).toString()}`} />
              <FieldRow>
                <Field label="Name (only we see it)" htmlFor="name">
                  <Input id="name" name="name" defaultValue={template?.name ?? ""} placeholder="US engineers, round 1" maxLength={120} />
                </Field>
                <Field label="Type" htmlFor="kind" hint="Outreach marks prospects contacted and can follow up; an update is news to people we work with.">
                  <Select id="kind" name="kind" defaultValue={template?.kind === "update" ? "update" : "outreach"} options={[{ value: "outreach", label: "Outreach" }, { value: "update", label: "Update" }]} />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Role" htmlFor="jobId" hint="Fills {{job_title}} and links replies to the role.">
                  <Select id="jobId" name="jobId" defaultValue={f.job} options={jobs.filter((j) => j.status === "open" || j.status === "paused").map((j) => ({ value: j.id, label: j.title }))} placeholder="No role" />
                </Field>
                <Field label="Project" htmlFor="projectId" hint="Fills {{project}} and {{referral_link}}.">
                  <Select id="projectId" name="projectId" defaultValue={f.project || template?.projectId || ""} options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} placeholder="No project" />
                </Field>
              </FieldRow>
              <Field label="Subject" htmlFor="subject">
                <Input id="subject" name="subject" defaultValue={template?.subject ?? ""} maxLength={200} required />
              </Field>
              <Field label="Message" htmlFor="body">
                <Textarea id="body" name="body" rows={10} defaultValue={template?.body ?? ""} maxLength={10000} required />
              </Field>
              <div className="space-y-3 rounded-md border border-border p-4">
                <Checkbox name="followUp" value="yes" label="Follow up if they don't answer (outreach only)" />
                <FieldRow>
                  <Field label="Follow-up subject" htmlFor="followUpSubject" hint="Empty uses “Re:” and the first subject.">
                    <Input id="followUpSubject" name="followUpSubject" maxLength={200} />
                  </Field>
                  <Field label="After (days)" htmlFor="followUpAfterDays">
                    <Input id="followUpAfterDays" name="followUpAfterDays" type="number" min={1} max={30} defaultValue={4} />
                  </Field>
                </FieldRow>
                <Field label="Follow-up message" htmlFor="followUpBody">
                  <Textarea id="followUpBody" name="followUpBody" rows={4} maxLength={10000} />
                </Field>
              </div>
              <SubmitButton pendingText="Preparing...">Prepare draft</SubmitButton>
            </form>
          ) : (
            <EmptyState padded={false} title="Pick who it goes to first" description="Then check who gets it; the email form opens when at least one person can get it." />
          )}
        </Section>
      </Stack>
    </>
  );
}
