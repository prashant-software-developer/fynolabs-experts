// Learn (/me/learn): courses, booklets and quiz sets for experts, with their progress; and the team's
// side (/admin/learn): editing courses and lessons, adding the FynoLabs starter courses, and counts.
// Experts only ever see published courses. Every expert function takes the expert id from the
// signed-in session (src/lib/auth/expert.ts). A lesson_progress row means the lesson is done: a
// quiz gets one on its first pass (70% or more) and then keeps the best score and counts the
// attempts. Tested in tests/learn.test.ts.
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { courseLessons, courses, lessonProgress, type Course, type CourseLesson, type QuizQuestion } from "@/db/schema";
import { COURSE_KINDS, COURSE_LEVELS, LESSON_KINDS, isOneOf } from "@/lib/constants";
import { ART_KEYS, safeLessonUrl } from "@/lib/learn/labels";
import { isUsableQuiz, parseQuizText, questionsForExpert, scoreQuiz, type QuizScore } from "@/lib/learn/quiz";
import { STARTER_COURSES, type SeedCourse } from "@/lib/learn/seed";
import { actorEmail, logActivity, type Actor } from "./activity";

const PORTAL_ACTOR: Actor = { email: "expert-portal", role: "expert" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export type CourseProgress = { slug: string; title: string; kind: string; done: number; total: number };

/** Published courses the expert has started but not finished (for Home). */
export async function coursesInProgress(db: DB, expertId: string): Promise<CourseProgress[]> {
  const rows = await db
    .select({
      slug: courses.slug,
      title: courses.title,
      kind: courses.kind,
      total: sql<number>`(select count(*) from ${courseLessons} l where l.course_id = ${courses.id})`.mapWith(Number),
      done: sql<number>`count(${lessonProgress.id})`.mapWith(Number),
    })
    .from(lessonProgress)
    .innerJoin(courses, eq(courses.id, lessonProgress.courseId))
    .where(and(eq(lessonProgress.expertId, expertId), eq(courses.published, true)))
    .groupBy(courses.id)
    .orderBy(asc(courses.position));
  return rows.filter((r) => r.total > 0 && r.done < r.total);
}

export type CompletedCourse = { slug: string; title: string; kind: string; completedAt: Date };

/** Published courses the expert has finished (every lesson done), newest first: their certificates. */
export async function completedCourses(db: DB, expertId: string): Promise<CompletedCourse[]> {
  const rows = await db
    .select({
      slug: courses.slug,
      title: courses.title,
      kind: courses.kind,
      completedAt: sql<Date>`max(${lessonProgress.completedAt})`.mapWith(lessonProgress.completedAt),
      total: sql<number>`(select count(*) from ${courseLessons} l where l.course_id = ${courses.id})`.mapWith(Number),
      done: sql<number>`count(${lessonProgress.id})`.mapWith(Number),
    })
    .from(lessonProgress)
    .innerJoin(courses, eq(courses.id, lessonProgress.courseId))
    .where(and(eq(lessonProgress.expertId, expertId), eq(courses.published, true)))
    .groupBy(courses.id)
    .orderBy(desc(sql`max(${lessonProgress.completedAt})`), asc(courses.position));
  return rows.filter((r) => r.total > 0 && r.done >= r.total).map(({ slug, title, kind, completedAt }) => ({ slug, title, kind, completedAt }));
}

// ---------- What a lesson needs before an expert can do it ----------

type LessonFacts = { kind: string; url: string | null; hasBody: boolean; questions: number };

/** A video needs an address or notes; a booklet or link an address; a reading its text; a quiz questions. */
export function lessonReady(l: LessonFacts): boolean {
  if (l.kind === "quiz") return l.questions > 0;
  if (l.kind === "reading") return l.hasBody;
  if (l.kind === "video") return Boolean(safeLessonUrl(l.url)) || l.hasBody;
  return Boolean(safeLessonUrl(l.url));
}

const factsOf = (l: Pick<CourseLesson, "kind" | "url" | "body" | "quiz">): LessonFacts => ({
  kind: l.kind,
  url: l.url,
  hasBody: Boolean(l.body?.trim()),
  questions: isUsableQuiz(l.quiz) ? l.quiz.length : 0,
});

/** The lesson to open by default: the first one not done that can be done, else the first not done, else the first. */
function defaultLesson<T extends { id: string; done: boolean; ready: boolean }>(lessons: T[]): string | null {
  return (lessons.find((l) => !l.done && l.ready) ?? lessons.find((l) => !l.done) ?? lessons[0])?.id ?? null;
}

const sumMinutes = (xs: { minutes: number | null }[]) => xs.reduce((n, x) => n + (x.minutes ?? 0), 0) || null;

// ---------- Expert: the catalog and one course ----------

export type CourseCard = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  kind: string;
  level: string;
  art: string | null;
  /** The course's own figure, else the lessons' minutes added up. */
  minutes: number | null;
  lessons: number;
  done: number;
  completedAt: Date | null;
  nextLessonId: string | null;
  /** Nothing in it can be done yet (no lessons, or only videos without an address or notes). */
  comingSoon: boolean;
};

/** Every published course, booklet and quiz set, with the expert's progress, in the team's order. */
export async function learnCatalog(db: DB, expertId: string): Promise<CourseCard[]> {
  const list = await db
    .select({ id: courses.id, slug: courses.slug, title: courses.title, summary: courses.summary, kind: courses.kind, level: courses.level, art: courses.art, minutes: courses.minutes })
    .from(courses)
    .where(eq(courses.published, true))
    .orderBy(asc(courses.position), asc(courses.title));
  if (!list.length) return [];
  const ids = list.map((c) => c.id);
  const [lessons, progress] = await Promise.all([
    db
      .select({
        id: courseLessons.id,
        courseId: courseLessons.courseId,
        kind: courseLessons.kind,
        url: courseLessons.url,
        minutes: courseLessons.minutes,
        hasBody: sql<boolean>`coalesce(length(trim(${courseLessons.body})), 0) > 0`,
        questions: sql<number>`case when jsonb_typeof(${courseLessons.quiz}) = 'array' then jsonb_array_length(${courseLessons.quiz}) else 0 end`.mapWith(Number),
      })
      .from(courseLessons)
      .where(inArray(courseLessons.courseId, ids))
      .orderBy(asc(courseLessons.position), asc(courseLessons.createdAt)),
    db
      .select({ lessonId: lessonProgress.lessonId, completedAt: lessonProgress.completedAt })
      .from(lessonProgress)
      .where(and(eq(lessonProgress.expertId, expertId), inArray(lessonProgress.courseId, ids))),
  ]);
  const doneAt = new Map(progress.map((p) => [p.lessonId, p.completedAt]));
  return list.map((c) => {
    const mine = lessons.filter((l) => l.courseId === c.id).map((l) => ({ ...l, ready: lessonReady({ ...l, hasBody: Boolean(l.hasBody) }), done: doneAt.has(l.id) }));
    const done = mine.filter((l) => l.done).length;
    const finished = mine.length > 0 && done >= mine.length;
    const last = finished ? Math.max(...mine.map((l) => doneAt.get(l.id)?.getTime() ?? 0)) : 0;
    return {
      ...c,
      minutes: c.minutes ?? sumMinutes(mine),
      lessons: mine.length,
      done,
      completedAt: finished && last ? new Date(last) : null,
      nextLessonId: defaultLesson(mine),
      comingSoon: !mine.some((l) => l.ready),
    };
  });
}

export type LessonView = {
  id: string;
  position: number;
  title: string;
  kind: string;
  url: string | null;
  body: string | null;
  minutes: number | null;
  /** Quiz questions without their answers (safe to send to the browser). */
  questions: { q: string; options: string[] }[];
  ready: boolean;
  done: boolean;
  completedAt: Date | null;
  /** A quiz's best score in percent, and how many attempts were graded since the first pass. */
  score: number | null;
  attempts: number | null;
};

export type CourseView = {
  course: Pick<Course, "id" | "slug" | "title" | "summary" | "kind" | "level" | "art" | "minutes">;
  lessons: LessonView[];
  done: number;
  total: number;
  completedAt: Date | null;
  defaultLessonId: string | null;
};

/** One published course with its lessons (in order) and the expert's progress; null if not published. */
export async function courseForExpert(db: DB, expertId: string, slug: string): Promise<CourseView | null> {
  const [course] = await db
    .select({ id: courses.id, slug: courses.slug, title: courses.title, summary: courses.summary, kind: courses.kind, level: courses.level, art: courses.art, minutes: courses.minutes })
    .from(courses)
    .where(and(eq(courses.slug, String(slug ?? "").toLowerCase()), eq(courses.published, true)))
    .limit(1);
  if (!course) return null;
  const [rows, progress] = await Promise.all([
    db.select().from(courseLessons).where(eq(courseLessons.courseId, course.id)).orderBy(asc(courseLessons.position), asc(courseLessons.createdAt)),
    db.select().from(lessonProgress).where(and(eq(lessonProgress.expertId, expertId), eq(lessonProgress.courseId, course.id))),
  ]);
  const mine = new Map(progress.map((p) => [p.lessonId, p]));
  const lessons: LessonView[] = rows.map((l) => {
    const p = mine.get(l.id);
    return {
      id: l.id,
      position: l.position,
      title: l.title,
      kind: l.kind,
      url: safeLessonUrl(l.url),
      body: l.body,
      minutes: l.minutes,
      questions: l.kind === "quiz" && isUsableQuiz(l.quiz) ? questionsForExpert(l.quiz) : [],
      ready: lessonReady(factsOf(l)),
      done: Boolean(p),
      completedAt: p?.completedAt ?? null,
      score: p?.score ?? null,
      attempts: p ? p.attempts : null,
    };
  });
  const done = lessons.filter((l) => l.done).length;
  const finished = lessons.length > 0 && done >= lessons.length;
  const last = finished ? Math.max(...lessons.map((l) => l.completedAt?.getTime() ?? 0)) : 0;
  return {
    course: { ...course, minutes: course.minutes ?? sumMinutes(lessons) },
    lessons,
    done,
    total: lessons.length,
    completedAt: finished && last ? new Date(last) : null,
    defaultLessonId: defaultLesson(lessons),
  };
}

/** A published course's title (the browser tab), or null. */
export async function publishedCourseTitle(db: DB, slug: string): Promise<string | null> {
  const [row] = await db
    .select({ title: courses.title })
    .from(courses)
    .where(and(eq(courses.slug, String(slug ?? "").toLowerCase()), eq(courses.published, true)))
    .limit(1);
  return row?.title ?? null;
}

// ---------- Expert: finishing lessons and quizzes ----------

async function lessonInPublishedCourse(db: DB, lessonId: string) {
  if (!isUuid(lessonId)) return null;
  const [row] = await db
    .select({ lesson: courseLessons, slug: courses.slug, title: courses.title, published: courses.published })
    .from(courseLessons)
    .innerJoin(courses, eq(courses.id, courseLessons.courseId))
    .where(eq(courseLessons.id, lessonId))
    .limit(1);
  return row?.published ? row : null;
}

async function courseCounts(db: DB, expertId: string, courseId: string) {
  const [total, done] = await Promise.all([
    db.$count(courseLessons, eq(courseLessons.courseId, courseId)),
    db.$count(lessonProgress, and(eq(lessonProgress.expertId, expertId), eq(lessonProgress.courseId, courseId))),
  ]);
  return { total: Number(total), done: Number(done) };
}

/** After a lesson was newly done: the course's counts, and a line on the expert's timeline when it's finished. */
async function afterProgress(db: DB, expertId: string, row: { lesson: CourseLesson; slug: string; title: string }, changed: boolean) {
  const { done, total } = await courseCounts(db, expertId, row.lesson.courseId);
  const courseCompleted = changed && total > 0 && done >= total;
  if (courseCompleted) await logActivity(db, { entityType: "expert", entityId: expertId, actor: PORTAL_ACTOR, action: "course_completed", detail: { value: row.title, course: row.slug } });
  return { done, total, courseCompleted };
}

export type LessonDone = { ok: true; slug: string; lessonId: string; done: number; total: number; courseCompleted: boolean } | { ok: false; reason: string };

/** "Mark as done" for a video, booklet, reading or link. Doing it again changes nothing. */
export async function completeLesson(db: DB, expertId: string, lessonId: string): Promise<LessonDone> {
  const row = await lessonInPublishedCourse(db, lessonId);
  if (!row) return { ok: false, reason: "That lesson isn't available." };
  if (row.lesson.kind === "quiz") return { ok: false, reason: "Pass the quiz to finish this lesson." };
  if (!lessonReady(factsOf(row.lesson))) return { ok: false, reason: "This lesson isn't ready yet. Try another one." };
  const inserted = await db.insert(lessonProgress).values({ expertId, lessonId: row.lesson.id, courseId: row.lesson.courseId }).onConflictDoNothing().returning({ id: lessonProgress.id });
  const after = await afterProgress(db, expertId, row, inserted.length > 0);
  return { ok: true, slug: row.slug, lessonId: row.lesson.id, ...after };
}

/** The attempt's score (correct / total = questions), plus the lesson's and the course's state after it. */
export type QuizGraded =
  | ({ ok: true; slug: string; lessonId: string; best: number | null; attempts: number | null; lessonDone: boolean; courseDone: number; courseTotal: number; courseCompleted: boolean } & QuizScore)
  | { ok: false; reason: string };

/**
 * Grades a quiz attempt (answers[i] = the option index picked for question i, null if skipped).
 * 70% or more marks the lesson done; after that every attempt is counted and the best score kept.
 * An attempt below 70% before the first pass is shown to the expert but not stored.
 */
export async function gradeQuiz(db: DB, expertId: string, lessonId: string, answers: readonly (number | null)[]): Promise<QuizGraded> {
  const row = await lessonInPublishedCourse(db, lessonId);
  if (!row || row.lesson.kind !== "quiz" || !isUsableQuiz(row.lesson.quiz)) return { ok: false, reason: "That quiz isn't available." };
  const s = scoreQuiz(row.lesson.quiz, answers);
  const [before] = await db
    .select({ id: lessonProgress.id, score: lessonProgress.score, attempts: lessonProgress.attempts })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.expertId, expertId), eq(lessonProgress.lessonId, row.lesson.id)))
    .limit(1);
  let best: number | null = before?.score ?? null;
  let attempts: number | null = before?.attempts ?? null;
  let changed = false;
  if (before) {
    const [u] = await db
      .update(lessonProgress)
      .set({ score: sql`greatest(coalesce(${lessonProgress.score}, 0), ${s.percent})`, attempts: sql`least(${lessonProgress.attempts} + 1, 32767)` })
      .where(eq(lessonProgress.id, before.id))
      .returning({ score: lessonProgress.score, attempts: lessonProgress.attempts });
    best = u?.score ?? best;
    attempts = u?.attempts ?? attempts;
  } else if (s.passed) {
    const [ins] = await db
      .insert(lessonProgress)
      .values({ expertId, lessonId: row.lesson.id, courseId: row.lesson.courseId, score: s.percent, attempts: 1 })
      .onConflictDoUpdate({
        target: [lessonProgress.expertId, lessonProgress.lessonId],
        set: { score: sql`greatest(coalesce(${lessonProgress.score}, 0), excluded.score)`, attempts: sql`least(${lessonProgress.attempts} + 1, 32767)` },
      })
      .returning({ score: lessonProgress.score, attempts: lessonProgress.attempts });
    best = ins?.score ?? s.percent;
    attempts = ins?.attempts ?? 1;
    changed = true;
  }
  const after = await afterProgress(db, expertId, row, changed);
  return { ...s, ok: true, slug: row.slug, lessonId: row.lesson.id, best, attempts, lessonDone: Boolean(before) || s.passed, courseDone: after.done, courseTotal: after.total, courseCompleted: after.courseCompleted };
}

// ---------- Team: courses, lessons and counts ----------

export type CourseRow = Course & { lessons: number; started: number; completed: number };

/** Every course (drafts too) with its lesson count and how many experts started and finished it. */
export async function courseList(db: DB): Promise<CourseRow[]> {
  const totals = db
    .select({ courseId: courseLessons.courseId, n: sql<number>`count(*)`.as("n") })
    .from(courseLessons)
    .groupBy(courseLessons.courseId)
    .as("totals");
  const per = db
    .select({ courseId: lessonProgress.courseId, expertId: lessonProgress.expertId, done: sql<number>`count(*)`.as("done") })
    .from(lessonProgress)
    .groupBy(lessonProgress.courseId, lessonProgress.expertId)
    .as("per");
  const rows = await db
    .select({
      course: courses,
      lessons: sql<number>`coalesce(max(${totals.n}), 0)`.mapWith(Number),
      started: sql<number>`count(${per.expertId})`.mapWith(Number),
      completed: sql<number>`count(${per.expertId}) filter (where ${totals.n} > 0 and ${per.done} >= ${totals.n})`.mapWith(Number),
    })
    .from(courses)
    .leftJoin(totals, eq(totals.courseId, courses.id))
    .leftJoin(per, eq(per.courseId, courses.id))
    .groupBy(courses.id)
    .orderBy(asc(courses.position), asc(courses.title));
  return rows.map((r) => ({ ...r.course, lessons: r.lessons, started: r.started, completed: r.completed }));
}

export async function courseWithLessons(db: DB, id: string): Promise<{ course: Course; lessons: CourseLesson[] } | null> {
  if (!isUuid(id)) return null;
  const [course] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  if (!course) return null;
  const lessons = await db.select().from(courseLessons).where(eq(courseLessons.courseId, id)).orderBy(asc(courseLessons.position), asc(courseLessons.createdAt));
  return { course, lessons };
}

export type SaveResult = { ok: true; id: string } | { ok: false; errors: Record<string, string>; message?: string };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Terminal-Bench from zero" -> "terminal-bench-from-zero". */
export function slugify(s: string): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** A whole number in [min, max], null when empty, NaN when it isn't one. */
function intOrNull(v: unknown, min: number, max: number): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= min && n <= max ? n : Number.NaN;
}

export type CourseInput = { title?: string; slug?: string; summary?: string; kind?: string; level?: string; minutes?: string | number | null; art?: string; position?: string | number | null; published?: boolean };

function cleanCourse(input: CourseInput) {
  const errors: Record<string, string> = {};
  const title = String(input.title ?? "").trim().replace(/\s+/g, " ");
  if (!title) errors.title = "Give it a title.";
  else if (title.length > 160) errors.title = "Keep the title under 160 characters.";
  const slugRaw = String(input.slug ?? "").trim().toLowerCase();
  const slug = slugRaw || slugify(title);
  if (!slug) errors.slug = "Add an address, e.g. terminal-bench-from-zero.";
  else if (!SLUG_RE.test(slug) || slug.length > 80) errors.slug = "Lowercase letters, numbers and dashes only, e.g. terminal-bench-from-zero.";
  const summary = String(input.summary ?? "").trim() || null;
  if (summary && summary.length > 400) errors.summary = "Keep the summary under 400 characters: two short lines on the card.";
  const kind = String(input.kind || "course");
  if (!isOneOf(COURSE_KINDS, kind)) errors.kind = "Pick a kind.";
  const level = String(input.level || "beginner");
  if (!isOneOf(COURSE_LEVELS, level)) errors.level = "Pick a level.";
  const minutes = intOrNull(input.minutes, 1, 6000);
  if (Number.isNaN(minutes)) errors.minutes = "Minutes as a whole number, or leave it empty to add up the lessons.";
  const art = String(input.art ?? "").trim() || null;
  if (art && !isOneOf(ART_KEYS, art)) errors.art = "Pick one of the drawings.";
  const position = intOrNull(input.position, -999, 999);
  if (Number.isNaN(position)) errors.position = "A whole number from -999 to 999.";
  return { errors, values: { title, slug, summary, kind, level, minutes, art, position: position ?? 0, published: Boolean(input.published) } };
}

const slugTaken = async (db: DB, slug: string, exceptId?: string) =>
  (await db.$count(courses, exceptId ? and(eq(courses.slug, slug), ne(courses.id, exceptId)) : eq(courses.slug, slug))) > 0;

const learnLog = (db: DB, actor: Actor, action: string, detail: Record<string, unknown>) => logActivity(db, { entityType: "setting", entityId: "learn", actor, action, detail });

export async function createCourse(db: DB, input: CourseInput, actor: Actor): Promise<SaveResult> {
  const { errors, values } = cleanCourse(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  if (await slugTaken(db, values.slug)) return { ok: false, errors: { slug: "Another course uses this address. Pick another." } };
  const by = actorEmail(actor);
  const [row] = await db
    .insert(courses)
    .values({ ...values, createdBy: by, updatedBy: by })
    .onConflictDoNothing({ target: courses.slug })
    .returning({ id: courses.id });
  if (!row) return { ok: false, errors: { slug: "Another course uses this address. Pick another." } };
  await learnLog(db, actor, "course_created", { value: values.title, course: values.slug });
  return { ok: true, id: row.id };
}

export async function updateCourse(db: DB, id: string, input: CourseInput, actor: Actor): Promise<SaveResult> {
  if (!isUuid(id)) return { ok: false, errors: {}, message: "That course no longer exists." };
  const { errors, values } = cleanCourse(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  if (await slugTaken(db, values.slug, id)) return { ok: false, errors: { slug: "Another course uses this address. Pick another." } };
  const [row] = await db
    .update(courses)
    .set({ ...values, updatedAt: new Date(), updatedBy: actorEmail(actor) })
    .where(eq(courses.id, id))
    .returning({ id: courses.id });
  if (!row) return { ok: false, errors: {}, message: "That course no longer exists." };
  await learnLog(db, actor, "course_updated", { value: values.title, course: values.slug });
  return { ok: true, id: row.id };
}

export async function setCoursePublished(db: DB, id: string, published: boolean, actor: Actor): Promise<boolean> {
  if (!isUuid(id)) return false;
  const [row] = await db
    .update(courses)
    .set({ published, updatedAt: new Date(), updatedBy: actorEmail(actor) })
    .where(eq(courses.id, id))
    .returning({ title: courses.title, slug: courses.slug });
  if (!row) return false;
  await learnLog(db, actor, published ? "course_published" : "course_unpublished", { value: row.title, course: row.slug });
  return true;
}

/** Removes a course with its lessons and everyone's progress in it. */
export async function deleteCourse(db: DB, id: string, actor: Actor): Promise<boolean> {
  if (!isUuid(id)) return false;
  const [row] = await db.delete(courses).where(eq(courses.id, id)).returning({ title: courses.title, slug: courses.slug });
  if (!row) return false;
  await learnLog(db, actor, "course_deleted", { value: row.title, course: row.slug });
  return true;
}

export type LessonInput = { id?: string | null; title?: string; kind?: string; position?: string | number | null; minutes?: string | number | null; url?: string; body?: string; quizText?: string };

/** Adds a lesson (no id) or changes one. The quiz arrives as text (src/lib/learn/quiz.ts) and is checked here. */
export async function saveLesson(db: DB, courseId: string, input: LessonInput, actor: Actor): Promise<SaveResult> {
  if (!isUuid(courseId)) return { ok: false, errors: {}, message: "That course no longer exists." };
  const [course] = await db.select({ id: courses.id, slug: courses.slug }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return { ok: false, errors: {}, message: "That course no longer exists." };
  const errors: Record<string, string> = {};
  const title = String(input.title ?? "").trim().replace(/\s+/g, " ");
  if (!title) errors.title = "Give the lesson a title.";
  else if (title.length > 200) errors.title = "Keep the title under 200 characters.";
  const kind = String(input.kind || "reading");
  if (!isOneOf(LESSON_KINDS, kind)) errors.kind = "Pick a kind.";
  const urlRaw = String(input.url ?? "").trim();
  const url = urlRaw ? safeLessonUrl(urlRaw) : null;
  if (urlRaw && !url) errors.url = "Use an https:// address, or a path on this site such as /learn/booklet.pdf.";
  if ((kind === "pdf" || kind === "link") && !urlRaw) errors.url = kind === "pdf" ? "Add the booklet's address, e.g. /learn/booklet.pdf." : "Add the link's address.";
  const body = String(input.body ?? "").replace(/\r\n?/g, "\n").trim() || null;
  if (body && body.length > 20000) errors.body = "Keep the text under 20,000 characters.";
  if (kind === "reading" && !body) errors.body = "A reading needs its text.";
  let quiz: QuizQuestion[] | null = null;
  if (kind === "quiz") {
    const parsed = parseQuizText(String(input.quizText ?? ""));
    if (parsed.ok) quiz = parsed.questions;
    else errors.quizText = parsed.errors.join("\n");
  }
  const minutes = intOrNull(input.minutes, 1, 600);
  if (Number.isNaN(minutes)) errors.minutes = "Minutes as a whole number from 1 to 600, or leave it empty.";
  let position = intOrNull(input.position, -999, 999);
  if (Number.isNaN(position)) errors.position = "A whole number from -999 to 999.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const values = { title, kind, url: kind === "quiz" ? null : url, body, quiz, minutes };
  const by = actorEmail(actor);
  const id = String(input.id ?? "").trim();
  if (id) {
    if (!isUuid(id)) return { ok: false, errors: {}, message: "That lesson no longer exists." };
    const [row] = await db
      .update(courseLessons)
      .set({ ...values, ...(position === null ? {} : { position }), updatedAt: new Date(), updatedBy: by })
      .where(and(eq(courseLessons.id, id), eq(courseLessons.courseId, courseId)))
      .returning({ id: courseLessons.id });
    if (!row) return { ok: false, errors: {}, message: "That lesson no longer exists." };
    await learnLog(db, actor, "lesson_updated", { value: title, course: course.slug });
    return { ok: true, id: row.id };
  }
  if (position === null) {
    const [m] = await db.select({ max: sql<number | null>`max(${courseLessons.position})` }).from(courseLessons).where(eq(courseLessons.courseId, courseId));
    position = Math.min(999, Number(m?.max ?? 0) + 1);
  }
  const [row] = await db
    .insert(courseLessons)
    .values({ ...values, courseId, position, updatedBy: by })
    .returning({ id: courseLessons.id });
  await learnLog(db, actor, "lesson_added", { value: title, course: course.slug });
  return { ok: true, id: row.id };
}

export async function deleteLesson(db: DB, courseId: string, lessonId: string, actor: Actor): Promise<boolean> {
  if (!isUuid(courseId) || !isUuid(lessonId)) return false;
  const [row] = await db
    .delete(courseLessons)
    .where(and(eq(courseLessons.id, lessonId), eq(courseLessons.courseId, courseId)))
    .returning({ title: courseLessons.title });
  if (!row) return false;
  await learnLog(db, actor, "lesson_deleted", { value: row.title });
  return true;
}

// ---------- The FynoLabs starter courses ----------

const normTitle = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Adds the starter courses (src/lib/learn/seed.ts) that aren't there yet, by slug, published. For a
 * course that's already there, only lessons missing by title are added. Nothing is ever updated, so
 * the team's edits stay; running it twice changes nothing.
 */
export async function addStarterCourses(db: DB, actor: Actor, seeds: SeedCourse[] = STARTER_COURSES): Promise<{ courses: number; lessons: number; existing: number }> {
  const by = actorEmail(actor);
  const out = { courses: 0, lessons: 0, existing: 0 };
  for (const s of seeds) {
    const [created] = await db
      .insert(courses)
      .values({ slug: s.slug, title: s.title, summary: s.summary, kind: s.kind, level: s.level, art: s.art, minutes: s.minutes ?? null, position: s.position, published: true, createdBy: by, updatedBy: by })
      .onConflictDoNothing({ target: courses.slug })
      .returning({ id: courses.id });
    let courseId = created?.id;
    let have = new Set<string>();
    if (created) out.courses++;
    else {
      out.existing++;
      const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, s.slug)).limit(1);
      if (!row) continue;
      courseId = row.id;
      const titles = await db.select({ title: courseLessons.title }).from(courseLessons).where(eq(courseLessons.courseId, courseId));
      have = new Set(titles.map((t) => normTitle(t.title)));
    }
    const missing = s.lessons.map((l, i) => ({ ...l, position: i + 1 })).filter((l) => !have.has(normTitle(l.title)));
    if (!courseId || !missing.length) continue;
    await db.insert(courseLessons).values(
      missing.map((l) => ({ courseId: courseId as string, position: l.position, title: l.title, kind: l.kind, url: l.url ?? null, body: l.body ?? null, quiz: l.quiz ?? null, minutes: l.minutes ?? null, updatedBy: by })),
    );
    out.lessons += missing.length;
  }
  if (out.courses || out.lessons) await learnLog(db, actor, "starter_courses_added", { courses: out.courses, lessons: out.lessons });
  return out;
}
