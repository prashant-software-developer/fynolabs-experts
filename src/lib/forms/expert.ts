// Reads and checks the add / edit expert form.
import { AVAILABILITY, CV_CONSENT, DOMAINS, EXPERT_STATUSES, isOneOf, type Availability, type CvConsent, type ExpertStatus } from "@/lib/constants";
import { normalizeCountry, splitSkills } from "@/lib/match/dictionary";
import { cleanLongText, cleanText, normalizeEmail, normalizeLinkedin, normalizePhone, normalizeTags, splitList, toInt } from "@/lib/normalize";

export const EXPERT_FIELDS = [
  "fullName",
  "email",
  "phone",
  "country",
  "region",
  "city",
  "linkedinUrl",
  "headline",
  "domain",
  "skills",
  "languages",
  "yearsExperience",
  "highestDegree",
  "fieldOfStudy",
  "university",
  "hoursPerWeek",
  "availability",
  "rateExpectationUsd",
  "status",
  "cvConsent",
  "notes",
  "tags",
] as const;
export type ExpertFormValues = Record<(typeof EXPERT_FIELDS)[number], string>;

export type ExpertData = {
  fullName: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  linkedinUrl: string | null;
  headline: string | null;
  domain: string | null;
  skills: string[];
  languages: string[];
  yearsExperience: number | null;
  highestDegree: string | null;
  fieldOfStudy: string | null;
  university: string | null;
  hoursPerWeek: number | null;
  availability: Availability;
  rateExpectationUsd: number | null;
  status: ExpertStatus;
  cvConsent: CvConsent;
  notes: string | null;
  tags: string[];
};

export function formValues(fd: FormData): ExpertFormValues {
  const v = {} as ExpertFormValues;
  for (const f of EXPERT_FIELDS) v[f] = String(fd.get(f) ?? "");
  return v;
}

export function parseExpertForm(fd: FormData): { values: ExpertFormValues; data: ExpertData | null; errors: Record<string, string> } {
  const values = formValues(fd);
  const errors: Record<string, string> = {};
  const fullName = cleanText(values.fullName, 200);
  if (!fullName) errors.fullName = "Name is required.";
  const email = values.email.trim() ? normalizeEmail(values.email) : null;
  if (values.email.trim() && !email) errors.email = "That doesn't look like an email address.";
  const linkedinUrl = values.linkedinUrl.trim() ? normalizeLinkedin(values.linkedinUrl) : null;
  if (values.linkedinUrl.trim() && !linkedinUrl) errors.linkedinUrl = "Paste the full profile link (linkedin.com/in/...).";
  const years = values.yearsExperience.trim() ? toInt(values.yearsExperience, 0, 70) : null;
  if (values.yearsExperience.trim() && years == null) errors.yearsExperience = "A whole number from 0 to 70.";
  const hours = values.hoursPerWeek.trim() ? toInt(values.hoursPerWeek, 0, 80) : null;
  if (values.hoursPerWeek.trim() && hours == null) errors.hoursPerWeek = "A whole number from 0 to 80.";
  const rate = values.rateExpectationUsd.trim() ? toInt(values.rateExpectationUsd, 0, 10_000) : null;
  if (values.rateExpectationUsd.trim() && rate == null) errors.rateExpectationUsd = "A whole number in USD.";
  const domain = values.domain && isOneOf(DOMAINS, values.domain) ? values.domain : null;
  if (values.domain && !domain) errors.domain = "Pick a domain from the list.";
  const availability = isOneOf(AVAILABILITY, values.availability) ? values.availability : "available";
  const status = isOneOf(EXPERT_STATUSES, values.status) ? values.status : "applicant";
  const cvConsent = isOneOf(CV_CONSENT, values.cvConsent) ? values.cvConsent : "unknown";
  if (Object.keys(errors).length || !fullName) return { values, data: null, errors };
  return {
    values,
    errors,
    data: {
      fullName,
      email,
      phone: normalizePhone(values.phone),
      country: normalizeCountry(values.country),
      region: cleanText(values.region, 80),
      city: cleanText(values.city, 80),
      linkedinUrl,
      headline: cleanText(values.headline, 200),
      domain,
      skills: splitSkills(values.skills),
      languages: splitList(values.languages, 20),
      yearsExperience: years,
      highestDegree: cleanText(values.highestDegree, 120),
      fieldOfStudy: cleanText(values.fieldOfStudy, 120),
      university: cleanText(values.university, 160),
      hoursPerWeek: hours,
      availability,
      rateExpectationUsd: rate,
      status,
      cvConsent,
      notes: cleanLongText(values.notes, 10_000),
      tags: normalizeTags(values.tags),
    },
  };
}

export function valuesFromExpert(e: Partial<Record<keyof ExpertData, unknown>> | null): ExpertFormValues {
  const v = {} as ExpertFormValues;
  for (const f of EXPERT_FIELDS) {
    const raw = e?.[f];
    v[f] = Array.isArray(raw) ? raw.join(", ") : raw == null ? "" : String(raw);
  }
  if (!v.availability) v.availability = "available";
  if (!v.status) v.status = "applicant";
  if (!v.cvConsent) v.cvConsent = "unknown";
  return v;
}
