"use client";
// A quiz lesson: one question per block, radio buttons, "Check my answers". The browser only ever has
// the questions and options; the score, the right answers and the reasons come back from the server.
// 70% or more finishes the lesson. "Try again" starts a fresh attempt; the best score is kept.
import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { submitQuiz, type QuizState } from "@/app/(portal)/me/learn/actions";
import { optionLetter } from "@/lib/learn/quiz";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/feedback";

type Question = { q: string; options: string[] };

export function QuizForm({ lessonId, questions, passPercent, nextHref, nextLabel }: { lessonId: string; questions: Question[]; passPercent: number; nextHref?: string | null; nextLabel?: string }) {
  const [state, formAction, pending] = useActionState<QuizState, FormData>(submitQuiz, null);
  const [attempt, setAttempt] = useState(0);
  const [dismissed, setDismissed] = useState<QuizState>(null);
  const shown = state && state !== dismissed ? state : null;

  if (shown?.ok) {
    return (
      <QuizReview
        result={shown}
        questions={questions}
        passPercent={passPercent}
        nextHref={nextHref}
        nextLabel={nextLabel}
        onRetry={() => {
          setDismissed(state);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  return (
    <form key={attempt} action={formAction} className="space-y-8">
      <input type="hidden" name="lessonId" value={lessonId} />
      {shown && !shown.ok ? <Notice tone="error">{shown.error}</Notice> : null}
      <ol className="space-y-8">
        {questions.map((q, i) => (
          <li key={i}>
            <fieldset className="space-y-3">
              <legend className="mb-3 text-[15px] leading-relaxed text-foreground">
                <span className="tabular mr-2 text-muted-foreground">{i + 1}.</span>
                {q.q}
              </legend>
              {q.options.map((o, k) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground/90 transition-colors hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.05] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <input type="radio" name={`q${i}`} value={k} required className="mt-0.5 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none" />
                  <span>
                    <span className="mr-1.5 text-muted-foreground">{optionLetter(k)})</span>
                    {o}
                  </span>
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-6">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending ? "Checking..." : "Check my answers"}
        </button>
        <span className="text-[13px] text-muted-foreground">
          {questions.length} {questions.length === 1 ? "question" : "questions"} · {passPercent}% to pass · you can try again
        </span>
      </div>
    </form>
  );
}

function QuizReview({
  result,
  questions,
  passPercent,
  nextHref,
  nextLabel = "Next lesson",
  onRetry,
}: {
  result: Extract<QuizState, { ok: true }>;
  questions: Question[];
  passPercent: number;
  nextHref?: string | null;
  nextLabel?: string;
  onRetry: () => void;
}) {
  const { percent, correct, total, passed, best, attempts, lessonDone, courseCompleted, review } = result;
  return (
    <div className="space-y-8" aria-live="polite">
      <div className={cn("rounded-xl border px-5 py-5 sm:px-6", passed ? "border-success/25 bg-success-soft" : "border-border bg-secondary/60")}>
        <p className="eyebrow text-muted-foreground">Your score</p>
        <p className="tabular mt-1 text-stat text-foreground">{percent}%</p>
        <p className="mt-2 text-sm text-foreground/85">
          {correct} of {total} right.{" "}
          {passed ? (courseCompleted ? "Passed, and that finishes the course. It's in your certificates now." : "Passed. Nice work.") : `You need ${passPercent}% to pass. Read the answers below, then give it another go.`}
        </p>
        {lessonDone && best != null ? (
          <p className="mt-1 text-[13px] text-muted-foreground">
            Best score {best}%{attempts && attempts > 1 ? ` · ${attempts} attempts` : ""}
          </p>
        ) : null}
      </div>

      <ol className="space-y-7">
        {questions.map((q, i) => {
          const r = review[i];
          if (!r) return null;
          return (
            <li key={i} className="space-y-3">
              <p className="text-[15px] leading-relaxed text-foreground">
                <span className="tabular mr-2 text-muted-foreground">{i + 1}.</span>
                {q.q}
              </p>
              <ul className="space-y-1.5">
                {q.options.map((o, k) => {
                  const isAnswer = k === r.answer;
                  const picked = k === r.chosen;
                  return (
                    <li
                      key={k}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm leading-relaxed",
                        isAnswer ? "border-success/30 bg-success-soft text-foreground" : picked ? "border-danger/25 bg-danger-soft text-foreground" : "border-transparent text-muted-foreground",
                      )}
                    >
                      <span className="mt-0.5 shrink-0">
                        {isAnswer ? <Check className="h-4 w-4 text-success" aria-label="Right answer" /> : picked ? <X className="h-4 w-4 text-danger" aria-label="Your answer" /> : <span className="inline-block h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="mr-1.5 text-muted-foreground">{optionLetter(k)})</span>
                        {o}
                      </span>
                      {picked ? <span className="shrink-0 text-xs text-muted-foreground">Your answer</span> : null}
                    </li>
                  );
                })}
              </ul>
              {r.chosen === null ? <p className="text-[13px] text-muted-foreground">You didn&apos;t answer this one.</p> : null}
              {r.why ? (
                <p className="text-sm leading-relaxed text-foreground/80">
                  <span className="text-foreground">Why: </span>
                  {r.why}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6">
        <button type="button" onClick={onRetry} className={buttonClass(passed ? "secondary" : "primary", "md")}>
          Try again
        </button>
        {passed && nextHref ? (
          <Link href={nextHref} className={buttonClass("primary", "md")}>
            {nextLabel} →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
