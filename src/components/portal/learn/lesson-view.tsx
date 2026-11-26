// One lesson on a course page, shown by kind: a video (YouTube in the privacy-enhanced player, or a
// video file), a PDF booklet, a reading, a quiz or a link. Then "Mark as done" (or the quiz's own
// button) and "Next lesson".
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle2, Download, ExternalLink } from "lucide-react";
import { markLessonDone } from "@/app/(portal)/me/learn/actions";
import { fmtDate } from "@/lib/format";
import { lessonKindLabel, minutesLabel, videoSource } from "@/lib/learn/labels";
import { PASS_PERCENT } from "@/lib/learn/quiz";
import { renderMarkdown } from "@/lib/markdown";
import type { LessonView } from "@/lib/server/learn";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { cn } from "@/components/ui/cn";
import { QuizForm } from "./quiz-form";

/** Lesson text (Markdown, rendered safely by src/lib/markdown.ts). */
export function Prose({ md, className }: { md: string | null | undefined; className?: string }) {
  const html = renderMarkdown(md);
  if (!html) return null;
  return <div className={cn("job-prose", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A calm panel for something that isn't there yet. */
function Soon({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-5 rounded-xl border border-dashed border-border bg-secondary/40 px-5 py-6 sm:px-6">
      <svg viewBox="0 0 64 44" fill="none" className="h-11 w-16 shrink-0" aria-hidden="true">
        <rect x="1.5" y="1.5" width="61" height="41" className="fill-card stroke-muted-foreground" strokeOpacity={0.4} vectorEffect="non-scaling-stroke" />
        <path d="M27 14v16l13-8z" className="fill-primary" />
        <path d="M8 36h48" className="stroke-muted-foreground" strokeOpacity={0.25} vectorEffect="non-scaling-stroke" />
        <path d="M8 36h14" className="stroke-primary" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="min-w-0 space-y-1">
        <p className="text-[15px] text-foreground">{title}</p>
        {children ? <p className="text-sm leading-relaxed text-muted-foreground">{children}</p> : null}
      </div>
    </div>
  );
}

function Video({ lesson }: { lesson: LessonView }) {
  const v = videoSource(lesson.url);
  if (!v)
    return (
      <Soon title="Video coming soon">{lesson.body ? "The notes below cover what it teaches. Read them, then mark this lesson done." : "We're finishing this one. Check back soon."}</Soon>
    );
  if (v.kind === "youtube")
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-secondary">
        <iframe
          src={v.embed}
          title={lesson.title}
          className="h-full w-full"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
    );
  if (v.kind === "file")
    return (
      <video controls preload="metadata" playsInline className="aspect-video w-full rounded-xl border border-border bg-foreground" src={v.src}>
        Your browser can&apos;t play this video here.{" "}
        <a href={v.src} className="underline">
          Download it
        </a>
        .
      </video>
    );
  return (
    <a href={v.href} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md")}>
      Watch the video <ExternalLink className="h-4 w-4" aria-hidden />
    </a>
  );
}

function Booklet({ lesson }: { lesson: LessonView }) {
  if (!lesson.url) return <Soon title="Booklet coming soon">We&apos;re finishing this one. Check back soon.</Soon>;
  const sameSite = lesson.url.startsWith("/");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <a href={lesson.url} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md")}>
          Open the booklet <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
        {sameSite ? (
          <a href={lesson.url} download className={buttonClass("secondary", "md")}>
            <Download className="h-4 w-4" aria-hidden /> Download PDF
          </a>
        ) : null}
      </div>
      <Prose md={lesson.body} />
      {/* The booklet inline on larger screens (phones open it full screen with the button above). */}
      {sameSite ? <iframe src={`${lesson.url}#view=FitH`} title={lesson.title} className="hidden h-[78vh] min-h-[32rem] w-full rounded-xl border border-border bg-secondary sm:block" /> : null}
    </div>
  );
}

export function LessonPanel({
  slug,
  lesson,
  index,
  nextHref,
  courseFinished,
}: {
  slug: string;
  lesson: LessonView;
  index: number;
  nextHref: string | null;
  courseFinished: boolean;
}) {
  const kind = lessonKindLabel(lesson.kind);
  const mins = minutesLabel(lesson.minutes);
  const isQuiz = lesson.kind === "quiz";
  const next = nextHref ? (
    <Link href={nextHref} className={buttonClass(lesson.done ? "primary" : "secondary", "md")}>
      Next lesson <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  ) : courseFinished ? (
    <Link href="/me/learn" className={buttonClass(lesson.done ? "primary" : "secondary", "md")}>
      Back to Learn
    </Link>
  ) : null;

  return (
    <section id="lesson" className="scroll-mt-6 overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="lesson-title">
      <header className="border-b border-border px-5 py-5 sm:px-7">
        <p className="eyebrow text-muted-foreground">
          Lesson {index + 1} · {kind}
          {mins ? ` · ${mins}` : ""}
        </p>
        <h2 id="lesson-title" className="mt-1.5 text-xl font-light text-foreground">
          {lesson.title}
        </h2>
      </header>

      <div className="space-y-6 px-5 py-6 sm:px-7 sm:py-7">
        {lesson.kind === "video" ? (
          <>
            <Video lesson={lesson} />
            {lesson.body ? (
              <div className="space-y-3">
                {lesson.url ? <p className="eyebrow text-muted-foreground">Notes</p> : null}
                <Prose md={lesson.body} />
              </div>
            ) : null}
          </>
        ) : null}
        {lesson.kind === "pdf" ? <Booklet lesson={lesson} /> : null}
        {lesson.kind === "reading" ? lesson.body ? <Prose md={lesson.body} /> : <Soon title="Coming soon">We&apos;re writing this one. Check back soon.</Soon> : null}
        {lesson.kind === "link" ? (
          <>
            <Prose md={lesson.body} />
            {lesson.url ? (
              <a href={lesson.url} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md")}>
                Open the link <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            ) : (
              <Soon title="Coming soon" />
            )}
          </>
        ) : null}
        {isQuiz ? (
          <>
            {lesson.done ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Passed{lesson.score != null ? ` · best score ${lesson.score}%` : ""}. Take it again any time.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Pick one answer for each question. Score {PASS_PERCENT}% or more to finish this lesson.</p>
            )}
            <Prose md={lesson.body} />
            {lesson.questions.length ? (
              <QuizForm key={lesson.id} lessonId={lesson.id} questions={lesson.questions} passPercent={PASS_PERCENT} nextHref={nextHref ?? (courseFinished ? "/me/learn" : null)} nextLabel={nextHref ? "Next lesson" : "Back to Learn"} />
            ) : (
              <Soon title="Quiz coming soon">We&apos;re writing the questions. Check back soon.</Soon>
            )}
          </>
        ) : null}
      </div>

      {!isQuiz || next ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-7">
          <div className="min-w-0">
            {isQuiz ? null : lesson.done ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Done{lesson.completedAt ? ` · ${fmtDate(lesson.completedAt)}` : ""}
              </p>
            ) : lesson.ready ? (
              <form action={markLessonDone}>
                <input type="hidden" name="lessonId" value={lesson.id} />
                <input type="hidden" name="back" value={`/me/learn/${slug}`} />
                <SubmitButton pendingText="Saving...">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Mark as done
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Not ready yet. You can mark it done once it&apos;s here.</p>
            )}
          </div>
          {next}
        </footer>
      ) : null}
    </section>
  );
}
