"use server";
// Learn admin (/admin/learn): courses, lessons and the FynoLabs starter courses. Admins only
// (settings.manage, in the Settings section). The two forms return their errors (and what was typed)
// to the page; everything else redirects back with ?ok= / ?error=.
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, returnPath, str } from "@/lib/crm/flash";
import { addStarterCourses, createCourse, deleteCourse, deleteLesson, saveLesson, setCoursePublished, updateCourse } from "@/lib/server/learn";

const BACK = "/admin/learn";

/** What a form gets back when something needs fixing: messages by field, and the values to show again. */
export type LearnFormState = { errors?: Record<string, string>; message?: string; values?: Record<string, string> } | null;

const allow = () => authorizeIn("settings", "settings.manage");

function refresh() {
  revalidatePath(BACK, "layout");
  revalidatePath("/me/learn", "layout");
  revalidatePath("/me");
}

const typed = (fd: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, str(fd, k)]));

const COURSE_FIELDS = ["title", "slug", "summary", "kind", "level", "minutes", "art", "position", "published"];
const LESSON_FIELDS = ["title", "kind", "position", "minutes", "url", "body", "quizText"];

export async function saveCourseForm(_prev: LearnFormState, fd: FormData): Promise<LearnFormState> {
  const id = str(fd, "id");
  let state: LearnFormState = null;
  await bounce(id ? `${BACK}/${id}` : BACK, async () => {
    const user = await allow();
    const db = await getDb();
    const input = {
      title: str(fd, "title"),
      slug: str(fd, "slug"),
      summary: str(fd, "summary"),
      kind: str(fd, "kind"),
      level: str(fd, "level"),
      minutes: str(fd, "minutes"),
      art: str(fd, "art"),
      position: str(fd, "position"),
      published: str(fd, "published") === "on",
    };
    const r = id ? await updateCourse(db, id, input, user) : await createCourse(db, input, user);
    if (!r.ok) {
      state = { errors: r.errors, message: r.message ?? "Check the fields marked below.", values: typed(fd, COURSE_FIELDS) };
      return;
    }
    refresh();
    flash(`${BACK}/${r.id}`, "ok", id ? "Course saved." : "Course added. Now add its lessons.");
  });
  return state;
}

export async function saveLessonForm(_prev: LearnFormState, fd: FormData): Promise<LearnFormState> {
  const courseId = str(fd, "courseId");
  const lessonId = str(fd, "id");
  let state: LearnFormState = null;
  await bounce(`${BACK}/${courseId}`, async () => {
    const user = await allow();
    const db = await getDb();
    const r = await saveLesson(
      db,
      courseId,
      { id: lessonId || null, title: str(fd, "title"), kind: str(fd, "kind"), position: str(fd, "position"), minutes: str(fd, "minutes"), url: str(fd, "url"), body: str(fd, "body"), quizText: str(fd, "quizText") },
      user,
    );
    if (!r.ok) {
      state = { errors: r.errors, message: r.message ?? "Check the fields marked below.", values: typed(fd, LESSON_FIELDS) };
      return;
    }
    refresh();
    flash(`${BACK}/${courseId}`, "ok", lessonId ? "Lesson saved." : "Lesson added.");
  });
  return state;
}

export async function deleteLessonForm(fd: FormData) {
  const courseId = str(fd, "courseId");
  await bounce(`${BACK}/${courseId}`, async () => {
    const user = await allow();
    const ok = await deleteLesson(await getDb(), courseId, str(fd, "lessonId"), user);
    refresh();
    flash(`${BACK}/${courseId}`, ok ? "ok" : "error", ok ? "Lesson deleted." : "That lesson was already gone.");
  });
}

export async function setPublishedForm(fd: FormData) {
  const id = str(fd, "id");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await allow();
    const publish = str(fd, "published") === "yes";
    const ok = await setCoursePublished(await getDb(), id, publish, user);
    refresh();
    const back = returnPath(fd, `${BACK}/${id}`);
    if (!ok) flash(BACK, "error", "That course no longer exists.");
    flash(back, "ok", publish ? "Published. Experts can see it under Learn." : "Unpublished. Experts no longer see it; their progress is kept.");
  });
}

export async function deleteCourseForm(fd: FormData) {
  const id = str(fd, "id");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await allow();
    const ok = await deleteCourse(await getDb(), id, user);
    refresh();
    flash(BACK, ok ? "ok" : "error", ok ? "Course deleted, with its lessons and progress." : "That course was already gone.");
  });
}

export async function addStarterCoursesForm(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await allow();
    const r = await addStarterCourses(await getDb(), user);
    refresh();
    const back = returnPath(fd, BACK);
    if (!r.courses && !r.lessons) flash(back, "ok", "The starter courses are all here already. Nothing changed.");
    const parts = [r.courses ? `${r.courses} ${r.courses === 1 ? "course" : "courses"}` : null, r.lessons ? `${r.lessons} ${r.lessons === 1 ? "lesson" : "lessons"}` : null].filter(Boolean).join(" and ");
    flash(back, "ok", `Added ${parts}. They're published: experts see them under Learn.`);
  });
}
