// The roster sent to a partner for one requirement: a CSV in the column order of vendor portals
// (vendor-portal style) and a ZIP of CVs. Only experts who said yes to sharing their CV are included.
import { OPEN_SUBMISSION, label, type SubmissionStatus } from "@/lib/constants";
import { safeFilename, toCsv } from "@/lib/csv";

export const ROSTER_HEADERS = [
  "Name",
  "Email",
  "Country",
  "City",
  "Phone",
  "Years of professional experience",
  "LinkedIn profile URL",
  "Résumé filename",
  "Notes",
] as const;

export type RosterInput = {
  submissionId: string;
  status: SubmissionStatus | string;
  partnerNote: string | null;
  expert: {
    id: string;
    fullName: string;
    email: string | null;
    country: string | null;
    city: string | null;
    phone: string | null;
    yearsExperience: number | null;
    linkedinUrl: string | null;
    cvConsent: string;
  };
  cv: { fileId: string; filename: string } | null;
};

export type RosterLine = RosterInput & { zipName: string | null };
export type RosterPlan = { included: RosterLine[]; skipped: { name: string; reason: string }[]; missingCv: string[] };

function extensionOf(filename: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(filename);
  return m ? `.${m[1].toLowerCase()}` : ".pdf";
}

/** "Jane Doe - CV.pdf", with " (2)" added if two people share a name. */
export function cvZipName(fullName: string, originalFilename: string, used: Set<string>): string {
  const base = `${safeFilename(fullName, "Expert")} - CV`;
  const ext = extensionOf(originalFilename);
  let name = `${base}${ext}`;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})${ext}`;
  used.add(name.toLowerCase());
  return name;
}

export function planRoster(items: RosterInput[]): RosterPlan {
  const used = new Set<string>();
  const included: RosterLine[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const missingCv: string[] = [];
  const sorted = [...items].sort((a, b) => a.expert.fullName.localeCompare(b.expert.fullName));
  for (const item of sorted) {
    if (!(OPEN_SUBMISSION as readonly string[]).includes(item.status)) {
      skipped.push({ name: item.expert.fullName, reason: `Status: ${label(item.status)}` });
      continue;
    }
    if (item.expert.cvConsent !== "yes") {
      skipped.push({
        name: item.expert.fullName,
        reason: item.expert.cvConsent === "no" ? "Said no to sharing their CV" : "CV consent not recorded",
      });
      continue;
    }
    const zipName = item.cv ? cvZipName(item.expert.fullName, item.cv.filename, used) : null;
    if (!item.cv) missingCv.push(item.expert.fullName);
    included.push({ ...item, zipName });
  }
  return { included, skipped, missingCv };
}

export function rosterCsv(lines: RosterLine[]): string {
  return toCsv(
    [...ROSTER_HEADERS],
    lines.map((l) => [
      l.expert.fullName,
      l.expert.email,
      l.expert.country,
      l.expert.city,
      l.expert.phone,
      l.expert.yearsExperience,
      l.expert.linkedinUrl,
      l.zipName ?? "",
      l.partnerNote ?? "",
    ]),
  );
}
