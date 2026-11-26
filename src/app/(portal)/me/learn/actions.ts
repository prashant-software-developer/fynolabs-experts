"use server";
// Learn actions for experts. The expert id always comes from the signed-in session (ownExpertId),
// never from the form, so nobody can record progress for someone else.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { ownExpertId } from "@/lib/auth/expert";
import { MAX_QUESTIONS } from "@/lib/learn/quiz";
import { completeLesson, gradeQuiz } from "@/lib/server/learn";

const withMsg = (path: string, kind: "ok" | "error", text: string) => `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`;

/** The Learn page the form came from (only /me/learn paths are followed). */
function backTo(fd: FormData): string {
  const raw = String(fd.get("back") ?? "");
  return /^\/me\/learn(\/[a-z0-9-]+)?$/.test(raw) ? raw : "/me/learn";
}

function refresh(slug?: string) {
  revalidatePath("/me");
  revalidatePath("/me/learn");
  if (slug) revalidatePath(`/me/learn/${slug}`);
}

/** "Mark as done" on a video, booklet, reading or link lesson; back to the same lesson, now ticked. */
export async function markLessonDone(fd: FormData) {
  const id = await ownExpertId();
  if (!id) redirect("/signin?callbackUrl=/me/learn");
  const res = await completeLesson(await getDb(), id, String(fd.get("lessonId") ?? ""));
  if (!res.ok) redirect(withMsg(backTo(fd), "error", res.reason));
  refresh(res.slug);
  redirect(`/me/learn/${res.slug}?lesson=${res.lessonId}#lesson`);
}

export type QuizReviewItem = { chosen: number | null; answer: number; right: boolean; why: string | null };
export type QuizState =
  | { ok: true; percent: number; correct: number; total: number; passed: boolean; best: number | null; attempts: number | null; lessonDone: boolean; courseCompleted: boolean; review: QuizReviewItem[] }
  | { ok: false; error: string }
  | null;

/** Grades a quiz (answers arrive as q0, q1, ... = the option picked) and returns the score with every answer explained. */
export async function submitQuiz(_prev: QuizState, fd: FormData): Promise<QuizState> {
  const id = await ownExpertId();
  if (!id) return { ok: false, error: "Your session ended. Sign in again, then take the quiz." };
  const answers: (number | null)[] = [];
  for (let i = 0; i < MAX_QUESTIONS; i++) {
    const v = fd.get(`q${i}`);
    answers.push(typeof v === "string" && /^\d{1,2}$/.test(v) ? Number(v) : null);
  }
  const res = await gradeQuiz(await getDb(), id, String(fd.get("lessonId") ?? ""), answers);
  if (!res.ok) return { ok: false, error: res.reason };
  refresh(res.slug);
  return {
    ok: true,
    percent: res.percent,
    correct: res.correct,
    total: res.total,
    passed: res.passed,
    best: res.best,
    attempts: res.attempts,
    lessonDone: res.lessonDone,
    courseCompleted: res.courseCompleted,
    review: res.review,
  };
}
