// The tabs of a job's admin page: Details, Form (builder), Applicants, Matches, Share.
import Link from "next/link";
import { ArrowDown, ArrowUp, Copy, Download, ExternalLink, FileText, Hash, Mail, MessageCircle, Share2, Trash2 } from "lucide-react";
import { getDb } from "@/db/client";
import type { Job } from "@/db/schema";
import { can, canSeeContact, canSeeMoney, maskEmail, maskPhone } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { APPLICATION_STATUSES, JOB_VISIBILITY, label } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  answerText,
  checkFormDefinition,
  FIELD_TYPE_INFO,
  FIELD_TYPES,
  PROFILE_KEY_INFO,
  PROFILE_KEYS,
  type Answer,
  type FieldDef,
  type FileAnswer,
} from "@/lib/forms/job-fields";
import { placeLabel } from "@/lib/match/dictionary";
import { WEIGHTS } from "@/lib/match/score";
import { activityFor } from "@/lib/server/activity";
import { applicationMoney, getApplicant, listApplicants, sortedAnswers } from "@/lib/server/applications";
import { emailConfigured } from "@/lib/server/email";
import { jobCandidates, listTemplates, publishProblems } from "@/lib/server/jobs";
import { listPartners, listRequirements } from "@/lib/server/requirements";
import { inviteToken } from "@/lib/server/tokens";
import { siteUrl, utmLink } from "@/lib/site";
import { ActivityList } from "@/components/activity-list";
import { PostingSection } from "./posting";
import { ApplyForm } from "@/components/jobs/apply-form";
import { JobForm } from "@/components/jobs/job-form";
import { ReasonChips, ScoreBar } from "@/components/match-bits";
import { Badge, Chips, StatusBadge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { AutoSubmitSelect, SelectAll, SubmitButton } from "@/components/ui/client";
import { cn } from "@/components/ui/cn";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { DefinitionList, Section, Stack } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { applyFormTemplate, changeFormField, inviteToJob, saveApplicantNote, saveFormTemplate, setApplicantsStatus, setJobSharing, shortlistFromJob } from "../actions";

const jobValues = (job: Job) => ({
  title: job.title,
  publicCompanyLabel: job.publicCompanyLabel,
  partnerId: job.partnerId ?? "",
  requirementId: job.requirementId ?? "",
  summary: job.summary ?? "",
  description: job.description ?? "",
  location: job.location ?? "",
  employmentType: job.employmentType,
  domains: [...job.domains],
  skills: job.skills.join(", "),
  countriesAllowed: job.countriesAllowed.join(", "),
  countriesBlocked: job.countriesBlocked.join(", "),
  minYears: job.minYears != null ? String(job.minYears) : "",
  openings: String(job.openings),
  closesOn: job.closesOn ?? "",
  visibility: job.visibility,
  featured: job.featured ? "yes" : "",
  internalRateNote: job.internalRateNote ?? "",
});

// ---------- Details ----------

export async function DetailsTab({ job, user, partnerName, requirementTitle }: { job: Job; user: CurrentUser; partnerName: string | null; requirementTitle: string | null }) {
  const db = await getDb();
  const activity = await activityFor(db, "job", job.id, 40);
  const money = can(user.role, "jobs.rate_note");
  if (can(user.role, "jobs.manage")) {
    const [partners, reqs] = await Promise.all([listPartners(db), listRequirements(db)]);
    return (
      <Stack>
        <Section>
          <JobForm
            id={job.id}
            initial={jobValues(job)}
            partners={partners.map((p) => ({ id: p.id, name: p.name }))}
            requirements={reqs.map((r) => ({ id: r.req.id, label: `${r.req.title} · ${r.partnerName}` }))}
            cancelHref={`/admin/jobs/${job.id}`}
            canSeeRateNote={money}
          />
        </Section>
        <PostingSection jobId={job.id} user={user} />
        <Section title="Activity">
          <ActivityList items={activity} showEntity={false} />
        </Section>
      </Stack>
    );
  }
  return (
    <Stack>
      <Section title="Job details" description="Read only for your role.">
        <DefinitionList
          items={[
            { label: "Company label (public)", value: job.publicCompanyLabel },
            { label: "Location", value: job.location },
            { label: "Type", value: label(job.employmentType) },
            { label: "Openings", value: job.openings },
            { label: "Skills", value: job.skills.length ? <Chips items={job.skills} max={30} /> : null },
            { label: "Fields", value: job.domains.join(", ") || null },
            { label: "Open to", value: job.countriesAllowed.map(placeLabel).join(", ") || "Anywhere" },
            { label: "Not open in", value: job.countriesBlocked.map(placeLabel).join(", ") || "None" },
            { label: "Minimum years", value: job.minYears },
            { label: "Closes on", value: fmtDate(job.closesOn) },
            { label: "Partner (internal)", value: partnerName },
            { label: "Requirement (internal)", value: requirementTitle },
            ...(money ? [{ label: "Internal rate note", value: job.internalRateNote }] : []),
          ]}
        />
        {job.summary ? <p className="mt-6 text-sm text-foreground/80">{job.summary}</p> : null}
        {job.description ? <pre className="prose-box mt-4">{job.description}</pre> : null}
      </Section>
      <PostingSection jobId={job.id} user={user} />
      <Section title="Activity">
        <ActivityList items={activity} showEntity={false} />
      </Section>
    </Stack>
  );
}

// ---------- Form builder ----------

const CHOICE_TYPES = FIELD_TYPES.filter((t) => FIELD_TYPE_INFO[t].choices);

function FieldCard({ f, i, last, jobId, open, manage }: { f: FieldDef; i: number; last: boolean; jobId: string; open: boolean; manage: boolean }) {
  const protectedField = f.mapsTo === "email" || f.mapsTo === "full_name";
  const compatible = PROFILE_KEYS.filter((k) => PROFILE_KEY_INFO[k].types.includes(f.type));
  const iconBtn = "h-8 w-8 px-0 text-muted-foreground hover:text-foreground";
  return (
    <li id={`q-${f.id}`} className={cn("scroll-mt-24 rounded-md border bg-card", open ? "border-primary/50" : "border-border")}>
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="tabular mt-0.5 w-6 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={f.type === "section" ? "progress" : "muted"}>{FIELD_TYPE_INFO[f.type].label}</Badge>
            {f.required ? <Badge tone="warning">Required</Badge> : null}
            {f.mapsTo ? <Badge tone="info">Fills: {PROFILE_KEY_INFO[f.mapsTo].label}</Badge> : null}
          </div>
          <p className={cn("text-sm text-foreground", f.type === "section" && "font-medium", f.type === "consent" && "line-clamp-2 text-foreground/80")}>{f.label}</p>
          {f.helpText ? <p className="line-clamp-2 text-xs text-muted-foreground">{f.helpText}</p> : null}
          {f.options?.choices?.length ? <p className="text-xs text-muted-foreground">Choices: {f.options.choices.join(" · ")}</p> : null}
        </div>
        {manage ? (
          <form action={changeFormField} className="flex shrink-0 items-center">
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="fieldId" value={f.id} />
            <SubmitButton name="op" value="up" variant="ghost" size="sm" className={iconBtn} disabled={i === 0} aria-label={`Move question ${i + 1} up`} title="Move up">
              <ArrowUp className="h-4 w-4" />
            </SubmitButton>
            <SubmitButton name="op" value="down" variant="ghost" size="sm" className={iconBtn} disabled={last} aria-label={`Move question ${i + 1} down`} title="Move down">
              <ArrowDown className="h-4 w-4" />
            </SubmitButton>
            <SubmitButton name="op" value="duplicate" variant="ghost" size="sm" className={iconBtn} aria-label={`Duplicate question ${i + 1}`} title="Duplicate">
              <Copy className="h-4 w-4" />
            </SubmitButton>
            <SubmitButton
              name="op"
              value="delete"
              variant="ghost"
              size="sm"
              className={cn(iconBtn, "hover:text-danger")}
              disabled={protectedField}
              confirm={`Delete "${f.label.slice(0, 60)}"? Answers already given stay on the applications.`}
              aria-label={`Delete question ${i + 1}`}
              title={protectedField ? "Every application needs a name and an email" : "Delete"}
            >
              <Trash2 className="h-4 w-4" />
            </SubmitButton>
          </form>
        ) : null}
      </div>
      {manage ? (
        <details open={open} className="group border-t border-border">
          <summary className="cursor-pointer list-none px-4 py-2 text-[13px] font-medium text-primary [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Edit question</span>
            <span className="hidden group-open:inline">Editing</span>
          </summary>
          <form action={changeFormField} className="space-y-4 px-4 pt-1 pb-4">
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="fieldId" value={f.id} />
            <input type="hidden" name="op" value="update" />
            <FieldRow>
              <Field label="Question type" htmlFor={`t-${f.id}`} hint={protectedField ? "Fills a field every application needs." : undefined}>
                <Select id={`t-${f.id}`} name="type" defaultValue={f.type} disabled={protectedField} options={FIELD_TYPES.map((t) => ({ value: t, label: FIELD_TYPE_INFO[t].label }))} />
              </Field>
              <Field label="Fills on the expert profile" htmlFor={`m-${f.id}`} hint="Answers fill empty profile fields only; team edits are kept.">
                <Select id={`m-${f.id}`} name="mapsTo" defaultValue={f.mapsTo ?? ""} options={compatible.map((k) => ({ value: k, label: PROFILE_KEY_INFO[k].label }))} placeholder="Nothing (answer stays on the application)" />
              </Field>
            </FieldRow>
            {protectedField ? <input type="hidden" name="type" value={f.type} /> : null}
            <Field label={f.type === "consent" ? "Consent text" : f.type === "section" ? "Heading" : "Question"} htmlFor={`l-${f.id}`}>
              {f.type === "consent" || f.type === "section" ? <Textarea id={`l-${f.id}`} name="label" rows={3} defaultValue={f.label} /> : <Input id={`l-${f.id}`} name="label" defaultValue={f.label} />}
            </Field>
            <Field label={f.type === "section" ? "Text under the heading" : "Help text"} htmlFor={`h-${f.id}`}>
              <Input id={`h-${f.id}`} name="helpText" defaultValue={f.helpText ?? ""} />
            </Field>
            {(CHOICE_TYPES as readonly string[]).includes(f.type) ? (
              <Field label="Choices" htmlFor={`c-${f.id}`} hint="One per line.">
                <Textarea id={`c-${f.id}`} name="choices" rows={Math.min(8, Math.max(3, f.options?.choices?.length ?? 3))} defaultValue={(f.options?.choices ?? []).join("\n")} />
              </Field>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {f.type !== "section" ? <Checkbox name="required" value="yes" defaultChecked={f.required} disabled={protectedField} label="Required" /> : <span />}
              {protectedField ? <input type="hidden" name="required" value="yes" /> : null}
              <SubmitButton size="sm" pendingText="Saving...">
                Save question
              </SubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </li>
  );
}

export async function FormTab({ job, user, fields, sp }: { job: Job; user: CurrentUser; fields: FieldDef[]; sp: SearchParams }) {
  const manage = can(user.role, "jobs.manage");
  const view = manage && one(sp.view) !== "preview" ? "edit" : "preview";
  const problems = checkFormDefinition(fields);
  const db = await getDb();
  const templates = manage ? await listTemplates(db, user.email) : [];
  const base = `/admin/jobs/${job.id}?tab=form`;
  return (
    <Stack>
      {problems.length ? (
        <Notice tone="warning" title="Fix this before the job can open">
          <ul className="list-inside list-disc">
            {problems.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {manage ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-input p-0.5" role="group" aria-label="Form view">
            {[
              { id: "edit", label: "Edit questions", href: base },
              { id: "preview", label: "Preview", href: `${base}&view=preview` },
            ].map((t) => (
              <Link key={t.id} href={t.href} aria-current={view === t.id ? "page" : undefined} className={cn("inline-flex h-7 items-center rounded-[3px] px-3 text-[13px] transition-colors", view === t.id ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
              </Link>
            ))}
          </div>
          <p className="text-[13px] text-muted-foreground">Answers are saved on each application. Questions that fill a profile field also update the expert record.</p>
        </div>
      ) : null}
      {view === "edit" ? (
        <>
          <ol className="space-y-2.5">
            {fields.map((f, i) => (
              <FieldCard key={f.id} f={f} i={i} last={i === fields.length - 1} jobId={job.id} open={one(sp.field) === f.id} manage={manage} />
            ))}
          </ol>
          {!fields.length ? <EmptyState title="No questions yet" description="Add one below, or start from the standard form." /> : null}
          <Section title="Add a question">
            <form action={changeFormField} className="grid gap-3 sm:grid-cols-[14rem_1fr_auto]">
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="op" value="add" />
              <Select name="type" defaultValue="short_text" options={FIELD_TYPES.map((t) => ({ value: t, label: `${FIELD_TYPE_INFO[t].label} · ${FIELD_TYPE_INFO[t].hint}` }))} aria-label="Question type" />
              <Input name="label" placeholder="Question, e.g. Which area are you strongest in?" aria-label="Question" maxLength={200} />
              <SubmitButton variant="secondary" pendingText="Adding...">
                Add
              </SubmitButton>
            </form>
          </Section>
          <Section title="Templates" description="Reuse a form across jobs.">
            <div className="space-y-5">
              <form action={saveFormTemplate} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="jobId" value={job.id} />
                <Input name="name" placeholder="Template name, e.g. Coding experts" aria-label="Template name" maxLength={80} className="w-auto min-w-64 flex-1" required />
                <Checkbox name="shared" value="yes" defaultChecked label="Share with the team" />
                <SubmitButton size="sm" variant="secondary">
                  Save as template
                </SubmitButton>
              </form>
              <form action={applyFormTemplate} className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
                <input type="hidden" name="jobId" value={job.id} />
                <Select
                  name="templateId"
                  defaultValue="default"
                  options={[{ value: "default", label: "Standard application form" }, ...templates.map((t) => ({ value: t.id, label: `${t.name}${t.shared ? "" : " (personal)"}` }))]}
                  aria-label="Template"
                  className="w-auto min-w-64 flex-1"
                />
                <SubmitButton size="sm" variant="ghost" confirm="Replace this job's questions with the template? Answers already given stay on the applications.">
                  Start from template
                </SubmitButton>
              </form>
            </div>
          </Section>
        </>
      ) : (
        <Section title="Preview" description="Exactly what applicants see on the job page. Nothing is sent from here.">
          <ApplyForm slug={job.slug} fields={fields} preview />
        </Section>
      )}
    </Stack>
  );
}

// ---------- Applicants ----------

const KEY_TYPES = new Set(["single_select", "yes_no", "number", "years", "multi_select", "checkboxes", "short_text", "date"]);

const fileOf = (fields: FieldDef[], answers: Record<string, Answer>): FileAnswer | null => {
  const f = fields.find((x) => x.type === "file" && x.mapsTo === "cv") ?? fields.find((x) => x.type === "file");
  const a = f ? answers[f.id] : null;
  return a && typeof a === "object" && !Array.isArray(a) ? (a as FileAnswer) : null;
};

export async function ApplicantsTab({ job, user, fields, sp, counts }: { job: Job; user: CurrentUser; fields: FieldDef[]; sp: SearchParams; counts: Record<string, number> }) {
  const db = await getDb();
  const status = one(sp.status);
  const rows = await listApplicants(db, job.id, { status });
  const manage = can(user.role, "applications.manage");
  const contact = canSeeContact(user.role);
  const canCv = can(user.role, "experts.cv_download");
  const keyFields = fields.filter((f) => !f.mapsTo && KEY_TYPES.has(f.type)).slice(0, 2);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const base = `/admin/jobs/${job.id}`;
  const here = hrefWith(base, sp, { tab: "applicants", ok: null, error: null, app: null });
  const openId = one(sp.app);
  const open = openId ? await getApplicant(db, openId) : null;
  const panel = open && open.app.jobId === job.id ? open : null;
  return (
    <Stack>
      <nav className="flex flex-wrap gap-1.5" aria-label="Filter by status">
        {[{ id: "", label: "All", n: total }, ...APPLICATION_STATUSES.map((s) => ({ id: s, label: label(s), n: counts[s] ?? 0 }))].map((t) => (
          <Link
            key={t.id}
            href={hrefWith(base, sp, { tab: "applicants", status: t.id || null, app: null, ok: null, error: null })}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors", status === t.id ? "border-foreground bg-foreground text-background" : "border-border text-foreground/75 hover:bg-secondary")}
          >
            {t.label}
            <span className="tabular text-xs opacity-70">{t.n}</span>
          </Link>
        ))}
      </nav>
      <Section flush>
        <form id="bulk-apps" action={setApplicantsStatus}>
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="returnTo" value={here} />
        </form>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          {manage && rows.length ? (
            <>
              <span className="text-[13px] text-muted-foreground">Ticked:</span>
              <Select form="bulk-apps" name="status" defaultValue="" options={APPLICATION_STATUSES.map((s) => ({ value: s, label: label(s) }))} placeholder="Set status to..." className="h-8 w-auto text-[13px]" aria-label="New status" />
              <SubmitButton form="bulk-apps" size="sm" variant="secondary" pendingText="Saving...">
                Apply
              </SubmitButton>
            </>
          ) : (
            <span className="text-[13px] text-muted-foreground">{rows.length} shown</span>
          )}
          {can(user.role, "applications.export") && rows.length ? (
            <ButtonLink href={`/api/jobs/${job.id}/applicants${status ? `?status=${status}` : ""}`} size="sm" variant="secondary" className="ml-auto">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </ButtonLink>
          ) : null}
        </div>
        {rows.length ? (
          <Table dense>
            <THead>
              {manage ? (
                <Th className="w-8">
                  <SelectAll form="bulk-apps" />
                </Th>
              ) : null}
              <Th>Applicant</Th>
              <Th>Country</Th>
              <Th>Years</Th>
              {keyFields.map((f) => (
                <Th key={f.id} className="max-w-36 truncate" title={f.label}>
                  {f.label.length > 18 ? `${f.label.slice(0, 16)}…` : f.label}
                </Th>
              ))}
              <Th>CV</Th>
              <Th>Status</Th>
              <Th>Applied</Th>
            </THead>
            <TBody>
              {rows.map((r) => {
                const answers = r.app.answers as Record<string, Answer>;
                const cv = fileOf(fields, answers);
                const src = r.app.source;
                return (
                  <Tr key={r.app.id} className={panel?.app.id === r.app.id ? "bg-secondary/60" : undefined}>
                    {manage ? (
                      <Td>
                        <input form="bulk-apps" type="checkbox" name="ids" value={r.app.id} aria-label={`Select ${r.expertName}`} className="h-4 w-4 rounded-sm align-middle" />
                      </Td>
                    ) : null}
                    <Td className="max-w-52 min-w-40">
                      <Link href={hrefWith(base, sp, { tab: "applicants", app: r.app.id, ok: null, error: null })} scroll={false} className="font-medium text-foreground hover:text-primary">
                        {r.expertName}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">{contact ? r.expertEmail : maskEmail(r.expertEmail)}</div>
                    </Td>
                    <Td className="whitespace-nowrap">{r.expertCountry ?? "–"}</Td>
                    <Td className="tabular">{r.yearsExperience ?? "–"}</Td>
                    {keyFields.map((f) => (
                      <Td key={f.id} className="max-w-36 truncate" title={answerText(answers[f.id])}>
                        {answerText(answers[f.id]) || <span className="text-muted-foreground/70">–</span>}
                      </Td>
                    ))}
                    <Td className="whitespace-nowrap">
                      {cv && canCv && r.cvConsent !== "no" ? (
                        <a href={`/api/files/${cv.fileId}`} className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
                          <FileText className="h-3.5 w-3.5" /> CV
                        </a>
                      ) : cv ? (
                        <span className="text-xs text-muted-foreground" title={r.cvConsent === "no" ? "They said no to sharing" : "Your role can't download CVs"}>
                          On file
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">–</span>
                      )}
                    </Td>
                    <Td>
                      {manage ? (
                        <form action={setApplicantsStatus}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="one" value={r.app.id} />
                          <input type="hidden" name="returnTo" value={here} />
                          <AutoSubmitSelect name="status" defaultValue={r.app.status} className="control h-8 w-32 text-[13px]" aria-label={`Status of ${r.expertName}`}>
                            {APPLICATION_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {label(s)}
                              </option>
                            ))}
                          </AutoSubmitSelect>
                        </form>
                      ) : (
                        <StatusBadge value={r.app.status} />
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="text-muted-foreground">{fmtDate(r.app.createdAt)}</div>
                      <div className="text-xs text-muted-foreground/80">{src?.invited ? "via invite" : src?.utm?.source ? `via ${src.utm.source}` : src?.ref ? `via ${src.ref}` : "direct"}</div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <EmptyState title={status ? `No applicants with status ${label(status)}` : "No applicants yet"} description={status ? undefined : "Share the job's link (Share tab) or invite people from the Matches tab."} />
        )}
      </Section>
      {panel ? <ApplicantPanel job={job} user={user} fields={fields} a={panel} closeHref={here} /> : null}
    </Stack>
  );
}

async function ApplicantPanel({ job, user, fields, a, closeHref }: { job: Job; user: CurrentUser; fields: FieldDef[]; a: NonNullable<Awaited<ReturnType<typeof getApplicant>>>; closeHref: string }) {
  const manage = can(user.role, "applications.manage");
  const contact = canSeeContact(user.role);
  const canCv = can(user.role, "experts.cv_download") && a.cvConsent !== "no";
  const here = `${closeHref}${closeHref.includes("?") ? "&" : "?"}app=${a.app.id}`;
  const answers = sortedAnswers(fields, a.app);
  const src = a.app.source;
  // Money (admins and finance): the rate asked for on the old jobs site. Never loaded for other roles.
  const money = canSeeMoney(user.role) ? await applicationMoney(await getDb(), a.app.id) : null;
  return (
    <SlideOver
      title={a.expertName}
      closeHref={closeHref}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Applied {fmtDateTime(a.app.createdAt)}
            {a.app.updatedAt.getTime() - a.app.createdAt.getTime() > 60_000 ? ` · updated ${fmtDateTime(a.app.updatedAt)}` : ""}
          </span>
          <ButtonLink href={`/admin/experts/${a.app.expertId}`} size="sm" variant="primary">
            Open full profile
          </ButtonLink>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {manage ? (
            <form action={setApplicantsStatus} className="flex items-center gap-2">
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="one" value={a.app.id} />
              <input type="hidden" name="returnTo" value={here} />
              <span className="text-[13px] text-muted-foreground">Status</span>
              <AutoSubmitSelect name="status" defaultValue={a.app.status} className="control h-8 w-auto text-[13px]" aria-label="Status">
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </AutoSubmitSelect>
            </form>
          ) : (
            <StatusBadge value={a.app.status} />
          )}
          <span className="text-[13px] text-muted-foreground">CV consent:</span>
          <StatusBadge value={a.cvConsent} />
          <span className="text-[13px] text-muted-foreground">· Expert status:</span>
          <StatusBadge value={a.expertStatus} />
        </div>
        <DefinitionList
          items={[
            { label: "Email", value: contact ? a.expertEmail : maskEmail(a.expertEmail) },
            { label: "Phone", value: contact ? a.expertPhone : maskPhone(a.expertPhone) },
            { label: "Source", value: src?.jobsSite ? `Old jobs site (application ${src.jobsSite.applicationId}, status there: ${src.jobsSite.status.replace(/_/g, " ")})` : src?.invited ? "Invited from Matches" : [src?.utm?.source, src?.utm?.medium, src?.utm?.campaign].filter(Boolean).join(" / ") || src?.ref || "Direct" },
            ...(money?.rateExpectationUsd != null ? [{ label: "Rate asked (money)", value: `${money.rateExpectationUsd} USD` }] : []),
          ]}
        />
        <div className="space-y-1">
          <div className="eyebrow text-muted-foreground">Answers</div>
          <dl className="divide-y divide-border rounded-md border border-border">
            {answers.map(({ field, answer }) => {
              const isFile = answer && typeof answer === "object" && !Array.isArray(answer);
              const masked = !contact && (field.mapsTo === "email" || field.mapsTo === "phone");
              return (
                <div key={field.id} className="space-y-1 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">{field.type === "consent" ? "Consent" : field.label}</dt>
                  <dd className="text-sm break-words whitespace-pre-line text-foreground">
                    {isFile ? (
                      canCv ? (
                        <a href={`/api/files/${(answer as FileAnswer).fileId}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <FileText className="h-3.5 w-3.5" /> {(answer as FileAnswer).filename}
                        </a>
                      ) : (
                        <span>{(answer as FileAnswer).filename} <span className="text-xs text-muted-foreground">({a.cvConsent === "no" ? "they said no to sharing" : "your role can't download"})</span></span>
                      )
                    ) : masked ? (
                      field.mapsTo === "email" ? maskEmail(String(answer ?? "")) : maskPhone(String(answer ?? ""))
                    ) : (
                      answerText(answer) || <span className="text-muted-foreground/70">–</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
        <div className="space-y-2">
          <div className="eyebrow text-muted-foreground">Internal note</div>
          {manage ? (
            <form action={saveApplicantNote} className="space-y-2">
              <input type="hidden" name="id" value={a.app.id} />
              <input type="hidden" name="returnTo" value={here} />
              <Textarea name="note" rows={3} defaultValue={a.app.internalNote ?? ""} placeholder="Only the team sees this. Never shown to the applicant." aria-label="Internal note" />
              <SubmitButton size="sm" variant="secondary">
                Save note
              </SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-foreground/80">{a.app.internalNote || "–"}</p>
          )}
        </div>
      </div>
    </SlideOver>
  );
}

// ---------- Matches ----------

export async function MatchesTab({ job, user }: { job: Job; user: CurrentUser }) {
  const db = await getDb();
  if (!job.skills.length && !job.domains.length) {
    return (
      <Section flush>
        <EmptyState title="Add skills or fields to see matches" description="The Matches tab ranks experts already in the hub by the job's skills, fields, countries and minimum years." action={can(user.role, "jobs.manage") ? <ButtonLink href={`/admin/jobs/${job.id}?tab=details`} size="sm">Edit details</ButtonLink> : undefined} />
      </Section>
    );
  }
  const { ranked, pool, excludedTotal } = await jobCandidates(db, job);
  const manage = can(user.role, "jobs.manage");
  const shortlist = Boolean(job.requirementId) && can(user.role, "matching.shortlist");
  const base = await siteUrl();
  const mail = emailConfigured();
  return (
    <Stack>
      <Notice tone="info">
        Experts already in the hub, ranked out of 100 like requirement matches (skills {WEIGHTS.skills}, field {WEIGHTS.domain}, years {WEIGHTS.years}, availability {WEIGHTS.availability}, status {WEIGHTS.status}, consent {WEIGHTS.consent}). People who applied are on the Applicants tab; &quot;do not contact&quot; and inactive people are left out
        {excludedTotal ? `, and ${excludedTotal} more by the location rules` : ""}.
        {manage && !mail ? " Email isn't set up, so Mark invited only records the invite: copy the link and send it yourself." : ""}
      </Notice>
      <Section title={`Best matches (${ranked.length})`} description={`${pool} people share a skill or the field.`} flush>
        {ranked.length ? (
          <>
            {shortlist ? (
              <form id="job-shortlist" action={shortlistFromJob} className="flex items-center gap-2 border-b border-border px-4 py-3">
                <input type="hidden" name="jobId" value={job.id} />
                <SubmitButton size="sm" variant="secondary" pendingText="Adding...">
                  Shortlist ticked to the requirement
                </SubmitButton>
                <span className="text-xs text-muted-foreground">Shortlisting doesn&apos;t send anything.</span>
              </form>
            ) : null}
            <Table>
              <THead>
                {shortlist ? (
                  <Th className="w-8">
                    <SelectAll form="job-shortlist" />
                  </Th>
                ) : null}
                <Th>Expert</Th>
                <Th>Score</Th>
                <Th>Why</Th>
                <Th className="text-right">Invite</Th>
              </THead>
              <TBody>
                {ranked.map((m) => {
                  const link = `${base}/jobs/${job.slug}?ref=invite&e=${inviteToken(m.expertId)}`;
                  return (
                    <Tr key={m.expertId}>
                      {shortlist ? (
                        <Td>
                          <input form="job-shortlist" type="checkbox" name="ids" value={m.expertId} aria-label={`Select ${m.expert.fullName}`} className="h-4 w-4 rounded-sm align-middle" />
                        </Td>
                      ) : null}
                      <Td className="min-w-48">
                        <Link href={`/admin/experts/${m.expertId}`} className="font-medium text-foreground hover:text-primary">
                          {m.expert.fullName}
                        </Link>
                        <div className="text-xs text-muted-foreground">{[m.expert.domain, m.expert.country].filter(Boolean).join(" · ") || "–"}</div>
                        {m.invited ? <div className="mt-1 text-xs text-info">Invited {fmtDate(m.invited.createdAt)}{m.invited.emailed ? " by email" : ""}</div> : null}
                      </Td>
                      <Td>
                        <ScoreBar score={m.score} />
                      </Td>
                      <Td className="min-w-64">
                        <ReasonChips reasons={m.reasons} />
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        {manage ? (
                          <div className="flex flex-nowrap items-center gap-1">
                            <CopyButton value={link} label="Copy link" variant="ghost" />
                            <form action={inviteToJob}>
                              <input type="hidden" name="jobId" value={job.id} />
                              <input type="hidden" name="expertId" value={m.expertId} />
                              <SubmitButton size="sm" variant="secondary" pendingText="Saving...">
                                {m.invited ? "Invite again" : "Mark invited"}
                              </SubmitButton>
                            </form>
                            {shortlist ? (
                              <SubmitButton form="job-shortlist" name="one" value={m.expertId} size="sm" variant="ghost" className="text-primary">
                                Shortlist
                              </SubmitButton>
                            ) : null}
                          </div>
                        ) : null}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </>
        ) : (
          <EmptyState title="No matches yet" description="Nobody in the hub shares the job's skills or field. Share the job to bring in applicants." />
        )}
      </Section>
    </Stack>
  );
}

// ---------- Share ----------

const CHANNELS = [
  { id: "linkedin", label: "LinkedIn", icon: Share2, medium: "social" },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, medium: "messaging" },
  { id: "slack", label: "Slack", icon: Hash, medium: "messaging" },
  { id: "email", label: "Email", icon: Mail, medium: "email" },
] as const;

export async function ShareTab({ job, user, sp }: { job: Job; user: CurrentUser; sp: SearchParams }) {
  const db = await getDb();
  const manage = can(user.role, "jobs.manage");
  const base = await siteUrl();
  const url = `${base}/jobs/${job.slug}`;
  const problems = manage && job.status !== "open" ? await publishProblems(db, job) : [];
  const here = `/admin/jobs/${job.id}?tab=share`;
  const campaign = job.slug.slice(0, 50);
  const custom = { source: one(sp.us).slice(0, 60), medium: one(sp.um).slice(0, 60), campaign: one(sp.uc).slice(0, 60) || campaign };
  const customLink = custom.source ? utmLink(url, custom) : null;
  const statusBtn = (status: string, text: string, variant: "primary" | "secondary" = "secondary") => (
    <form action={setJobSharing}>
      <input type="hidden" name="id" value={job.id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="returnTo" value={here} />
      <SubmitButton size="sm" variant={variant} disabled={job.status === status} pendingText="Saving...">
        {text}
      </SubmitButton>
    </form>
  );
  return (
    <Stack>
      <Section title="Public link" description={job.visibility === "internal" ? "Internal: only the team can open this page." : job.visibility === "unlisted" ? "Unlisted: not on the job board, but anyone with the link can apply." : "Public: listed on the job board while the job is open."}>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={url} readOnly aria-label="Public link" className="min-w-0 flex-1 font-mono text-[13px]" />
          <CopyButton value={url} label="Copy link" />
          <a href={`/jobs/${job.slug}`} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </a>
        </div>
      </Section>

      {manage ? (
        <Section title="Status" description="Open takes applications. Paused shows the page without the form. Closed says it no longer accepts applications.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-muted-foreground">Now:</span>
              <StatusBadge value={job.status} />
              <span className="mx-2 h-4 w-px bg-border" />
              {statusBtn("open", job.status === "draft" ? "Open (publish)" : "Open", "primary")}
              {statusBtn("paused", "Pause")}
              {statusBtn("closed", "Close")}
              {statusBtn("draft", "Back to draft")}
            </div>
            {problems.length ? (
              <Notice tone="warning" title="Can't open yet">
                <ul className="list-inside list-disc">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
          </div>
        </Section>
      ) : null}

      {manage ? (
        <Section title="Visibility and dates">
          <form action={setJobSharing} className="space-y-5">
            <input type="hidden" name="id" value={job.id} />
            <input type="hidden" name="returnTo" value={here} />
            <input type="hidden" name="featuredSet" value="1" />
            <fieldset className="space-y-2">
              <legend className="mb-1 text-[13px] font-medium text-foreground/80">Who can see it</legend>
              {JOB_VISIBILITY.map((v) => (
                <label key={v} className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground/85">
                  <input type="radio" name="visibility" value={v} defaultChecked={job.visibility === v} className="mt-0.5 h-4 w-4" />
                  <span>
                    <span className="font-medium text-foreground">{label(v)}</span>{" "}
                    <span className="text-muted-foreground">{v === "public" ? "on the job board and in Google Jobs" : v === "unlisted" ? "only people with the link" : "only the team (preview)"}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <FieldRow>
              <Field label="Applications close on" htmlFor="share-closes" hint="Leave empty to keep it open until you close it.">
                <Input id="share-closes" name="closesOn" type="date" defaultValue={job.closesOn ?? ""} />
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox name="featured" value="yes" defaultChecked={job.featured} label="Featured: shown first on the board" />
              </div>
            </FieldRow>
            <SubmitButton size="sm" pendingText="Saving...">
              Save
            </SubmitButton>
          </form>
        </Section>
      ) : null}

      <Section title="Share links" description="Each link is tagged, so the Applicants tab shows where people came from." flush>
        <Table>
          <THead>
            <Th>Channel</Th>
            <Th>Tagged link</Th>
            <Th className="text-right" />
          </THead>
          <TBody>
            {CHANNELS.map((c) => {
              const link = utmLink(url, { source: c.id, medium: c.medium, campaign });
              const share =
                c.id === "linkedin"
                  ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`
                  : c.id === "whatsapp"
                    ? `https://wa.me/?text=${encodeURIComponent(`${job.title}: ${link}`)}`
                    : c.id === "email"
                      ? `mailto:?subject=${encodeURIComponent(job.title)}&body=${encodeURIComponent(`${job.summary ?? job.title}\n\n${link}`)}`
                      : null;
              return (
                <Tr key={c.id}>
                  <Td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <c.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {c.label}
                    </span>
                  </Td>
                  <Td className="max-w-[28rem] truncate font-mono text-xs text-muted-foreground" title={link}>
                    {link.replace(/^https?:\/\//, "")}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <CopyButton value={link} label="Copy" variant="ghost" />
                      {share ? (
                        <a href={share} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                          Share
                        </a>
                      ) : null}
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
        <form method="get" className="space-y-3 border-t border-border px-5 py-4">
          <input type="hidden" name="tab" value="share" />
          <div className="text-[13px] font-medium text-foreground/80">Custom link</div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Input name="us" defaultValue={custom.source} placeholder="Source, e.g. reddit" aria-label="utm_source" />
            <Input name="um" defaultValue={custom.medium} placeholder="Medium, e.g. community" aria-label="utm_medium" />
            <Input name="uc" defaultValue={one(sp.uc)} placeholder={`Campaign (${campaign})`} aria-label="utm_campaign" />
            <button className={buttonClass("secondary", "md")}>Build</button>
          </div>
          {customLink ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input value={customLink} readOnly aria-label="Custom link" className="min-w-0 flex-1 font-mono text-[13px]" />
              <CopyButton value={customLink} />
            </div>
          ) : null}
        </form>
      </Section>
      <p className="text-xs text-muted-foreground">Public pages never show pay, a pay basis or the partner. The company label reads &quot;{job.publicCompanyLabel}&quot;.</p>
    </Stack>
  );
}
