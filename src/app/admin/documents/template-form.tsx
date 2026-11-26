"use client";
// Add or edit a document template: text with placeholders, or a PDF. When something needs fixing the
// form comes back with what was typed (a long pasted text is never lost); only a chosen PDF has to be
// picked again.
import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { FilePicker } from "@/components/ui/file-picker";
import { saveTemplateAction, type TemplateFormState } from "./actions";

export type TemplateFormInitial = {
  id: string | null;
  title: string;
  kind: string;
  description: string;
  body: string;
  position: string;
  requiredForAll: boolean;
  active: boolean;
  pdf: { filename: string; size: string; href: string } | null;
  signed: number;
};

export function TemplateForm({ initial, kinds, textHelp, cancelHref }: { initial: TemplateFormInitial; kinds: { value: string; label: string }[]; textHelp: string; cancelHref: string }) {
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(saveTemplateAction, {});
  const back = state.values;
  const v = {
    title: back?.title ?? initial.title,
    kind: back?.kind ?? initial.kind,
    description: back?.description ?? initial.description,
    body: back?.body ?? initial.body,
    position: back?.position ?? initial.position,
    requiredForAll: back ? back.requiredForAll === "yes" : initial.requiredForAll,
    active: back ? back.active === "yes" : initial.active,
    removePdf: back?.removePdf === "yes",
  };
  const pdfLocked = Boolean(initial.pdf) && initial.signed > 0;
  return (
    <form action={action} className="space-y-5">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <FieldRow>
        <Field label="Title" htmlFor="tpl-title" hint="Experts see it on their Documents page.">
          <Input id="tpl-title" name="title" required maxLength={200} defaultValue={v.title} />
        </Field>
        <Field label="Kind" htmlFor="tpl-kind">
          <Select id="tpl-kind" name="kind" defaultValue={v.kind} options={kinds} />
        </Field>
      </FieldRow>
      <Field label="Description" htmlFor="tpl-description" hint="One short line under the title, for experts. Optional.">
        <Input id="tpl-description" name="description" maxLength={300} defaultValue={v.description} />
      </Field>
      <Field label="Text" htmlFor="tpl-body" hint={textHelp}>
        <Textarea id="tpl-body" name="body" rows={16} defaultValue={v.body} className="font-mono text-[13px] leading-relaxed" spellCheck />
      </Field>
      <div className="space-y-2">
        <p className="text-[13px] font-medium text-foreground/80">Or a PDF, instead of text</p>
        {initial.pdf ? (
          <p className="text-[13px] text-muted-foreground">
            Now:{" "}
            <a href={initial.pdf.href} className="text-primary underline-offset-4 hover:underline" target="_blank" rel="noopener">
              {initial.pdf.filename}
            </a>{" "}
            ({initial.pdf.size}){pdfLocked ? `. Signed by ${initial.signed}, so it can't be replaced: add a new template for a new version.` : ""}
          </p>
        ) : null}
        {pdfLocked ? null : (
          <>
            <FilePicker name="pdf" accept="application/pdf,.pdf" label={initial.pdf ? "Replace the PDF" : "Upload a PDF"} hint="PDF, up to 4 MB. Leave the text empty for a PDF template." />
            {initial.pdf ? <Checkbox name="removePdf" value="yes" defaultChecked={v.removePdf} label="Remove the PDF (use the text instead)" /> : null}
          </>
        )}
      </div>
      <FieldRow>
        <Field label="Position" htmlFor="tpl-position" hint="Lower comes first on the expert's page.">
          <Input id="tpl-position" name="position" type="number" min={0} max={999} defaultValue={v.position} />
        </Field>
      </FieldRow>
      <div className="flex flex-col items-start gap-2.5">
        <Checkbox name="requiredForAll" value="yes" defaultChecked={v.requiredForAll} label="Every expert signs it (it waits on their Documents page until they do)" />
        <Checkbox name="active" value="yes" defaultChecked={v.active} label="Active (turn off to stop asking for it; signed copies stay)" />
      </div>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending ? "Saving..." : initial.id ? "Save template" : "Add template"}
        </button>
        <Link href={cancelHref} className={buttonClass("ghost", "md")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
