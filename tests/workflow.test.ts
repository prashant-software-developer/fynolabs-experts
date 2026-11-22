import { describe, expect, it } from "vitest";
import { computeMoney, summarize } from "@/lib/money";
import { checkSubmissionMove, expertStatusAfter, requirementStatusAfter } from "@/lib/workflow";

describe("submission rules", () => {
  it("blocks marking submitted without CV consent, and says why", () => {
    const r = checkSubmissionMove({ from: "shortlisted", to: "submitted", cvConsent: "unknown", expertStatus: "bench", expertName: "Asha" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Asha has no CV consent on record");
    const no = checkSubmissionMove({ from: "consent_requested", to: "partner_review", cvConsent: "no", expertStatus: "bench" });
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.reason).toContain("said no");
  });

  it("allows it with consent, and allows non-sending moves without", () => {
    expect(checkSubmissionMove({ from: "shortlisted", to: "submitted", cvConsent: "yes", expertStatus: "bench" }).ok).toBe(true);
    expect(checkSubmissionMove({ from: "shortlisted", to: "consent_requested", cvConsent: "unknown", expertStatus: "bench" }).ok).toBe(true);
    expect(checkSubmissionMove({ from: "shortlisted", to: "withdrawn", cvConsent: "no", expertStatus: "bench" }).ok).toBe(true);
    expect(checkSubmissionMove({ from: "submitted", to: "approved", cvConsent: "no", expertStatus: "submitted" }).ok).toBe(true);
  });

  it("moves the expert forward, never back", () => {
    expect(expertStatusAfter("bench", "submitted")).toBe("submitted");
    expect(expertStatusAfter("placed", "submitted")).toBeNull();
    expect(expertStatusAfter("submitted", "active")).toBe("placed");
    expect(expertStatusAfter("bench", "rejected")).toBeNull();
  });

  it("fills requirements as people are approved", () => {
    expect(requirementStatusAfter({ current: "open", slots: 2, statuses: ["shortlisted"] })).toBeNull();
    expect(requirementStatusAfter({ current: "open", slots: 2, statuses: ["submitted"] })).toBe("filling");
    expect(requirementStatusAfter({ current: "filling", slots: 2, statuses: ["approved", "active"] })).toBe("filled");
    expect(requirementStatusAfter({ current: "filled", slots: 2, statuses: ["approved", "rejected"] })).toBe("filling");
    expect(requirementStatusAfter({ current: "closed", slots: 1, statuses: ["approved"] })).toBeNull();
  });
});

describe("placement money", () => {
  it("derives totals from units x rate unless typed in", () => {
    expect(computeMoney({ basis: "hourly", rateToExpert: 40, rateFromPartner: 55, hoursApproved: 32, tasksAccepted: null, earnedByExpert: null, revenue: null })).toEqual({ earned: 1280, revenue: 1760, margin: 480 });
    expect(computeMoney({ basis: "per_task", rateToExpert: 12.5, rateFromPartner: 20, hoursApproved: 10, tasksAccepted: 8, earnedByExpert: null, revenue: 150 })).toEqual({ earned: 100, revenue: 150, margin: 50 });
    expect(computeMoney({ basis: "hourly", rateToExpert: null, rateFromPartner: null, hoursApproved: null, tasksAccepted: null, earnedByExpert: null, revenue: null })).toEqual({ earned: null, revenue: null, margin: null });
  });

  it("totals per partner and per month, by currency", () => {
    const s = summarize([
      { partnerName: "A", currency: "USD", startDate: "2026-11-03", status: "active", basis: "hourly", rateToExpert: 10, rateFromPartner: 20, hoursApproved: 10, tasksAccepted: null, earnedByExpert: null, revenue: null },
      { partnerName: "A", currency: "USD", startDate: "2026-11-20", status: "ended", basis: "hourly", rateToExpert: 10, rateFromPartner: 20, hoursApproved: 5, tasksAccepted: null, earnedByExpert: null, revenue: null },
      { partnerName: "B", currency: "EUR", startDate: "2026-10-01", status: "active", basis: "per_task", rateToExpert: 1, rateFromPartner: 2, hoursApproved: null, tasksAccepted: 100, earnedByExpert: null, revenue: null },
    ]);
    expect(s.byPartner[0]).toMatchObject({ partner: "A", currency: "USD", count: 2, earned: 150, revenue: 300, margin: 150, hours: 15 });
    expect(s.byMonth.map((m) => m.month)).toEqual(["2026-11", "2026-10"]);
    expect(s.total.find((t) => t.currency === "EUR")).toMatchObject({ earned: 100, revenue: 200 });
  });
});
