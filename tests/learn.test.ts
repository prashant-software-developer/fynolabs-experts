// Learn: the quiz text format and scoring, video addresses, the FynoLabs starter courses (adding them
// twice changes nothing), what experts see (published only), progress (mark as done, quizzes with the
// 70% rule and the best score kept), Home's "in progress", certificates and the admin's counts; then
// the pages and actions themselves, rendered with a mocked session over an in-memory PGlite.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const session = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(public url: string) {
      super(`REDIRECT ${url}`);
    }
  }
  return { user: null as unknown, expertId: null as string | null, db: null as unknown, Redirect };
});
vi.mock("@/lib/auth/session", () => ({
  getAccount: async () => (session.user ? { kind: "team", user: session.user } : null),
  getCurrentUser: async () => session.user,
  requireUser: async () => {
    if (!session.user) throw new session.Redirect("/signin");
    return session.user;
  },
}));
vi.mock("@/lib/auth/expert", () => ({
  ownExpertId: async () => session.expertId,
  portalContext: async () => (session.expertId ? { kind: "expert", expertId: session.expertId, account: { kind: "expert", email: "expert@example.org" } } : { kind: "refused" }),
}));
vi.mock("@/db/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db/client")>()), getDb: async () => session.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new session.Redirect(url);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import { openTestDb } from "./fixtures/db";
import type { DB } from "@/db/client";
import { activity, courseLessons, courses, experts, lessonProgress, type QuizQuestion } from "@/db/schema";
import { minutesLabel, safeLessonUrl, videoSource } from "@/lib/learn/labels";
import { PASS_PERCENT, isUsableQuiz, parseQuizText, questionsForExpert, quizToText, scoreQuiz } from "@/lib/learn/quiz";
import { STARTER_COURSES } from "@/lib/learn/seed";
import {
  addStarterCourses,
  completeLesson,
  completedCourses,
  courseForExpert,
  courseList,
  coursesInProgress,
  createCourse,
  deleteLesson,
  gradeQuiz,
  learnCatalog,
  saveLesson,
  setCoursePublished,
  slugify,
  updateCourse,
} from "@/lib/server/learn";
import LearnPage from "@/app/(portal)/me/learn/page";
import CoursePage, { generateMetadata } from "@/app/(portal)/me/learn/[slug]/page";
import { markLessonDone, submitQuiz } from "@/app/(portal)/me/learn/actions";
import AdminLearnPage from "@/app/admin/learn/page";
import AdminCoursePage from "@/app/admin/learn/[id]/page";
import { addStarterCoursesForm, saveCourseForm, saveLessonForm, setPublishedForm } from "@/app/admin/learn/actions";

const ADMIN = { email: "admin@xocket.sh", role: "admin" };
const teamUser = (role: string) => ({ accountId: `acc-${role}`, email: `${role}@xocket.sh`, name: role, role, partnerIds: [], roleSource: "db", blocked: false, mustChangePassword: false, sections: [] });
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
/** Where an action or page sent the browser (it throws the redirect, as Next.js does). */
async function landing(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof session.Redirect) return e.url;
    throw e;
  }
  throw new Error("expected a redirect");
}
const html = async (page: Promise<unknown>) => renderToStaticMarkup((await page) as ReactElement);
let db: DB;
let client: PGlite;

async function newExpert(name: string): Promise<string> {
  const [e] = await db.insert(experts).values({ fullName: name, email: `${slugify(name)}@example.org` }).returning({ id: experts.id });
  return e.id;
}
async function lessonsOf(slug: string) {
  const [c] = await db.select().from(courses).where(eq(courses.slug, slug));
  return db.select().from(courseLessons).where(eq(courseLessons.courseId, c.id)).orderBy(courseLessons.position);
}
/** Answers with exactly `right` correct ones (the rest pick another option). */
const answersFor = (quiz: QuizQuestion[], right: number) => quiz.map((q, i) => (i < right ? q.answer : (q.answer + 1) % q.options.length));

beforeAll(async () => {
  ({ db, client } = await openTestDb());
  session.db = db;
});
afterAll(async () => {
  await client.close();
});

describe("the quiz text format", () => {
  it("reads questions, options, answers and reasons, with lines that continue the one above", () => {
    const r = parseQuizText(`Q: What does the verifier check?
A) What the agent printed
B) What the agent left
   on the machine
Answer: b)
Why: Tests check state,
not text.

Q2. Pick C.
A) One
B) Two
C) Three
Answer: C`);
    expect(r).toEqual({
      ok: true,
      questions: [
        { q: "What does the verifier check?", options: ["What the agent printed", "What the agent left on the machine"], answer: 1, why: "Tests check state, not text." },
        { q: "Pick C.", options: ["One", "Two", "Three"], answer: 2, why: null },
      ],
    });
  });

  it("explains what to fix, by line and by question", () => {
    const r = parseQuizText(`Some intro text
Q: Only one option
A) Lonely
Answer: A

Q: No answer
A) Yes
B) No

Q: Answer out of range
A) Yes
B) No
Answer: D

Q: Out of order
A) One
C) Three
Answer: A`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/^Line 1: start each question with "Q:"/);
    expect(r.errors.find((e) => e.startsWith("Question 1"))).toMatch(/at least two options/);
    expect(r.errors.find((e) => e.startsWith("Question 2"))).toMatch(/no "Answer:" line/);
    expect(r.errors.find((e) => e.startsWith("Question 3"))).toMatch(/"Answer: D" must be one of A, B/);
    expect(r.errors.find((e) => e.startsWith("Question 4"))).toMatch(/option C\) is out of order: expected B\)/);
    expect(parseQuizText("   \n")).toEqual({ ok: false, errors: ['Add at least one question. Start it with "Q:".'] });
  });

  it("writes questions back as text that reads the same (every starter quiz included)", () => {
    for (const course of STARTER_COURSES)
      for (const lesson of course.lessons.filter((l) => l.kind === "quiz")) {
        const again = parseQuizText(quizToText(lesson.quiz));
        expect(again, `${course.slug} / ${lesson.title}`).toEqual({ ok: true, questions: lesson.quiz });
      }
  });
});

describe("scoring a quiz", () => {
  const ten: QuizQuestion[] = Array.from({ length: 10 }, (_, i) => ({ q: `Q${i}`, options: ["A", "B"], answer: i % 2, why: `because ${i}` }));
  it("passes at 70% or more; skipped or impossible answers count as wrong", () => {
    expect(PASS_PERCENT).toBe(70);
    const seven = scoreQuiz(ten, answersFor(ten, 7));
    expect(seven).toMatchObject({ correct: 7, total: 10, percent: 70, passed: true });
    expect(scoreQuiz(ten, answersFor(ten, 6))).toMatchObject({ percent: 60, passed: false });
    const three = ten.slice(0, 3);
    expect(scoreQuiz(three, [0, 1, 1])).toMatchObject({ correct: 2, percent: 67, passed: false });
    const odd = scoreQuiz(three, [null, 7, 1.5]);
    expect(odd.correct).toBe(0);
    expect(odd.review.map((r) => r.chosen)).toEqual([null, null, null]);
    expect(odd.review[0]).toEqual({ chosen: null, answer: 0, right: false, why: "because 0" });
    expect(scoreQuiz([], [])).toMatchObject({ percent: 0, passed: false });
  });
  it("sends the browser questions and options only, never the answers", () => {
    const shown = questionsForExpert(ten.slice(0, 2));
    expect(shown).toEqual([
      { q: "Q0", options: ["A", "B"] },
      { q: "Q1", options: ["A", "B"] },
    ]);
    expect(JSON.stringify(shown)).not.toMatch(/answer|because/);
  });
});

describe("lesson addresses and labels", () => {
  it("plays YouTube in the privacy-enhanced player, files in the browser, anything else as a link", () => {
    const embed = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    expect(videoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ kind: "youtube", id: "dQw4w9WgXcQ", embed });
    expect(videoSource("https://youtu.be/dQw4w9WgXcQ?t=1m30s")).toMatchObject({ kind: "youtube", embed: `${embed}?start=90` });
    expect(videoSource("https://youtube.com/shorts/dQw4w9WgXcQ")).toMatchObject({ kind: "youtube", embed });
    expect(videoSource("https://m.youtube.com/embed/dQw4w9WgXcQ?start=12")).toMatchObject({ embed: `${embed}?start=12` });
    expect(videoSource("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toMatchObject({ kind: "youtube", embed });
    expect(videoSource("/learn/intro.mp4")).toEqual({ kind: "file", src: "/learn/intro.mp4" });
    expect(videoSource("https://vimeo.com/123")).toEqual({ kind: "link", href: "https://vimeo.com/123" });
    expect(videoSource("javascript:alert(1)")).toBeNull();
    expect(videoSource("")).toBeNull();
  });
  it("accepts https addresses and paths on this site only", () => {
    expect(safeLessonUrl("/learn/terminal-bench-from-zero.pdf")).toBe("/learn/terminal-bench-from-zero.pdf");
    expect(safeLessonUrl("//evil.example/x.pdf")).toBeNull();
    expect(safeLessonUrl("data:text/html,hi")).toBeNull();
    expect(safeLessonUrl("https://fynolabs.si/x.pdf")).toBe("https://fynolabs.si/x.pdf");
    expect(minutesLabel(45)).toBe("~45 min");
    expect(minutesLabel(90)).toBe("~1 h 30 min");
    expect(minutesLabel(null)).toBeNull();
    expect(slugify("Terminal-Bench, from zero!")).toBe("terminal-bench-from-zero");
  });
});

describe("the FynoLabs starter courses", () => {
  it("are complete, publishable and never mention pay", () => {
    const slugs = STARTER_COURSES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of STARTER_COURSES) {
      expect(c.lessons.length, c.slug).toBeGreaterThan(0);
      for (const l of c.lessons) if (l.kind === "quiz") expect(isUsableQuiz(l.quiz), `${c.slug} / ${l.title}`).toBe(true);
    }
    const quiz = STARTER_COURSES.find((c) => c.slug === "ai-trainer-quiz")!;
    expect(quiz.kind).toBe("quiz");
    expect(quiz.lessons.map((l) => l.quiz?.length)).toEqual([10, 10, 10]);
    expect(STARTER_COURSES.find((c) => c.slug === "terminal-bench-from-zero")!.lessons.map((l) => l.kind)).toEqual(["video", "pdf", "quiz"]);
    expect(STARTER_COURSES.find((c) => c.slug === "terminal-bench-from-zero")!.lessons[2].quiz).toHaveLength(5);
    const text = JSON.stringify(STARTER_COURSES);
    expect(text).not.toMatch(/\$\s?\d|\b(paid|pay|payment|payout|salary|wage|wages|earn|earned|earnings|hourly)\b/i);
  });

  it("adds every starter course once, published; running it again changes nothing and keeps the team's edits", async () => {
    const first = await addStarterCourses(db, ADMIN);
    const lessonTotal = STARTER_COURSES.reduce((n, c) => n + c.lessons.length, 0);
    expect(first).toEqual({ courses: STARTER_COURSES.length, lessons: lessonTotal, existing: 0 });
    const rows = await db.select().from(courses);
    expect(rows).toHaveLength(STARTER_COURSES.length);
    expect(rows.every((r) => r.published && r.createdBy === "admin@xocket.sh")).toBe(true);
    expect(await db.$count(courseLessons)).toBe(lessonTotal);

    // The team edits a course and a lesson; a second run leaves both alone.
    const [tb] = rows.filter((r) => r.slug === "terminal-bench-from-zero");
    await updateCourse(db, tb.id, { ...tb, summary: tb.summary ?? "", minutes: null, position: tb.position, title: "Terminal-Bench, from zero", art: tb.art ?? "", published: true }, ADMIN);
    const [video] = await lessonsOf("terminal-bench-from-zero");
    await db.update(courseLessons).set({ url: "https://youtu.be/dQw4w9WgXcQ" }).where(eq(courseLessons.id, video.id));
    expect(await addStarterCourses(db, ADMIN)).toEqual({ courses: 0, lessons: 0, existing: STARTER_COURSES.length });
    expect(await db.$count(courses)).toBe(STARTER_COURSES.length);
    expect(await db.$count(courseLessons)).toBe(lessonTotal);
    const [tbAfter] = await db.select().from(courses).where(eq(courses.id, tb.id));
    expect(tbAfter.title).toBe("Terminal-Bench, from zero");
    const [videoAfter] = await db.select().from(courseLessons).where(eq(courseLessons.id, video.id));
    expect(videoAfter.url).toBe("https://youtu.be/dQw4w9WgXcQ");

    // A starter lesson that went missing comes back (matched by title), once.
    const pb = await lessonsOf("paperbench-from-zero");
    await db.delete(courseLessons).where(eq(courseLessons.id, pb[1].id));
    expect(await addStarterCourses(db, ADMIN)).toMatchObject({ courses: 0, lessons: 1 });
    expect((await lessonsOf("paperbench-from-zero")).map((l) => l.title)).toEqual(STARTER_COURSES.find((c) => c.slug === "paperbench-from-zero")!.lessons.map((l) => l.title));
    expect(await addStarterCourses(db, ADMIN)).toMatchObject({ courses: 0, lessons: 0 });
    expect(await db.$count(activity, and(eq(activity.entityType, "setting"), eq(activity.action, "starter_courses_added")))).toBe(2);
  });
});

describe("what experts see", () => {
  it("only published courses: drafts stay hidden and can't be done", async () => {
    const asha = await newExpert("Asha Learner");
    const draft = await createCourse(db, { title: "Draft course", kind: "course", level: "advanced", summary: "Not ready." }, ADMIN);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const reading = await saveLesson(db, draft.id, { title: "Read me", kind: "reading", body: "Some **text**." }, ADMIN);
    const quiz = await saveLesson(db, draft.id, { title: "Quick quiz", kind: "quiz", quizText: "Q: One?\nA) Yes\nB) No\nAnswer: A" }, ADMIN);
    if (!reading.ok || !quiz.ok) throw new Error("lessons not saved");

    expect((await learnCatalog(db, asha)).map((c) => c.slug)).not.toContain("draft-course");
    expect(await courseForExpert(db, asha, "draft-course")).toBeNull();
    expect(await completeLesson(db, asha, reading.id)).toEqual({ ok: false, reason: "That lesson isn't available." });
    expect(await gradeQuiz(db, asha, quiz.id, [0])).toEqual({ ok: false, reason: "That quiz isn't available." });
    expect(await completeLesson(db, asha, "not-a-uuid")).toMatchObject({ ok: false });

    expect(await setCoursePublished(db, draft.id, true, ADMIN)).toBe(true);
    expect((await learnCatalog(db, asha)).find((c) => c.slug === "draft-course")).toMatchObject({ lessons: 2, done: 0, comingSoon: false, nextLessonId: reading.id });
    expect(await completeLesson(db, asha, reading.id)).toMatchObject({ ok: true, done: 1, total: 2 });
    // Unpublished again: gone from Learn and Home, progress kept for when it comes back.
    await setCoursePublished(db, draft.id, false, ADMIN);
    expect((await coursesInProgress(db, asha)).map((c) => c.slug)).not.toContain("draft-course");
    expect(await db.$count(lessonProgress, eq(lessonProgress.expertId, asha))).toBe(1);
  });

  it("lists courses in the team's order, with lessons, minutes and what's next", async () => {
    const ravi = await newExpert("Ravi Newcomer");
    const cards = await learnCatalog(db, ravi);
    const byPosition = [...STARTER_COURSES].sort((a, b) => a.position - b.position).map((c) => c.slug);
    expect(cards.map((c) => c.slug)).toEqual(byPosition);
    const tb = cards.find((c) => c.slug === "terminal-bench-from-zero")!;
    const [video] = await lessonsOf("terminal-bench-from-zero");
    expect(tb).toMatchObject({ kind: "course", level: "beginner", art: "terminal", lessons: 3, done: 0, minutes: 42, completedAt: null, nextLessonId: video.id, comingSoon: false });
    const view = (await courseForExpert(db, ravi, "terminal-bench-from-zero"))!;
    expect(view.lessons.map((l) => [l.kind, l.ready, l.done])).toEqual([
      ["video", true, false],
      ["pdf", true, false],
      ["quiz", true, false],
    ]);
    expect(view.lessons[2].questions).toHaveLength(5);
    expect(JSON.stringify(view.lessons[2].questions)).not.toMatch(/"answer"|"why"/);
    expect(view.lessons[1].url).toBe("/learn/terminal-bench-from-zero.pdf");
  });
});

describe("progress", () => {
  it("mark as done, the 70% rule, the best score, Home's in-progress list and certificates", async () => {
    const meera = await newExpert("Meera Progress");
    const other = await newExpert("Other Expert");
    const [video, booklet, quizLesson] = await lessonsOf("terminal-bench-from-zero");
    const quiz = quizLesson.quiz!;

    expect(await completeLesson(db, meera, video.id)).toMatchObject({ ok: true, slug: "terminal-bench-from-zero", done: 1, total: 3, courseCompleted: false });
    expect(await completeLesson(db, meera, video.id)).toMatchObject({ ok: true, done: 1 }); // again: nothing changes
    expect(await coursesInProgress(db, meera)).toEqual([{ slug: "terminal-bench-from-zero", title: "Terminal-Bench, from zero", kind: "course", done: 1, total: 3 }]);
    expect(await completeLesson(db, meera, quizLesson.id)).toEqual({ ok: false, reason: "Pass the quiz to finish this lesson." });
    expect(await completeLesson(db, meera, booklet.id)).toMatchObject({ done: 2 });

    // 3 of 5 = 60%: shown, not stored.
    const low = await gradeQuiz(db, meera, quizLesson.id, answersFor(quiz, 3));
    expect(low).toMatchObject({ ok: true, percent: 60, correct: 3, total: 5, passed: false, lessonDone: false, best: null, attempts: null, courseDone: 2, courseTotal: 3, courseCompleted: false });
    if (low.ok) expect(low.review.map((r) => r.right)).toEqual([true, true, true, false, false]);
    expect(await db.$count(lessonProgress, and(eq(lessonProgress.expertId, meera), eq(lessonProgress.lessonId, quizLesson.id)))).toBe(0);

    // 4 of 5 = 80%: passed, the course is finished.
    expect(await gradeQuiz(db, meera, quizLesson.id, answersFor(quiz, 4))).toMatchObject({ ok: true, percent: 80, correct: 4, total: 5, passed: true, lessonDone: true, best: 80, attempts: 1, courseDone: 3, courseTotal: 3, courseCompleted: true });
    expect(await coursesInProgress(db, meera)).toEqual([]);
    const certs = await completedCourses(db, meera);
    expect(certs).toEqual([{ slug: "terminal-bench-from-zero", title: "Terminal-Bench, from zero", kind: "course", completedAt: expect.any(Date) }]);
    const logged = await db.select().from(activity).where(and(eq(activity.entityType, "expert"), eq(activity.entityId, meera)));
    expect(logged.map((a) => [a.action, a.detail])).toEqual([["course_completed", { value: "Terminal-Bench, from zero", course: "terminal-bench-from-zero" }]]);

    // Retries: the best score stays, every attempt counts, the lesson stays done.
    expect(await gradeQuiz(db, meera, quizLesson.id, answersFor(quiz, 5))).toMatchObject({ percent: 100, best: 100, attempts: 2, courseCompleted: false });
    expect(await gradeQuiz(db, meera, quizLesson.id, answersFor(quiz, 1))).toMatchObject({ percent: 20, passed: false, lessonDone: true, best: 100, attempts: 3 });
    const view = (await courseForExpert(db, meera, "terminal-bench-from-zero"))!;
    expect(view).toMatchObject({ done: 3, total: 3, completedAt: expect.any(Date) });
    expect(view.lessons[2]).toMatchObject({ done: true, score: 100, attempts: 3 });
    expect(await db.$count(activity, and(eq(activity.entityId, meera), eq(activity.action, "course_completed")))).toBe(1);
    expect((await learnCatalog(db, meera)).find((c) => c.slug === "terminal-bench-from-zero")).toMatchObject({ done: 3, lessons: 3, completedAt: expect.any(Date) });

    // Someone else's progress is their own.
    expect(await coursesInProgress(db, other)).toEqual([]);
    expect(await completedCourses(db, other)).toEqual([]);
    expect((await courseForExpert(db, other, "terminal-bench-from-zero"))!.done).toBe(0);

    // The team's counts.
    await completeLesson(db, other, video.id);
    const tb = (await courseList(db)).find((c) => c.slug === "terminal-bench-from-zero")!;
    expect(tb).toMatchObject({ lessons: 3, started: 2, completed: 1 });

    // A new lesson in a finished course: in progress again, until it's done too.
    const extra = await saveLesson(db, tb.id, { title: "Further reading", kind: "link", url: "https://tbench.ai" }, ADMIN);
    expect(extra).toMatchObject({ ok: true });
    expect(await coursesInProgress(db, meera)).toEqual([expect.objectContaining({ slug: "terminal-bench-from-zero", done: 3, total: 4 })]);
    expect(await completedCourses(db, meera)).toEqual([]);
    if (extra.ok) await deleteLesson(db, tb.id, extra.id, ADMIN);
    expect((await completedCourses(db, meera)).map((c) => c.slug)).toEqual(["terminal-bench-from-zero"]);
  });

  it("a booklet is done in one step, and a deleted lesson takes its progress with it", async () => {
    const sam = await newExpert("Sam Reader");
    const [pdf] = await lessonsOf("benchmark-task-playbook");
    expect(await completeLesson(db, sam, pdf.id)).toMatchObject({ ok: true, done: 1, total: 1, courseCompleted: true });
    expect((await completedCourses(db, sam)).map((c) => [c.slug, c.kind])).toEqual([["benchmark-task-playbook", "guide"]]);
    const [course] = await db.select().from(courses).where(eq(courses.slug, "benchmark-task-playbook"));
    await deleteLesson(db, course.id, pdf.id, ADMIN);
    expect(await db.$count(lessonProgress, eq(lessonProgress.expertId, sam))).toBe(0);
    expect((await learnCatalog(db, sam)).find((c) => c.slug === "benchmark-task-playbook")).toMatchObject({ lessons: 0, comingSoon: true, nextLessonId: null });
  });
});

describe("editing courses and lessons", () => {
  it("checks a course's fields and keeps addresses unique", async () => {
    expect(await createCourse(db, { title: "" }, ADMIN)).toMatchObject({ ok: false, errors: { title: expect.any(String), slug: expect.any(String) } });
    expect(await createCourse(db, { title: "Bad address", slug: "Not OK!" }, ADMIN)).toMatchObject({ ok: false, errors: { slug: expect.stringMatching(/Lowercase/) } });
    expect(await createCourse(db, { title: "Odd", kind: "lecture", level: "expert", minutes: "a lot", art: "rocket", position: "1.5" }, ADMIN)).toMatchObject({
      ok: false,
      errors: { kind: expect.any(String), level: expect.any(String), minutes: expect.any(String), art: expect.any(String), position: expect.any(String) },
    });
    expect(await createCourse(db, { title: "PaperBench from zero" }, ADMIN)).toEqual({ ok: false, errors: { slug: "Another course uses this address. Pick another." } });
    const made = await createCourse(db, { title: "Rubric writing 101", minutes: "20", art: "rubric", position: "5", published: false }, ADMIN);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const [row] = await db.select().from(courses).where(eq(courses.id, made.id));
    expect(row).toMatchObject({ slug: "rubric-writing-101", kind: "course", level: "beginner", minutes: 20, art: "rubric", position: 5, published: false });
    expect(await updateCourse(db, made.id, { title: "Rubric writing 101", slug: "ai-trainer-quiz" }, ADMIN)).toMatchObject({ ok: false, errors: { slug: expect.any(String) } });
    expect(await updateCourse(db, made.id, { title: "Rubric writing 101", slug: "rubric-writing-101", summary: "Leaves that two graders score the same." }, ADMIN)).toEqual({ ok: true, id: made.id });
  });

  it("checks a lesson by its kind, reads the quiz text, and numbers new lessons after the last", async () => {
    const made = await createCourse(db, { title: "Lesson checks" }, ADMIN);
    if (!made.ok) throw new Error("no course");
    const id = made.id;
    expect(await saveLesson(db, id, { title: "", kind: "pdf" }, ADMIN)).toMatchObject({ ok: false, errors: { title: expect.any(String), url: expect.any(String) } });
    expect(await saveLesson(db, id, { title: "Bad link", kind: "link", url: "javascript:alert(1)" }, ADMIN)).toMatchObject({ ok: false, errors: { url: expect.any(String) } });
    expect(await saveLesson(db, id, { title: "Empty reading", kind: "reading" }, ADMIN)).toMatchObject({ ok: false, errors: { body: expect.any(String) } });
    const badQuiz = await saveLesson(db, id, { title: "Quiz", kind: "quiz", quizText: "Q: Only one\nA) Yes\nAnswer: A" }, ADMIN);
    expect(badQuiz).toMatchObject({ ok: false, errors: { quizText: expect.stringMatching(/Question 1 \(line 1\): it needs at least two options/) } });

    const v = await saveLesson(db, id, { title: "Video soon", kind: "video" }, ADMIN);
    const q = await saveLesson(db, id, { title: "Quiz", kind: "quiz", url: "https://ignored.example", quizText: "Q: Two?\nA) One\nB) Two\nAnswer: B\nWhy: Count them." }, ADMIN);
    if (!v.ok || !q.ok) throw new Error("not saved");
    const rows = await db.select().from(courseLessons).where(eq(courseLessons.courseId, id)).orderBy(courseLessons.position);
    expect(rows.map((r) => [r.title, r.position, r.kind, r.url])).toEqual([
      ["Video soon", 1, "video", null],
      ["Quiz", 2, "quiz", null],
    ]);
    expect(rows[1].quiz).toEqual([{ q: "Two?", options: ["One", "Two"], answer: 1, why: "Count them." }]);

    // A video with neither an address nor notes can't be done yet; the course shows "Coming soon" until a lesson can.
    await setCoursePublished(db, id, true, ADMIN);
    const lee = await newExpert("Lee Tester");
    expect(await completeLesson(db, lee, v.id)).toMatchObject({ ok: false, reason: expect.stringMatching(/isn't ready yet/) });
    // Changing the kind clears what the old kind used.
    expect(await saveLesson(db, id, { id: q.id, title: "Now a reading", kind: "reading", body: "Text.", position: "7" }, ADMIN)).toEqual({ ok: true, id: q.id });
    const [changed] = await db.select().from(courseLessons).where(eq(courseLessons.id, q.id));
    expect(changed).toMatchObject({ kind: "reading", quiz: null, position: 7, body: "Text." });
    expect(await saveLesson(db, id, { id: "00000000-0000-4000-8000-000000000000", title: "Gone", kind: "reading", body: "x" }, ADMIN)).toMatchObject({ ok: false, message: expect.any(String) });
  });
});

const expertNamed = async (name: string) => (await db.select({ id: experts.id }).from(experts).where(eq(experts.fullName, name)))[0].id;
const course = (slug: string, lesson?: string) => CoursePage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(lesson ? { lesson } : {}) });

describe("the Learn pages", () => {
  it("Learn shows published courses by kind, what's in progress and the certificates", async () => {
    session.expertId = await expertNamed("Meera Progress");
    const meera = await html(LearnPage({ searchParams: Promise.resolve({}) }));
    for (const t of ["Learn", "Courses", "Booklets", "Quizzes", "Your certificates", "Terminal-Bench, from zero", "PaperBench from zero", "AI Trainer Quiz", "Completed", "Review", "Start", "Coming soon", "/me/learn/paperbench-from-zero?lesson="]) expect(meera).toContain(t);
    for (const t of ["Draft course", "Rubric writing 101", "Continue learning", "No certificates yet"]) expect(meera).not.toContain(t);

    session.expertId = await expertNamed("Other Expert");
    const other = await html(LearnPage({ searchParams: Promise.resolve({}) }));
    expect(other).toContain("Continue learning");
    expect(other).toContain("1 of 3 done");
    expect(other).toContain("No certificates yet");
  });

  it("a course opens its next lesson and shows each kind: video, booklet, quiz, coming soon", async () => {
    session.expertId = await expertNamed("Other Expert");
    const [tbVideo, tbPdf, tbQuiz] = await lessonsOf("terminal-bench-from-zero");
    // No lesson in the address: on to the first one not done yet (the video is done).
    expect(await landing(course("terminal-bench-from-zero"))).toBe(`/me/learn/terminal-bench-from-zero?lesson=${tbPdf.id}`);

    const video = await html(course("terminal-bench-from-zero", tbVideo.id));
    expect(video).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(video).toContain("1 of 3 done");
    expect(video).toContain("Next lesson");
    expect(video).not.toContain("Mark as done");

    const pdf = await html(course("terminal-bench-from-zero", tbPdf.id));
    expect(pdf).toContain('src="/learn/terminal-bench-from-zero.pdf#view=FitH"');
    for (const t of ["Open the booklet", "Download PDF", "Mark as done", "Lesson 2"]) expect(pdf).toContain(t);

    const quiz = await html(course("terminal-bench-from-zero", tbQuiz.id));
    for (const t of ['name="q0"', 'name="q4"', "Check my answers", "70% to pass"]) expect(quiz).toContain(t);
    // The page never carries the answers or the reasons.
    for (const t of ["The agent would read the answers", "Three runs, three answers", "Difficulty should come from skill"]) expect(quiz).not.toContain(t);

    const [pbVideo] = await lessonsOf("paperbench-from-zero");
    const soon = await html(course("paperbench-from-zero", pbVideo.id));
    for (const t of ["Video coming soon", "Chapters", "Mark as done", "0 of 3 done"]) expect(soon).toContain(t);

    expect(await html(course("no-such-course"))).toContain("This course isn");
    expect(await html(course("draft-course"))).toContain("This course isn");
    expect(await generateMetadata({ params: Promise.resolve({ slug: "paperbench-from-zero" }) })).toEqual({ title: "PaperBench from zero" });
    expect(await generateMetadata({ params: Promise.resolve({ slug: "draft-course" }) })).toEqual({ title: "Learn" });
  });
});

describe("the Learn actions", () => {
  it("record progress for the signed-in expert only, whatever the form says", async () => {
    const lee = await expertNamed("Lee Tester");
    const ravi = await expertNamed("Ravi Newcomer");
    const [pbVideo, , pbQuiz] = await lessonsOf("paperbench-from-zero");
    session.expertId = lee;
    expect(await landing(markLessonDone(form({ lessonId: pbVideo.id, expertId: ravi, back: "/me/learn/paperbench-from-zero" })))).toBe(`/me/learn/paperbench-from-zero?lesson=${pbVideo.id}#lesson`);
    expect(await db.$count(lessonProgress, and(eq(lessonProgress.expertId, lee), eq(lessonProgress.lessonId, pbVideo.id)))).toBe(1);
    expect(await db.$count(lessonProgress, eq(lessonProgress.expertId, ravi))).toBe(0);
    expect(await landing(markLessonDone(form({ lessonId: pbQuiz.id, back: "/me/learn/paperbench-from-zero" })))).toBe("/me/learn/paperbench-from-zero?error=Pass%20the%20quiz%20to%20finish%20this%20lesson.");
    expect(await landing(markLessonDone(form({ lessonId: "nope", back: "https://evil.example/" })))).toBe("/me/learn?error=That%20lesson%20isn't%20available.");

    const right = pbQuiz.quiz!.map((q, i) => [`q${i}`, String(q.answer)]);
    const graded = await submitQuiz(null, form({ lessonId: pbQuiz.id, expertId: ravi, ...Object.fromEntries(right) }));
    expect(graded).toMatchObject({ ok: true, percent: 100, correct: 5, total: 5, passed: true, lessonDone: true, best: 100, attempts: 1, courseCompleted: false });
    expect(await db.$count(lessonProgress, and(eq(lessonProgress.expertId, lee), eq(lessonProgress.lessonId, pbQuiz.id)))).toBe(1);
    expect(await submitQuiz(null, form({ lessonId: pbQuiz.id, q0: "9", q1: "x" }))).toMatchObject({ ok: true, correct: 0, review: [{ chosen: null }, { chosen: null }, { chosen: null }, { chosen: null }, { chosen: null }] });

    session.expertId = null;
    expect(await submitQuiz(null, form({ lessonId: pbQuiz.id, q0: "1" }))).toEqual({ ok: false, error: expect.stringMatching(/Sign in again/) });
    expect(await landing(markLessonDone(form({ lessonId: pbVideo.id })))).toBe("/signin?callbackUrl=/me/learn");
  });

  it("the admin is for admins; its forms say what to fix and keep what was typed; the starter button is safe to press again", async () => {
    session.user = teamUser("recruiter");
    expect(await landing(addStarterCoursesForm(form({ returnTo: "/admin/learn" })))).toMatch(/^\/admin\/learn\?error=/);
    expect(await html(AdminLearnPage({ searchParams: Promise.resolve({}) }))).toContain("available to your role");

    session.user = teamUser("admin");
    expect(await landing(addStarterCoursesForm(form({ returnTo: "/admin/learn" })))).toMatch(/^\/admin\/learn\?ok=Added/); // the playbook's deleted lesson
    expect(decodeURIComponent(await landing(addStarterCoursesForm(form({ returnTo: "/admin/learn" }))))).toContain("Nothing changed");

    expect(await saveCourseForm(null, form({ title: "", slug: "Bad Slug", summary: "Kept" }))).toMatchObject({ errors: { title: expect.any(String), slug: expect.any(String) }, values: { slug: "Bad Slug", summary: "Kept" } });
    const made = await landing(saveCourseForm(null, form({ title: "Admin made", published: "on" })));
    expect(made).toMatch(/^\/admin\/learn\/[0-9a-f-]{36}\?ok=Course%20added/);
    const id = made.split("/")[3].split("?")[0];
    expect(await saveLessonForm(null, form({ courseId: id, title: "Quiz", kind: "quiz", quizText: "Q: Hi\nA) Yes\nB) No" }))).toMatchObject({
      errors: { quizText: expect.stringMatching(/no "Answer:" line/) },
      values: { quizText: "Q: Hi\nA) Yes\nB) No" },
    });
    expect(await landing(saveLessonForm(null, form({ courseId: id, title: "Quiz", kind: "quiz", quizText: "Q: Hi\nA) Yes\nB) No\nAnswer: A" })))).toMatch(new RegExp(`^/admin/learn/${id}\\?ok=Lesson%20added`));
    expect(await landing(setPublishedForm(form({ id, published: "no", returnTo: `/admin/learn/${id}` })))).toMatch(/ok=Unpublished/);
    expect((await db.select().from(courses).where(eq(courses.id, id)))[0].published).toBe(false);

    const list = await html(AdminLearnPage({ searchParams: Promise.resolve({ view: id }) }));
    for (const t of ["Add the FynoLabs starter courses", "New course", "Admin made", "Open full course", "Terminal-Bench, from zero", "/me/learn/ai-trainer-quiz", "Draft"]) expect(list).toContain(t);
    const [quizLesson] = await db.select().from(courseLessons).where(eq(courseLessons.courseId, id));
    const edit = await html(AdminCoursePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ lesson: quizLesson.id }) }));
    for (const t of ["Edit lesson", "Q: Hi", "Answer: A", "Delete lesson", "1 question", "Publish"]) expect(edit).toContain(t);
    expect(await html(AdminCoursePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ lesson: "new" }) }))).toContain("New lesson");
    expect(await html(AdminCoursePage({ params: Promise.resolve({ id: "nope" }), searchParams: Promise.resolve({}) }))).toContain("Course not found");
    session.user = null;
  });
});
