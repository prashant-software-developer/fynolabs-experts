// Rules for anything the public sees about a job (job page, board, share links, structured data):
// no pay or pay basis, and never the client's name. Checked when a job is saved and before it goes
// live; tested in tests/forms.test.ts. Pure functions.

const PAY_PATTERNS: { re: RegExp; what: string }[] = [
  { re: /[$€£₹¥]\s?\d/, what: "an amount of money" },
  { re: /\b\d[\d,.]*\s?(usd|eur|gbp|inr|aud|cad|dollars?|rupees?|euros?|pounds?)\b/i, what: "an amount of money" },
  { re: /\b(usd|eur|gbp|inr|rs\.?)\s?\d/i, what: "an amount of money" },
  // "per week" / "per month" alone are about time ("hours per week"); amounts with them are caught above.
  { re: /\bper\s+(hour|hr|task|item|annum|project|submission)\b/i, what: "a pay basis (per hour, per task...)" },
  { re: /\/\s?(hr|hour|h|task)\b/i, what: "a pay basis (/hr, /task...)" },
  { re: /\bpaid\s+(per|by|hourly|weekly|monthly|daily)\b/i, what: "a pay basis (paid per...)" },
  { re: /\b(hourly|daily|weekly|monthly|annual)\s+(rate|pay|payments?|payouts?)\b/i, what: "a pay basis (hourly rate, weekly payments...)" },
  { re: /\b(salary|salaries|stipend|compensation|remuneration|wages?|pay\s?rate|payouts?|earn up to|earnings)\b/i, what: "pay" },
  { re: /\b\d+\s?k\s?(\/|per)\s?(yr|year|month|mo)\b/i, what: "an amount of money" },
];

/** What in this text talks about pay ("" when nothing). */
export function payProblem(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const p of PAY_PATTERNS) if (p.re.test(text)) return p.what;
  return null;
}

const STOP = new Set(["the", "and", "labs", "lab", "data", "ai", "inc", "ltd", "llc", "group", "global", "experts", "expert", "partners", "partner", "technologies", "tech", "solutions", "services", "company", "co"]);

/** The words of a partner's name worth looking for: the full name without "(demo)" and its first distinctive word. */
export function partnerNameTerms(name: string | null | undefined): string[] {
  if (!name) return [];
  const core = name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!core) return [];
  const terms = [core];
  const first = core.split(/[\s,.-]+/).find((w) => w.length >= 4 && !STOP.has(w.toLowerCase()));
  if (first && first.toLowerCase() !== core.toLowerCase()) terms.push(first);
  return terms;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function mentionsPartner(text: string | null | undefined, partnerName: string | null | undefined): boolean {
  if (!text) return false;
  return partnerNameTerms(partnerName).some((t) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(t)}($|[^\\p{L}\\p{N}])`, "iu").test(text));
}

export type CopyProblem = { field: string; message: string };

/** Every public text of a job and its form, checked for pay and the partner's name. */
export function publicCopyProblems(
  texts: { field: string; label: string; text: string | null | undefined }[],
  partnerName: string | null | undefined,
): CopyProblem[] {
  const out: CopyProblem[] = [];
  for (const t of texts) {
    const pay = payProblem(t.text);
    if (pay) out.push({ field: t.field, message: `${t.label} mentions ${pay}. Public job material never shows pay or a pay basis; keep rates in the internal rate note.` });
    if (mentionsPartner(t.text, partnerName)) out.push({ field: t.field, message: `${t.label} names the partner. Use the company label (e.g. "AI data partner (via FynoLabs)") instead.` });
  }
  return out;
}
