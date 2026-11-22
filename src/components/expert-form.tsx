"use client";
import Link from "next/link";
import { useActionState, useTransition, type FormEvent } from "react";
import { saveExpert, type ExpertFormState } from "@/app/(app)/experts/actions";
import { AVAILABILITY, CV_CONSENT, DOMAINS, EXPERT_STATUSES, label } from "@/lib/constants";
import type { ExpertFormValues } from "@/lib/forms/expert";
import { Button } from "./ui/button";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "./ui/field";
import { Notice } from "./ui/feedback";

const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: label(v) }));

export function ExpertForm({ id, initial, cancelHref }: { id?: string; initial: ExpertFormValues; cancelHref: string }) {
  const [state, dispatch, pending] = useActionState<ExpertFormState, FormData>(saveExpert, {});
  const [, startTransition] = useTransition();
  const v = state.values ?? initial;
  const err = state.errors ?? {};

  // Submit by hand so the form keeps what was typed when the server sends back an error.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state.message ? (
        <Notice tone={state.needsConfirm ? "warning" : "error"} title={state.message}>
          {state.duplicates?.length ? (
            <ul className="mt-1 list-inside list-disc">
              {state.duplicates.map((d) => (
                <li key={d.id}>
                  <Link className="underline" href={`/experts/${d.id}`} target="_blank">
                    {d.fullName}
                  </Link>{" "}
                  (same {d.matchedBy === "email" ? "email" : "LinkedIn URL"})
                </li>
              ))}
            </ul>
          ) : null}
          {state.needsConfirm ? (
            <div className="mt-2">
              <Checkbox name="confirmDuplicate" value="yes" label="It's a different person: save anyway" />
            </div>
          ) : null}
        </Notice>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-3 text-muted-foreground">Who</legend>
        <FieldRow>
          <Field label="Full name" error={err.fullName} htmlFor="fullName">
            <Input id="fullName" name="fullName" defaultValue={v.fullName} required autoComplete="off" />
          </Field>
          <Field label="Email" error={err.email} htmlFor="email" hint="Stored in lower case. One expert per email.">
            <Input id="email" name="email" type="email" defaultValue={v.email} autoComplete="off" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="LinkedIn URL" error={err.linkedinUrl} htmlFor="linkedinUrl">
            <Input id="linkedinUrl" name="linkedinUrl" defaultValue={v.linkedinUrl} placeholder="https://www.linkedin.com/in/..." />
          </Field>
          <Field label="Phone" htmlFor="phone" hint="Only if the partner's form asks for it.">
            <Input id="phone" name="phone" defaultValue={v.phone} />
          </Field>
        </FieldRow>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Country" htmlFor="country" hint='English name, e.g. "United States".'>
            <Input id="country" name="country" defaultValue={v.country} />
          </Field>
          <Field label="State / region" htmlFor="region" hint="For US experts: state code, e.g. TX.">
            <Input id="region" name="region" defaultValue={v.region} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" defaultValue={v.city} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-3 text-muted-foreground">Expertise</legend>
        <Field label="Headline" htmlFor="headline" hint='One line, e.g. "PhD mathematician, numerical analysis".'>
          <Input id="headline" name="headline" defaultValue={v.headline} />
        </Field>
        <FieldRow>
          <Field label="Domain" error={err.domain} htmlFor="domain">
            <Select id="domain" name="domain" defaultValue={v.domain} options={DOMAINS} placeholder="Choose..." />
          </Field>
          <Field label="Years of professional experience" error={err.yearsExperience} htmlFor="yearsExperience">
            <Input id="yearsExperience" name="yearsExperience" inputMode="numeric" defaultValue={v.yearsExperience} />
          </Field>
        </FieldRow>
        <Field label="Skills" htmlFor="skills" hint="Comma-separated. Spellings are tidied (Python3 -> python, K8s -> kubernetes).">
          <Input id="skills" name="skills" defaultValue={v.skills} placeholder="python, numerical methods, latex" />
        </Field>
        <FieldRow>
          <Field label="Languages" htmlFor="languages">
            <Input id="languages" name="languages" defaultValue={v.languages} placeholder="English, Hindi" />
          </Field>
          <Field label="Highest degree" htmlFor="highestDegree">
            <Input id="highestDegree" name="highestDegree" defaultValue={v.highestDegree} placeholder="PhD, Master's, Bachelor's..." />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Field of study" htmlFor="fieldOfStudy">
            <Input id="fieldOfStudy" name="fieldOfStudy" defaultValue={v.fieldOfStudy} />
          </Field>
          <Field label="University" htmlFor="university">
            <Input id="university" name="university" defaultValue={v.university} />
          </Field>
        </FieldRow>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-3 text-muted-foreground">Status and availability</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={v.status} options={opts(EXPERT_STATUSES)} />
          </Field>
          <Field label="Availability" htmlFor="availability">
            <Select id="availability" name="availability" defaultValue={v.availability} options={opts(AVAILABILITY)} />
          </Field>
          <Field label="CV consent" htmlFor="cvConsent" hint="Yes = we may share their CV with partners.">
            <Select id="cvConsent" name="cvConsent" defaultValue={v.cvConsent} options={opts(CV_CONSENT)} />
          </Field>
        </div>
        <FieldRow>
          <Field label="Hours per week" error={err.hoursPerWeek} htmlFor="hoursPerWeek">
            <Input id="hoursPerWeek" name="hoursPerWeek" inputMode="numeric" defaultValue={v.hoursPerWeek} />
          </Field>
          <Field label="Rate expectation (USD/hour, internal)" error={err.rateExpectationUsd} htmlFor="rateExpectationUsd" hint="Never shown to partners or in public posts.">
            <Input id="rateExpectationUsd" name="rateExpectationUsd" inputMode="numeric" defaultValue={v.rateExpectationUsd} />
          </Field>
        </FieldRow>
        <Field label="Tags" htmlFor="tags" hint="Comma-separated, e.g. ai-training, us-bench.">
          <Input id="tags" name="tags" defaultValue={v.tags} />
        </Field>
        <Field label="Notes (internal)" htmlFor="notes" hint="No ID numbers, dates of birth or bank details, ever.">
          <Textarea id="notes" name="notes" rows={5} defaultValue={v.notes} />
        </Field>
      </fieldset>

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : id ? "Save changes" : "Add expert"}
        </Button>
        <Link href={cancelHref} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  );
}
