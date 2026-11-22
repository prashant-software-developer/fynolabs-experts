// Maps an export of the old admin CRM (fynolabs.si/admin experts) or any similar spreadsheet.
// Headings are matched loosely: "Full name", "full_name" and "Name" all mean the name.
import { AVAILABILITY, isOneOf, type ExpertStatus } from "@/lib/constants";
import { normalizeCountry, normalizeDomain, splitLocation, splitSkills } from "@/lib/match/dictionary";
import { cleanLongText, cleanText, normalizeEmail, normalizeLinkedin, normalizePhone, normalizeTags, splitList, toInt } from "@/lib/normalize";
import { registerConsent } from "./register";
import { emptyDraft, type DraftRow } from "./types";

export const CRM_FIELDS: { field: string; aliases: string[] }[] = [
  { field: "id", aliases: ["id", "expert id", "profile id", "crm id", "record id"] },
  { field: "name", aliases: ["name", "full name", "fullname", "candidate", "person", "expert"] },
  { field: "email", aliases: ["email", "e-mail", "email address", "mail"] },
  { field: "linkedin", aliases: ["linkedin", "linkedin url", "linkedin profile", "linkedin profile url", "profile url"] },
  { field: "phone", aliases: ["phone", "mobile", "phone number", "whatsapp"] },
  { field: "headline", aliases: ["headline", "title", "current title", "role", "position", "job title"] },
  { field: "country", aliases: ["country", "lives in", "nation"] },
  { field: "region", aliases: ["region", "state", "province", "state or region"] },
  { field: "city", aliases: ["city", "town"] },
  { field: "location", aliases: ["location", "based in"] },
  { field: "domain", aliases: ["domain", "field", "track", "area"] },
  { field: "years", aliases: ["years experience", "years of experience", "experience", "yoe", "years", "years of professional experience"] },
  { field: "degree", aliases: ["highest degree", "degree", "education"] },
  { field: "study", aliases: ["field of study", "major", "subject"] },
  { field: "university", aliases: ["university", "school", "college", "alma mater"] },
  { field: "languages", aliases: ["languages", "language"] },
  { field: "hours", aliases: ["hours per week", "hours", "hours a week", "availability hours"] },
  { field: "availability", aliases: ["availability", "available"] },
  { field: "rate", aliases: ["rate expectation", "rate", "hourly rate", "rate usd", "rate expectation usd"] },
  { field: "skills", aliases: ["skills", "stack", "expertise", "skill"] },
  { field: "tags", aliases: ["tags", "labels"] },
  { field: "status", aliases: ["status", "stage", "pipeline status"] },
  { field: "consent", aliases: ["cv consent", "consent", "consent to share cv", "cv sharing consent"] },
  { field: "notes", aliases: ["notes", "note", "comments", "comment"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.]+/g, " ").trim();

/** Which CRM field each heading maps to. */
export function crmColumnMap(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    const f = CRM_FIELDS.find((x) => x.aliases.some((a) => norm(a) === norm(h)));
    if (f && !Object.values(out).includes(f.field)) out[h] = f.field;
  }
  return out;
}

export function crmStatus(raw: string | null): ExpertStatus | null {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return null;
  if (/do.?not.?contact|dnc|blocked/.test(s)) return "do_not_contact";
  if (/inactive|archived|dropped|rejected/.test(s)) return "inactive";
  if (/placed|active|working/.test(s)) return "placed";
  if (/submitted|shortlist|client/.test(s)) return "submitted";
  if (/bench|vetted|approved|qualified/.test(s)) return "bench";
  if (/screen|interview|assess|review|contacted/.test(s)) return "screening";
  return "applicant";
}

export function mapCrmRow(row: Record<string, string>, rowNumber: number, columns: Record<string, string>): DraftRow {
  const v: Record<string, string> = {};
  for (const [heading, field] of Object.entries(columns)) {
    const val = (row[heading] ?? "").trim();
    if (val) v[field] = val;
  }
  const warnings: string[] = [];
  const d = emptyDraft();
  d.fullName = cleanText(v.name, 200);
  d.email = normalizeEmail(v.email);
  if (v.email && !d.email) warnings.push(`Email "${v.email}" doesn't look valid: left empty`);
  d.linkedinUrl = normalizeLinkedin(v.linkedin);
  d.phone = normalizePhone(v.phone);
  d.headline = cleanText(v.headline, 200);
  const loc = splitLocation(v.location);
  d.country = normalizeCountry(v.country) ?? loc.country;
  d.region = cleanText(v.region, 80) ?? loc.region;
  d.city = cleanText(v.city, 80) ?? loc.city;
  d.domain = v.domain ? normalizeDomain(v.domain) : null;
  d.yearsExperience = toInt(v.years, 0, 70);
  d.highestDegree = cleanText(v.degree, 120);
  d.fieldOfStudy = cleanText(v.study, 120);
  d.university = cleanText(v.university, 160);
  d.languages = splitList(v.languages, 20);
  d.hoursPerWeek = toInt(v.hours, 0, 80);
  const av = (v.availability ?? "").toLowerCase();
  d.availability = isOneOf(AVAILABILITY, av) ? av : null;
  d.rateExpectationUsd = toInt(v.rate, 0, 10_000);
  d.skills = splitSkills(v.skills);
  d.tags = normalizeTags(v.tags);
  d.status = crmStatus(v.status ?? null);
  d.cvConsent = v.consent ? registerConsent(v.consent) : null;
  d.notes = cleanLongText(v.notes, 4000);
  if (!d.fullName) warnings.push("No name: row skipped");
  const externalId = cleanText(v.id, 100) ?? (d.email ? `email:${d.email}` : null);
  return { row: rowNumber, source: "admin_crm", externalId, draft: d, warnings };
}
