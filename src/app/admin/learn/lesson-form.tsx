"use client";
// The lesson form (in the side panel on a course): title, kind, order, minutes, then what the kind
// needs: an address (video, booklet, link), the text (Markdown) and, for a quiz, the questions in
// the plain-text format (src/lib/learn/quiz.ts). Errors come back with what was typed.
import Link from "next/link";
import { useActionState, useState } from "react";
import { LESSON_KINDS, type LessonKind } from "@/lib/constants";
import { LESSON_KIND_LABELS } from "@/lib/learn/labels";
import { QUIZ_TEXT_EXAMPLE } from "@/lib/learn/quiz";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { saveLessonForm, type LearnFormState } from "./actions";

export type LessonFormValues = { id: string; title: string; kind: string; position: number; minutes: number | null; url: string | null; body: string | null; quizText: string };

const URL_HINT: Partial<Record<LessonKind, string>> = {
  video: "A YouTube link (any form) or a .mp4 file. Leave it empty until the video is up: experts see “Video coming soon” and your notes.",
  pdf: "A PDF on this site (/learn/booklet.pdf) or an https:// address.",
  link: "An https:// address. It opens in a new tab.",
};
const BODY_LABEL: Record<LessonKind, string> = { video: "Notes", pdf: "About this booklet", reading: "Text", quiz: "Intro (optional)", link: "Text (optional)" };

export function LessonForm({ courseId, lesson, defaultPosition, cancelHref }: { courseId: string; lesson?: LessonFormValues | null; defaultPosition: number; cancelHref: string }) {
  const [state, action, pending] = useActionState<LearnFormState, FormData>(saveLessonForm, null);
  const typed = state?.values;
  const v = (k: string, fallback: string | number | null | undefined) => typed?.[k] ?? (fallback == null ? "" : String(fallback));
  const err = (k: string) => state?.errors?.[k] ?? null;
  const [kind, setKind] = useState<string>(v("kind", lesson?.kind ?? "video"));
  const k = (LESSON_KINDS as readonly string[]).includes(kind) ? (kind as LessonKind) : "reading";
  const quizErrors = err("quizText")?.split("\n").filter(Boolean) ?? [];

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="courseId" value={courseId} />
      {lesson ? <input type="hidden" name="id" value={lesson.id} /> : null}
      {state?.message ? <Notice tone="error">{state.message}</Notice> : null}
      <Field label="Title" htmlFor="lf-title" error={err("title")}>
        <Input id="lf-title" name="title" required maxLength={200} defaultValue={v("title", lesson?.title)} aria-invalid={err("title") ? true : undefined} />
      </Field>
      <FieldRow>
        <Field label="Kind" htmlFor="lf-kind" error={err("kind")}>
          <Select id="lf-kind" name="kind" value={k} onChange={(e) => setKind(e.currentTarget.value)} options={LESSON_KINDS.map((x) => ({ value: x, label: LESSON_KIND_LABELS[x] }))} />
        </Field>
        <FieldRow>
          <Field label="Order" htmlFor="lf-position" hint="1 comes first." error={err("position")}>
            <Input id="lf-position" name="position" type="number" min={-999} max={999} defaultValue={v("position", lesson?.position ?? defaultPosition)} aria-invalid={err("position") ? true : undefined} />
          </Field>
          <Field label="Minutes" htmlFor="lf-minutes" error={err("minutes")}>
            <Input id="lf-minutes" name="minutes" type="number" min={1} max={600} defaultValue={v("minutes", lesson?.minutes)} aria-invalid={err("minutes") ? true : undefined} />
          </Field>
        </FieldRow>
      </FieldRow>
      {k === "video" || k === "pdf" || k === "link" ? (
        <Field label={k === "video" ? "Video address" : k === "pdf" ? "Booklet address" : "Link"} htmlFor="lf-url" hint={URL_HINT[k]} error={err("url")}>
          <Input id="lf-url" name="url" maxLength={2000} placeholder={k === "pdf" ? "/learn/booklet.pdf" : "https://"} defaultValue={v("url", lesson?.url)} aria-invalid={err("url") ? true : undefined} />
        </Field>
      ) : null}
      {k === "quiz" ? (
        <div className="space-y-1.5">
          <label htmlFor="lf-quiz" className="block text-[13px] font-medium text-foreground/80">
            Questions
          </label>
          <Textarea id="lf-quiz" name="quizText" rows={16} spellCheck={false} className="font-mono text-[13px]" defaultValue={v("quizText", lesson?.quizText)} aria-invalid={quizErrors.length ? true : undefined} aria-describedby="lf-quiz-help" />
          {quizErrors.length ? (
            <div role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2.5 text-xs text-danger">
              <p className="font-medium">Fix these, then save again:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {quizErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div id="lf-quiz-help" className="space-y-1.5 text-xs text-muted-foreground">
            <p>One block per question: “Q:” then the question, options as A), B), C)..., then “Answer:” with the letter and an optional “Why:”. Experts need 70% to pass.</p>
            <pre className="overflow-x-auto rounded-md bg-secondary px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground/80">{QUIZ_TEXT_EXAMPLE}</pre>
          </div>
        </div>
      ) : null}
      <Field label={BODY_LABEL[k]} htmlFor="lf-body" hint="Markdown: # headings, - lists, **bold**, [links](https://...)." error={err("body")}>
        <Textarea id="lf-body" name="body" rows={k === "reading" ? 16 : 8} maxLength={20000} defaultValue={v("body", lesson?.body)} aria-invalid={err("body") ? true : undefined} />
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending ? "Saving..." : lesson ? "Save lesson" : "Add lesson"}
        </button>
        <Link href={cancelHref} scroll={false} className={buttonClass("secondary", "md")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
