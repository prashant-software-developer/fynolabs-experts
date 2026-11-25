"use client";
import Link from "next/link";
import { useActionState } from "react";
import { saveOnboarding, type StepFormState } from "@/app/(site)/me/actions";
import { DOMAINS } from "@/lib/constants";
import { CONSENT_TEXT, DEGREE_CHOICES } from "@/lib/forms/field-meta";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import type { StepId } from "@/lib/server/portal";
import { Field, FieldRow, Input, Select } from "@/components/ui/field";
import { FilePicker } from "@/components/ui/file-picker";
import { Notice } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

const AVAIL = [
  { value: "available", label: "Available now" },
  { value: "limited", label: "Limited (a few hours a week)" },
  { value: "busy", label: "Busy for now, available later" },
  { value: "unavailable", label: "Not available right now" },
];

const pill =
  "flex cursor-pointer items-center gap-2.5 rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground/85 transition-colors hover:bg-foreground/[0.06] has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06] has-[:checked]:text-foreground";

export function OnboardingForm({ step, initial, nextHref, cvFilename }: { step: StepId; initial: Record<string, string>; nextHref: string | null; cvFilename: string | null }) {
  const [state, action, pending] = useActionState<StepFormState, FormData>(saveOnboarding, {});
  const v = { ...initial, ...(state.values ?? {}) };
  const e = state.errors ?? {};
  const val = (k: string) => v[k] ?? "";
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="step" value={step} />
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      {step === "basics" ? (
        <>
          <Field label="Full name *" htmlFor="fullName" error={e.fullName}>
            <Input id="fullName" name="fullName" defaultValue={val("fullName")} autoComplete="name" aria-invalid={e.fullName ? true : undefined} />
          </Field>
          <FieldRow>
            <Field label="Country *" htmlFor="country" error={e.country}>
              <Select id="country" name="country" defaultValue={val("country")} options={COUNTRY_OPTIONS} placeholder="Choose a country" aria-invalid={e.country ? true : undefined} />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" defaultValue={val("city")} autoComplete="address-level2" />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="State or region" htmlFor="region" hint="US applicants: your state, e.g. TX.">
              <Input id="region" name="region" defaultValue={val("region")} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={e.phone} hint="With country code.">
              <Input id="phone" name="phone" type="tel" defaultValue={val("phone")} autoComplete="tel" />
            </Field>
          </FieldRow>
          <Field label="LinkedIn profile URL" htmlFor="linkedinUrl" error={e.linkedinUrl}>
            <Input id="linkedinUrl" name="linkedinUrl" type="url" defaultValue={val("linkedinUrl")} placeholder="https://www.linkedin.com/in/..." />
          </Field>
        </>
      ) : null}
      {step === "expertise" ? (
        <>
          <Field label="Headline" htmlFor="headline" hint="One line, e.g. PhD mathematician, numerical analysis.">
            <Input id="headline" name="headline" defaultValue={val("headline")} maxLength={200} />
          </Field>
          <Field label="Main field" htmlFor="domain" error={e.domain}>
            <Select id="domain" name="domain" defaultValue={val("domain")} options={[...DOMAINS]} placeholder="Choose your field" />
          </Field>
          <Field label="Skills *" htmlFor="skills" error={e.skills} hint="Comma-separated, e.g. Python, numerical methods, LaTeX.">
            <Input id="skills" name="skills" defaultValue={val("skills")} aria-invalid={e.skills ? true : undefined} />
          </Field>
          <Field label="Languages" htmlFor="languages" hint="Comma-separated, e.g. English, Hindi.">
            <Input id="languages" name="languages" defaultValue={val("languages")} />
          </Field>
        </>
      ) : null}
      {step === "experience" ? (
        <>
          <FieldRow>
            <Field label="Years of professional experience *" htmlFor="yearsExperience" error={e.yearsExperience}>
              <Input id="yearsExperience" name="yearsExperience" type="number" min={0} max={70} defaultValue={val("yearsExperience")} aria-invalid={e.yearsExperience ? true : undefined} />
            </Field>
            <Field label="Highest degree" htmlFor="highestDegree">
              <Select id="highestDegree" name="highestDegree" defaultValue={val("highestDegree")} options={DEGREE_CHOICES} placeholder="Choose one" />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Field of study" htmlFor="fieldOfStudy">
              <Input id="fieldOfStudy" name="fieldOfStudy" defaultValue={val("fieldOfStudy")} />
            </Field>
            <Field label="University" htmlFor="university">
              <Input id="university" name="university" defaultValue={val("university")} />
            </Field>
          </FieldRow>
        </>
      ) : null}
      {step === "cv" ? (
        <Field label="Your CV" htmlFor="cv-file" error={e.file} hint={cvFilename ? `On file: ${cvFilename}. Choose a new file to replace it, or continue.` : "PDF or Word, up to 4 MB."}>
          <FilePicker id="cv-file" name="file" accept=".pdf,.doc,.docx" label={cvFilename ? "Replace your CV" : "Upload your CV"} hint="Click or drop a file" invalid={Boolean(e.file)} />
        </Field>
      ) : null}
      {step === "availability" ? (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 eyebrow text-muted-foreground">Availability *</legend>
            {AVAIL.map((a) => (
              <label key={a.value} className={pill}>
                <input type="radio" name="availability" value={a.value} defaultChecked={val("availability") === a.value} className="h-4 w-4" />
                {a.label}
              </label>
            ))}
            {e.availability ? <p className="text-xs text-destructive">{e.availability}</p> : null}
          </fieldset>
          <Field label="Hours per week you can give *" htmlFor="hoursPerWeek" error={e.hoursPerWeek}>
            <Input id="hoursPerWeek" name="hoursPerWeek" type="number" min={0} max={80} defaultValue={val("hoursPerWeek")} className="sm:max-w-48" />
          </Field>
        </>
      ) : null}
      {step === "consent" ? (
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm leading-relaxed text-foreground/80">{CONSENT_TEXT}</legend>
          {[
            { value: "yes", label: "Yes, I agree" },
            { value: "no", label: "No, don't share my profile or CV" },
          ].map((o) => (
            <label key={o.value} className={pill}>
              <input type="radio" name="consent" value={o.value} defaultChecked={val("consent") === o.value} className="h-4 w-4" />
              {o.label}
            </label>
          ))}
          {e.consent ? <p className="text-xs text-destructive">{e.consent}</p> : null}
          <p className="text-xs text-muted-foreground">You can change this at any time on your profile.</p>
        </fieldset>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending ? "Saving..." : nextHref ? "Save and continue" : "Save and finish"}
        </button>
        {nextHref ? (
          <button type="submit" name="then" value="profile" disabled={pending} className={buttonClass("secondary", "md")}>
            Save and go to profile
          </button>
        ) : null}
        {nextHref ? (
          <Link href={nextHref} className={cn(buttonClass("ghost", "md"), "ml-auto text-muted-foreground")}>
            Skip for now
          </Link>
        ) : null}
      </div>
    </form>
  );
}
