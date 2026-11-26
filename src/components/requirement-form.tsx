"use client";
import Link from "next/link";
import { useActionState, useState, useTransition, type FormEvent } from "react";
import { Wand2 } from "@/components/icons";
import { saveRequirement, type RequirementFormState } from "@/app/admin/requirements/actions";
import { DEGREE_LEVELS, DOMAINS, REQUIREMENT_STATUSES, label } from "@/lib/constants";
import type { RequirementFormValues } from "@/lib/forms/requirement";
import { parseRequirement } from "@/lib/match/parse";
import { Button } from "./ui/button";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "./ui/field";
import { Notice } from "./ui/feedback";

export function RequirementForm({
  id,
  initial,
  partners,
  withPaste,
  cancelHref,
  allowNewPartner = true,
}: {
  id?: string;
  initial: RequirementFormValues;
  partners: { id: string; name: string }[];
  withPaste?: boolean;
  cancelHref: string;
  /** Typing a new partner is partner management (admins); others pick from the list. */
  allowNewPartner?: boolean;
}) {
  const [state, dispatch, pending] = useActionState<RequirementFormState, FormData>(saveRequirement, {});
  const [, startTransition] = useTransition();
  const [v, setV] = useState<RequirementFormValues>(initial);
  const [paste, setPaste] = useState("");
  const [found, setFound] = useState<string[] | null>(null);
  const err = state.errors ?? {};
  const set = <K extends keyof RequirementFormValues>(k: K, value: RequirementFormValues[K]) => setV((old) => ({ ...old, [k]: value }));
  const toggle = (k: "domains" | "degrees", value: string) =>
    setV((old) => ({ ...old, [k]: old[k].includes(value) ? old[k].filter((x) => x !== value) : [...old[k], value] }));

  function readPaste() {
    const p = parseRequirement(paste);
    setV((old) => ({
      ...old,
      title: p.title || old.title,
      externalRef: p.externalRef ?? old.externalRef,
      description: paste.trim(),
      mustSkills: p.mustSkills.join(", "),
      niceSkills: p.niceSkills.join(", "),
      domains: p.domains.length ? p.domains : old.domains,
      degrees: p.degrees,
      countriesAllowed: p.countriesAllowed.join(", "),
      countriesBlocked: p.countriesBlocked.join(", "),
      minYears: p.minYears != null ? String(p.minYears) : "",
      slots: p.slots != null ? String(p.slots) : old.slots,
      rateNote: p.rateNote ?? old.rateNote,
      deadline: p.deadline ?? old.deadline,
    }));
    setFound(p.found);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  return (
    <div className="space-y-8">
      {withPaste ? (
        <div className="space-y-3">
          <Field label="Paste the partner's requirement" htmlFor="paste" hint="From an email, Slack or their portal. We pick out skills, domain, years, slots and locations; check everything below before saving.">
            <Textarea
              id="paste"
              rows={7}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Scientific Coding Expert - Mathematics. Pilot: up to 3 people. Strong Python, numerical methods, PhD or Master's in Mathematics, 3+ years."
            />
          </Field>
          <Button type="button" variant="secondary" onClick={readPaste} disabled={!paste.trim()}>
            <Wand2 className="h-4 w-4" /> Read requirement
          </Button>
          {found ? (
            <Notice tone={found.length ? "info" : "warning"} title={found.length ? "Picked up" : "Nothing recognised: fill the fields by hand."}>
              {found.length ? (
                <ul className="list-inside list-disc">
                  {found.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              ) : null}
            </Notice>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-8" noValidate>
        {id ? <input type="hidden" name="id" value={id} /> : null}
        {state.message ? <Notice tone="error">{state.message}</Notice> : null}

        <fieldset className="space-y-4">
          <legend className="eyebrow mb-3 text-muted-foreground">Requirement</legend>
          <FieldRow>
            <Field label="Partner" error={err.partnerId} htmlFor="partnerId" hint={allowNewPartner ? undefined : "Partner not listed? Ask an admin to add it."}>
              <Select
                id="partnerId"
                name="partnerId"
                value={v.partnerId === "new" && !allowNewPartner ? "" : v.partnerId}
                onChange={(e) => set("partnerId", e.target.value)}
                options={[...partners.map((p) => ({ value: p.id, label: p.name })), ...(allowNewPartner ? [{ value: "new", label: "+ New partner..." }] : [])]}
                placeholder="Choose..."
              />
            </Field>
            {allowNewPartner && (v.partnerId === "new" || (!v.partnerId && !partners.length)) ? (
              <Field label="New partner name" htmlFor="newPartner" hint="Internal name. Never shown publicly.">
                <Input id="newPartner" name="newPartner" value={v.newPartner} onChange={(e) => set("newPartner", e.target.value)} />
              </Field>
            ) : (
              <Field label="Partner reference" htmlFor="externalRef" hint='e.g. "SOW 103650"'>
                <Input id="externalRef" name="externalRef" value={v.externalRef} onChange={(e) => set("externalRef", e.target.value)} />
              </Field>
            )}
          </FieldRow>
          {allowNewPartner && (v.partnerId === "new" || (!v.partnerId && !partners.length)) ? (
            <Field label="Partner reference" htmlFor="externalRef2" hint='e.g. "SOW 103650"'>
              <Input id="externalRef2" name="externalRef" value={v.externalRef} onChange={(e) => set("externalRef", e.target.value)} />
            </Field>
          ) : null}
          <Field label="Title" error={err.title} htmlFor="title">
            <Input id="title" name="title" value={v.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Slots (people needed)" error={err.slots} htmlFor="slots">
              <Input id="slots" name="slots" inputMode="numeric" value={v.slots} onChange={(e) => set("slots", e.target.value)} />
            </Field>
            <Field label="Minimum years" error={err.minYears} htmlFor="minYears">
              <Input id="minYears" name="minYears" inputMode="numeric" value={v.minYears} onChange={(e) => set("minYears", e.target.value)} />
            </Field>
            <Field label="Deadline" error={err.deadline} htmlFor="deadline">
              <Input id="deadline" name="deadline" type="date" value={v.deadline} onChange={(e) => set("deadline", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="eyebrow mb-3 text-muted-foreground">Who fits</legend>
          <Field label="Must-have skills" htmlFor="mustSkills" hint="Comma-separated. Biggest part of the match score.">
            <Input id="mustSkills" name="mustSkills" value={v.mustSkills} onChange={(e) => set("mustSkills", e.target.value)} />
          </Field>
          <Field label="Nice-to-have skills" htmlFor="niceSkills">
            <Input id="niceSkills" name="niceSkills" value={v.niceSkills} onChange={(e) => set("niceSkills", e.target.value)} />
          </Field>
          <div className="space-y-1.5">
            <div className="text-[13px] font-medium text-foreground/80">Domains</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {DOMAINS.map((d) => (
                <Checkbox key={d} name="domains" value={d} checked={v.domains.includes(d)} onChange={() => toggle("domains", d)} label={d} />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[13px] font-medium text-foreground/80">Degree (any of)</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {DEGREE_LEVELS.map((d) => (
                <Checkbox key={d} name="degrees" value={d} checked={v.degrees.includes(d)} onChange={() => toggle("degrees", d)} label={label(d)} />
              ))}
            </div>
          </div>
          <FieldRow>
            <Field label="Allowed countries" htmlFor="countriesAllowed" hint="Empty = anywhere. Comma-separated.">
              <Input id="countriesAllowed" name="countriesAllowed" value={v.countriesAllowed} onChange={(e) => set("countriesAllowed", e.target.value)} placeholder="United States" />
            </Field>
            <Field label="Blocked countries / US states" htmlFor="countriesBlocked" hint="US states as US-CA, US-CT...">
              <Input id="countriesBlocked" name="countriesBlocked" value={v.countriesBlocked} onChange={(e) => set("countriesBlocked", e.target.value)} placeholder="US-CA, US-CT" />
            </Field>
          </FieldRow>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="eyebrow mb-3 text-muted-foreground">Internal</legend>
          <FieldRow>
            <Field label="Rate note (internal)" htmlFor="rateNote" hint="Never exported or shown to experts.">
              <Input id="rateNote" name="rateNote" value={v.rateNote} onChange={(e) => set("rateNote", e.target.value)} />
            </Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" name="status" value={v.status} onChange={(e) => set("status", e.target.value)} options={REQUIREMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))} />
            </Field>
          </FieldRow>
          <Field label="Full description" htmlFor="description">
            <Textarea id="description" name="description" rows={6} value={v.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </fieldset>

        <div className="flex items-center gap-3 border-t border-border pt-6">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : id ? "Save changes" : "Save and find matches"}
          </Button>
          <Link href={cancelHref} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
