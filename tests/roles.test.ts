import { describe, expect, it } from "vitest";
import { adminEmails, defaultRole, resolveRole } from "@/lib/auth/roles";

const env = { ALLOWED_DOMAIN: "xocket.sh", ADMIN_EMAILS: "Prashant@Xocket.sh, ops@example.com" };

it("ADMIN_EMAILS=prashant@xocket.sh forces admin for the owner, whatever the team list says", () => {
  const own = { ADMIN_EMAILS: "prashant@xocket.sh", ALLOWED_DOMAIN: "xocket.sh" };
  expect(resolveRole({ email: "prashant@xocket.sh", member: null, env: own })).toMatchObject({ status: "ok", role: "admin", source: "admin_emails" });
  expect(resolveRole({ email: "prashant@xocket.sh", member: { role: "viewer", active: true, partnerIds: [] }, env: own })).toMatchObject({ role: "admin" });
});

describe("role resolution", () => {
  it("ADMIN_EMAILS are always admins (case-insensitive), even over a team row or an inactive one", () => {
    expect(adminEmails(env)).toEqual(["prashant@xocket.sh", "ops@example.com"]);
    expect(resolveRole({ email: "prashant@xocket.sh", member: null, env })).toEqual({ status: "ok", role: "admin", partnerIds: [], source: "admin_emails" });
    expect(resolveRole({ email: "PRASHANT@xocket.sh", member: { role: "viewer", active: true, partnerIds: [] }, env })).toMatchObject({ role: "admin", source: "admin_emails" });
    expect(resolveRole({ email: "prashant@xocket.sh", member: { role: "viewer", active: false, partnerIds: [] }, env })).toMatchObject({ status: "ok", role: "admin" });
  });

  it("an active team row gives its role; pod leads keep their partner scope", () => {
    expect(resolveRole({ email: "r@xocket.sh", member: { role: "recruiter", active: true, partnerIds: ["x"] }, env })).toEqual({ status: "ok", role: "recruiter", partnerIds: [], source: "team" });
    expect(resolveRole({ email: "p@xocket.sh", member: { role: "pod_lead", active: true, partnerIds: ["a", "b"] }, env })).toEqual({ status: "ok", role: "pod_lead", partnerIds: ["a", "b"], source: "team" });
    expect(resolveRole({ email: "f@xocket.sh", member: { role: "finance", active: true, partnerIds: [] }, env })).toMatchObject({ role: "finance" });
  });

  it("an inactive team row is blocked", () => {
    expect(resolveRole({ email: "gone@xocket.sh", member: { role: "admin", active: false, partnerIds: [] }, env })).toEqual({ status: "inactive" });
  });

  it("a row with an unknown role falls back to viewer", () => {
    expect(resolveRole({ email: "x@xocket.sh", member: { role: "owner", active: true, partnerIds: [] }, env })).toMatchObject({ role: "viewer" });
  });

  it("no row: DEFAULT_ROLE for the team domain, viewer when unset or unknown", () => {
    expect(resolveRole({ email: "new@xocket.sh", member: null, env })).toEqual({ status: "ok", role: "viewer", partnerIds: [], source: "default" });
    expect(resolveRole({ email: "new@xocket.sh", member: null, env: { ...env, DEFAULT_ROLE: "recruiter" } })).toMatchObject({ role: "recruiter", source: "default" });
    expect(resolveRole({ email: "new@xocket.sh", member: null, env: { ...env, DEFAULT_ROLE: "superuser" } })).toMatchObject({ role: "viewer" });
    expect(defaultRole({})).toBe("viewer");
    expect(defaultRole({ DEFAULT_ROLE: " Finance " })).toBe("finance");
  });

  it("outside addresses (ALLOWED_EMAILS) without a row get viewer, never DEFAULT_ROLE", () => {
    expect(resolveRole({ email: "contractor@gmail.com", member: null, env: { ...env, DEFAULT_ROLE: "recruiter" } })).toMatchObject({ role: "viewer", source: "default" });
    expect(resolveRole({ email: "contractor@gmail.com", member: { role: "recruiter", active: true, partnerIds: [] }, env })).toMatchObject({ role: "recruiter", source: "team" });
  });

});
