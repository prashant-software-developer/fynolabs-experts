// One course in the Learn admin (/admin/learn/<id>): Publish / Unpublish, the lessons (add, edit and
// delete in a side panel, ?lesson=<id> or ?lesson=new), the course details and Delete. Admins only.
import { Plus } from "@/components/icons";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { courseKindLabel, lessonKindLabel, levelLabel, minutesLabel, videoSource } from "@/lib/learn/labels";
import { isUsableQuiz, quizToText } from "@/lib/learn/quiz";
import { courseList, courseWithLessons } from "@/lib/server/learn";
import type { CourseLesson } from "@/db/schema";
import { RowLink } from "@/components/crm/row-link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { deleteCourseForm, deleteLessonForm, setPublishedForm } from "../actions";
import { CourseForm } from "../course-form";
import { LessonForm } from "../lesson-form";

export const metadata = { title: "Course · Learn" };

/** What the lesson holds, in a few words (the Content column). */
function contentOf(l: CourseLesson): string {
  const notes = l.body?.trim() ? " + notes" : "";
  switch (l.kind) {
    case "video": {
      const v = videoSource(l.url);
      if (!v) return l.body?.trim() ? "Coming soon + notes" : "Coming soon";
      return `${v.kind === "youtube" ? "YouTube" : v.kind === "file" ? "Video file" : "Video link"}${notes}`;
    }
    case "pdf":
      return l.url ? `${l.url}${notes}` : "No booklet yet";
    case "quiz": {
      const n = isUsableQuiz(l.quiz) ? l.quiz.length : 0;
      return n ? `${n} ${n === 1 ? "question" : "questions"}` : "No questions yet";
    }
    case "link":
      return l.url ? l.url.replace(/^https?:\/\//, "") : "No link yet";
    default: {
      const words = l.body?.trim() ? l.body.trim().split(/\s+/).length : 0;
      return words ? `${words} words` : "No text yet";
    }
  }
}

export default async function AdminCoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user, allowed } = await requireSection("settings");
  if (!allowed || !can(user.role, "settings.manage"))
    return (
      <>
        <PageHeader title="Learn" back={{ href: "/admin/learn", label: "Learn" }} />
        <Section>
          <NoAccess what="Learn" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const data = await courseWithLessons(db, id);
  if (!data)
    return (
      <>
        <PageHeader title="Course not found" back={{ href: "/admin/learn", label: "Learn" }} />
        <Section>
          <EmptyState size="section" title="This course doesn't exist any more" description="It may have been deleted. Every course is listed on Learn." action={<ButtonLink href="/admin/learn" size="sm">Back to Learn</ButtonLink>} />
        </Section>
      </>
    );
  const { course, lessons } = data;
  const stats = (await courseList(db)).find((r) => r.id === course.id);
  const base = `/admin/learn/${course.id}`;
  const close = hrefWith(base, sp, { lesson: null, ok: null, error: null });
  const editing = one(sp.lesson);
  const lesson = editing && editing !== "new" ? (lessons.find((l) => l.id === editing) ?? null) : null;
  const panelOpen = editing === "new" || Boolean(lesson);
  const nextPosition = lessons.reduce((m, l) => Math.max(m, l.position), 0) + 1;
  const time = minutesLabel(course.minutes ?? (lessons.reduce((n, l) => n + (l.minutes ?? 0), 0) || null));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/learn", label: "Learn" }}
        title={course.title}
        badge={course.published ? <Badge tone="success" pill dot>Published</Badge> : <Badge tone="muted" pill dot>Draft</Badge>}
        subtitle={`${courseKindLabel(course.kind)} · ${levelLabel(course.level)}${time ? ` · ${time}` : ""} · experts open it at /me/learn/${course.slug}`}
        meta={
          stats ? (
            <span className="text-[13px] text-muted-foreground">
              Started by {stats.started} {stats.started === 1 ? "expert" : "experts"} · completed by {stats.completed}
            </span>
          ) : null
        }
        actions={
          <form action={setPublishedForm}>
            <input type="hidden" name="id" value={course.id} />
            <input type="hidden" name="published" value={course.published ? "no" : "yes"} />
            <input type="hidden" name="returnTo" value={close} />
            <SubmitButton variant={course.published ? "secondary" : "primary"} pendingText="Saving…">
              {course.published ? "Unpublish" : "Publish"}
            </SubmitButton>
          </form>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        <Section
          title="Lessons"
          description="In order. Experts tick each one off; a quiz counts once they score 70% or more."
          actions={
            <ButtonLink href={hrefWith(base, sp, { lesson: "new", ok: null, error: null })} variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add lesson
            </ButtonLink>
          }
          flush
        >
          {lessons.length ? (
            <Table>
              <THead>
                <Th className="w-14 text-right">Order</Th>
                <Th>Lesson</Th>
                <Th>Kind</Th>
                <Th className="text-right">Minutes</Th>
                <Th>Content</Th>
              </THead>
              <TBody>
                {lessons.map((l) => (
                  <tr key={l.id} className="row-hover relative">
                    <Td className="tabular text-right text-muted-foreground">{l.position}</Td>
                    <Td className=".5">
                      <RowLink href={hrefWith(base, sp, { lesson: l.id, ok: null, error: null })} className="block max-w-96 truncate">
                        {l.title}
                      </RowLink>
                    </Td>
                    <Td>{lessonKindLabel(l.kind)}</Td>
                    <Td className="tabular text-right">{l.minutes ?? "–"}</Td>
                    <Td className="max-w-72 truncate text-muted-foreground">{contentOf(l)}</Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="No lessons yet" description="Add a video, a booklet, a reading, a quiz or a link." />
          )}
        </Section>

        <Section title="Details" description="What experts see on the card and at the top of the course.">
          <CourseForm
            course={{ id: course.id, title: course.title, slug: course.slug, summary: course.summary, kind: course.kind, level: course.level, minutes: course.minutes, art: course.art, position: course.position, published: course.published }}
          />
        </Section>

        <Section title="Delete this course" description="Removes the course, its lessons and every expert's progress in it. To hide it for a while instead, unpublish it.">
          <form action={deleteCourseForm}>
            <input type="hidden" name="id" value={course.id} />
            <SubmitButton variant="danger" size="sm" pendingText="Deleting…" confirm={`Delete “${course.title}”, its ${lessons.length} lessons and everyone's progress in it? This can't be undone.`}>
              Delete course
            </SubmitButton>
          </form>
        </Section>
      </Stack>

      {panelOpen ? (
        <SlideOver
          title={lesson ? "Edit lesson" : "New lesson"}
          closeHref={close}
          footer={
            lesson ? (
              <form action={deleteLessonForm} className="mr-auto">
                <input type="hidden" name="courseId" value={course.id} />
                <input type="hidden" name="lessonId" value={lesson.id} />
                <SubmitButton variant="ghost" size="sm" className="text-danger" pendingText="Deleting…" confirm="Delete this lesson? Experts' progress on it goes with it.">
                  Delete lesson
                </SubmitButton>
              </form>
            ) : undefined
          }
        >
          <LessonForm
            key={lesson?.id ?? "new"}
            courseId={course.id}
            cancelHref={close}
            defaultPosition={nextPosition}
            lesson={lesson ? { id: lesson.id, title: lesson.title, kind: lesson.kind, position: lesson.position, minutes: lesson.minutes, url: lesson.url, body: lesson.body, quizText: quizToText(lesson.quiz) } : null}
          />
        </SlideOver>
      ) : null}
    </>
  );
}
