// Learn admin (/admin/learn): every course, booklet and quiz set with its lessons and how many experts
// started and finished it. A row opens a side panel first ("Open full course" edits it). New course
// and "Add the FynoLabs starter courses" (inserts only what's missing). Admins only (settings.manage).
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { ago } from "@/lib/format";
import { courseKindLabel, lessonKindLabel, lessonsLabel, levelLabel, minutesLabel } from "@/lib/learn/labels";
import { courseList, courseWithLessons } from "@/lib/server/learn";
import { CourseArtPanel } from "@/components/portal/learn/course-art";
import { RowLink } from "@/components/crm/row-link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { DefinitionList, PageHeader, Section, Stat, StatGrid } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { addStarterCoursesForm, setPublishedForm } from "./actions";
import { CourseForm } from "./course-form";

export const metadata = { title: "Learn" };

const BASE = "/admin/learn";

function StarterButton({ returnTo, variant = "secondary" }: { returnTo: string; variant?: "primary" | "secondary" }) {
  return (
    <form action={addStarterCoursesForm}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <SubmitButton variant={variant} pendingText="Adding...">
        Add the FynoLabs starter courses
      </SubmitButton>
    </form>
  );
}

export default async function AdminLearnPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("settings");
  if (!allowed || !can(user.role, "settings.manage"))
    return (
      <>
        <PageHeader title="Learn" />
        <Section>
          <NoAccess what="Learn" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const rows = await courseList(db);
  const viewId = one(sp.view);
  const viewing = viewId ? (rows.find((r) => r.id === viewId) ?? null) : null;
  const viewLessons = viewing ? ((await courseWithLessons(db, viewing.id))?.lessons ?? []) : [];
  const close = hrefWith(BASE, sp, { view: null, new: null, ok: null, error: null });
  const here = hrefWith(BASE, sp, { ok: null, error: null });
  const published = rows.filter((r) => r.published).length;
  const nextPosition = rows.reduce((m, r) => Math.max(m, r.position), 0) + 10;

  return (
    <>
      <PageHeader
        title="Learn"
        subtitle="Courses, booklets and quizzes experts see under Learn in their portal: how AI-training work is done."
        actions={
          <>
            {rows.length ? <StarterButton returnTo={here} /> : null}
            <ButtonLink href={hrefWith(BASE, sp, { new: "1", view: null, ok: null, error: null })} variant="primary">
              <Plus className="h-4 w-4" aria-hidden /> New course
            </ButtonLink>
          </>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      {rows.length ? (
        <div className="mb-6">
          <StatGrid>
            <Stat label="Published" value={published} />
            <Stat label="Drafts" value={rows.length - published} hint="Experts don't see these" />
            <Stat label="Course starts" value={rows.reduce((n, r) => n + r.started, 0)} hint="Experts who began a course" />
            <Stat label="Completions" value={rows.reduce((n, r) => n + r.completed, 0)} hint="Certificates earned" />
          </StatGrid>
        </div>
      ) : null}
      <Section flush>
        {rows.length ? (
          <Table>
            <THead>
              <Th>Course</Th>
              <Th>Kind</Th>
              <Th>Level</Th>
              <Th className="text-right">Lessons</Th>
              <Th>Status</Th>
              <Th className="text-right">Started</Th>
              <Th className="text-right">Completed</Th>
            </THead>
            <TBody>
              {rows.map((c) => (
                <tr key={c.id} className="row-hover relative">
                  <Td className=".5">
                    <RowLink href={hrefWith(BASE, sp, { view: c.id, new: null, ok: null, error: null })} className="block max-w-96 truncate">
                      {c.title}
                    </RowLink>
                    <span className="block text-[13px] text-muted-foreground">/me/learn/{c.slug}</span>
                  </Td>
                  <Td>{courseKindLabel(c.kind)}</Td>
                  <Td>{levelLabel(c.level)}</Td>
                  <Td className="tabular text-right">{c.lessons}</Td>
                  <Td>{c.published ? <Badge tone="success" pill dot>Published</Badge> : <Badge tone="muted" pill dot>Draft</Badge>}</Td>
                  <Td className="tabular text-right">{c.started}</Td>
                  <Td className="tabular text-right">{c.completed}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            size="page"
            title="No courses yet"
            description="Start with the FynoLabs starter courses (Terminal-Bench and PaperBench from zero, the benchmark playbook, the AI Trainer Quiz and more), or make your own."
            action={<StarterButton returnTo={here} variant="primary" />}
          />
        )}
      </Section>

      {one(sp.new) ? (
        <SlideOver title="New course" closeHref={close}>
          <div className="space-y-4">
            <p className="text-small text-muted-foreground">Add the details now and the lessons on the next page. It stays a draft until you tick Published.</p>
            <CourseForm cancelHref={close} defaultPosition={nextPosition} />
          </div>
        </SlideOver>
      ) : null}

      {viewing ? (
        <SlideOver
          title="Course"
          closeHref={close}
          addon={viewing.published ? <Badge tone="success" pill dot>Published</Badge> : <Badge tone="muted" pill dot>Draft</Badge>}
          footer={
            <>
              <form action={setPublishedForm}>
                <input type="hidden" name="id" value={viewing.id} />
                <input type="hidden" name="published" value={viewing.published ? "no" : "yes"} />
                <input type="hidden" name="returnTo" value={here} />
                <SubmitButton variant="secondary" size="sm" pendingText="Saving...">
                  {viewing.published ? "Unpublish" : "Publish"}
                </SubmitButton>
              </form>
              <ButtonLink href={`${BASE}/${viewing.id}`} variant="primary" size="sm">
                Open full course →
              </ButtonLink>
            </>
          }
        >
          <div className="space-y-6">
            <CourseArtPanel art={viewing.art} className="aspect-[21/8] w-full rounded-md border border-border" />
            <div className="space-y-1.5">
              <p className="text-lg text-foreground">{viewing.title}</p>
              {viewing.summary ? <p className="text-small text-muted-foreground">{viewing.summary}</p> : null}
            </div>
            <DefinitionList
              items={[
                { label: "Kind", value: courseKindLabel(viewing.kind) },
                { label: "Level", value: levelLabel(viewing.level) },
                { label: "Lessons", value: lessonsLabel(viewing.lessons) },
                { label: "Time", value: minutesLabel(viewing.minutes ?? (viewLessons.reduce((n, l) => n + (l.minutes ?? 0), 0) || null)) },
                { label: "Started", value: `${viewing.started} ${viewing.started === 1 ? "expert" : "experts"}` },
                { label: "Completed", value: `${viewing.completed} ${viewing.completed === 1 ? "expert" : "experts"}` },
                { label: "Address", value: `/me/learn/${viewing.slug}` },
                { label: "Last change", value: `${ago(viewing.updatedAt)}${viewing.updatedBy ? ` · ${viewing.updatedBy}` : ""}` },
              ]}
            />
            <div className="space-y-2">
              <p className="eyebrow text-muted-foreground">Lessons</p>
              {viewLessons.length ? (
                <ol className="divide-y divide-border rounded-md border border-border">
                  {viewLessons.map((l, i) => (
                    <li key={l.id} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
                      <span className="tabular w-5 shrink-0 text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{l.title}</span>
                      <span className="shrink-0 text-[13px] text-muted-foreground">{lessonKindLabel(l.kind)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  title="No lessons yet"
                  description="Add them on the full course page."
                  action={
                    <Link href={`${BASE}/${viewing.id}?lesson=new`} className="text-[13px] text-primary hover:underline">
                      Add a lesson
                    </Link>
                  }
                />
              )}
            </div>
          </div>
        </SlideOver>
      ) : null}
    </>
  );
}
