"use client";
// The course form (new course and Details): every field experts see on the card, the drawing (with a
// preview) and Published. Errors come back from the server with what was typed.
import Link from "next/link";
import { useActionState, useState } from "react";
import { COURSE_KIND_LABELS, COURSE_KINDS, COURSE_LEVELS } from "@/lib/constants";
import { ART_KEYS, ART_LABELS, LEVEL_LABELS } from "@/lib/learn/labels";
import { CourseArtPanel } from "@/components/portal/learn/course-art";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Checkbox, Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { saveCourseForm, type LearnFormState } from "./actions";

export type CourseFormValues = { id: string; title: string; slug: string; summary: string | null; kind: string; level: string; minutes: number | null; art: string | null; position: number; published: boolean };

export function CourseForm({ course, cancelHref, defaultPosition = 0 }: { course?: CourseFormValues | null; cancelHref?: string; defaultPosition?: number }) {
  const [state, action, pending] = useActionState<LearnFormState, FormData>(saveCourseForm, null);
  const typed = state?.values;
  const v = (k: string, fallback: string | number | null | undefined) => typed?.[k] ?? (fallback == null ? "" : String(fallback));
  const err = (k: string) => state?.errors?.[k] ?? null;
  const [art, setArt] = useState(v("art", course?.art));
  const id = course?.id ?? "new";

  return (
    <form action={action} className="space-y-5">
      {course ? <input type="hidden" name="id" value={course.id} /> : null}
      {state?.message ? <Notice tone="error">{state.message}</Notice> : null}
      <Field label="Title" htmlFor={`${id}-title`} error={err("title")}>
        <Input id={`${id}-title`} name="title" required maxLength={160} defaultValue={v("title", course?.title)} aria-invalid={err("title") ? true : undefined} />
      </Field>
      <Field label="Address" htmlFor={`${id}-slug`} hint="Experts open it at /me/learn/<address>. Leave empty to make one from the title." error={err("slug")}>
        <Input id={`${id}-slug`} name="slug" maxLength={80} placeholder="terminal-bench-from-zero" defaultValue={v("slug", course?.slug)} aria-invalid={err("slug") ? true : undefined} />
      </Field>
      <Field label="Summary" htmlFor={`${id}-summary`} hint="Two short lines on the card. Plain and encouraging; no client names, no pay." error={err("summary")}>
        <Textarea id={`${id}-summary`} name="summary" rows={3} maxLength={400} defaultValue={v("summary", course?.summary)} aria-invalid={err("summary") ? true : undefined} />
      </Field>
      <FieldRow>
        <Field label="Kind" htmlFor={`${id}-kind`} hint="Courses, booklets and quizzes each get their own row on Learn." error={err("kind")}>
          <Select id={`${id}-kind`} name="kind" defaultValue={v("kind", course?.kind ?? "course")} options={COURSE_KINDS.map((k) => ({ value: k, label: COURSE_KIND_LABELS[k] }))} />
        </Field>
        <Field label="Level" htmlFor={`${id}-level`} error={err("level")}>
          <Select id={`${id}-level`} name="level" defaultValue={v("level", course?.level ?? "beginner")} options={COURSE_LEVELS.map((k) => ({ value: k, label: LEVEL_LABELS[k] }))} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Minutes" htmlFor={`${id}-minutes`} hint="Leave empty to add up the lessons." error={err("minutes")}>
          <Input id={`${id}-minutes`} name="minutes" type="number" min={1} max={6000} defaultValue={v("minutes", course?.minutes)} aria-invalid={err("minutes") ? true : undefined} />
        </Field>
        <Field label="Order" htmlFor={`${id}-position`} hint="Lower numbers come first on Learn." error={err("position")}>
          <Input id={`${id}-position`} name="position" type="number" min={-999} max={999} defaultValue={v("position", course?.position ?? defaultPosition)} aria-invalid={err("position") ? true : undefined} />
        </Field>
      </FieldRow>
      <Field label="Drawing" htmlFor={`${id}-art`} hint="The line drawing on the card." error={err("art")}>
        <Select id={`${id}-art`} name="art" value={art} onChange={(e) => setArt(e.currentTarget.value)} options={ART_KEYS.map((k) => ({ value: k, label: ART_LABELS[k] }))} placeholder="A learning path (default)" />
      </Field>
      <CourseArtPanel art={art || null} className="aspect-[12/7] w-full max-w-xs rounded-md border border-border" />
      <Checkbox name="published" label="Published: experts see it under Learn" defaultChecked={typed ? typed.published === "on" : Boolean(course?.published)} />
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending ? "Saving..." : course ? "Save changes" : "Add course"}
        </button>
        {cancelHref ? (
          <Link href={cancelHref} scroll={false} className={buttonClass("secondary", "md")}>
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}
