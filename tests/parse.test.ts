import { describe, expect, it } from "vitest";
import { parseDeadline, parseLocations, parseMinYears, parseRequirement, parseSlots } from "@/lib/match/parse";

const TODAY = new Date("2026-11-22T00:00:00Z");

describe("requirement parser", () => {
  it("reads the vendor-portal pilot example", () => {
    const p = parseRequirement(
      "Scientific Coding Expert - Mathematics. Pilot: up to 3 people. Strong Python, numerical methods, PhD or Master's in Mathematics, 3+ years.",
      { today: TODAY },
    );
    expect(p.slots).toBe(3);
    expect(p.domains).toEqual(["Mathematics"]);
    expect(p.mustSkills).toContain("python");
    expect(p.mustSkills).toContain("numerical methods");
    expect(p.minYears).toBe(3);
    expect(p.degrees).toEqual(["masters", "phd"]);
    expect(p.title).toBe("Scientific Coding Expert - Mathematics");
    expect(p.countriesAllowed).toEqual([]);
  });

  it("handles US-based with state exclusions, nice-to-haves, refs, rates and deadlines", () => {
    const p = parseRequirement(
      [
        "Rust Systems Engineer (SOW 103650)",
        "We need 5 engineers, US-based, not CA, CT, IL or NY.",
        "Requirements:",
        "- 5+ years of Rust and C++",
        "- Linux, Docker",
        "Nice to have:",
        "- Kubernetes, Go",
        "Deadline: Dec 5. $60/hr",
      ].join("\n"),
      { today: TODAY },
    );
    expect(p.externalRef).toBe("SOW 103650");
    expect(p.slots).toBe(5);
    expect(p.minYears).toBe(5);
    expect(p.countriesAllowed).toEqual(["United States"]);
    expect(p.countriesBlocked).toEqual(["US-CA", "US-CT", "US-IL", "US-NY"]);
    expect(p.mustSkills).toEqual(expect.arrayContaining(["rust", "c++", "linux", "docker"]));
    expect(p.niceSkills).toEqual(expect.arrayContaining(["kubernetes", "go"]));
    expect(p.mustSkills).not.toContain("kubernetes");
    expect(p.rateNote).toBe("$60/hr");
    expect(p.deadline).toBe("2026-12-05");
    expect(p.domains).toEqual(["Software"]);
  });

  it("reads country lists and country exclusions", () => {
    const p = parseRequirement("3 Biology reviewers needed. Excluding India and Pakistan. Bachelor's or higher in Biology; at least 2 years experience. Remote (UK, Canada, Germany).");
    expect(p.slots).toBe(3);
    expect(p.domains).toEqual(["Biology"]);
    expect(p.countriesBlocked).toEqual(["India", "Pakistan"]);
    expect(p.countriesAllowed).toEqual(["United Kingdom", "Canada", "Germany"]);
    expect(p.minYears).toBe(2);
  });

  it("does not mistake ordinary words for skills or places", () => {
    const p = parseRequirement("We need people who can go the extra mile and are not afraid of feedback. R&D background is a plus.");
    expect(p.mustSkills).not.toContain("go");
    expect(p.mustSkills).not.toContain("r");
    expect(p.countriesBlocked).toEqual([]);
  });

  it("parses slots in several phrasings", () => {
    expect(parseSlots("Pilot: up to 3 people")).toBe(3);
    expect(parseSlots("3 Scientific Coding Experts - Mathematics")).toBe(3);
    expect(parseSlots("Looking for two physicists")).toBe(2);
    expect(parseSlots("Headcount: 12")).toBe(12);
    expect(parseSlots("3+ years of Python")).toBeNull();
  });

  it("parses years in several phrasings", () => {
    expect(parseMinYears("5+ years")).toBe(5);
    expect(parseMinYears("at least 4 years of experience")).toBe(4);
    expect(parseMinYears("minimum 2 yrs")).toBe(2);
    expect(parseMinYears("3-5 years experience")).toBe(3);
    expect(parseMinYears("7 years of professional experience")).toBe(7);
    expect(parseMinYears("no experience needed")).toBeNull();
  });

  it("only treats state codes as states when the role is US-based", () => {
    expect(parseLocations("Open worldwide, not IN.").blocked).toEqual(["India"]);
    expect(parseLocations("US only, except California").blocked).toEqual(["US-CA"]);
  });

  it("rolls a deadline without a year into the future", () => {
    expect(parseDeadline("Submit by 3 Jan", TODAY)).toBe("2027-01-03");
    expect(parseDeadline("deadline 2026-12-01", TODAY)).toBe("2026-12-01");
    expect(parseDeadline("We started in January", TODAY)).toBeNull();
  });
});
