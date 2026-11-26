// Learn cards: the drawing on top, level, title, two lines of summary, lessons and minutes, and
// Start / Continue / Review. The whole card is one link. Courses with nothing to do yet are shown
// as "Coming soon" and don't link anywhere.
import Link from "next/link";
import type { ReactNode } from "react";
import { fmtDate } from "@/lib/format";
import { courseKindLabel, lessonsLabel, levelLabel, minutesLabel } from "@/lib/learn/labels";
import type { CompletedCourse, CourseCard as CardData } from "@/lib/server/learn";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { CertificateSeal, CourseArtPanel } from "./course-art";

/** A thin blue bar: how much of a course is done. */
export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total ? Math.min(100, Math.round((100 * done) / total)) : 0;
  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-secondary", className)} role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label={`${done} of ${total} lessons done`}>
      <div className="h-1 rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The cards, as many per row as fit (one on phones). */
export function CardGrid({ children }: { children: ReactNode }) {
  return <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>;
}

export function courseHref(c: Pick<CardData, "slug" | "nextLessonId">) {
  return `/me/learn/${c.slug}${c.nextLessonId ? `?lesson=${c.nextLessonId}` : ""}`;
}

export function CourseCard({ c }: { c: CardData }) {
  const finished = c.lessons > 0 && c.done >= c.lessons;
  const started = c.done > 0 && !finished;
  const cta = c.comingSoon ? "Coming soon" : finished ? "Review" : started ? "Continue" : "Start";
  const facts = [lessonsLabel(c.lessons), minutesLabel(c.minutes)].filter(Boolean).join(" · ");
  const body = (
    <article className={cn("flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors", !c.comingSoon && "group-hover:border-primary/40")}>
      <CourseArtPanel art={c.art} className={cn("aspect-[12/7] border-b border-border", c.comingSoon && "opacity-60")} />
      <div className="flex flex-1 flex-col gap-2.5 px-5 pt-4 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="outline" className="font-normal">
            {levelLabel(c.level)}
          </Badge>
          {c.kind !== "course" ? <span className="eyebrow text-muted-foreground">{courseKindLabel(c.kind)}</span> : null}
          {finished ? <Badge tone="success">Completed</Badge> : null}
        </div>
        <h3 className="text-[17px] leading-snug text-foreground transition-colors group-hover:text-primary">{c.title}</h3>
        {c.summary ? <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{c.summary}</p> : null}
        <div className="mt-auto space-y-3 pt-3">
          {started ? <ProgressBar done={c.done} total={c.lessons} /> : null}
          <div className="flex items-center justify-between gap-3">
            <span className="tabular text-[13px] text-muted-foreground">{started ? `${c.done} of ${c.lessons} done` : facts}</span>
            <span className={cn(buttonClass(started ? "primary" : "secondary", "sm"), c.comingSoon && "pointer-events-none opacity-60")} aria-hidden>
              {cta}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
  if (c.comingSoon)
    return (
      <li className="h-full" aria-label={`${c.title}: coming soon`}>
        {body}
      </li>
    );
  return (
    <li className="h-full">
      <Link href={courseHref(c)} className="group block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none" aria-label={`${cta}: ${c.title}`}>
        {body}
      </Link>
    </li>
  );
}

/** Finished courses, booklets and quizzes, newest first. */
export function CertificateList({ items }: { items: (Pick<CompletedCourse, "slug" | "title" | "kind" | "completedAt"> & { href?: string })[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {items.map((c) => (
        <li key={c.slug}>
          <Link href={c.href ?? `/me/learn/${c.slug}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-foreground/[0.025]">
            <CertificateSeal />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-foreground">{c.title}</span>
              <span className="block text-[13px] text-muted-foreground">
                {courseKindLabel(c.kind)} · Completed {fmtDate(c.completedAt)}
              </span>
            </span>
            <span className={buttonClass("ghost", "sm")} aria-hidden>
              Review
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
