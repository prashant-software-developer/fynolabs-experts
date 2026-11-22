// Reads and checks the requirement form.
import { DEGREE_LEVELS, DOMAINS, REQUIREMENT_STATUSES, isOneOf, type DegreeLevel, type Domain, type RequirementStatus } from "@/lib/constants";
import { lookupCountry, lookupUsState, normalizeCountry, splitSkills } from "@/lib/match/dictionary";
import { cleanLongText, cleanText, isoDate, toInt } from "@/lib/normalize";

export type RequirementFormValues = {
  partnerId: string;
  newPartner: string;
  title: string;
  externalRef: string;
  description: string;
  mustSkills: string;
  niceSkills: string;
  domains: string[];
  degrees: string[];
  countriesAllowed: string;
  countriesBlocked: string;
  minYears: string;
  slots: string;
  rateNote: string;
  deadline: string;
  status: string;
};

export type RequirementData = {
  partnerId: string | null;
  newPartner: string | null;
  title: string;
  externalRef: string | null;
  description: string | null;
  mustSkills: string[];
  niceSkills: string[];
  domains: Domain[];
  degrees: DegreeLevel[];
  countriesAllowed: string[];
  countriesBlocked: string[];
  minYears: number | null;
  slots: number;
  rateNote: string | null;
  deadline: string | null;
  status: RequirementStatus;
};

/** "United States, US-CA, Texas (US), uk" -> ["United States", "US-CA", "US-TX", "United Kingdom"] */
export function parsePlaces(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const s = part.trim();
    if (!s) continue;
    let v: string | null = null;
    const code = /^US[-\s]([A-Za-z]{2})$/i.exec(s);
    const named = /^(.+?)\s*\((?:US|USA)\)$/i.exec(s);
    if (code && lookupUsState(code[1])) v = `US-${code[1].toUpperCase()}`;
    else if (named && lookupUsState(named[1])) v = `US-${lookupUsState(named[1])}`;
    else v = lookupCountry(s) ?? normalizeCountry(s);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

export function requirementValues(fd: FormData): RequirementFormValues {
  const s = (k: string) => String(fd.get(k) ?? "");
  return {
    partnerId: s("partnerId"),
    newPartner: s("newPartner"),
    title: s("title"),
    externalRef: s("externalRef"),
    description: s("description"),
    mustSkills: s("mustSkills"),
    niceSkills: s("niceSkills"),
    domains: fd.getAll("domains").map(String),
    degrees: fd.getAll("degrees").map(String),
    countriesAllowed: s("countriesAllowed"),
    countriesBlocked: s("countriesBlocked"),
    minYears: s("minYears"),
    slots: s("slots"),
    rateNote: s("rateNote"),
    deadline: s("deadline"),
    status: s("status") || "open",
  };
}

export function parseRequirementForm(fd: FormData): { values: RequirementFormValues; data: RequirementData | null; errors: Record<string, string> } {
  const values = requirementValues(fd);
  const errors: Record<string, string> = {};
  const title = cleanText(values.title, 200);
  if (!title) errors.title = "Give the requirement a title.";
  const newPartner = cleanText(values.newPartner, 120);
  const partnerId = values.partnerId && values.partnerId !== "new" ? values.partnerId : null;
  if (!partnerId && !newPartner) errors.partnerId = "Pick the partner, or type a new partner's name.";
  const slots = values.slots.trim() ? toInt(values.slots, 1, 500) : 1;
  if (slots == null) errors.slots = "A whole number from 1 to 500.";
  const minYears = values.minYears.trim() ? toInt(values.minYears, 0, 40) : null;
  if (values.minYears.trim() && minYears == null) errors.minYears = "A whole number from 0 to 40.";
  const deadline = values.deadline.trim() ? isoDate(values.deadline) : null;
  if (values.deadline.trim() && !deadline) errors.deadline = "Use a date like 2026-12-05.";
  const mustSkills = splitSkills(values.mustSkills);
  const niceSkills = splitSkills(values.niceSkills).filter((s) => !mustSkills.includes(s));
  if (Object.keys(errors).length || !title || slots == null) return { values, data: null, errors };
  return {
    values,
    errors,
    data: {
      partnerId,
      newPartner: partnerId ? null : newPartner,
      title,
      externalRef: cleanText(values.externalRef, 80),
      description: cleanLongText(values.description, 20_000),
      mustSkills,
      niceSkills,
      domains: values.domains.filter((d): d is Domain => isOneOf(DOMAINS, d)),
      degrees: values.degrees.filter((d): d is DegreeLevel => isOneOf(DEGREE_LEVELS, d)),
      countriesAllowed: parsePlaces(values.countriesAllowed),
      countriesBlocked: parsePlaces(values.countriesBlocked),
      minYears,
      slots,
      rateNote: cleanText(values.rateNote, 300),
      deadline,
      status: isOneOf(REQUIREMENT_STATUSES, values.status) ? values.status : "open",
    },
  };
}
