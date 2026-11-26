// Learn: the words shown for levels, lesson kinds and illustrations, and small helpers shared by the
// expert pages and the admin. Course kinds use COURSE_KIND_LABELS in constants ("guide" = Booklet).
import { COURSE_KIND_LABELS, COURSE_LEVELS, LESSON_KINDS, isOneOf, type CourseKind, type CourseLevel, type LessonKind } from "@/lib/constants";

export const LEVEL_LABELS: Record<CourseLevel, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
export const LESSON_KIND_LABELS: Record<LessonKind, string> = { video: "Video", pdf: "Booklet", reading: "Reading", quiz: "Quiz", link: "Link" };

export const levelLabel = (v: string) => (isOneOf(COURSE_LEVELS, v) ? LEVEL_LABELS[v] : v);
export const lessonKindLabel = (v: string) => (isOneOf(LESSON_KINDS, v) ? LESSON_KIND_LABELS[v] : v);
export const courseKindLabel = (v: string) => COURSE_KIND_LABELS[v as CourseKind] ?? v;

/**
 * The line drawing on a course card (courses.art). Each key is one picture in
 * src/components/portal/learn/course-art.tsx; anything else falls back to "path".
 */
export const ART_KEYS = ["booklet", "terminal", "rubric", "ml", "loop", "review", "quiz", "path"] as const;
export type ArtKey = (typeof ART_KEYS)[number];
export const ART_LABELS: Record<ArtKey, string> = {
  booklet: "An open booklet",
  terminal: "A terminal window",
  rubric: "A rubric tree",
  ml: "Runs and a pass bar",
  loop: "An exam paper in its hall",
  review: "Three review gates",
  quiz: "Two answer cards",
  path: "A learning path",
};
export const artKey = (v: string | null | undefined): ArtKey => (isOneOf(ART_KEYS, v) ? v : "path");

/** "~45 min", or null when nothing is known. */
export function minutesLabel(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  if (n < 60) return `~${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}

export const lessonsLabel = (n: number) => `${n} ${n === 1 ? "lesson" : "lessons"}`;

/** A lesson link: an absolute http(s) address or a path on this site (/learn/...). Anything else is refused. */
export function safeLessonUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 2000 || /[\u0000-\u001f\u007f\\\s]/.test(s)) return null;
  if (s.startsWith("/")) return s.startsWith("//") ? null : s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type VideoSource = { kind: "youtube"; id: string; embed: string; watch: string } | { kind: "file"; src: string } | { kind: "link"; href: string };

/** "90", "90s", "1m30s", "1h2m3s" -> seconds. */
function startSeconds(v: string | null): number {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(v);
  if (!m || !m[0]) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * How to show a video lesson's address: YouTube (any of its link forms) plays in the privacy-enhanced
 * player (youtube-nocookie.com), a .mp4 / .webm file in the browser's own player, anything else as a link.
 */
export function videoSource(url: string | null | undefined): VideoSource | null {
  const safe = safeLessonUrl(url);
  if (!safe) return null;
  let u: URL;
  try {
    u = new URL(safe, "https://experts.fynolabs.si");
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] || null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else id = /^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(u.pathname)?.[1] ?? null;
  }
  if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
    const start = startSeconds(u.searchParams.get("t") ?? u.searchParams.get("start"));
    return { kind: "youtube", id, embed: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`, watch: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}` };
  }
  if (/\.(mp4|webm|m4v|mov)$/i.test(u.pathname)) return { kind: "file", src: safe };
  return { kind: "link", href: safe };
}
