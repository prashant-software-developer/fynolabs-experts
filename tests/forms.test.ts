// Job application forms: every field type's checks, the default template, the profile merge rules,
// and the public-copy guard (no pay, no client name). Pure functions, no database.
import { describe, expect, it } from "vitest";
import {
  answerInputFrom,
  checkFile,
  checkFormDefinition,
  cleanFieldDef,
  consentGiven,
  defaultTemplate,
  inputName,
  mergeIntoProfile,
  prefillFromProfile,
  profileFromAnswers,
  toAvailability,
  validateAnswers,
  type FieldDef,
  type FieldType,
  type UploadedFile,
} from "@/lib/forms/job-fields";
import { markdownToText, renderMarkdown } from "@/lib/markdown";
import { mentionsPartner, partnerNameTerms, payProblem, publicCopyProblems } from "@/lib/public-copy";

const field = (type: FieldType, extra: Partial<FieldDef> = {}): FieldDef => ({ id: `id-${type}`, type, label: type, helpText: null, required: false, options: null, mapsTo: null, ...extra });
const one = (f: FieldDef, value: string | string[] | UploadedFile | undefined) => validateAnswers([f], answerInputFrom({ [inputName(f.id)]: value }));
const file = (name: string, type: string, size = 100): UploadedFile => ({ name, type, size, bytes: new Uint8Array(size) });

describe("validation per field type", () => {
  it("short and long text: trimmed, length limits, required", () => {
    expect(one(field("short_text"), "  Hello   world ").answers["id-short_text"]).toBe("Hello world");
    expect(one(field("short_text"), "x".repeat(301)).errors["id-short_text"]).toMatch(/300/);
    expect(one(field("short_text", { required: true }), "  ").errors["id-short_text"]).toBe("This question is required.");
    expect(one(field("short_text"), "").answers["id-short_text"]).toBeNull();
    expect(one(field("long_text"), "line 1\r\nline 2").answers["id-long_text"]).toBe("line 1\nline 2");
    expect(one(field("long_text"), "y".repeat(5001)).errors["id-long_text"]).toMatch(/5,000/);
  });

  it("email, phone and URL (LinkedIn when it fills linkedin_url)", () => {
    expect(one(field("email"), " Ada@Example.ORG ").answers["id-email"]).toBe("ada@example.org");
    expect(one(field("email"), "not-an-email").errors["id-email"]).toMatch(/valid email/);
    expect(one(field("phone"), "+91 98765 43210").answers["id-phone"]).toBe("+91 98765 43210");
    expect(one(field("phone"), "12").errors["id-phone"]).toMatch(/country code/);
    expect(one(field("url"), "example.com/work").answers["id-url"]).toBe("https://example.com/work");
    expect(one(field("url"), "javascript:alert(1)").errors["id-url"]).toBeTruthy();
    const li = field("url", { mapsTo: "linkedin_url" });
    expect(one(li, "linkedin.com/in/Ada-Tester/?trk=x").answers[li.id]).toBe("https://www.linkedin.com/in/ada-tester");
    expect(one(li, "https://github.com/ada").errors[li.id]).toMatch(/LinkedIn/);
  });

  it("number, years and hours per week", () => {
    expect(one(field("number"), "1,250.5").answers["id-number"]).toBe(1250.5);
    expect(one(field("number"), "abc").errors["id-number"]).toBe("Enter a number.");
    expect(one(field("years"), "7").answers["id-years"]).toBe(7);
    expect(one(field("years"), "71").errors["id-years"]).toMatch(/0 to 70/);
    const hours = field("number", { mapsTo: "hours_per_week" });
    expect(one(hours, "20.4").answers[hours.id]).toBe(20);
    expect(one(hours, "120").errors[hours.id]).toMatch(/0 to 80/);
  });

  it("single choice, multiple choice and checkboxes only accept listed options", () => {
    const opts = { choices: ["A", "B", "C"] };
    expect(one(field("single_select", { options: opts }), "B").answers["id-single_select"]).toBe("B");
    expect(one(field("single_select", { options: opts }), "Z").errors["id-single_select"]).toMatch(/Pick one/);
    expect(one(field("multi_select", { options: opts }), ["C", "A", "A"]).answers["id-multi_select"]).toEqual(["A", "C"]);
    expect(one(field("multi_select", { options: opts }), ["A", "Hacked"]).errors["id-multi_select"]).toBeTruthy();
    expect(one(field("checkboxes", { options: opts, required: true }), []).errors["id-checkboxes"]).toBe("This question is required.");
    expect(one(field("checkboxes", { options: opts }), "B").answers["id-checkboxes"]).toEqual(["B"]);
  });

  it("yes/no, date and country", () => {
    expect(one(field("yes_no"), "Yes").answers["id-yes_no"]).toBe("yes");
    expect(one(field("yes_no"), "maybe").errors["id-yes_no"]).toBeTruthy();
    expect(one(field("date"), "2026-12-31").answers["id-date"]).toBe("2026-12-31");
    expect(one(field("date"), "2026-02-30").errors["id-date"]).toBeTruthy();
    expect(one(field("country"), "usa").answers["id-country"]).toBe("United States");
    expect(one(field("country"), "Côte d'Ivoire").answers["id-country"]).toBe("Côte d'Ivoire");
    expect(one(field("country"), "Atlantis").errors["id-country"]).toMatch(/country/);
  });

  it("skills become a clean list (same spellings as matching)", () => {
    expect(one(field("skills"), "Python3, numerical analysis, LaTeX").answers["id-skills"]).toEqual(["python", "numerical methods", "latex"]);
    expect(one(field("skills"), Array.from({ length: 41 }, (_, i) => `skill${i}`).join(",")).errors["id-skills"]).toMatch(/40/);
  });

  it("file upload: PDF or Word up to 10 MB; required files must be attached", () => {
    const f = field("file", { required: true, mapsTo: "cv" });
    expect(one(f, file("cv.pdf", "application/pdf")).files[f.id].name).toBe("cv.pdf");
    expect(one(f, file("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).errors[f.id]).toBeUndefined();
    expect(one(f, file("cv.exe", "application/x-msdownload")).errors[f.id]).toMatch(/PDF or Word/);
    expect(one(f, file("cv.pdf", "text/html")).errors[f.id]).toMatch(/PDF or Word/);
    expect(one(f, file("big.pdf", "application/pdf", 10 * 1024 * 1024 + 1)).errors[f.id]).toMatch(/10 MB/);
    expect(one(f, undefined).errors[f.id]).toBe("Please attach a file.");
    expect(checkFile({ name: "x.pdf", type: "application/pdf", size: 0 })).toMatch(/empty/);
    // A signed-in expert's CV on file satisfies the required question.
    const kept = validateAnswers([f], answerInputFrom({}), { existingFile: { [f.id]: { fileId: "x", filename: "old.pdf", size: 5 } } });
    expect(kept.errors).toEqual({});
    expect(kept.answers[f.id]).toEqual({ fileId: "x", filename: "old.pdf", size: 5 });
  });

  it("consent must be ticked when required; section headings take no answer", () => {
    const c = field("consent", { required: true, mapsTo: "cv_consent" });
    expect(one(c, undefined).errors[c.id]).toMatch(/tick/);
    const ok = one(c, "yes");
    expect(ok.answers[c.id]).toBe(true);
    expect(consentGiven([c], ok.answers)).toBe(true);
    expect(consentGiven([c], { [c.id]: false })).toBe(false);
    const s = field("section", { required: true });
    expect(one(s, "anything")).toEqual({ answers: {}, files: {}, errors: {}, values: {} });
  });
});

describe("form definitions", () => {
  it("the default template has every standard question and is ready to publish", () => {
    const t = defaultTemplate();
    expect(t.map((f) => f.mapsTo).filter(Boolean)).toEqual(["full_name", "email", "phone", "country", "city", "linkedin_url", "years_experience", "highest_degree", "field_of_study", "university", "skills", "hours_per_week", "availability", "cv", "cv_consent"]);
    expect(t.filter((f) => f.required).map((f) => f.label)).toEqual(["Full name", "Email", "Country", "LinkedIn profile URL", "Years of professional experience", "Skills", "CV", expect.stringContaining("I agree that FynoLabs may store my details")]);
    expect(t.find((f) => f.label === "Why are you a good fit?")?.type).toBe("long_text");
    expect(checkFormDefinition(t)).toEqual([]);
  });

  it("refuses forms without a required email and name, duplicate mappings or empty choices", () => {
    const t = defaultTemplate();
    expect(checkFormDefinition(t.filter((f) => f.mapsTo !== "email")).map((p) => p.message)).toContain("Add an Email field that fills Email: it's how we know who applied.");
    expect(checkFormDefinition(t.map((f) => (f.mapsTo === "full_name" ? { ...f, required: false } : f)))[0].message).toMatch(/Full name field must be required/);
    expect(checkFormDefinition([...t, { ...t[2] }])[0].message).toMatch(/Two fields fill "Phone"/);
    expect(checkFormDefinition([...t, cleanFieldDef({ type: "single_select", label: "Pick", choices: [] })])[0].message).toMatch(/needs at least one choice/);
  });

  it("cleans builder input: unknown types become short text, mappings must fit the type", () => {
    expect(cleanFieldDef({ type: "evil", label: "  Q  " })).toMatchObject({ type: "short_text", label: "Q", mapsTo: null });
    expect(cleanFieldDef({ type: "number", label: "Email?", mapsTo: "email" }).mapsTo).toBeNull();
    expect(cleanFieldDef({ type: "email", label: "Email", mapsTo: "email", required: "yes" })).toMatchObject({ mapsTo: "email", required: true });
    expect(cleanFieldDef({ type: "multi_select", label: "Areas", choices: "A\nB\n\nA\n" }).options).toEqual({ choices: ["A", "B"] });
    expect(cleanFieldDef({ type: "section", label: "About you", required: true }).required).toBe(false);
  });
});

describe("answers -> the expert record", () => {
  const fields: FieldDef[] = defaultTemplate().map((f, i) => ({ ...f, id: `f${i}` }));
  const byKey = (k: string) => fields.find((f) => f.mapsTo === k)!.id;

  it("maps answers onto profile fields", () => {
    const answers = { [byKey("full_name")]: "Ada Tester", [byKey("skills")]: ["python", "latex"], [byKey("years_experience")]: 6, [byKey("availability")]: "Not available right now", [byKey("cv")]: { fileId: "x", filename: "a.pdf", size: 3 } };
    expect(profileFromAnswers(fields, answers)).toEqual({ fullName: "Ada Tester", skills: ["python", "latex"], yearsExperience: 6, availability: "unavailable" });
    expect(toAvailability("Limited (a few hours a week)")).toBe("limited");
    expect(toAvailability("busy")).toBe("busy");
    expect(toAvailability("whenever")).toBe("available");
  });

  it("merge rule: fills empty fields only, adds new skills, never changes name or availability", () => {
    const existing = { fullName: "Ada T.", phone: "+1 555 0100", headline: null, skills: ["python"], languages: [], city: "", availability: "busy", email: null };
    const { patch, filled } = mergeIntoProfile(existing, { fullName: "Ada Tester", phone: "+44 7700 900000", headline: "Numerical analyst", skills: ["Python", "latex"], city: "Austin", availability: "available", email: "ada@example.org" });
    expect(patch).toEqual({ headline: "Numerical analyst", skills: ["python", "latex"], city: "Austin", email: "ada@example.org" });
    expect(filled.sort()).toEqual(["city", "email", "headline", "skills"]);
    expect(mergeIntoProfile(existing, { skills: ["PYTHON"] }).patch).toEqual({});
    expect(mergeIntoProfile(null, { fullName: "New", availability: "limited" }).patch).toEqual({ fullName: "New", availability: "limited" });
  });

  it("prefills a signed-in expert's form from their profile", () => {
    const v = prefillFromProfile(fields, { fullName: "Ada", skills: ["python", "latex"], availability: "limited", country: "India", highestDegree: "PhD", hoursPerWeek: 20 });
    expect(v[byKey("full_name")]).toBe("Ada");
    expect(v[byKey("skills")]).toBe("python, latex");
    expect(v[byKey("availability")]).toBe("Limited (a few hours a week)");
    expect(v[byKey("highest_degree")]).toBe("PhD");
    expect(v[byKey("hours_per_week")]).toBe("20");
  });
});

describe("public copy: no pay, no client name", () => {
  it("spots amounts and pay bases", () => {
    for (const bad of ["Pay: $50/hr", "₹2,000 per task", "USD 40 an hour", "40 USD", "Paid per task", "weekly payments", "hourly rate on request", "Competitive salary", "60k/year", "Earn up to a lot", "rate: 30/hour"]) {
      expect(payProblem(bad), bad).not.toBeNull();
    }
    for (const ok of ["Remote, flexible hours", "3+ years of Python", "Work 10-20 hours a week", "Hours per week you can give", "Open to 5 people", "Paid screening is not needed", null]) {
      expect(payProblem(ok as string | null), String(ok)).toBeNull();
    }
  });

  it("spots the partner's name (without the '(demo)' suffix) but not unrelated words", () => {
    expect(partnerNameTerms("Acme AI Data (demo)")).toEqual(["Acme AI Data", "Acme"]);
    expect(partnerNameTerms("Northwind Labs")).toEqual(["Northwind Labs", "Northwind"]);
    expect(mentionsPartner("Work with acme on evals", "Acme AI Data (demo)")).toBe(true);
    expect(mentionsPartner("Academic experts welcome", "Acme AI Data (demo)")).toBe(false);
    expect(mentionsPartner("For Northwind's new model", "Northwind Labs")).toBe(true);
    const problems = publicCopyProblems([{ field: "summary", label: "The summary", text: "Acme pays $40/hr" }], "Acme AI Data (demo)");
    expect(problems.map((p) => p.message)).toEqual([expect.stringMatching(/mentions an amount of money/), expect.stringMatching(/names the partner/)]);
  });
});

describe("Markdown for job descriptions", () => {
  it("renders the supported subset and escapes everything else", () => {
    const html = renderMarkdown("## About\nWrite **hard** problems in *Python* with `numpy`.\n\n- one\n- two\n\n1. first\n\n[Site](https://example.com) [bad](javascript:alert(1)) <script>x</script>");
    expect(html).toContain("<h3>About</h3>");
    expect(html).toContain("<strong>hard</strong>");
    expect(html).toContain("<em>Python</em>");
    expect(html).toContain("<code>numpy</code>");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<ol><li>first</li></ol>");
    expect(html).toContain('<a href="https://example.com" rel="nofollow noopener" target="_blank">Site</a>');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(markdownToText("## Hi\n- **a** [b](https://x.y)", 50)).toBe("Hi a b");
  });
});
