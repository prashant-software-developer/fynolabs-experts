import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { crmColumnMap, mapCrmRow } from "@/lib/import/crm";
import { detectKind } from "@/lib/import/detect";
import { mapJobsUser, statusFromApplications } from "@/lib/import/jobs";
import { buildIndex, fillEmptyFields, planImport, type ExistingExpert } from "@/lib/import/plan";
import { mapRegisterRow, registerConsent, registerStatus } from "@/lib/import/register";
import { emailHash, normalizeLinkedin } from "@/lib/normalize";

const REGISTER_CSV = [
  "Name,Role,Location,Line,Folder,CV file,Status,Best fit,Consent to share CV,Source,Added,Notes",
  'Asha Example,AI Trainer (coding evaluation),"Pune, India",AI Training,Bench,Asha Example - AI Trainer.pdf,Bench,"Coding evals, Python and Rust tasks",Yes (job form consent 2026-10-14),Network,2026-10-10,Strong reviewer',
  "Marco Sample,Maths and STEM evaluator,United Kingdom,AI Training,—,—,Awaiting reply,Maths/STEM evaluation,Ask,Inbound email,2026-11-02,",
  "Lena Demo,Product designer,Berlin,Product Studio,Placed,—,Placed,Design-heavy product builds,No,Founder,2026-10-08,",
  ",,,,,,,,,,,",
  "Asha Example,AI Trainer,Pune,AI Training,Bench,,Bench,,Yes,,,duplicate row",
].join("\n");

const existing = (over: Partial<ExistingExpert>): ExistingExpert => ({
  id: "x1",
  fullName: "Someone",
  email: null,
  linkedinUrl: null,
  phone: null,
  country: null,
  region: null,
  city: null,
  headline: null,
  domain: null,
  skills: [],
  languages: [],
  yearsExperience: null,
  highestDegree: null,
  fieldOfStudy: null,
  university: null,
  hoursPerWeek: null,
  rateExpectationUsd: null,
  status: "applicant",
  cvConsent: "unknown",
  notes: null,
  tags: [],
  ...over,
});

describe("Talent register mapping", () => {
  const { headers, rows } = parseCsv(REGISTER_CSV);

  it("detects the register format from its headings", () => {
    expect(detectKind(headers)).toBe("register");
  });

  it("maps a row to an expert", () => {
    const r = mapRegisterRow(rows[0], 2);
    expect(r.draft.fullName).toBe("Asha Example");
    expect(r.draft.headline).toBe("AI Trainer (coding evaluation)");
    expect(r.draft.city).toBe("Pune");
    expect(r.draft.country).toBe("India");
    expect(r.draft.status).toBe("bench");
    expect(r.draft.cvConsent).toBe("yes");
    expect(r.draft.skills).toEqual(expect.arrayContaining(["python", "rust"]));
    expect(r.draft.tags).toEqual(["ai-training"]);
    expect(r.draft.notes).toContain("CV file (local): Bench/Asha Example - AI Trainer.pdf");
    expect(r.draft.notes).toContain("Strong reviewer");
    expect(r.externalId).toBe("name:asha example");
  });

  it("maps statuses and consent words", () => {
    expect(registerStatus("Submitted to a partner (in review)", null)).toBe("submitted");
    expect(registerStatus("Awaiting reply", null)).toBe("screening");
    expect(registerStatus("Not contacted", null)).toBe("applicant");
    expect(registerStatus("", "Inactive")).toBe("inactive");
    expect(registerStatus("Active", null)).toBe("placed");
    expect(registerConsent("Yes (applied, 22 Oct)")).toBe("yes");
    expect(registerConsent("Ask")).toBe("unknown");
    expect(registerConsent("Confirm")).toBe("unknown");
    expect(registerConsent("No")).toBe("no");
  });

  it("plans creates, skips empty rows and flags in-file duplicates", () => {
    const drafts = rows.map((r, i) => mapRegisterRow(r, i + 2));
    const plan = planImport(drafts, buildIndex([], []));
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "create", "create", "duplicate"]);
    expect(plan.rows[3].reason).toContain("row 2");
    expect(plan.counts.create).toBe(3);
  });

  it("matches an earlier register import by its key and only fills empty fields", () => {
    const drafts = rows.slice(0, 1).map((r, i) => mapRegisterRow(r, i + 2));
    const index = buildIndex([existing({ id: "a1", fullName: "Asha Example", headline: "Edited by the team", country: "India", tags: ["vip"] })], [{ source: "register", externalId: "name:asha example", expertId: "a1" }]);
    const plan = planImport(drafts, index);
    expect(plan.rows[0].action).toBe("update");
    expect(plan.rows[0].matchedBy).toBe("source");
    expect(plan.rows[0].patch.headline).toBeUndefined(); // team edit kept
    expect(plan.rows[0].patch.city).toBe("Pune");
    expect(plan.rows[0].patch.status).toBe("bench");
    expect(plan.rows[0].patch.tags).toEqual(["vip", "ai-training"]);
  });

  it("holds back same-name matches for review unless asked to merge", () => {
    const drafts = rows.slice(1, 2).map((r, i) => mapRegisterRow(r, i + 3));
    const index = buildIndex([existing({ id: "m1", fullName: "Marco  SAMPLE", email: "marco@example.com" })], [{ source: "jobs_site", externalId: "7", expertId: "m1" }]);
    expect(planImport(drafts, index).rows[0].action).toBe("duplicate");
    const merged = planImport(drafts, index, { nameMatch: "merge" }).rows[0];
    expect(merged.action).toBe("update");
    expect(merged.expertId).toBe("m1");
  });
});

describe("Admin CRM export mapping", () => {
  const csv = [
    "full_name,email,linkedin_url,phone,headline,country,city,field,years_experience,skills,status,consent,notes,id",
    "Omar Testwell,Omar.Testwell@Example.com,linkedin.com/in/Omar-Testwell/?trk=x,+1 555 0103,Rust engineer,USA,Seattle,Software Engineering,9,\"Rust, C++, K8s\",bench,yes,Met at a meetup,crm-17",
    "No Email Person,not-an-email,,,,,,,,,,,,",
  ].join("\n");
  const { headers, rows } = parseCsv(csv);
  const columns = crmColumnMap(headers);

  it("recognises loosely named columns", () => {
    expect(detectKind(headers)).toBe("admin_crm");
    expect(columns.full_name).toBe("name");
    expect(columns.linkedin_url).toBe("linkedin");
    expect(columns.field).toBe("domain");
  });

  it("cleans values", () => {
    const r = mapCrmRow(rows[0], 2, columns);
    expect(r.draft.email).toBe("omar.testwell@example.com");
    expect(r.draft.linkedinUrl).toBe("https://www.linkedin.com/in/omar-testwell");
    expect(r.draft.country).toBe("United States");
    expect(r.draft.domain).toBe("Software");
    expect(r.draft.skills).toEqual(["rust", "c++", "kubernetes"]);
    expect(r.draft.status).toBe("bench");
    expect(r.draft.cvConsent).toBe("yes");
    expect(r.externalId).toBe("crm-17");
    const bad = mapCrmRow(rows[1], 3, columns);
    expect(bad.draft.email).toBeNull();
    expect(bad.warnings[0]).toContain("doesn't look valid");
  });

  it("dedupes against the hub by email, then LinkedIn", () => {
    const drafts = rows.map((r, i) => mapCrmRow(r, i + 2, columns));
    const byEmail = planImport(drafts, buildIndex([existing({ id: "o1", fullName: "Omar T.", email: "omar.testwell@example.com" })], []));
    expect(byEmail.rows[0]).toMatchObject({ action: "update", matchedBy: "email", expertId: "o1" });
    const byLinkedin = planImport(drafts, buildIndex([existing({ id: "o2", fullName: "Omar T.", linkedinUrl: "https://www.linkedin.com/in/omar-testwell" })], []));
    expect(byLinkedin.rows[0]).toMatchObject({ action: "update", matchedBy: "linkedin" });
    const clash = planImport(drafts, buildIndex([existing({ id: "o3", fullName: "Other Person", email: "other@example.com", linkedinUrl: "https://www.linkedin.com/in/omar-testwell" })], []));
    expect(clash.rows[0].action).toBe("duplicate");
  });

  it("skips people deleted on request", () => {
    const drafts = rows.slice(0, 1).map((r, i) => mapCrmRow(r, i + 2, columns));
    const plan = planImport(drafts, buildIndex([], [], [{ emailSha256: emailHash("omar.testwell@example.com"), source: null, externalId: null }]));
    expect(plan.rows[0].action).toBe("skip");
    expect(plan.rows[0].reason).toContain("Deleted on request");
  });
});

describe("fill-empty rule", () => {
  it("never overwrites a value and treats default status/consent as empty", () => {
    const patch = fillEmptyFields(existing({ phone: "+1 555 0199", status: "bench", cvConsent: "unknown", skills: ["go"] }), {
      ...mapRegisterRow({ Name: "X", Status: "New", "Consent to share CV": "Yes" }, 2).draft,
      phone: "+1 555 0000",
      skills: ["python"],
      email: "x@example.com",
    });
    expect(patch.phone).toBeUndefined();
    expect(patch.skills).toBeUndefined();
    expect(patch.status).toBeUndefined();
    expect(patch.cvConsent).toBe("yes");
    expect(patch.email).toBe("x@example.com");
  });
});

describe("jobs-site mapping", () => {
  it("maps a jobs user and their applications", () => {
    const r = mapJobsUser(
      { id: 42, email: " Rina@Example.org ", name: "Rina Jobsdemo", country: "india", city: "Chennai", state: null, linkedin_url: null, headline: "Maths grad", domain: "Mathematics", years_experience: 2, highest_degree: "Master's", field_of_study: "Mathematics", university: null, hours_per_week: 20, phone: null, skills: "Python, NumPy, Numerical analysis", languages: "English, Tamil" },
      [
        { user_id: 42, status: "submitted", rate_expectation: null, created_at: "2026-11-01", title: "A" },
        { user_id: 42, status: "assessment", rate_expectation: 35, created_at: "2026-11-05", title: "B" },
      ],
    );
    expect(r.externalId).toBe("42");
    expect(r.draft.email).toBe("rina@example.org");
    expect(r.draft.country).toBe("India");
    expect(r.draft.skills).toEqual(["python", "numpy", "numerical methods"]);
    expect(r.draft.status).toBe("screening");
    expect(r.draft.rateExpectationUsd).toBe(35);
    expect(statusFromApplications([{ user_id: 1, status: "accepted", rate_expectation: null, created_at: "", title: "" }])).toBe("bench");
  });

  it("normalises LinkedIn URLs", () => {
    expect(normalizeLinkedin("https://in.linkedin.com/in/Jane-Doe-123/")).toBe("https://www.linkedin.com/in/jane-doe-123");
    expect(normalizeLinkedin("not a url")).toBeNull();
  });
});
