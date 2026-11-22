// Reads and checks the job details form (admin), and turns a requirement into a job's starting
// values. Pure functions, tested in tests/jobs.test.ts.
import { DEFAULT_COMPANY_LABEL, DOMAINS, EMPLOYMENT_TYPES, JOB_VISIBILITY, isOneOf, type Domain, type EmploymentType, type JobVisibility } from "@/lib/constants";
import { splitSkills } from "@/lib/match/dictionary";
import { cleanLongText, cleanText, isoDate, toInt } from "@/lib/normalize";
import type { Requirement } from "@/db/schema";
import { parsePlaces } from "./requirement";

export type JobFormValues = {
  title: string;
  publicCompanyLabel: string;
  partnerId: string;
  requirementId: string;
  summary: string;
  description: string;
  location: string;
  employmentType: string;
  domains: string[];
  skills: string;
  countriesAllowed: string;
  countriesBlocked: string;
  minYears: string;
  openings: string;
  closesOn: string;
  visibility: string;
  featured: string;
  internalRateNote: string;
};

export type JobData = {
  title: string;
  publicCompanyLabel: string;
  partnerId: string | null;
  requirementId: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  employmentType: EmploymentType;
  domains: Domain[];
  skills: string[];
  countriesAllowed: string[];
  countriesBlocked: string[];
  minYears: number | null;
  openings: number;
  closesOn: string | null;
  visibility: JobVisibility;
  featured: boolean;
  internalRateNote: string | null;
};

const KEYS: (keyof JobFormValues)[] = [
  "title",
  "publicCompanyLabel",
  "partnerId",
  "requirementId",
  "summary",
  "description",
  "location",
  "employmentType",
  "domains",
  "skills",
  "countriesAllowed",
  "countriesBlocked",
  "minYears",
  "openings",
  "closesOn",
  "visibility",
  "featured",
  "internalRateNote",
];

export const emptyJobValues = (): JobFormValues => ({
  title: "",
  publicCompanyLabel: DEFAULT_COMPANY_LABEL,
  partnerId: "",
  requirementId: "",
  summary: "",
  description: "",
  location: "Remote",
  employmentType: "contract",
  domains: [],
  skills: "",
  countriesAllowed: "",
  countriesBlocked: "",
  minYears: "",
  openings: "1",
  closesOn: "",
  visibility: "public",
  featured: "",
  internalRateNote: "",
});

export function jobFormValues(fd: FormData): JobFormValues {
  const v = emptyJobValues();
  for (const k of KEYS) {
    if (k === "domains") v.domains = fd.getAll("domains").map(String);
    else (v as Record<string, unknown>)[k] = String(fd.get(k) ?? "");
  }
  return v;
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseJobForm(fd: FormData): { values: JobFormValues; data: JobData | null; errors: Record<string, string> } {
  const values = jobFormValues(fd);
  const errors: Record<string, string> = {};
  const title = cleanText(values.title, 160);
  if (!title) errors.title = "Give the job a title.";
  const label = cleanText(values.publicCompanyLabel, 120) ?? DEFAULT_COMPANY_LABEL;
  const minYears = values.minYears.trim() ? toInt(values.minYears, 0, 60) : null;
  if (values.minYears.trim() && minYears == null) errors.minYears = "A whole number from 0 to 60.";
  const openings = values.openings.trim() ? toInt(values.openings, 1, 1000) : 1;
  if (openings == null) errors.openings = "A whole number from 1 to 1000.";
  const closesOn = values.closesOn.trim() ? isoDate(values.closesOn) : null;
  if (values.closesOn.trim() && !closesOn) errors.closesOn = "Pick a date.";
  const employmentType = isOneOf(EMPLOYMENT_TYPES, values.employmentType) ? values.employmentType : "contract";
  const visibility = isOneOf(JOB_VISIBILITY, values.visibility) ? values.visibility : "public";
  const domains = values.domains.filter((d): d is Domain => isOneOf(DOMAINS, d));
  if (Object.keys(errors).length || !title || openings == null) return { values, data: null, errors };
  return {
    values,
    errors,
    data: {
      title,
      publicCompanyLabel: label,
      partnerId: uuidRe.test(values.partnerId) ? values.partnerId : null,
      requirementId: uuidRe.test(values.requirementId) ? values.requirementId : null,
      summary: cleanText(values.summary, 400),
      description: cleanLongText(values.description, 20_000),
      location: cleanText(values.location, 120),
      employmentType,
      domains,
      skills: splitSkills(values.skills),
      countriesAllowed: parsePlaces(values.countriesAllowed),
      countriesBlocked: parsePlaces(values.countriesBlocked),
      minYears,
      openings,
      closesOn,
      visibility,
      featured: values.featured === "yes" || values.featured === "on",
      internalRateNote: cleanLongText(values.internalRateNote, 2000),
    },
  };
}

const titleCase = (s: string) => s.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());

/**
 * "Create job from requirement": the job starts with the requirement's title, skills, domains,
 * countries, minimum years and slots. The partner stays an internal link; the public company label
 * is the default one. The requirement's rate note only goes to the job's internal note, and only
 * for people who may see money. Nothing about the partner or pay goes into public fields.
 */
export function jobPrefillFromRequirement(req: Pick<Requirement, "id" | "partnerId" | "title" | "mustSkills" | "niceSkills" | "domains" | "countriesAllowed" | "countriesBlocked" | "minYears" | "slots" | "rateNote" | "deadline">, opts: { withRateNote: boolean }): JobFormValues {
  const skills = [...new Set([...req.mustSkills, ...req.niceSkills])];
  const v = emptyJobValues();
  v.title = req.title;
  v.partnerId = req.partnerId;
  v.requirementId = req.id;
  v.domains = [...req.domains];
  v.skills = skills.join(", ");
  v.countriesAllowed = req.countriesAllowed.join(", ");
  v.countriesBlocked = req.countriesBlocked.join(", ");
  v.minYears = req.minYears != null ? String(req.minYears) : "";
  v.openings = String(req.slots);
  v.closesOn = req.deadline ?? "";
  const domainText = req.domains.length ? ` in ${req.domains.join(" and ")}` : "";
  v.summary = `Remote work for experienced experts${domainText}, helping train and evaluate frontier AI models.`;
  const must = req.mustSkills.map(titleCase);
  v.description = [
    "## About the work",
    `You will work on AI training and evaluation tasks${domainText}: writing and reviewing problems, checking model answers and explaining what good looks like.`,
    "",
    "## What we look for",
    ...(must.length ? must.map((s) => `- ${s}`) : ["- Strong, verifiable expertise in the field"]),
    ...(req.minYears != null ? [`- ${req.minYears}+ years of relevant experience`] : []),
    "- Clear written English",
    "",
    "## How it works",
    "Apply with the form below. If your profile fits, we will contact you about the next steps.",
  ].join("\n");
  v.internalRateNote = opts.withRateNote ? (req.rateNote ?? "") : "";
  return v;
}
