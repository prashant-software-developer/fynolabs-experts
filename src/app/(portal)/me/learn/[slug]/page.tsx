// One course, booklet or quiz set (/me/learn/<slug>?lesson=<id>): the header with progress, the
// numbered lessons with ticks, then the open lesson. Without ?lesson= it opens the first lesson not
// done yet. Only published courses open; anything else shows a short note.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, ChevronRight } from "@/components/icons";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { courseKindLabel, lessonKindLabel, lessonsLabel, levelLabel, minutesLabel } from "@/lib/learn/labels";
import { courseForExpert, publishedCourseTitle } from "@/lib/server/learn";
import { CourseArtPanel } from "@/components/portal/learn/course-art";
import { ProgressBar } from "@/components/portal/learn/course-card";
import { LessonPanel } from "@/components/portal/learn/lesson-view";
import { PortalEmpty, PortalSectionTitle } from "@/components/portal/page";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FlashFromParams, Notice } from "@/components/ui/feedback";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const title = await publishedCourseTitle(await getDb(), slug).catch(() => null);
  return { title: title ?? "Learn" };
}

function BackToLearn() {
  return (
    <Link href="/me/learn" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Learn
    </Link>
  );
}

export default async function CoursePage({ params, searchParams }: { params: Params; searchParams: Promise<SearchParams> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ctx = await portalContext(`/me/learn/${encodeURIComponent(slug)}`);
  if (ctx.kind !== "expert") return null;
  const view = await courseForExpert(await getDb(), ctx.expertId, slug);
  if (!view)
    return (
      <>
        <BackToLearn />
        <PortalEmpty
          title="This course isn't available"
          description="It may have moved or be taken down for a refresh. Everything you can take is on Learn."
          action={
            <Link href="/me/learn" className={buttonClass("secondary", "sm")}>
              Go to Learn
            </Link>
          }
        />
      </>
    );

  const { course, lessons, done, total, completedAt } = view;
  const base = `/me/learn/${course.slug}`;
  const wanted = one(sp.lesson);
  const index = lessons.findIndex((l) => l.id === wanted);
  // Always open a lesson by its address, so the page stays on it while its quiz is graded.
  if (index < 0 && view.defaultLessonId) {
    const q = new URLSearchParams({ lesson: view.defaultLessonId });
    for (const k of ["ok", "error"] as const) if (one(sp[k])) q.set(k, one(sp[k]));
    redirect(`${base}?${q.toString().replace(/\+/g, "%20")}`);
  }
  const current = index >= 0 ? lessons[index] : null;
  const next = index >= 0 ? lessons[index + 1] : undefined;
  const finished = total > 0 && done >= total;
  const facts = [courseKindLabel(course.kind), lessonsLabel(total), minutesLabel(course.minutes)].filter(Boolean).join(" · ");

  return (
    <>
      <BackToLearn />
      <header className="mb-10 space-y-6">
        <CourseArtPanel art={course.art} className="aspect-[12/7] max-h-56 w-full rounded-xl border border-border sm:aspect-[24/7]" />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="outline" className="font-normal">
              {levelLabel(course.level)}
            </Badge>
            <span className="text-[13px] text-muted-foreground">{facts}</span>
            {finished ? <Badge tone="success">Completed{completedAt ? ` · ${fmtDate(completedAt)}` : ""}</Badge> : null}
          </div>
          <h1 className="text-title text-foreground">{course.title}</h1>
          {course.summary ? <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{course.summary}</p> : null}
        </div>
        {total ? (
          <div className="max-w-md space-y-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">{finished ? "All lessons done" : done ? "Your progress" : "Not started yet"}</span>
              <span className="tabular text-foreground">
                {done} of {total} done
              </span>
            </div>
            <ProgressBar done={done} total={total} />
          </div>
        ) : null}
      </header>

      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      {finished ? (
        <Notice tone="success" title="You finished this course" className="mb-8">
          Nice work. It&apos;s in your certificates on Learn. Come back any time to review it.
        </Notice>
      ) : null}

      {!lessons.length ? (
        <PortalEmpty title="Lessons are on their way" description="We're still putting this one together. Check back soon." />
      ) : (
        <div className="space-y-10">
          <section aria-labelledby="course-lessons">
            <PortalSectionTitle>
              <span id="course-lessons">Lessons</span>
            </PortalSectionTitle>
            <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {lessons.map((l, i) => {
                const on = current?.id === l.id;
                const meta = [lessonKindLabel(l.kind), minutesLabel(l.minutes), !l.ready ? "Coming soon" : null, l.kind === "quiz" && l.score != null ? `Best ${l.score}%` : null].filter(Boolean).join(" · ");
                return (
                  <li key={l.id}>
                    <Link
                      href={`${base}?lesson=${l.id}#lesson`}
                      aria-current={on ? "step" : undefined}
                      className={cn("flex items-center gap-4 px-5 py-3.5 transition-colors", on ? "bg-primary/[0.06]" : "hover:bg-foreground/[0.025]")}
                    >
                      <span
                        className={cn(
                          "tabular grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[12px]",
                          l.done ? "border-primary bg-primary text-primary-foreground" : on ? "border-primary text-primary" : "border-border text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        {l.done ? <Check className="h-3.5 w-3.5" weight="bold" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-[15px]", on ? "text-primary" : "text-foreground")}>
                          {l.title}
                          {l.done ? <span className="sr-only"> (done)</span> : null}
                        </span>
                        <span className="block text-xs text-muted-foreground">{meta}</span>
                      </span>
                      <ChevronRight className={cn("h-4 w-4 shrink-0", on ? "text-primary" : "text-muted-foreground/50")} aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>

          {current ? <LessonPanel slug={course.slug} lesson={current} index={index} nextHref={next ? `${base}?lesson=${next.id}#lesson` : null} courseFinished={finished} /> : null}
        </div>
      )}
    </>
  );
}
