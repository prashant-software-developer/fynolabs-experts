import { describe, expect, it } from "vitest";
import {
  MATRIX,
  ROLES,
  can,
  canManageView,
  canSeeContact,
  canSeeMoney,
  canSeeView,
  ensure,
  ForbiddenError,
  isForbidden,
  maskEmail,
  maskPhone,
  partnerScope,
  visibleExpert,
  type Action,
  type Role,
} from "@/lib/auth/permissions";

// The matrix written out by hand, independently of MATRIX, so a change to one shows up here.
const EXPECTED: Record<Role, Action[]> = {
  admin: Object.keys(MATRIX) as Action[],
  recruiter: [
    "experts.read",
    "experts.create",
    "experts.edit",
    "experts.notes",
    "experts.cv_upload",
    "experts.cv_download",
    "experts.export",
    "experts.contact",
    "requirements.read",
    "requirements.create",
    "requirements.edit",
    "requirements.rate_note",
    "matching.shortlist",
    "submissions.read",
    "submissions.update",
    "roster.export",
    "placements.read",
    "imports.csv",
    "partners.read",
    "jobs.read",
    "jobs.manage",
    "applications.read",
    "applications.manage",
    "applications.export",
    "views.save",
    "views.share",
  ],
  pod_lead: [
    "experts.read",
    "experts.cv_download",
    "experts.contact",
    "requirements.read",
    "submissions.read",
    "submissions.update",
    "placements.read",
    "placements.progress",
    "partners.read",
    "jobs.read",
    "applications.read",
    "views.save",
    "views.share",
  ],
  finance: [
    "experts.read",
    "experts.contact",
    "requirements.read",
    "requirements.rate_note",
    "submissions.read",
    "placements.read",
    "placements.create",
    "placements.edit",
    "placements.progress",
    "placements.export",
    "money.read",
    "partners.read",
    "jobs.read",
    "jobs.rate_note",
    "applications.read",
    "views.save",
    "views.share",
  ],
  viewer: ["experts.read", "requirements.read", "submissions.read", "placements.read", "partners.read", "jobs.read", "applications.read", "views.save"],
};

describe("permissions matrix", () => {
  const actions = Object.keys(MATRIX) as Action[];

  for (const role of ROLES) {
    it(`${role}: exactly the expected actions`, () => {
      const allowed = actions.filter((a) => can(role, a));
      expect(allowed.sort()).toEqual([...EXPECTED[role]].sort());
    });
  }

  it("key rules from the brief", () => {
    // Admin only
    for (const a of ["team.manage", "imports.jobs", "experts.delete", "partners.manage", "settings.manage"] as Action[]) {
      expect(ROLES.filter((r) => can(r, a))).toEqual(["admin"]);
    }
    // Money: admin and finance only
    expect(ROLES.filter((r) => canSeeMoney(r))).toEqual(["admin", "finance"]);
    // Contact details masked for viewers only
    expect(ROLES.filter((r) => !canSeeContact(r))).toEqual(["viewer"]);
    // No exports for viewers or pod leads
    for (const a of ["experts.export", "roster.export", "placements.export"] as Action[]) {
      expect(can("viewer", a)).toBe(false);
      expect(can("pod_lead", a)).toBe(false);
    }
    // Recruiter: CSV import yes, jobs sync no; no delete
    expect(can("recruiter", "imports.csv")).toBe(true);
    expect(can("recruiter", "imports.jobs")).toBe(false);
    expect(can("recruiter", "experts.delete")).toBe(false);
    // Finance: no imports, no team page
    expect(can("finance", "imports.csv")).toBe(false);
    expect(can("finance", "team.manage")).toBe(false);
  });

  it("unknown roles get nothing", () => {
    expect(can("owner" as Role, "experts.read")).toBe(false);
  });
});

describe("pod-lead partner scope", () => {
  const scope = { partnerIds: ["p1", "p2"] };

  it("scoped actions hold only for partners in scope", () => {
    expect(can("pod_lead", "submissions.update", { ...scope, partnerId: "p1" })).toBe(true);
    expect(can("pod_lead", "submissions.update", { ...scope, partnerId: "p3" })).toBe(false);
    expect(can("pod_lead", "placements.progress", { ...scope, partnerId: "p2" })).toBe(true);
    expect(can("pod_lead", "placements.read", { ...scope, partnerId: "p9" })).toBe(false);
    expect(can("pod_lead", "submissions.read", { ...scope, partnerId: null })).toBe(false);
    expect(can("pod_lead", "submissions.read", { partnerIds: [], partnerId: "p1" })).toBe(false);
  });

  it("without a partner the answer is 'for some partners' (lists are filtered)", () => {
    expect(can("pod_lead", "submissions.update")).toBe(true);
    expect(partnerScope({ role: "pod_lead", partnerIds: ["p1"] })).toEqual(["p1"]);
    expect(partnerScope({ role: "recruiter", partnerIds: ["p1"] })).toBeNull();
    expect(partnerScope({ role: "admin", partnerIds: [] })).toBeNull();
  });

  it("only pod leads are scoped; scope never adds rights", () => {
    expect(can("recruiter", "submissions.update", { partnerIds: [], partnerId: "p3" })).toBe(true);
    expect(can("pod_lead", "placements.edit", { ...scope, partnerId: "p1" })).toBe(false);
    expect(can("pod_lead", "money.read", { ...scope, partnerId: "p1" })).toBe(false);
  });
});

describe("ensure (the guard's check)", () => {
  it("throws a 403 ForbiddenError with a clear message", () => {
    const viewer = { email: "v@xocket.sh", role: "viewer" as Role, partnerIds: [] };
    expect(() => ensure(viewer, "experts.delete")).toThrow(ForbiddenError);
    try {
      ensure(viewer, "experts.delete");
    } catch (e) {
      expect(isForbidden(e)).toBe(true);
      expect((e as ForbiddenError).status).toBe(403);
      expect((e as Error).message).toBe("Viewer access can't delete experts. Ask an admin if you need this.");
    }
    expect(() => ensure({ ...viewer, role: "admin" }, "experts.delete")).not.toThrow();
  });

  it("explains a pod lead's out-of-scope refusal", () => {
    const pl = { email: "p@xocket.sh", role: "pod_lead" as Role, partnerIds: ["p1"] };
    expect(() => ensure(pl, "submissions.update", { partnerId: "p1" })).not.toThrow();
    expect(() => ensure(pl, "submissions.update", { partnerId: "p2" })).toThrow(/outside your pods/);
  });

  it("blocks inactive members whatever their role", () => {
    expect(() => ensure({ email: "a@xocket.sh", role: "admin", partnerIds: [], blocked: true }, "experts.read")).toThrow(/turned off/);
  });
});

describe("masking and field visibility", () => {
  it("masks email and phone", () => {
    expect(maskEmail("asha.example@example.com")).toBe("a•••@example.com");
    expect(maskEmail("a@example.com")).toBe("a•••@example.com");
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("not-an-email")).toBe("•••");
    expect(maskPhone("+91 98765 54085")).toBe("+91 ••••• •4085");
    expect(maskPhone("+1 555 0111")).toBe("+1 ••• 0111");
    expect(maskPhone("9876554085")).toBe("••••••4085");
    expect(maskPhone("+44-20-7946-0958")).toBe("+44-••-••••-0958");
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone("n/a")).toBe("•••");
  });

  const e = { email: "asha@example.com", phone: "+91 98765 54085", linkedinUrl: "https://www.linkedin.com/in/asha", rateExpectationUsd: 45 };

  it("viewer: masked contact, LinkedIn visible, no money", () => {
    expect(visibleExpert("viewer", e)).toEqual({ email: "a•••@example.com", phone: "+91 ••••• •4085", linkedinUrl: e.linkedinUrl, rateExpectationUsd: null });
  });

  it("recruiter and pod lead: contact yes, money no", () => {
    expect(visibleExpert("recruiter", e)).toEqual({ ...e, rateExpectationUsd: null });
    expect(visibleExpert("pod_lead", e)).toEqual({ ...e, rateExpectationUsd: null });
  });

  it("finance and admin: everything", () => {
    expect(visibleExpert("finance", e)).toEqual(e);
    expect(visibleExpert("admin", e)).toEqual(e);
  });

  it("never changes the original record", () => {
    const copy = { ...e };
    visibleExpert("viewer", copy);
    expect(copy).toEqual(e);
  });
});

describe("saved view rules", () => {
  const mine = { ownerEmail: "me@xocket.sh", shared: false };
  const theirsShared = { ownerEmail: "them@xocket.sh", shared: true };
  const theirsPrivate = { ownerEmail: "them@xocket.sh", shared: false };

  it("see: own views and shared ones", () => {
    expect(canSeeView({ email: "me@xocket.sh" }, mine)).toBe(true);
    expect(canSeeView({ email: "me@xocket.sh" }, theirsShared)).toBe(true);
    expect(canSeeView({ email: "me@xocket.sh" }, theirsPrivate)).toBe(false);
  });

  it("change or delete: owner or admin", () => {
    expect(canManageView({ email: "me@xocket.sh", role: "viewer" }, mine)).toBe(true);
    expect(canManageView({ email: "me@xocket.sh", role: "recruiter" }, theirsShared)).toBe(false);
    expect(canManageView({ email: "boss@xocket.sh", role: "admin" }, theirsShared)).toBe(true);
  });
});
