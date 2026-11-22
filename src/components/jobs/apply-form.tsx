"use client";
// The public application form. Sends to POST /api/apply/<slug> (fetch with JavaScript; a plain form
// post without it), shows friendly errors next to each question, then opens the thank-you page.
import { useRef, useState, type FormEvent } from "react";
import type { FieldDef } from "@/lib/forms/field-meta";
import type { FormValues } from "@/lib/forms/job-fields";
import { Notice } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { FieldInput } from "./field-input";

export function ApplyForm({
  slug,
  fields,
  values = {},
  hidden = {},
  lockedEmailFieldId,
  cvNote,
  preview,
  initialError,
}: {
  slug: string;
  fields: FieldDef[];
  values?: FormValues;
  /** utm_*, ref and e from the page URL, sent along so we know where the applicant came from. */
  hidden?: Record<string, string>;
  /** A signed-in expert: their account email is used, so the email question can't be changed. */
  lockedEmailFieldId?: string | null;
  cvNote?: string | null;
  /** The builder's preview: looks the same, sends nothing. */
  preview?: boolean;
  initialError?: string | null;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (preview || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/apply/${slug}`, { method: "POST", body: new FormData(e.currentTarget), headers: { Accept: "application/json" } });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; redirect?: string; message?: string; errors?: Record<string, string> } | null;
      if (data?.ok && data.redirect) {
        window.location.assign(data.redirect);
        return;
      }
      setErrors(data?.errors ?? {});
      setMessage(data?.message ?? "Something went wrong. Please try again.");
      const first = data?.errors ? Object.keys(data.errors)[0] : null;
      const el = first ? document.getElementById(`field-${first}`) : form.current;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      setMessage("We couldn't send the form. Check your connection and try again.");
    }
    setPending(false);
  }

  const visible = fields.filter((f) => f.type !== "section").length;
  return (
    <form ref={form} action={`/api/apply/${slug}`} method="post" encType="multipart/form-data" onSubmit={onSubmit} noValidate className="space-y-6">
      {message ? (
        <Notice tone="error" title="Not sent yet">
          {message}
        </Notice>
      ) : null}
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {/* Left empty by people; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {fields.map((f) => (
        <FieldInput
          key={f.id}
          field={f}
          value={values[f.id]}
          error={errors[f.id]}
          disabled={preview}
          readOnly={f.id === lockedEmailFieldId}
          fileNote={f.type === "file" && f.mapsTo === "cv" ? cvNote : undefined}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <button type="submit" disabled={preview || pending} className={buttonClass("primary", "md", "h-10 px-6")}>
          {pending ? "Sending..." : "Submit application"}
        </button>
        <p className="text-xs text-muted-foreground">
          {preview ? `Preview: ${visible} questions. Nothing is sent from here.` : "Questions marked * are required."}
        </p>
      </div>
    </form>
  );
}
