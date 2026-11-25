// Job application forms (like a Google Form): the field types, how each answer is checked, the
// default template, and how answers map onto the central expert record. Pure functions, tested in
// tests/forms.test.ts. The public form, the builder preview and the server all use these.
import { AVAILABILITY, type Availability } from "@/lib/constants";
import { toCountryName } from "@/lib/countries";
import { normalizeSkills, splitSkills } from "@/lib/match/dictionary";
import { cleanLongText, cleanText, normalizeEmail, normalizeLinkedin, normalizePhone, splitList } from "@/lib/normalize";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limit";

export {
  AVAILABILITY_CHOICES,
  CONSENT_TEXT,
  DEGREE_CHOICES,
  FIELD_TYPE_INFO,
  FIELD_TYPES,
  inputName,
  isFieldType,
  isProfileKey,
  PROFILE_KEY_INFO,
  PROFILE_KEYS,
} from "./field-meta";
export type { FieldDef, FieldOptions, FieldType, ProfileKey, TemplateField } from "./field-meta";
import { AVAILABILITY_CHOICES, CONSENT_TEXT, DEGREE_CHOICES, FIELD_TYPE_INFO, inputName, isFieldType, isProfileKey, PROFILE_KEY_INFO, type FieldDef, type FieldType, type ProfileKey, type TemplateField } from "./field-meta";

const t = (type: FieldType, label: string, extra: Partial<TemplateField> = {}): TemplateField => ({
  type,
  label,
  helpText: null,
  required: false,
  options: null,
  mapsTo: null,
  ...extra,
});

/** Every new job starts with this form (editable in the builder). */
export function defaultTemplate(): TemplateField[] {
  return [
    t("short_text", "Full name", { required: true, mapsTo: "full_name" }),
    t("email", "Email", { required: true, mapsTo: "email" }),
    t("phone", "Phone", { helpText: "With country code, e.g. +91 98765 43210", mapsTo: "phone" }),
    t("country", "Country", { required: true, mapsTo: "country" }),
    t("short_text", "City", { mapsTo: "city" }),
    t("url", "LinkedIn profile URL", { required: true, helpText: "linkedin.com/in/...", mapsTo: "linkedin_url" }),
    t("years", "Years of professional experience", { required: true, mapsTo: "years_experience" }),
    t("single_select", "Highest degree", { options: { choices: DEGREE_CHOICES }, mapsTo: "highest_degree" }),
    t("short_text", "Field of study", { mapsTo: "field_of_study" }),
    t("short_text", "University", { mapsTo: "university" }),
    t("skills", "Skills", { required: true, helpText: "Comma-separated, e.g. Python, numerical methods, LaTeX", mapsTo: "skills" }),
    t("number", "Hours per week you can give", { mapsTo: "hours_per_week" }),
    t("single_select", "Availability", { options: { choices: AVAILABILITY_CHOICES }, mapsTo: "availability" }),
    t("file", "CV", { required: true, helpText: "PDF or Word, up to 4 MB", mapsTo: "cv" }),
    t("long_text", "Why are you a good fit?", { helpText: "A few lines about the work you have done that fits this role." }),
    t("consent", CONSENT_TEXT, { required: true, mapsTo: "cv_consent" }),
  ];
}

// ---------- Cleaning field definitions (builder input, templates, stored JSON) ----------

export const MAX_FIELDS = 60;

/** One choice per line (or comma-separated on one line); trimmed, de-duplicated, at most 50. */
export function parseChoices(raw: unknown): string[] {
  if (Array.isArray(raw)) return splitList(raw.map(String), 50).map((c) => c.slice(0, 120));
  const s = String(raw ?? "");
  const parts = s.includes("\n") ? s.split(/\r?\n/) : s.split(",");
  return splitList(parts, 50).map((c) => c.slice(0, 120));
}

/** Makes any stored or posted shape into a safe field definition (unknown types become short text). */
export function cleanFieldDef(raw: Record<string, unknown>): TemplateField {
  const type = isFieldType(raw.type) ? raw.type : "short_text";
  const label = cleanText(raw.label, type === "consent" || type === "section" ? 600 : 200) ?? (type === "section" ? "Section" : "Untitled question");
  const help = cleanLongText(raw.helpText ?? raw.help_text, 1000);
  const opts = (raw.options && typeof raw.options === "object" ? raw.options : {}) as { choices?: unknown };
  const choices = FIELD_TYPE_INFO[type].choices ? parseChoices(opts.choices ?? raw.choices ?? []) : undefined;
  const mapsRaw = raw.mapsTo ?? raw.maps_to;
  const mapsTo = isProfileKey(mapsRaw) && PROFILE_KEY_INFO[mapsRaw].types.includes(type) ? mapsRaw : null;
  return {
    type,
    label,
    helpText: help,
    required: type === "section" ? false : raw.required === true || raw.required === "yes" || raw.required === "on",
    options: choices ? { choices } : null,
    mapsTo,
  };
}

export type FormProblem = { fieldIndex: number | null; message: string };

/** What stops a form from going live. The public form needs an email and a name to file the answers. */
export function checkFormDefinition(fields: readonly TemplateField[]): FormProblem[] {
  const problems: FormProblem[] = [];
  if (fields.length > MAX_FIELDS) problems.push({ fieldIndex: null, message: `A form can have up to ${MAX_FIELDS} fields.` });
  const seen = new Map<ProfileKey, number>();
  fields.forEach((f, i) => {
    if (f.mapsTo) {
      if (seen.has(f.mapsTo)) problems.push({ fieldIndex: i, message: `Two fields fill "${PROFILE_KEY_INFO[f.mapsTo].label}". Keep one.` });
      seen.set(f.mapsTo, i);
      if (!PROFILE_KEY_INFO[f.mapsTo].types.includes(f.type)) problems.push({ fieldIndex: i, message: `"${f.label}" can't fill ${PROFILE_KEY_INFO[f.mapsTo].label}.` });
    }
    if (FIELD_TYPE_INFO[f.type].choices && !(f.options?.choices?.length ?? 0)) problems.push({ fieldIndex: i, message: `"${f.label}" needs at least one choice.` });
  });
  const email = seen.has("email") ? fields[seen.get("email")!] : null;
  if (!email) problems.push({ fieldIndex: null, message: "Add an Email field that fills Email: it's how we know who applied." });
  else if (!email.required) problems.push({ fieldIndex: seen.get("email")!, message: "The Email field must be required." });
  const name = seen.has("full_name") ? fields[seen.get("full_name")!] : null;
  if (!name) problems.push({ fieldIndex: null, message: "Add a Full name field that fills Full name." });
  else if (!name.required) problems.push({ fieldIndex: seen.get("full_name")!, message: "The Full name field must be required." });
  return problems;
}

// ---------- Answers ----------

export type FileAnswer = { fileId: string; filename: string; size: number };
export type Answer = string | string[] | number | boolean | FileAnswer | null;

export type UploadedFile = { name: string; type: string; size: number; bytes: Uint8Array };

/** What a submitted form looks like to the validator: FormData in the app, a plain object in tests. */
export type AnswerInput = {
  get(name: string): string | null;
  getAll(name: string): string[];
  file(name: string): UploadedFile | null;
};


/** Vercel's standard request limit decides it (src/lib/upload-limit.ts). */
export const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;
const FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function checkFile(file: { name: string; type: string; size: number }): string | null {
  if (!file.size) return "The file is empty.";
  if (file.size > MAX_FILE_BYTES) return "Files can be up to 4 MB.";
  const byExt = /\.(pdf|docx?)$/i.test(file.name);
  if (!byExt || (file.type && !FILE_TYPES.has(file.type) && file.type !== "application/octet-stream")) return "Upload a PDF or Word document (.pdf, .doc, .docx).";
  return null;
}

const isIsoDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && Number(m[1]) >= 1900 && Number(m[1]) <= 2100;
};

export { COUNTRY_OPTIONS } from "@/lib/countries";

/** What the person typed, kept so the form can be shown again with their answers after an error. */
export type FormValues = Record<string, string | string[]>;

export type Validated = {
  answers: Record<string, Answer>;
  files: Record<string, UploadedFile>;
  errors: Record<string, string>;
  values: FormValues;
};

/**
 * Checks every answer against its field. Returns cleaned answers (keyed by field id), uploaded
 * files (stored by the caller, which then puts a FileAnswer in `answers`), and friendly errors.
 */
export function validateAnswers(fields: readonly FieldDef[], input: AnswerInput, opts: { existingFile?: Record<string, FileAnswer | null> } = {}): Validated {
  const answers: Record<string, Answer> = {};
  const files: Record<string, UploadedFile> = {};
  const errors: Record<string, string> = {};
  const values: FormValues = {};
  const required = "This question is required.";

  for (const f of fields) {
    if (f.type === "section") continue;
    const name = inputName(f.id);
    const raw = (input.get(name) ?? "").toString();
    const trimmed = raw.trim();
    const many = input
      .getAll(name)
      .map((v) => v.toString().trim())
      .filter(Boolean);
    if (f.type !== "file") values[f.id] = f.type === "multi_select" || f.type === "checkboxes" ? many : raw.slice(0, 5000);
    const empty = f.type === "multi_select" || f.type === "checkboxes" ? many.length === 0 : trimmed === "";

    if (f.type === "file") {
      const file = input.file(name);
      if (!file || !file.size) {
        const kept = opts.existingFile?.[f.id];
        if (kept) answers[f.id] = kept;
        else if (f.required) errors[f.id] = "Please attach a file.";
        else answers[f.id] = null;
        continue;
      }
      const problem = checkFile(file);
      if (problem) errors[f.id] = problem;
      else files[f.id] = file;
      continue;
    }
    if (f.type === "consent") {
      const ticked = ["yes", "on", "true"].includes(trimmed.toLowerCase());
      if (f.required && !ticked) errors[f.id] = "Please tick this box to continue.";
      answers[f.id] = ticked;
      continue;
    }
    if (empty) {
      if (f.required) errors[f.id] = required;
      answers[f.id] = null;
      continue;
    }
    const choices = f.options?.choices ?? [];
    switch (f.type) {
      case "short_text": {
        if (trimmed.length > 300) errors[f.id] = "Keep this under 300 characters.";
        else answers[f.id] = cleanText(trimmed, 300);
        break;
      }
      case "long_text": {
        if (trimmed.length > 5000) errors[f.id] = "Keep this under 5,000 characters.";
        else answers[f.id] = cleanLongText(raw, 5000);
        break;
      }
      case "email": {
        const e = normalizeEmail(trimmed);
        if (!e) errors[f.id] = "Enter a valid email address, like name@example.com.";
        else answers[f.id] = e;
        break;
      }
      case "phone": {
        const p = normalizePhone(trimmed);
        if (!p) errors[f.id] = "Enter a phone number with the country code.";
        else answers[f.id] = p;
        break;
      }
      case "url": {
        if (f.mapsTo === "linkedin_url") {
          const li = normalizeLinkedin(trimmed);
          if (!li || !/linkedin\.com\/(in|pub|profile)/i.test(li)) errors[f.id] = "Paste your LinkedIn profile link (linkedin.com/in/...).";
          else answers[f.id] = li;
          break;
        }
        const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        let ok = false;
        try {
          const u = new URL(withScheme);
          ok = (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") && trimmed.length <= 500;
        } catch {
          ok = false;
        }
        if (!ok) errors[f.id] = "Enter a full link, like https://example.com.";
        else answers[f.id] = withScheme;
        break;
      }
      case "number": {
        const n = Number(trimmed.replace(/,/g, ""));
        const [min, max] = f.mapsTo === "hours_per_week" ? [0, 80] : [-1e9, 1e9];
        if (!Number.isFinite(n)) errors[f.id] = "Enter a number.";
        else if (n < min || n > max) errors[f.id] = f.mapsTo === "hours_per_week" ? "Enter hours from 0 to 80." : "That number is out of range.";
        else answers[f.id] = f.mapsTo === "hours_per_week" ? Math.round(n) : n;
        break;
      }
      case "years": {
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n < 0 || n > 70) errors[f.id] = "Enter whole years from 0 to 70.";
        else answers[f.id] = Math.round(n);
        break;
      }
      case "single_select": {
        if (!choices.includes(trimmed)) errors[f.id] = "Pick one of the options.";
        else answers[f.id] = trimmed;
        break;
      }
      case "multi_select":
      case "checkboxes": {
        const picked = [...new Set(many)];
        if (picked.some((p) => !choices.includes(p))) errors[f.id] = "Pick from the options shown.";
        else answers[f.id] = choices.filter((c) => picked.includes(c));
        break;
      }
      case "yes_no": {
        const v = trimmed.toLowerCase();
        if (v !== "yes" && v !== "no") errors[f.id] = "Choose yes or no.";
        else answers[f.id] = v;
        break;
      }
      case "date": {
        if (!isIsoDate(trimmed)) errors[f.id] = "Enter a date (YYYY-MM-DD).";
        else answers[f.id] = trimmed;
        break;
      }
      case "country": {
        const c = toCountryName(trimmed);
        if (!c) errors[f.id] = "Pick your country from the list.";
        else answers[f.id] = c;
        break;
      }
      case "skills": {
        const list = f.mapsTo === "languages" ? splitList(trimmed, 41) : splitSkills(trimmed);
        if (!list.length) errors[f.id] = required;
        else if (list.length > 40) errors[f.id] = "Up to 40 skills.";
        else answers[f.id] = list;
        break;
      }
    }
  }
  return { answers, files, errors, values };
}

/** FormData as an AnswerInput (files come in as File objects). */
export async function answerInputFromFormData(fd: FormData): Promise<AnswerInput> {
  const files = new Map<string, UploadedFile>();
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string" && v && typeof (v as File).arrayBuffer === "function" && (v as File).size > 0 && !files.has(k)) {
      const f = v as File;
      files.set(k, { name: f.name || "file", type: f.type || "", size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) });
    }
  }
  return {
    get: (n) => {
      const v = fd.get(n);
      return typeof v === "string" ? v : null;
    },
    getAll: (n) => fd.getAll(n).filter((v): v is string => typeof v === "string"),
    file: (n) => files.get(n) ?? null,
  };
}

/** A plain object as an AnswerInput (tests, scripts). */
export function answerInputFrom(values: Record<string, string | string[] | UploadedFile | undefined>): AnswerInput {
  return {
    get: (n) => {
      const v = values[n];
      return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? null) : null;
    },
    getAll: (n) => {
      const v = values[n];
      return typeof v === "string" ? [v] : Array.isArray(v) ? v : [];
    },
    file: (n) => {
      const v = values[n];
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    },
  };
}

// ---------- Answers -> the expert record ----------

/** The expert record's fields a form can fill (camelCase, as in the database schema). */
export type ProfileValues = {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  linkedinUrl: string;
  headline: string;
  yearsExperience: number;
  highestDegree: string;
  fieldOfStudy: string;
  university: string;
  skills: string[];
  languages: string[];
  hoursPerWeek: number;
  availability: Availability;
};

const KEY_TO_COLUMN: Partial<Record<ProfileKey, keyof ProfileValues>> = {
  full_name: "fullName",
  email: "email",
  phone: "phone",
  country: "country",
  city: "city",
  linkedin_url: "linkedinUrl",
  headline: "headline",
  years_experience: "yearsExperience",
  highest_degree: "highestDegree",
  field_of_study: "fieldOfStudy",
  university: "university",
  skills: "skills",
  languages: "languages",
  hours_per_week: "hoursPerWeek",
  availability: "availability",
};

/** "Available now" -> available, "Not available right now" -> unavailable, and so on. */
export function toAvailability(answer: string): Availability {
  const i = AVAILABILITY_CHOICES.indexOf(answer);
  if (i >= 0) return AVAILABILITY[i];
  const a = answer.toLowerCase();
  if ((AVAILABILITY as readonly string[]).includes(a)) return a as Availability;
  if (/\bnot\b|unavailable/.test(a)) return "unavailable";
  if (/busy|later|weeks?|months?/.test(a)) return "busy";
  if (/limited|part|few hours/.test(a)) return "limited";
  return "available";
}

/** The profile values the answers carry (only mapped fields with an answer). */
export function profileFromAnswers(fields: readonly FieldDef[], answers: Record<string, Answer>): Partial<ProfileValues> {
  const out: Partial<ProfileValues> = {};
  for (const f of fields) {
    if (!f.mapsTo) continue;
    const col = KEY_TO_COLUMN[f.mapsTo];
    const a = answers[f.id];
    if (!col || a == null || a === "" || (Array.isArray(a) && !a.length)) continue;
    switch (col) {
      case "skills":
        out.skills = normalizeSkills(Array.isArray(a) ? a : splitSkills(String(a)));
        break;
      case "languages":
        out.languages = Array.isArray(a) ? a.map(String) : splitList(String(a), 20);
        break;
      case "yearsExperience":
      case "hoursPerWeek":
        if (typeof a === "number") out[col] = Math.round(a);
        break;
      case "availability":
        out.availability = toAvailability(String(a));
        break;
      default:
        if (typeof a === "string") (out as Record<string, unknown>)[col] = a;
    }
  }
  return out;
}

/** True when the form's consent field that records CV consent was ticked. */
export function consentGiven(fields: readonly FieldDef[], answers: Record<string, Answer>): boolean {
  return fields.some((f) => f.mapsTo === "cv_consent" && answers[f.id] === true);
}

type Existing = Partial<Record<keyof ProfileValues, unknown>>;

const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * The merge rule for an expert who is already in the hub: answers only FILL fields that are empty,
 * so nothing the team typed is overwritten. Lists (skills, languages) gain new items; nothing is
 * removed. Availability is only set for new people (the record always has one). Name is never
 * changed here; email only fills an empty one.
 */
export function mergeIntoProfile(existing: Existing | null, incoming: Partial<ProfileValues>): { patch: Partial<ProfileValues>; filled: (keyof ProfileValues)[] } {
  if (!existing) return { patch: { ...incoming }, filled: Object.keys(incoming) as (keyof ProfileValues)[] };
  const patch: Partial<ProfileValues> = {};
  for (const [k, v] of Object.entries(incoming) as [keyof ProfileValues, unknown][]) {
    if (isEmpty(v)) continue;
    if (k === "availability" || k === "fullName") continue;
    const cur = existing[k];
    if (k === "skills" || k === "languages") {
      const curList = Array.isArray(cur) ? (cur as string[]) : [];
      const lower = new Set(curList.map((s) => s.toLowerCase()));
      const added = (v as string[]).filter((s) => !lower.has(s.toLowerCase()));
      if (added.length) (patch as Record<string, unknown>)[k] = [...curList, ...added];
      continue;
    }
    if (isEmpty(cur)) (patch as Record<string, unknown>)[k] = v;
  }
  return { patch, filled: Object.keys(patch) as (keyof ProfileValues)[] };
}

/** Prefill for a signed-in expert: the form's mapped fields from their profile. */
export function prefillFromProfile(fields: readonly FieldDef[], p: Partial<Record<keyof ProfileValues, unknown>>): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    if (!f.mapsTo) continue;
    const col = KEY_TO_COLUMN[f.mapsTo];
    if (!col) continue;
    const v = p[col];
    if (isEmpty(v)) continue;
    if (col === "availability") {
      const i = AVAILABILITY.indexOf(v as Availability);
      if (i >= 0 && f.options?.choices?.includes(AVAILABILITY_CHOICES[i])) out[f.id] = AVAILABILITY_CHOICES[i];
      continue;
    }
    if (Array.isArray(v)) out[f.id] = f.type === "multi_select" || f.type === "checkboxes" ? (v as string[]).filter((x) => f.options?.choices?.includes(x)) : (v as string[]).join(", ");
    else if (f.type === "single_select") {
      if (f.options?.choices?.includes(String(v))) out[f.id] = String(v);
    } else out[f.id] = String(v);
  }
  return out;
}

/** A short, readable version of an answer for tables and CSV. */
export function answerText(a: Answer | undefined): string {
  if (a == null) return "";
  if (typeof a === "boolean") return a ? "Yes" : "No";
  if (Array.isArray(a)) return a.join(", ");
  if (typeof a === "object") return a.filename;
  if (a === "yes" || a === "no") return a === "yes" ? "Yes" : "No";
  return String(a);
}
