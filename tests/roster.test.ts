import { describe, expect, it } from "vitest";
import { csvCell, parseCsv, toCsv } from "@/lib/csv";
import { cvZipName, planRoster, rosterCsv, ROSTER_HEADERS, type RosterInput } from "@/lib/roster";

const person = (over: Partial<RosterInput["expert"]> = {}, sub: Partial<RosterInput> = {}): RosterInput => ({
  submissionId: "s1",
  status: "submitted",
  partnerNote: null,
  cv: { fileId: "f1", filename: "cv.pdf" },
  ...sub,
  expert: {
    id: "e1",
    fullName: "Jane Example",
    email: "jane@example.com",
    country: "United States",
    city: "Austin",
    phone: "+1 555 0100",
    yearsExperience: 6,
    linkedinUrl: "https://www.linkedin.com/in/jane-example",
    cvConsent: "yes",
    ...over,
  },
});

describe("roster", () => {
  it("uses the vendor-portal column order", () => {
    const csv = rosterCsv(planRoster([person()]).included);
    const firstLine = csv.replace(/^﻿/, "").split("\r\n")[0];
    expect(firstLine).toBe("Name,Email,Country,City,Phone,Years of professional experience,LinkedIn profile URL,Résumé filename,Notes");
    expect(ROSTER_HEADERS).toHaveLength(9);
  });

  it("writes one row per consenting expert, matching the ZIP file names", () => {
    const plan = planRoster([person({}, { partnerNote: 'Prefers "async", 20h/week' })]);
    const csv = rosterCsv(plan.included);
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Name"]).toBe("Jane Example");
    expect(rows[0]["Phone"]).toBe("+1 555 0100");
    expect(rows[0]["Years of professional experience"]).toBe("6");
    expect(rows[0]["Résumé filename"]).toBe("Jane Example - CV.pdf");
    expect(rows[0]["Notes"]).toBe('Prefers "async", 20h/week');
    expect(plan.included[0].zipName).toBe("Jane Example - CV.pdf");
  });

  it("skips people without CV consent and closed submissions, and says why", () => {
    const plan = planRoster([
      person({ id: "a", fullName: "Ann Sample", cvConsent: "unknown" }),
      person({ id: "b", fullName: "Bob Sample", cvConsent: "no" }),
      person({ id: "c", fullName: "Cat Sample" }, { status: "rejected" }),
      person({ id: "d", fullName: "Dan Sample" }, { cv: null }),
    ]);
    expect(plan.included.map((l) => l.expert.fullName)).toEqual(["Dan Sample"]);
    expect(plan.skipped).toEqual([
      { name: "Ann Sample", reason: "CV consent not recorded" },
      { name: "Bob Sample", reason: "Said no to sharing their CV" },
      { name: "Cat Sample", reason: "Status: Rejected" },
    ]);
    expect(plan.missingCv).toEqual(["Dan Sample"]);
    expect(rosterCsv(plan.included)).toContain("Dan Sample");
  });

  it("gives two people with the same name different file names", () => {
    const used = new Set<string>();
    expect(cvZipName("Jane Example", "a.PDF", used)).toBe("Jane Example - CV.pdf");
    expect(cvZipName("Jane Example", "b.pdf", used)).toBe("Jane Example - CV (2).pdf");
    expect(cvZipName("José Ñuñez/../x", "c.docx", used)).toBe("Jose Nunez..x - CV.docx");
  });

  it("escapes CSV safely, including formula injection, but keeps phone numbers", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1 555 0100")).toBe("+1 555 0100");
    expect(csvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["A"], [["x"]], { bom: false })).toBe("A\r\nx\r\n");
  });
});
