// Ranks experts for a requirement. Pure function: no database, easy to test and to explain.
//
// Points (out of 100):
//   must-have skills 40 · nice-to-have 5 · domain 15 · degree 5 · years 10 · availability 10 · status 10 · CV consent 5
// Excluded outright: status "do not contact" or "inactive", a blocked country or US state,
// or a country outside the allowed list.
import type { Availability, CvConsent, DegreeLevel, ExpertStatus } from "@/lib/constants";
import { label } from "@/lib/constants";
import { degreeLevel, lookupUsState, normalizeCountry, normalizeSkill, placeLabel, textMentionsSkill } from "./dictionary";

export const WEIGHTS = {
  skills: 40,
  nice: 5,
  domain: 15,
  degree: 5,
  years: 10,
  availability: 10,
  status: 10,
  consent: 5,
} as const;

export type Factor = keyof typeof WEIGHTS | "location";

export type MatchRequirement = {
  mustSkills: string[];
  niceSkills: string[];
  domains: string[];
  degrees: string[];
  countriesAllowed: string[];
  countriesBlocked: string[];
  minYears: number | null;
};

export type MatchExpert = {
  id: string;
  fullName: string;
  skills: string[];
  headline: string | null;
  fieldOfStudy: string | null;
  domain: string | null;
  highestDegree: string | null;
  yearsExperience: number | null;
  country: string | null;
  region: string | null;
  availability: Availability | string;
  status: ExpertStatus | string;
  cvConsent: CvConsent | string;
};

export type Reason = {
  factor: Factor;
  points: number;
  max: number;
  text: string;
  tone: "good" | "ok" | "bad" | "block";
};

export type MatchResult = {
  expertId: string;
  score: number;
  excluded: boolean;
  excludedBecause: string[];
  reasons: Reason[];
  matchedSkills: string[];
  missingSkills: string[];
};

const AVAILABILITY_POINTS: Record<string, number> = { available: 10, limited: 6, busy: 2, unavailable: 0 };
const STATUS_POINTS: Record<string, number> = {
  bench: 10,
  placed: 8,
  submitted: 7,
  screening: 5,
  applicant: 3,
};
const DEGREE_RANK: Record<DegreeLevel, number> = { bachelors: 1, masters: 2, phd: 3 };

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const round = (n: number) => Math.round(n * 10) / 10;

function skillCredit(skill: string, own: Set<string>, text: string): 0 | 0.5 | 1 {
  const name = normalizeSkill(skill);
  if (own.has(name)) return 1;
  if (text && textMentionsSkill(text, name)) return 0.5;
  return 0;
}

export function scoreExpert(req: MatchRequirement, e: MatchExpert): MatchResult {
  const reasons: Reason[] = [];
  const excludedBecause: string[] = [];
  const own = new Set(e.skills.map(normalizeSkill));
  const text = [e.headline, e.fieldOfStudy].filter(Boolean).join(" · ");

  // Hard rules first.
  if (e.status === "do_not_contact" || e.status === "inactive") {
    excludedBecause.push(`Status is "${label(e.status)}"`);
    reasons.push({ factor: "status", points: 0, max: WEIGHTS.status, text: label(e.status), tone: "block" });
  }

  const country = normalizeCountry(e.country);
  const state = country === "United States" ? lookupUsState(e.region) : null;
  const blockedCountries = req.countriesBlocked.filter((c) => !c.startsWith("US-")).map((c) => normalizeCountry(c));
  const blockedStates = req.countriesBlocked.filter((c) => c.startsWith("US-")).map((c) => c.slice(3));
  const allowedStates = req.countriesAllowed.filter((c) => c.startsWith("US-")).map((c) => c.slice(3));
  const allowed = req.countriesAllowed.map((c) => (c.startsWith("US-") ? "United States" : normalizeCountry(c)));

  if (country && blockedCountries.includes(country)) {
    excludedBecause.push(`${country} is blocked`);
    reasons.push({ factor: "location", points: 0, max: 0, text: `${country} is blocked`, tone: "block" });
  } else if (country && allowed.length && !allowed.includes(country)) {
    excludedBecause.push(`${country} is not in ${allowed.join(", ")}`);
    reasons.push({ factor: "location", points: 0, max: 0, text: `${country}: outside allowed countries`, tone: "block" });
  } else if (state && blockedStates.includes(state)) {
    excludedBecause.push(`${placeLabel(`US-${state}`)} is blocked`);
    reasons.push({ factor: "location", points: 0, max: 0, text: `${placeLabel(`US-${state}`)} is blocked`, tone: "block" });
  } else if (state && allowedStates.length && !allowedStates.includes(state)) {
    excludedBecause.push(`${placeLabel(`US-${state}`)} is not an allowed state`);
    reasons.push({ factor: "location", points: 0, max: 0, text: `${state}: outside allowed states`, tone: "block" });
  } else if (!country && (allowed.length || blockedCountries.length)) {
    reasons.push({ factor: "location", points: 0, max: 0, text: "Country unknown: check", tone: "bad" });
  } else if (country === "United States" && !state && (blockedStates.length || allowedStates.length)) {
    const list = (blockedStates.length ? blockedStates : allowedStates).join(", ");
    reasons.push({
      factor: "location",
      points: 0,
      max: 0,
      text: blockedStates.length ? `US state unknown: check not in ${list}` : `US state unknown: must be ${list}`,
      tone: "bad",
    });
  } else if (country && (allowed.length || blockedCountries.length || blockedStates.length)) {
    reasons.push({ factor: "location", points: 0, max: 0, text: state ? `${country} (${state})` : country, tone: "good" });
  }

  // Must-have skills: the biggest factor.
  const matched: string[] = [];
  const missing: string[] = [];
  if (req.mustSkills.length) {
    let credit = 0;
    const partial: string[] = [];
    for (const s of req.mustSkills) {
      const c = skillCredit(s, own, text);
      credit += c;
      if (c === 1) matched.push(normalizeSkill(s));
      else if (c === 0.5) partial.push(normalizeSkill(s));
      else missing.push(normalizeSkill(s));
    }
    const pts = round((WEIGHTS.skills * credit) / req.mustSkills.length);
    const bits = [`${matched.length}/${req.mustSkills.length} must-have`];
    if (partial.length) bits.push(`${partial.join(", ")} only in headline`);
    if (missing.length) bits.push(`missing ${missing.join(", ")}`);
    reasons.push({
      factor: "skills",
      points: pts,
      max: WEIGHTS.skills,
      text: bits.join(" · "),
      tone: credit === req.mustSkills.length ? "good" : credit > 0 ? "ok" : "bad",
    });
  } else {
    reasons.push({ factor: "skills", points: WEIGHTS.skills, max: WEIGHTS.skills, text: "No must-have skills set", tone: "ok" });
  }

  if (req.niceSkills.length) {
    let credit = 0;
    const hits: string[] = [];
    for (const s of req.niceSkills) {
      const c = skillCredit(s, own, text);
      credit += c;
      if (c > 0) hits.push(normalizeSkill(s));
    }
    const pts = round((WEIGHTS.nice * credit) / req.niceSkills.length);
    reasons.push({
      factor: "nice",
      points: pts,
      max: WEIGHTS.nice,
      text: hits.length ? `Nice-to-have: ${hits.join(", ")}` : "No nice-to-have skills",
      tone: hits.length ? "good" : "ok",
    });
  } else {
    reasons.push({ factor: "nice", points: WEIGHTS.nice, max: WEIGHTS.nice, text: "No nice-to-have set", tone: "ok" });
  }

  // Domain: exact match, or the field of study names it ("Applied Mathematics").
  const domains = req.domains.map(lc);
  if (!domains.length) {
    reasons.push({ factor: "domain", points: WEIGHTS.domain, max: WEIGHTS.domain, text: "Any domain", tone: "ok" });
  } else if (domains.includes(lc(e.domain))) {
    reasons.push({ factor: "domain", points: WEIGHTS.domain, max: WEIGHTS.domain, text: `Domain: ${e.domain}`, tone: "good" });
  } else if (e.fieldOfStudy && domains.some((d) => lc(e.fieldOfStudy).includes(d.replace(/s$/, "")))) {
    reasons.push({ factor: "domain", points: 10, max: WEIGHTS.domain, text: `Studied ${e.fieldOfStudy}`, tone: "ok" });
  } else {
    reasons.push({
      factor: "domain",
      points: 0,
      max: WEIGHTS.domain,
      text: e.domain ? `Domain is ${e.domain}` : "Domain unknown",
      tone: "bad",
    });
  }

  // Degree.
  const wanted = req.degrees.filter((d): d is DegreeLevel => d in DEGREE_RANK).map((d) => DEGREE_RANK[d]);
  if (!wanted.length) {
    reasons.push({ factor: "degree", points: WEIGHTS.degree, max: WEIGHTS.degree, text: "Any degree", tone: "ok" });
  } else {
    const need = Math.min(...wanted);
    const have = degreeLevel(e.highestDegree);
    if (have == null) {
      reasons.push({ factor: "degree", points: 2, max: WEIGHTS.degree, text: "Degree unknown", tone: "bad" });
    } else if (have >= need) {
      reasons.push({ factor: "degree", points: WEIGHTS.degree, max: WEIGHTS.degree, text: e.highestDegree ?? "Degree ok", tone: "good" });
    } else {
      const needLabel = req.degrees.map((d) => label(d)).join(" or ");
      reasons.push({ factor: "degree", points: 0, max: WEIGHTS.degree, text: `${e.highestDegree} (wants ${needLabel})`, tone: "bad" });
    }
  }

  // Years of experience.
  if (req.minYears == null || req.minYears <= 0) {
    reasons.push({
      factor: "years",
      points: WEIGHTS.years,
      max: WEIGHTS.years,
      text: e.yearsExperience != null ? `${e.yearsExperience} yrs` : "No minimum years",
      tone: "ok",
    });
  } else if (e.yearsExperience == null) {
    reasons.push({ factor: "years", points: 3, max: WEIGHTS.years, text: `Years unknown (min ${req.minYears})`, tone: "bad" });
  } else if (e.yearsExperience >= req.minYears) {
    reasons.push({
      factor: "years",
      points: WEIGHTS.years,
      max: WEIGHTS.years,
      text: `${e.yearsExperience} yrs (min ${req.minYears})`,
      tone: "good",
    });
  } else {
    reasons.push({
      factor: "years",
      points: round((WEIGHTS.years * 0.5 * e.yearsExperience) / req.minYears),
      max: WEIGHTS.years,
      text: `${e.yearsExperience} yrs (min ${req.minYears})`,
      tone: "bad",
    });
  }

  // Availability.
  const av = AVAILABILITY_POINTS[e.availability] ?? 5;
  reasons.push({
    factor: "availability",
    points: av,
    max: WEIGHTS.availability,
    text: label(e.availability),
    tone: av >= 10 ? "good" : av >= 6 ? "ok" : "bad",
  });

  // Status: people already vetted (bench) or proven (placed) first.
  if (!excludedBecause.some((r) => r.startsWith("Status"))) {
    const st = STATUS_POINTS[e.status] ?? 0;
    reasons.push({
      factor: "status",
      points: st,
      max: WEIGHTS.status,
      text: label(e.status),
      tone: st >= 8 ? "good" : st >= 5 ? "ok" : "bad",
    });
  }

  // CV consent: we can only submit people who said yes.
  const consent = e.cvConsent === "yes" ? 5 : e.cvConsent === "unknown" ? 2 : 0;
  reasons.push({
    factor: "consent",
    points: consent,
    max: WEIGHTS.consent,
    text: e.cvConsent === "yes" ? "CV consent: yes" : e.cvConsent === "no" ? "CV consent: no (ask first)" : "CV consent: not asked",
    tone: consent === 5 ? "good" : consent ? "ok" : "bad",
  });

  const score = Math.round(reasons.reduce((sum, r) => sum + r.points, 0));
  return {
    expertId: e.id,
    score: excludedBecause.length ? 0 : Math.min(100, score),
    excluded: excludedBecause.length > 0,
    excludedBecause,
    reasons,
    matchedSkills: matched,
    missingSkills: missing,
  };
}

/** Scores everyone, best first. Excluded people come back separately so the page can say why. */
export function rankCandidates<E extends MatchExpert>(
  req: MatchRequirement,
  list: E[],
): { ranked: (MatchResult & { expert: E })[]; excluded: (MatchResult & { expert: E })[] } {
  const all = list.map((expert) => ({ ...scoreExpert(req, expert), expert }));
  const byScore = (a: { score: number; expert: E }, b: { score: number; expert: E }) =>
    b.score - a.score || a.expert.fullName.localeCompare(b.expert.fullName);
  return {
    ranked: all.filter((r) => !r.excluded).sort(byScore),
    excluded: all.filter((r) => r.excluded).sort((a, b) => a.expert.fullName.localeCompare(b.expert.fullName)),
  };
}
