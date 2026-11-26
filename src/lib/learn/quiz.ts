// Learn quizzes: scoring (70% passes) and the plain-text format the admin types questions in.
// Pure functions, tested in tests/learn.test.ts.
//
// The text format, one block per question (blank lines between blocks are optional):
//
//   Q: What does the verifier check?
//   A) What the agent printed
//   B) What the agent left on the machine
//   Answer: B
//   Why: Tests check state, not text.
//
// A line that starts with none of the markers continues the line above it (a long question,
// option or explanation). "Why:" is optional.
import type { QuizQuestion } from "@/db/schema";

/** A quiz lesson counts as done at this score (percent) or higher. */
export const PASS_PERCENT = 70;
export const MAX_QUESTIONS = 50;
export const MAX_OPTIONS = 8;

const LETTERS = "ABCDEFGH";
export const optionLetter = (i: number) => LETTERS[i] ?? String(i + 1);

export type QuizScore = { correct: number; total: number; percent: number; passed: boolean; review: { chosen: number | null; answer: number; right: boolean; why: string | null }[] };

/** Scores one attempt. An unanswered (or out-of-range) answer counts as wrong. */
export function scoreQuiz(questions: QuizQuestion[], answers: readonly (number | null | undefined)[]): QuizScore {
  const review = questions.map((q, i) => {
    const a = answers[i];
    const chosen = typeof a === "number" && Number.isInteger(a) && a >= 0 && a < q.options.length ? a : null;
    return { chosen, answer: q.answer, right: chosen === q.answer, why: q.why?.trim() || null };
  });
  const correct = review.filter((r) => r.right).length;
  const total = questions.length;
  const percent = total ? Math.round((100 * correct) / total) : 0;
  return { correct, total, percent, passed: total > 0 && percent >= PASS_PERCENT, review };
}

/** What the expert's browser gets: the questions and options, never the answers or explanations. */
export function questionsForExpert(questions: QuizQuestion[] | null | undefined): { q: string; options: string[] }[] {
  return (questions ?? []).map((x) => ({ q: x.q, options: [...x.options] }));
}

/** A stored quiz is usable when it has at least one question with two options and a valid answer. */
export function isUsableQuiz(questions: QuizQuestion[] | null | undefined): questions is QuizQuestion[] {
  return Array.isArray(questions) && questions.length > 0 && questions.every((q) => q && typeof q.q === "string" && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
}

export type QuizParse = { ok: true; questions: QuizQuestion[] } | { ok: false; errors: string[] };

type Draft = { line: number; q: string; options: { letter: string; text: string }[]; answer: string | null; answerLine: number; why: string | null };
type Field = "q" | "option" | "why" | null;

const Q_RE = /^Q\s*\d*\s*[:.)]\s*(.*)$/i;
const OPTION_RE = /^([A-H])\s*[).:]\s+(.*)$/i;
const ANSWER_RE = /^(?:Answer|Correct)\s*[:=]\s*(.*)$/i;
const WHY_RE = /^(?:Why|Explanation)\s*[:=]\s*(.*)$/i;

/** Reads the admin's text into questions, or explains (by line and question) what to fix. */
export function parseQuizText(text: string): QuizParse {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const drafts: Draft[] = [];
  const errors: string[] = [];
  let cur: Draft | null = null;
  let field: Field = null;

  lines.forEach((raw, i) => {
    const n = i + 1;
    const l = raw.trim();
    if (!l) {
      field = null;
      return;
    }
    const q = Q_RE.exec(l);
    if (q) {
      cur = { line: n, q: q[1].trim(), options: [], answer: null, answerLine: 0, why: null };
      drafts.push(cur);
      field = "q";
      return;
    }
    if (!cur) {
      errors.push(`Line ${n}: start each question with "Q:".`);
      return;
    }
    const d: Draft = cur;
    const opt = OPTION_RE.exec(l);
    if (opt && d.answer === null && d.why === null) {
      d.options.push({ letter: opt[1].toUpperCase(), text: opt[2].trim() });
      field = "option";
      return;
    }
    const ans = ANSWER_RE.exec(l);
    if (ans) {
      // "B", "b", "B)" or "B) the option text" all mean B.
      d.answer = (ans[1].trim().split(/[\s).:]+/)[0] ?? "").toUpperCase();
      d.answerLine = n;
      field = null;
      return;
    }
    const why = WHY_RE.exec(l);
    if (why) {
      d.why = why[1].trim();
      field = "why";
      return;
    }
    // A continuation of the line above.
    if (field === "q") d.q = `${d.q} ${l}`.trim();
    else if (field === "option") {
      const last = d.options[d.options.length - 1];
      last.text = `${last.text} ${l}`.trim();
    } else if (field === "why") d.why = `${d.why ?? ""} ${l}`.trim();
    else errors.push(`Line ${n}: this line isn't a question, an option (A), B), ...), "Answer:" or "Why:".`);
  });

  if (!drafts.length && !errors.length) errors.push('Add at least one question. Start it with "Q:".');
  if (drafts.length > MAX_QUESTIONS) errors.push(`Up to ${MAX_QUESTIONS} questions per quiz. Split the rest into another lesson.`);

  const questions: QuizQuestion[] = [];
  drafts.forEach((d, i) => {
    const where = `Question ${i + 1} (line ${d.line})`;
    const problems: string[] = [];
    if (!d.q) problems.push("the question text is empty");
    if (d.options.length < 2) problems.push("it needs at least two options (A) and B))");
    if (d.options.length > MAX_OPTIONS) problems.push(`it has more than ${MAX_OPTIONS} options`);
    d.options.forEach((o, k) => {
      if (o.letter !== optionLetter(k)) problems.push(`option ${o.letter}) is out of order: expected ${optionLetter(k)})`);
      if (!o.text) problems.push(`option ${o.letter}) is empty`);
    });
    let answer = -1;
    if (d.answer === null) problems.push('there is no "Answer:" line');
    else {
      answer = LETTERS.indexOf(d.answer);
      if (d.answer.length !== 1 || answer < 0 || answer >= d.options.length) {
        problems.push(`"Answer: ${d.answer}" must be one of ${d.options.map((o) => o.letter).join(", ") || "the options"}`);
        answer = -1;
      }
    }
    if (problems.length) errors.push(`${where}: ${problems.join("; ")}.`);
    else questions.push({ q: d.q, options: d.options.map((o) => o.text), answer, why: d.why || null });
  });

  return errors.length ? { ok: false, errors } : { ok: true, questions };
}

/** The same questions written back in the text format (for editing). */
export function quizToText(questions: QuizQuestion[] | null | undefined): string {
  return (questions ?? [])
    .map((q) => [`Q: ${q.q}`, ...q.options.map((o, i) => `${optionLetter(i)}) ${o}`), `Answer: ${optionLetter(q.answer)}`, ...(q.why ? [`Why: ${q.why}`] : [])].join("\n"))
    .join("\n\n");
}

/** The example shown under the quiz editor. */
export const QUIZ_TEXT_EXAMPLE = `Q: Where do Terminal-Bench tests run?
A) Inside the agent's machine, while it works
B) On a separate verifier machine, after the agent stops
Answer: B
Why: The agent can't see or touch the grader.`;
