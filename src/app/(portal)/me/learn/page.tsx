// Learn (/me/learn): how AI-training work is done, from FynoLabs's own courses, booklets and quizzes.
// Continue learning, then Courses, Booklets and Quizzes, then the expert's certificates.
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { COURSE_KINDS, type CourseKind } from "@/lib/constants";
import { one, type SearchParams } from "@/lib/filters";
import { learnCatalog } from "@/lib/server/learn";
import { CardGrid, CertificateList, CourseCard } from "@/components/portal/learn/course-card";
import { PortalEmpty, PortalHeader, PortalSectionTitle } from "@/components/portal/page";
import { FlashFromParams } from "@/components/ui/feedback";

export const metadata = { title: "Learn" };

const GROUPS: Record<CourseKind, { title: string; blurb: string }> = {
  course: { title: "Courses", blurb: "Short lessons, step by step, with a quick quiz to check what you know." },
  guide: { title: "Booklets", blurb: "Illustrated guides you can read in one sitting." },
  quiz: { title: "Quizzes", blurb: "Quick questions to check what you know." },
};

export default async function LearnPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await portalContext("/me/learn");
  if (ctx.kind !== "expert") return null;
  const cards = await learnCatalog(await getDb(), ctx.expertId);
  const inProgress = cards.filter((c) => c.done > 0 && c.done < c.lessons);
  const certificates = cards
    .filter((c) => c.completedAt)
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
    .map((c) => ({ slug: c.slug, title: c.title, kind: c.kind, completedAt: c.completedAt as Date }));

  return (
    <>
      <PortalHeader title="Learn" subtitle="How AI-training work is done, step by step: short courses, illustrated booklets and quick quizzes from the FynoLabs team. Go at your own pace." />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      {!cards.length ? (
        <PortalEmpty title="Courses are on their way" description="We're putting together short courses, booklets and quizzes on how AI-training work is done. Check back soon." />
      ) : (
        <div className="space-y-14">
          {inProgress.length ? (
            <section aria-labelledby="learn-continue">
              <PortalSectionTitle>
                <span id="learn-continue">Continue learning</span>
              </PortalSectionTitle>
              <CardGrid>
                {inProgress.map((c) => (
                  <CourseCard key={c.id} c={c} />
                ))}
              </CardGrid>
            </section>
          ) : null}

          {COURSE_KINDS.map((kind) => {
            const list = cards.filter((c) => c.kind === kind);
            if (!list.length) return null;
            const g = GROUPS[kind];
            return (
              <section key={kind} aria-labelledby={`learn-${kind}`}>
                <PortalSectionTitle count={list.length} className="mb-1">
                  <span id={`learn-${kind}`}>{g.title}</span>
                </PortalSectionTitle>
                <p className="mb-5 text-sm text-muted-foreground">{g.blurb}</p>
                <CardGrid>
                  {list.map((c) => (
                    <CourseCard key={c.id} c={c} />
                  ))}
                </CardGrid>
              </section>
            );
          })}

          <section aria-labelledby="learn-certificates">
            <PortalSectionTitle count={certificates.length || undefined} className="mb-1">
              <span id="learn-certificates">Your certificates</span>
            </PortalSectionTitle>
            <p className="mb-5 text-sm text-muted-foreground">Everything you&apos;ve finished, newest first.</p>
            {certificates.length ? (
              <CertificateList items={certificates} />
            ) : (
              <PortalEmpty title="No certificates yet" description="Finish every lesson of a course, booklet or quiz and it shows up here." />
            )}
          </section>
        </div>
      )}
    </>
  );
}
