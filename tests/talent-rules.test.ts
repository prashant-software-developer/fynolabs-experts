// The small rules of the talent and outreach screens (pure functions): stage changes, the expert's
// status, who can get a bulk email, referral wording and pipeline moves, fee states, the referral
// link on radar roles, pasted emails, and per-section access.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  emailsFrom,
  expertStatusFromPipelines,
  feeMoveAllowed,
  isOpenInbound,
  isOverdue,
  leadingStage,
  moneyByCurrency,
  needsConsent,
  needsLink,
  outcomeSummary,
  pipelineForOutcome,
  planStageChange,
  recipientBlock,
  referralSummary,
  renderMerge,
  skipSummary,
  todayIndia,
  withReferral,
} from "@/lib/talent";
import { canOpenSection, ensureSection, sectionAccess } from "@/lib/auth/sections";
import { Email } from "@/components/talent/bits";

describe("stage changes", () => {
  const today = "2026-11-24";
  it("needs a reason to reject and words the timeline line", () => {
    expect(planStageChange("Rust Engineer", { from: "new", to: "rejected", today })).toEqual({ ok: false, reason: "Pick why they were rejected." });
    expect(planStageChange("Rust Engineer", { from: "new", to: "rejected", rejectReason: "bogus", today }).ok).toBe(false);
    const r = planStageChange("Rust Engineer", { from: "new", to: "rejected", rejectReason: "client_rejected", today });
    expect(r).toEqual({ ok: true, patch: { stage: "rejected", rejectReason: "client_rejected" }, summary: "Rust Engineer: Rejected (client said no)" });
    expect(planStageChange("", { from: "new", to: "referred", today })).toMatchObject({ summary: "Job: Proposed to client" });
  });
  it("leaving Rejected clears the reason; Active and Ended set the contract dates", () => {
    expect(planStageChange("J", { from: "rejected", to: "shortlisted", rejectReason: "skills", today })).toMatchObject({ patch: { stage: "shortlisted", rejectReason: null } });
    expect(planStageChange("J", { from: "signed", to: "active", today })).toMatchObject({ patch: { startedOn: today } });
    expect(planStageChange("J", { from: "signed", to: "active", startedOn: "2026-11-01", today })).toMatchObject({ patch: { stage: "active" } });
    expect((planStageChange("J", { from: "signed", to: "active", startedOn: "2026-11-01", today }) as { patch: object }).patch).not.toHaveProperty("startedOn");
    expect(planStageChange("J", { from: "active", to: "ended", startedOn: "2026-12-10", today })).toMatchObject({ patch: { endedOn: "2026-12-10" } });
    expect(planStageChange("J", { from: "active", to: "ended", startedOn: "2026-11-01", today })).toMatchObject({ patch: { endedOn: today } });
  });
  it("the expert's status follows their pipelines; do not contact never changes", () => {
    expect(expertStatusFromPipelines("bench", ["new", "active"])).toBe("placed");
    expect(expertStatusFromPipelines("placed", ["ended"])).toBe("bench");
    expect(expertStatusFromPipelines("applicant", ["shortlisted"])).toBe("bench");
    expect(expertStatusFromPipelines("applicant", ["new", "rejected"])).toBe("applicant");
    expect(expertStatusFromPipelines("do_not_contact", ["active"])).toBe("do_not_contact");
    expect(expertStatusFromPipelines("inactive", ["active"])).toBe("inactive");
  });
  it("the leading pipeline is the most advanced open one", () => {
    expect(leadingStage(["new", "signed", "ended"])).toBe("signed");
    expect(leadingStage(["ended", "rejected"])).toBe("ended");
    expect(leadingStage(["rejected"])).toBe("rejected");
    expect(leadingStage([])).toBeNull();
  });
  it("inbound: open while not handled and still at Applied", () => {
    expect(isOpenInbound({ handledAt: null, stage: "new" })).toBe(true);
    expect(isOpenInbound({ handledAt: new Date(), stage: "new" })).toBe(false);
    expect(isOpenInbound({ handledAt: null, stage: "shortlisted" })).toBe(false);
  });
});

describe("bulk email recipients", () => {
  const blocked = { suppressed: new Map([["bounce@example.com", "bounced"]]), dncEmails: new Set(["shared@example.com"]) };
  it("skips no email, do not contact, unsubscribed and suppressed, in that order", () => {
    expect(recipientBlock({ email: null, status: "bench", emailOptOut: false }, blocked)).toBe("no email");
    expect(recipientBlock({ email: "x@example.com", status: "do_not_contact", emailOptOut: true }, blocked)).toBe("do not contact");
    expect(recipientBlock({ email: "Shared@Example.com", status: "bench", emailOptOut: false }, blocked)).toBe("do not contact");
    expect(recipientBlock({ email: "y@example.com", status: "bench", emailOptOut: true }, blocked)).toBe("unsubscribed");
    expect(recipientBlock({ email: "bounce@example.com", status: "bench", emailOptOut: false }, blocked)).toBe("suppressed (bounced)");
    expect(recipientBlock({ email: "ok@example.com", status: "bench", emailOptOut: false }, blocked)).toBeNull();
    expect(skipSummary(["no email", "no email", "suppressed (bounced)", null])).toBe("Skipped: 2 no email, 1 suppressed.");
    expect(skipSummary([null])).toBeNull();
  });
  it("merge fields; unknown ones become empty", () => {
    expect(renderMerge("Hi {{first_name}}, {{ job_title }}{{nope}}!", { first_name: "Alex", job_title: "the role" })).toBe("Hi Alex, the role!");
  });
});

describe("referrals", () => {
  it("profile shares and introductions need consent; emails and links need the link", () => {
    expect(["profile_share", "intro"].every(needsConsent)).toBe(true);
    expect(["email", "link", "agency_form", "other"].some(needsConsent)).toBe(false);
    expect(needsLink("email") && needsLink("link") && !needsLink("agency_form")).toBe(true);
  });
  it("timeline wording", () => {
    expect(referralSummary("email", "Examplework")).toBe("Referral sent: Examplework");
    expect(referralSummary("profile_share", "Examplework")).toBe("Profile shared with Examplework");
    expect(referralSummary("agency_form", "Examplework")).toBe("Submitted to Examplework through their form");
    expect(outcomeSummary("Examplework", "active")).toBe("Examplework: working");
  });
  it("outcomes move the pipeline forward only", () => {
    expect(pipelineForOutcome("in_review", "new")).toEqual({ stage: "referred" });
    expect(pipelineForOutcome("in_review", "signed")).toBeNull();
    expect(pipelineForOutcome("active", "signed")).toEqual({ stage: "active" });
    expect(pipelineForOutcome("churned", "active")).toEqual({ stage: "ended" });
    expect(pipelineForOutcome("rejected", "referred")).toEqual({ stage: "rejected", rejectReason: "client_rejected" });
    expect(pipelineForOutcome("already_member", "new")).toEqual({ stage: "rejected", rejectReason: "already_on_platform" });
    expect(pipelineForOutcome("signed_up", "rejected")).toBeNull();
    expect(pipelineForOutcome("sent", "new")).toBeNull();
  });
  it("radar roles get the referral query on the same site only", () => {
    expect(withReferral("https://jobs.example.com/a?x=1", "https://example.com/signup?ref=ABC")).toBe("https://jobs.example.com/a?x=1&ref=ABC");
    expect(withReferral("https://jobs.example.com/a", "https://example.com/r/ABC")).toBeNull();
    expect(withReferral("https://other.example.org/a", "https://example.com/signup?ref=ABC")).toBeNull();
    expect(withReferral("https://example.com/a", null)).toBeNull();
  });
  it("pasted emails", () => {
    expect(emailsFrom("A@Example.com, Bo <bo@example.org>\nnot-an-email; a@example.com")).toEqual(["a@example.com", "bo@example.org"]);
  });
});

describe("fees", () => {
  it("expected -> invoiced / paid / void; invoiced -> paid / void; paid and void are final", () => {
    expect(feeMoveAllowed("expected", "invoiced") && feeMoveAllowed("expected", "paid") && feeMoveAllowed("expected", "void")).toBe(true);
    expect(feeMoveAllowed("invoiced", "paid") && feeMoveAllowed("invoiced", "void")).toBe(true);
    expect(feeMoveAllowed("invoiced", "expected") || feeMoveAllowed("paid", "void") || feeMoveAllowed("void", "paid") || feeMoveAllowed("invoiced", "invoiced")).toBe(false);
  });
  it("overdue is invoiced and past due in India; totals stay per currency", () => {
    expect(isOverdue({ status: "invoiced", dueOn: "2026-11-01" }, "2026-11-24")).toBe(true);
    expect(isOverdue({ status: "invoiced", dueOn: "2026-11-24" }, "2026-11-24")).toBe(false);
    expect(isOverdue({ status: "expected", dueOn: "2026-11-01" }, "2026-11-24")).toBe(false);
    expect(todayIndia(new Date("2026-11-24T20:00:00Z"))).toBe("2026-11-25");
    expect(moneyByCurrency(new Map([["USD", 1200], ["INR", 40000], ["EUR", 0]]))).toBe("USD 1,200 · INR 40,000");
    expect(moneyByCurrency({})).toBe("–");
  });
});

describe("per-section access", () => {
  it("admins open everything; empty sections mean the role decides; listed sections restrict", () => {
    expect(canOpenSection({ role: "admin", sections: ["contact"] }, "fees")).toBe(true);
    expect(canOpenSection({ role: "recruiter", sections: [] }, "send-referrals")).toBe(true);
    expect(canOpenSection({ role: "recruiter" }, "profiles")).toBe(true);
    const member = { role: "recruiter" as const, sections: ["contact", "profiles", "send-referrals"] };
    expect(canOpenSection(member, "profiles")).toBe(true);
    expect(canOpenSection(member, "job-radar")).toBe(false);
    // Campaigns ride on Send emails or Send referrals (FynoLabs).
    expect(canOpenSection(member, "referrals")).toBe(true);
    expect(sectionAccess(member)).toMatchObject({ profiles: true, "job-radar": false, fees: false, "posted-jobs": false });
    expect(() => ensureSection({ ...member, email: "r@xocket.sh", partnerIds: [] }, "fees")).toThrow(/You don't have access to Fees/);
    expect(() => ensureSection({ ...member, email: "r@xocket.sh", partnerIds: [] }, "profiles", "experts.delete")).toThrow();
  });
  it("viewers see masked emails", () => {
    expect(renderToStaticMarkup(createElement(Email, { value: "asha.example@example.com", contact: false }))).toContain("a•••@example.com");
    expect(renderToStaticMarkup(createElement(Email, { value: "asha.example@example.com", contact: true }))).toContain("mailto:asha.example@example.com");
  });
});
