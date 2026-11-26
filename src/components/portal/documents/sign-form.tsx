"use client";
// The sign form under a document. For a text document it also draws the document itself, so the
// details typed below show up in the text as they are typed, and its "☐" lines are boxes to tick.
// Every check is repeated on the server (signDocument); the browser's own checks only save a trip.
import { startTransition, useActionState, useState, type ReactNode } from "react";
import { signDocumentAction, type SignState } from "@/app/(portal)/me/documents/actions";
import type { BodyBlock, SignField } from "@/lib/server/portal-documents";
import { PortalCard } from "@/components/portal/page";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DocumentBody, type CheckBlock } from "./document-body";

/** What an empty placeholder says in the text until it is filled in. */
const LABELS: Record<string, string> = {
  full_name: "your full name",
  relation: "son / daughter / spouse",
  parent_name: "father's, mother's or spouse's name",
  age: "age",
  address: "your address",
  city: "city",
  place: "city",
  country: "country",
};

function DetailInput({ f, value, onChange, error }: { f: SignField; value: string; onChange: (v: string) => void; error?: string }) {
  const id = `f_${f.key}`;
  const invalid = error ? true : undefined;
  return (
    <Field label={f.label} htmlFor={id} error={error} hint={f.hint} className={f.input === "textarea" ? "sm:col-span-2" : undefined}>
      {f.input === "select" ? (
        <Select id={id} name={id} required value={value} onChange={(e) => onChange(e.target.value)} options={f.options ?? []} placeholder="Choose" aria-invalid={invalid} />
      ) : f.input === "textarea" ? (
        <Textarea id={id} name={id} required rows={2} value={value} onChange={(e) => onChange(e.target.value)} maxLength={f.maxLength} autoComplete={f.autoComplete} aria-invalid={invalid} />
      ) : (
        <Input
          id={id}
          name={id}
          required
          type={f.input === "number" ? "number" : "text"}
          inputMode={f.input === "number" ? "numeric" : undefined}
          min={f.min}
          max={f.max}
          maxLength={f.input === "number" ? undefined : f.maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={f.autoComplete}
          aria-invalid={invalid}
        />
      )}
    </Field>
  );
}

export function SignForm({
  docRef,
  blocks,
  fields,
  auto,
  defaultName,
  consentText,
}: {
  docRef: string;
  /** The document's text (text documents); null for a PDF, which the page shows above the form. */
  blocks: BodyBlock[] | null;
  fields: SignField[];
  /** What fills itself in (email, the date, city and country from the profile). */
  auto: Record<string, string>;
  defaultName: string;
  consentText: string;
}) {
  const [state, dispatch, pending] = useActionState<SignState, FormData>(signDocumentAction, {});
  const [name, setName] = useState(defaultName);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const e = state.errors ?? {};
  const values: Record<string, string> = { ...auto, ...vals, full_name: name.trim() };
  if ("city" in vals) values.place = vals.city;

  const box = (b: CheckBlock, text: ReactNode) => {
    const err = e[`check_${b.index}`];
    return (
      <>
        <label className="grid cursor-pointer grid-cols-[1.75rem_1fr] items-start">
          <input type="checkbox" name={`check_${b.index}`} value="yes" required={!b.optional} aria-invalid={err ? true : undefined} className="mt-1 h-4 w-4 rounded-sm border-input accent-primary" />
          <span className="text-foreground/90">{text}</span>
        </label>
        {err ? <p className="mt-1 ml-7 text-xs text-destructive">{err}</p> : null}
      </>
    );
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      <input type="hidden" name="ref" value={docRef} />
      {blocks ? (
        <PortalCard as="article" className="px-5 py-6 sm:px-10 sm:py-10">
          <DocumentBody blocks={blocks} values={values} labels={LABELS} renderCheck={box} />
        </PortalCard>
      ) : null}

      <PortalCard as="section" className="space-y-5 px-5 py-6 sm:px-8">
        <div className="space-y-1">
          <h2 className="text-lg text-foreground">Sign</h2>
          <p className="text-sm text-muted-foreground">{fields.length ? "Add the details the document needs. They appear in it as you type." : "Read the document, then type your name to sign it."}</p>
        </div>
        {state.message ? <Notice tone="error">{state.message}</Notice> : null}
        {fields.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <DetailInput key={f.key} f={f} value={vals[f.key] ?? ""} onChange={(v) => setVals((o) => ({ ...o, [f.key]: v }))} error={e[f.key]} />
            ))}
          </div>
        ) : null}
        <Field label="Full legal name" htmlFor="signedName" error={e.signedName} hint="As on your ID. Typing it is your signature.">
          <Input id="signedName" name="signedName" required minLength={3} maxLength={200} autoComplete="name" value={name} onChange={(ev) => setName(ev.target.value)} aria-invalid={e.signedName ? true : undefined} />
        </Field>
        <div className="space-y-1">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-secondary/40 px-4 py-3 text-sm leading-relaxed text-foreground/85">
            <input type="checkbox" name="consent" value="yes" required aria-invalid={e.consent ? true : undefined} className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-input accent-primary" />
            <span>{consentText}</span>
          </label>
          {e.consent ? <p className="text-xs text-destructive">{e.consent}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
            {pending ? "Signing..." : "Sign"}
          </button>
          <span className="text-xs text-muted-foreground">
            Dated {auto.date}
            {auto.email ? ` · ${auto.email}` : ""}
          </span>
        </div>
      </PortalCard>
    </form>
  );
}
