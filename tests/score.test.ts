import { describe, expect, it } from "vitest";
import { rankCandidates, scoreExpert, WEIGHTS, type MatchExpert, type MatchRequirement } from "@/lib/match/score";

const req: MatchRequirement = {
  mustSkills: ["python", "numerical methods"],
  niceSkills: ["latex"],
  domains: ["Mathematics"],
  degrees: ["masters", "phd"],
  countriesAllowed: [],
  countriesBlocked: [],
  minYears: 3,
};

const base: MatchExpert = {
  id: "e1",
  fullName: "Asha Example",
  skills: ["python", "numerical methods", "latex"],
  headline: "PhD mathematician",
  fieldOfStudy: "Applied Mathematics",
  domain: "Mathematics",
  highestDegree: "PhD",
  yearsExperience: 7,
  country: "India",
  region: null,
  availability: "available",
  status: "bench",
  cvConsent: "yes",
};

describe("match scorer", () => {
  it("weights add up to 100", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("gives a perfect fit 100 with reasons for every factor", () => {
    const r = scoreExpert(req, base);
    expect(r.excluded).toBe(false);
    expect(r.score).toBe(100);
    expect(r.matchedSkills).toEqual(["python", "numerical methods"]);
    const factors = r.reasons.map((x) => x.factor);
    for (const f of ["skills", "nice", "domain", "degree", "years", "availability", "status", "consent"]) expect(factors).toContain(f);
  });

  it("must-have skills are the biggest factor", () => {
    const noSkills = scoreExpert(req, { ...base, skills: [], headline: null, fieldOfStudy: null });
    const wrongDomain = scoreExpert(req, { ...base, domain: "Physics", fieldOfStudy: "Physics" });
    expect(100 - noSkills.score).toBeGreaterThan(100 - wrongDomain.score);
    expect(noSkills.missingSkills).toEqual(["python", "numerical methods"]);
  });

  it("gives half credit for a skill that only appears in the headline", () => {
    const r = scoreExpert(req, { ...base, skills: ["python"], headline: "Works on numerical analysis" });
    const skills = r.reasons.find((x) => x.factor === "skills")!;
    expect(skills.points).toBe(30);
    expect(skills.text).toContain("only in headline");
  });

  it("understands synonyms (Python3, numerical analysis)", () => {
    const r = scoreExpert(req, { ...base, skills: ["Python3", "Numerical Analysis"] });
    expect(r.matchedSkills).toEqual(["python", "numerical methods"]);
  });

  it("penalises fewer years and unknown years, but doesn't exclude", () => {
    const junior = scoreExpert(req, { ...base, yearsExperience: 1 });
    const unknown = scoreExpert(req, { ...base, yearsExperience: null });
    expect(junior.excluded).toBe(false);
    expect(junior.reasons.find((x) => x.factor === "years")!.points).toBeLessThan(WEIGHTS.years);
    expect(unknown.reasons.find((x) => x.factor === "years")!.text).toContain("unknown");
  });

  it("excludes do-not-contact and inactive", () => {
    expect(scoreExpert(req, { ...base, status: "do_not_contact" }).excluded).toBe(true);
    expect(scoreExpert(req, { ...base, status: "inactive" }).excluded).toBe(true);
  });

  it("prefers bench and placed over applicants", () => {
    const bench = scoreExpert(req, base).score;
    const placed = scoreExpert(req, { ...base, status: "placed" }).score;
    const applicant = scoreExpert(req, { ...base, status: "applicant" }).score;
    expect(bench).toBeGreaterThan(applicant);
    expect(placed).toBeGreaterThan(applicant);
  });

  it("excludes blocked countries and countries outside the allowed list", () => {
    expect(scoreExpert({ ...req, countriesBlocked: ["India"] }, base).excluded).toBe(true);
    const outside = scoreExpert({ ...req, countriesAllowed: ["United States"] }, base);
    expect(outside.excluded).toBe(true);
    expect(outside.excludedBecause[0]).toContain("India");
    expect(scoreExpert({ ...req, countriesAllowed: ["United States"] }, { ...base, country: "USA", region: "TX" }).excluded).toBe(false);
  });

  it("excludes blocked US states and flags unknown states", () => {
    const usReq = { ...req, countriesAllowed: ["United States"], countriesBlocked: ["US-CA", "US-CT"] };
    expect(scoreExpert(usReq, { ...base, country: "United States", region: "California" }).excluded).toBe(true);
    expect(scoreExpert(usReq, { ...base, country: "United States", region: "CT" }).excluded).toBe(true);
    const unknownState = scoreExpert(usReq, { ...base, country: "United States", region: null });
    expect(unknownState.excluded).toBe(false);
    expect(unknownState.reasons.some((r) => r.factor === "location" && r.tone === "bad")).toBe(true);
  });

  it("CV consent known scores higher than unknown or no", () => {
    const yes = scoreExpert(req, base).score;
    const unknown = scoreExpert(req, { ...base, cvConsent: "unknown" }).score;
    const no = scoreExpert(req, { ...base, cvConsent: "no" }).score;
    expect(yes).toBeGreaterThan(unknown);
    expect(unknown).toBeGreaterThan(no);
  });

  it("ranks best first and keeps excluded people apart", () => {
    const list = [
      { ...base, id: "a", fullName: "A", skills: ["python"] },
      { ...base, id: "b", fullName: "B" },
      { ...base, id: "c", fullName: "C", country: "Iran" },
    ];
    const { ranked, excluded } = rankCandidates({ ...req, countriesBlocked: ["Iran"] }, list);
    expect(ranked.map((r) => r.expertId)).toEqual(["b", "a"]);
    expect(excluded.map((r) => r.expertId)).toEqual(["c"]);
  });

  it("treats an empty requirement as 'anyone' without crashing", () => {
    const r = scoreExpert({ mustSkills: [], niceSkills: [], domains: [], degrees: [], countriesAllowed: [], countriesBlocked: [], minYears: null }, { ...base, skills: [] });
    expect(r.excluded).toBe(false);
    expect(r.score).toBe(100);
  });
});
