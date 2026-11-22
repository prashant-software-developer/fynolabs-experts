// Decides, for every incoming row, whether it creates a new expert, updates an existing one,
// or is a duplicate to look at by hand. Pure: the database is passed in as a ready-made index.
//
// Update rule (also used by the jobs-site sync): an import only FILLS EMPTY FIELDS. Anything a
// team member typed stays as it is. Tags are merged. Status and CV consent count as empty while
// they are still the defaults ("applicant" / "unknown").
import { emailHash, nameKey } from "@/lib/normalize";
import type { DraftRow, ExpertDraft } from "./types";

export type ExistingExpert = {
  id: string;
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  headline: string | null;
  domain: string | null;
  skills: string[];
  languages: string[];
  yearsExperience: number | null;
  highestDegree: string | null;
  fieldOfStudy: string | null;
  university: string | null;
  hoursPerWeek: number | null;
  rateExpectationUsd: number | null;
  status: string;
  cvConsent: string;
  notes: string | null;
  tags: string[];
};

export type ExistingIndex = {
  experts: Map<string, ExistingExpert>;
  bySource: Map<string, string>;
  erasedEmails: Set<string>;
  erasedSources: Set<string>;
};

export type PlanAction = "create" | "update" | "unchanged" | "duplicate" | "skip";

export type PlanRow = {
  row: number;
  name: string;
  email: string | null;
  action: PlanAction;
  reason: string;
  expertId: string | null;
  matchedBy: "source" | "email" | "linkedin" | "name" | null;
  source: DraftRow["source"];
  externalId: string | null;
  draft: ExpertDraft;
  patch: Partial<ExpertDraft>;
  warnings: string[];
};

export type ImportPlan = { rows: PlanRow[]; counts: Record<PlanAction, number> };

export const sourceKey = (source: string, externalId: string) => `${source}|${externalId}`;

export function buildIndex(experts: ExistingExpert[], sources: { source: string; externalId: string; expertId: string }[], erasures: { emailSha256: string | null; source: string | null; externalId: string | null }[] = []): ExistingIndex {
  const index: ExistingIndex = {
    experts: new Map(experts.map((e) => [e.id, e])),
    bySource: new Map(sources.map((s) => [sourceKey(s.source, s.externalId), s.expertId])),
    erasedEmails: new Set(erasures.map((e) => e.emailSha256).filter((x): x is string => !!x)),
    erasedSources: new Set(erasures.filter((e) => e.source && e.externalId).map((e) => sourceKey(e.source!, e.externalId!))),
  };
  return index;
}

const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** The fields an import may change on an existing expert (only ones that are empty now). */
export function fillEmptyFields(existing: ExistingExpert, draft: ExpertDraft): Partial<ExpertDraft> {
  const patch: Partial<ExpertDraft> = {};
  const fields = [
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
    "rateExpectationUsd",
  ] as const;
  for (const f of fields) {
    const incoming = draft[f];
    if (!isEmpty(incoming) && isEmpty(existing[f as keyof ExistingExpert])) {
      (patch as Record<string, unknown>)[f] = incoming;
    }
  }
  if (draft.status && existing.status === "applicant" && draft.status !== "applicant") patch.status = draft.status;
  if (draft.cvConsent && draft.cvConsent !== "unknown" && existing.cvConsent === "unknown") patch.cvConsent = draft.cvConsent;
  const newTags = draft.tags.filter((t) => !existing.tags.includes(t));
  if (newTags.length) patch.tags = [...existing.tags, ...newTags];
  if (draft.notes && isEmpty(existing.notes)) patch.notes = draft.notes;
  return patch;
}

export type PlanOptions = {
  /** "merge": a row whose name matches exactly one existing expert updates that expert. */
  nameMatch?: "review" | "merge";
};

export function planImport(rows: DraftRow[], index: ExistingIndex, opts: PlanOptions = {}): ImportPlan {
  const out: PlanRow[] = [];
  const seenEmail = new Map<string, number>();
  const seenLinkedin = new Map<string, number>();
  const seenKey = new Map<string, number>();
  const byEmail = new Map<string, string>();
  const byLinkedin = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const e of index.experts.values()) {
    if (e.email) byEmail.set(e.email, e.id);
    if (e.linkedinUrl) byLinkedin.set(e.linkedinUrl.toLowerCase(), e.id);
    const k = nameKey(e.fullName);
    byName.set(k, [...(byName.get(k) ?? []), e.id]);
  }

  for (const r of rows) {
    const d = r.draft;
    const base = {
      row: r.row,
      name: d.fullName ?? "(no name)",
      email: d.email,
      source: r.source,
      externalId: r.externalId,
      draft: d,
      warnings: r.warnings,
      patch: {},
      expertId: null,
      matchedBy: null,
    } satisfies Partial<PlanRow>;
    const push = (p: Pick<PlanRow, "action" | "reason"> & Partial<PlanRow>) => out.push({ ...base, ...p } as PlanRow);

    if (!d.fullName) {
      push({ action: "skip", reason: "No name" });
      continue;
    }
    const key = r.externalId ? sourceKey(r.source, r.externalId) : null;
    if ((d.email && index.erasedEmails.has(emailHash(d.email))) || (key && index.erasedSources.has(key))) {
      push({ action: "skip", reason: "Deleted on request earlier: not imported again" });
      continue;
    }
    // The same person twice in one file.
    const twin =
      (d.email && seenEmail.get(d.email)) ||
      (d.linkedinUrl && seenLinkedin.get(d.linkedinUrl.toLowerCase())) ||
      (key && seenKey.get(key));
    if (twin) {
      push({ action: "duplicate", reason: `Same person as row ${twin} in this file` });
      continue;
    }
    if (d.email) seenEmail.set(d.email, r.row);
    if (d.linkedinUrl) seenLinkedin.set(d.linkedinUrl.toLowerCase(), r.row);
    if (key) seenKey.set(key, r.row);

    let expertId: string | null = null;
    let matchedBy: PlanRow["matchedBy"] = null;
    if (key && index.bySource.has(key)) {
      expertId = index.bySource.get(key)!;
      matchedBy = "source";
    } else if (d.email && byEmail.has(d.email)) {
      expertId = byEmail.get(d.email)!;
      matchedBy = "email";
    } else if (d.linkedinUrl && byLinkedin.has(d.linkedinUrl.toLowerCase())) {
      expertId = byLinkedin.get(d.linkedinUrl.toLowerCase())!;
      matchedBy = "linkedin";
    }

    if (expertId && index.experts.has(expertId)) {
      const existing = index.experts.get(expertId)!;
      const patch = fillEmptyFields(existing, d);
      // A different email on the matched record means two people share a LinkedIn URL or key.
      if (matchedBy === "linkedin" && d.email && existing.email && existing.email !== d.email) {
        push({ action: "duplicate", reason: `Same LinkedIn as ${existing.fullName} but a different email`, expertId, matchedBy });
        continue;
      }
      const how = matchedBy === "source" ? "earlier import" : matchedBy === "email" ? "email" : "LinkedIn URL";
      if (Object.keys(patch).length) {
        push({ action: "update", reason: `Matches ${existing.fullName} by ${how}: fills ${Object.keys(patch).join(", ")}`, expertId, matchedBy, patch });
      } else {
        push({ action: "unchanged", reason: `Matches ${existing.fullName} by ${how}: nothing new`, expertId, matchedBy });
      }
      continue;
    }

    const sameName = byName.get(nameKey(d.fullName)) ?? [];
    if (sameName.length === 1 && opts.nameMatch === "merge" && !d.email) {
      const existing = index.experts.get(sameName[0])!;
      const patch = fillEmptyFields(existing, d);
      const fills = Object.keys(patch);
      push({
        action: fills.length ? "update" : "unchanged",
        reason: `Same name as ${existing.fullName}: ${fills.length ? `fills ${fills.join(", ")}` : "nothing new"}`,
        expertId: existing.id,
        matchedBy: "name",
        patch,
      });
      continue;
    }
    if (sameName.length) {
      const other = index.experts.get(sameName[0]);
      push({
        action: "duplicate",
        reason: `Possible duplicate of ${other?.fullName ?? "an existing expert"} (same name; no email or LinkedIn to confirm). Not imported: add it by hand if it's someone else.`,
        expertId: sameName[0],
      });
      continue;
    }
    push({ action: "create", reason: "New expert" });
  }

  const counts: Record<PlanAction, number> = { create: 0, update: 0, unchanged: 0, duplicate: 0, skip: 0 };
  for (const r of out) counts[r.action]++;
  return { rows: out, counts };
}
