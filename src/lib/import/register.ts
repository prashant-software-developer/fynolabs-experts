// Maps the "Talent register" spreadsheet (Company/Talents/Talent register.xlsx, saved as CSV).
// Columns: Name, Role, Location, Line, Folder, CV file, Status, Best fit, Consent to share CV,
//          Source, Added, Notes
import type { CvConsent, ExpertStatus } from "@/lib/constants";
import { findSkills, normalizeDomain, domainOf, splitLocation } from "@/lib/match/dictionary";
import { cleanText, isoDate, nameKey } from "@/lib/normalize";
import { emptyDraft, type DraftRow } from "./types";

export const REGISTER_COLUMNS = [
  "Name",
  "Role",
  "Location",
  "Line",
  "Folder",
  "CV file",
  "Status",
  "Best fit",
  "Consent to share CV",
  "Source",
  "Added",
  "Notes",
] as const;

/** Register "Status" (free text) -> hub status. */
export function registerStatus(status: string | null, folder: string | null): ExpertStatus | null {
  const s = (status ?? "").toLowerCase();
  const f = (folder ?? "").toLowerCase();
  if (/do not contact|don't contact|dnc/.test(s)) return "do_not_contact";
  if (/inactive|dropped|not interested|left/.test(s) || f === "inactive") return "inactive";
  if (/placed|active|working|onboarded/.test(s) || f === "placed") return "placed";
  if (/submitted|in review|shortlisted/.test(s)) return "submitted";
  if (/bench|vetted|approved/.test(s) || f === "bench") return "bench";
  if (/screen|interview|awaiting|assessment|test/.test(s)) return "screening";
  if (/new|prospect|not contacted|applied|lead/.test(s)) return "applicant";
  return s ? "applicant" : null;
}

/** "Yes", "Yes (job form consent 2026-10-14)" -> yes; "No" -> no; "Ask", "Confirm", "" -> unknown. */
export function registerConsent(raw: string | null): CvConsent {
  const s = (raw ?? "").trim().toLowerCase();
  if (/^(yes|y|true|granted|ok)\b/.test(s)) return "yes";
  if (/^(no|n|false|declined|refused)\b/.test(s)) return "no";
  return "unknown";
}

export function mapRegisterRow(row: Record<string, string>, rowNumber: number): DraftRow {
  const get = (k: string) => cleanText(row[k] ?? row[k.toLowerCase()], 500);
  const warnings: string[] = [];
  const d = emptyDraft();
  d.fullName = get("Name");
  d.headline = get("Role");
  const loc = splitLocation(get("Location"));
  d.city = loc.city;
  d.region = loc.region;
  d.country = loc.country;
  const bestFit = get("Best fit");
  d.skills = findSkills([d.headline, bestFit].filter(Boolean).join(". "));
  d.domain = domainOf(bestFit) ?? domainOf(d.headline) ?? (d.headline ? normalizeDomain(d.headline) : null);
  if (d.domain === "Other" && !bestFit) d.domain = null;
  d.status = registerStatus(get("Status"), get("Folder"));
  d.cvConsent = registerConsent(get("Consent to share CV"));

  const tags: string[] = [];
  const line = get("Line");
  if (line) {
    if (/both/i.test(line)) tags.push("ai-training", "product-studio");
    else tags.push(line.toLowerCase().replace(/\s+/g, "-"));
  }
  const folder = get("Folder");
  if (folder && /^team$/i.test(folder)) tags.push("team");
  d.tags = tags;

  const notes: string[] = [];
  const status = get("Status");
  if (status) notes.push(`Register status: ${status}`);
  if (bestFit) notes.push(`Best fit: ${bestFit}`);
  const cvFile = get("CV file");
  if (cvFile && !/^[-–—]$/.test(cvFile)) notes.push(`CV file (local): ${folder && !/^[-–—]$/.test(folder) ? `${folder}/` : ""}${cvFile}`);
  const consentRaw = get("Consent to share CV");
  if (consentRaw && d.cvConsent === "yes" && consentRaw.length > 3) notes.push(`Consent: ${consentRaw}`);
  const source = get("Source");
  if (source) notes.push(`Source: ${source}`);
  const added = isoDate(get("Added"));
  if (added) notes.push(`Added to register: ${added}`);
  const extra = get("Notes");
  if (extra) notes.push(extra);
  d.notes = notes.join("\n") || null;

  if (!d.fullName) warnings.push("No name: row skipped");
  // The register has no email column, so the name is the key between imports.
  return { row: rowNumber, source: "register", externalId: d.fullName ? `name:${nameKey(d.fullName)}` : null, draft: d, warnings };
}
