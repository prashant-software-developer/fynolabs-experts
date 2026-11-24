"use client";
// The job details editor (admin). Public fields first, then the internal links and notes.
import Link from "next/link";
import { useActionState, useState, useTransition, type FormEvent } from "react";
import { saveJob, type JobFormState } from "@/app/admin/jobs/actions";
import { DOMAINS, EMPLOYMENT_TYPES, JOB_VISIBILITY, label } from "@/lib/constants";
import type { JobFormValues } from "@/lib/forms/job";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";

export function JobForm({
  id,
  initial,
  partners,
  requirements,
  cancelHref,
  canSeeRateNote,
}: {
  id?: string;
  initial: JobFormValues;
  partners: { id: string; name: string }[];
  requirements: { id: string; label: string }[];
  cancelHref: string;
  canSeeRateNote: boolean;
}) {
  const [state, dispatch, pending] = useActionState<JobFormState, FormData>(saveJob, {});
  const [, startTransition] = useTransition();
  const [v, setV] = useState<JobFormValues>(initial);
  const err = state.errors ?? {};
  const set = <K extends keyof JobFormValues>(k: K, value: JobFormValues[K]) => setV((old) => ({ ...old, [k]: value }));
  const toggle = (d: string) => setV((old) => ({ ...old, domains: old.domains.includes(d) ? old.domains.filter((x) => x !== d) : [...old.domains, d] }));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-1 text-muted-foreground">What the public sees</legend>
        <p className="text-small text-muted-foreground">Never mention pay, a pay basis (per hour, per task) or the client&apos;s name here. Saving checks for it.</p>
        <Field label="Title" error={err.title} htmlFor="title">
          <Input id="title" name="title" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Scientific Coding Expert - Mathematics" />
        </Field>
        <FieldRow>
          <Field label="Company label" error={err.publicCompanyLabel} htmlFor="publicCompanyLabel" hint="Shown publicly instead of the partner's name.">
            <Input id="publicCompanyLabel" name="publicCompanyLabel" value={v.publicCompanyLabel} onChange={(e) => set("publicCompanyLabel", e.target.value)} />
          </Field>
          <Field label="Location" error={err.location} htmlFor="location">
            <Input id="location" name="location" value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="Remote" />
          </Field>
        </FieldRow>
        <Field label="Summary" error={err.summary} htmlFor="summary" hint="One or two lines for the job board and link previews.">
          <Input id="summary" name="summary" value={v.summary} onChange={(e) => set("summary", e.target.value)} maxLength={400} />
        </Field>
        <Field label="Description" error={err.description} htmlFor="description" hint="Markdown: ## headings, - bullets, **bold**, [links](https://...).">
          <Textarea id="description" name="description" rows={12} value={v.description} onChange={(e) => set("description", e.target.value)} className="font-mono text-small" />
        </Field>
        <FieldRow>
          <Field label="Type" htmlFor="employmentType">
            <Select id="employmentType" name="employmentType" value={v.employmentType} onChange={(e) => set("employmentType", e.target.value)} options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: label(t) }))} />
          </Field>
          <Field label="Openings" error={err.openings} htmlFor="openings">
            <Input id="openings" name="openings" inputMode="numeric" value={v.openings} onChange={(e) => set("openings", e.target.value)} />
          </Field>
        </FieldRow>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-1 text-muted-foreground">Who fits (also used for matching)</legend>
        <Field label="Skills" htmlFor="skills" hint="Comma-separated. Shown on the job page and used to rank experts on the Matches tab.">
          <Input id="skills" name="skills" value={v.skills} onChange={(e) => set("skills", e.target.value)} />
        </Field>
        <div className="space-y-1.5">
          <div className="eyebrow text-muted-foreground">Fields</div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {DOMAINS.map((d) => (
              <Checkbox key={d} name="domains" value={d} checked={v.domains.includes(d)} onChange={() => toggle(d)} label={d} />
            ))}
          </div>
        </div>
        <FieldRow>
          <Field label="Open to countries" htmlFor="countriesAllowed" hint="Empty = anywhere. Comma-separated.">
            <Input id="countriesAllowed" name="countriesAllowed" value={v.countriesAllowed} onChange={(e) => set("countriesAllowed", e.target.value)} placeholder="United States, India" />
          </Field>
          <Field label="Not open in" htmlFor="countriesBlocked" hint="Countries, or US states as US-CA.">
            <Input id="countriesBlocked" name="countriesBlocked" value={v.countriesBlocked} onChange={(e) => set("countriesBlocked", e.target.value)} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Minimum years" error={err.minYears} htmlFor="minYears">
            <Input id="minYears" name="minYears" inputMode="numeric" value={v.minYears} onChange={(e) => set("minYears", e.target.value)} />
          </Field>
          <Field label="Applications close on" error={err.closesOn} htmlFor="closesOn" hint="Optional. After this date the page says it's closed.">
            <Input id="closesOn" name="closesOn" type="date" value={v.closesOn} onChange={(e) => set("closesOn", e.target.value)} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Visibility" htmlFor="visibility" hint="Public: on the board. Unlisted: only by link. Internal: team only.">
            <Select id="visibility" name="visibility" value={v.visibility} onChange={(e) => set("visibility", e.target.value)} options={JOB_VISIBILITY.map((x) => ({ value: x, label: label(x) }))} />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox name="featured" value="yes" checked={v.featured === "yes"} onChange={(e) => set("featured", e.target.checked ? "yes" : "")} label="Featured (shown first on the board)" />
          </div>
        </FieldRow>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-1 text-muted-foreground">Internal (never public)</legend>
        <FieldRow>
          <Field label="Partner" htmlFor="partnerId">
            <Select id="partnerId" name="partnerId" value={v.partnerId} onChange={(e) => set("partnerId", e.target.value)} options={partners.map((p) => ({ value: p.id, label: p.name }))} placeholder="No partner (bench building)" />
          </Field>
          <Field label="Requirement" htmlFor="requirementId" hint="Lets you shortlist matches to it.">
            <Select id="requirementId" name="requirementId" value={v.requirementId} onChange={(e) => set("requirementId", e.target.value)} options={requirements.map((r) => ({ value: r.id, label: r.label }))} placeholder="Not linked" />
          </Field>
        </FieldRow>
        {canSeeRateNote ? (
          <Field label="Internal rate note" htmlFor="internalRateNote" hint="For admins and finance. Never on the public page, exports or emails.">
            <Input id="internalRateNote" name="internalRateNote" value={v.internalRateNote} onChange={(e) => set("internalRateNote", e.target.value)} />
          </Field>
        ) : (
          <p className="text-small text-muted-foreground">The internal rate note is visible to admins and finance only.</p>
        )}
      </fieldset>

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : id ? "Save changes" : "Create job"}
        </Button>
        <Link href={cancelHref} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  );
}
