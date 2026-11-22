// Field types and labels for job application forms. No server-only imports, so client components
// (the public form, the builder preview, onboarding) can use it; job-fields.ts has the rest.

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "number",
  "single_select",
  "multi_select",
  "checkboxes",
  "yes_no",
  "date",
  "country",
  "years",
  "skills",
  "file",
  "consent",
  "section",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_INFO: Record<FieldType, { label: string; hint: string; choices?: boolean }> = {
  short_text: { label: "Short text", hint: "One line" },
  long_text: { label: "Long text", hint: "A paragraph" },
  email: { label: "Email", hint: "Checked to be an email address" },
  phone: { label: "Phone", hint: "With country code" },
  url: { label: "Link (URL)", hint: "https://..." },
  number: { label: "Number", hint: "Digits only" },
  single_select: { label: "Single choice", hint: "Pick one", choices: true },
  multi_select: { label: "Multiple choice", hint: "Pick any (chips)", choices: true },
  checkboxes: { label: "Checkboxes", hint: "Pick any (a list)", choices: true },
  yes_no: { label: "Yes / no", hint: "Two buttons" },
  date: { label: "Date", hint: "A calendar date" },
  country: { label: "Country", hint: "From the country list" },
  years: { label: "Years of experience", hint: "0 to 70" },
  skills: { label: "Skills (tags)", hint: "Comma-separated" },
  file: { label: "File upload", hint: "PDF or Word, up to 10 MB" },
  consent: { label: "Consent checkbox", hint: "Must be ticked if required" },
  section: { label: "Section heading", hint: "A title and text, no answer" },
};

export const isFieldType = (v: unknown): v is FieldType => typeof v === "string" && (FIELD_TYPES as readonly string[]).includes(v);

/** Profile keys a field can fill on the expert record. */
export const PROFILE_KEYS = [
  "full_name",
  "email",
  "phone",
  "country",
  "city",
  "linkedin_url",
  "headline",
  "years_experience",
  "highest_degree",
  "field_of_study",
  "university",
  "skills",
  "languages",
  "hours_per_week",
  "availability",
  "cv",
  "cv_consent",
] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];
export const isProfileKey = (v: unknown): v is ProfileKey => typeof v === "string" && (PROFILE_KEYS as readonly string[]).includes(v);

export const PROFILE_KEY_INFO: Record<ProfileKey, { label: string; types: readonly FieldType[] }> = {
  full_name: { label: "Full name", types: ["short_text"] },
  email: { label: "Email", types: ["email"] },
  phone: { label: "Phone", types: ["phone"] },
  country: { label: "Country", types: ["country"] },
  city: { label: "City", types: ["short_text"] },
  linkedin_url: { label: "LinkedIn URL", types: ["url"] },
  headline: { label: "Headline", types: ["short_text"] },
  years_experience: { label: "Years of experience", types: ["years", "number"] },
  highest_degree: { label: "Highest degree", types: ["single_select", "short_text"] },
  field_of_study: { label: "Field of study", types: ["short_text", "single_select"] },
  university: { label: "University", types: ["short_text"] },
  skills: { label: "Skills", types: ["skills", "multi_select", "checkboxes"] },
  languages: { label: "Languages", types: ["skills", "short_text", "multi_select", "checkboxes"] },
  hours_per_week: { label: "Hours per week", types: ["number"] },
  availability: { label: "Availability", types: ["single_select"] },
  cv: { label: "CV (becomes the current CV)", types: ["file"] },
  cv_consent: { label: "CV consent (ticked = yes)", types: ["consent"] },
};

export type FieldOptions = { choices?: string[] } | null;

export type FieldDef = {
  id: string;
  type: FieldType;
  label: string;
  helpText: string | null;
  required: boolean;
  options: FieldOptions;
  mapsTo: ProfileKey | null;
};

/** A field in a template (no id yet). */
export type TemplateField = Omit<FieldDef, "id">;

export const CONSENT_TEXT =
  "I agree that FynoLabs may store my details and share my profile and CV with partners for roles I apply to. I can ask for deletion at any time.";

export const DEGREE_CHOICES = ["High school", "Bachelor's", "Master's", "PhD", "MD", "JD", "Other"];

/** Availability choices on the default form, in the same order as the expert record's values. */
export const AVAILABILITY_CHOICES = ["Available now", "Limited (a few hours a week)", "Busy for now, available later", "Not available right now"];


export const inputName = (fieldId: string) => `f_${fieldId}`;
