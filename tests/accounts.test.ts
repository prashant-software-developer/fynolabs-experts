// Team vs expert accounts, the middleware's access rules, where people land after sign-in, which
// sign-in methods are on, and signed invite links. Pure functions.
import { describe, expect, it } from "vitest";
import { accessFor, accountKind, isApplyEndpoint, isTeamByEnv, nextAfterSignIn, safePath } from "@/lib/auth/account";
import { signInMethods } from "@/auth.config";
import { sourceFromParams } from "@/lib/server/applications";
import { inviteToken, keyedHash, readInviteToken } from "@/lib/server/tokens";

const env = { ALLOWED_DOMAIN: "xocket.sh", ALLOWED_EMAILS: "contractor@example.com", ADMIN_EMAILS: "boss@gmail.com" };

describe("account type at sign-in", () => {
  it("team: ADMIN_EMAILS, the team domain, ALLOWED_EMAILS, or a team_members row; everyone else is an expert", () => {
    expect(isTeamByEnv("someone@xocket.sh", env)).toBe(true);
    expect(isTeamByEnv("BOSS@gmail.com", env)).toBe(true);
    expect(isTeamByEnv("contractor@example.com", env)).toBe(true);
    expect(isTeamByEnv("someone@sub.xocket.sh", env)).toBe(false);
    expect(isTeamByEnv("expert@gmail.com", env)).toBe(false);
    expect(accountKind({ email: "expert@gmail.com", hasTeamRow: false, env })).toBe("expert");
    expect(accountKind({ email: "new.hire@gmail.com", hasTeamRow: true, env })).toBe("team");
    expect(accountKind({ email: "a@xocket.sh", hasTeamRow: false, env })).toBe("team");
  });
});

describe("middleware access rules", () => {
  const all = ["guest", "expert", "team"] as const;
  it("public pages and the apply endpoint are open to everyone", () => {
    for (const p of ["/", "/jobs", "/jobs/rust-systems-engineer", "/jobs/x/applied", "/join", "/privacy", "/signin", "/api/auth/callback/google", "/api/apply/rust-systems-engineer", "/brand/fynolabs-mark.svg", "/team-only"]) {
      for (const who of all) expect(accessFor(p, who), `${p} ${who}`).toEqual({ kind: "next" });
    }
    expect(isApplyEndpoint("/api/apply/some-job")).toBe(true);
    expect(isApplyEndpoint("/api/apply/../experts/export")).toBe(false);
  });

  it("/me needs any signed-in person", () => {
    expect(accessFor("/me", "guest")).toEqual({ kind: "signin", to: "/join" });
    expect(accessFor("/me/onboarding", "guest")).toEqual({ kind: "signin", to: "/join" });
    expect(accessFor("/api/me/export", "guest")).toEqual({ kind: "unauthorized" });
    expect(accessFor("/me", "expert")).toEqual({ kind: "next" });
    expect(accessFor("/me/applications", "team")).toEqual({ kind: "next" });
  });

  it("/admin and admin APIs: team only; experts get 403, guests sign in", () => {
    for (const p of ["/admin", "/admin/jobs", "/admin/experts/123"]) {
      expect(accessFor(p, "guest")).toEqual({ kind: "signin", to: "/signin" });
      expect(accessFor(p, "expert")).toEqual({ kind: "forbidden" });
      expect(accessFor(p, "team")).toEqual({ kind: "next" });
    }
    for (const p of ["/api/experts/export", "/api/files/abc", "/api/jobs/abc/applicants"]) {
      expect(accessFor(p, "guest")).toEqual({ kind: "unauthorized" });
      expect(accessFor(p, "expert")).toEqual({ kind: "forbidden" });
      expect(accessFor(p, "team")).toEqual({ kind: "next" });
    }
  });

  it("after sign-in: team to /admin (or the admin page they asked for), experts to /me or back to the job, never /admin", () => {
    expect(nextAfterSignIn("team", null)).toBe("/admin");
    expect(nextAfterSignIn("team", "/admin/jobs?tab=x")).toBe("/admin/jobs?tab=x");
    expect(nextAfterSignIn("team", "/me")).toBe("/admin");
    expect(nextAfterSignIn("team", "/jobs/rust")).toBe("/jobs/rust");
    expect(nextAfterSignIn("expert", null)).toBe("/me");
    expect(nextAfterSignIn("expert", "/jobs/rust-systems-engineer")).toBe("/jobs/rust-systems-engineer");
    expect(nextAfterSignIn("expert", "/me/onboarding")).toBe("/me/onboarding");
    expect(nextAfterSignIn("expert", "/admin/experts")).toBe("/me");
    expect(nextAfterSignIn("expert", "/api/experts/export")).toBe("/me");
    expect(nextAfterSignIn("expert", "https://evil.example/")).toBe("/me");
    expect(nextAfterSignIn("expert", "//evil.example/")).toBe("/me");
    expect(safePath("/\\evil")).toBeNull();
  });
});

describe("sign-in methods", () => {
  it("Google always; email links only with Resend; LinkedIn only with its keys", () => {
    expect(signInMethods({})).toEqual(["google"]);
    expect(signInMethods({ RESEND_API_KEY: "re_x" })).toEqual(["google"]);
    expect(signInMethods({ RESEND_API_KEY: "re_x", EMAIL_FROM: "FynoLabs <hello@example.com>" })).toEqual(["google", "email"]);
    expect(signInMethods({ AUTH_LINKEDIN_ID: "id", AUTH_LINKEDIN_SECRET: "s" })).toEqual(["google", "linkedin"]);
  });
});

describe("invite links and source tags", () => {
  it("signed invite tokens can't be made up or changed", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const t = inviteToken(id);
    expect(t).not.toContain("-");
    expect(readInviteToken(t)).toBe(id);
    expect(readInviteToken(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(readInviteToken(`${"1".repeat(32)}.${t.split(".")[1]}`)).toBeNull();
    expect(readInviteToken("junk")).toBeNull();
    expect(readInviteToken(null)).toBeNull();
    expect(keyedHash("ip", "1.2.3.4")).toMatch(/^[0-9a-f]{64}$/);
    expect(keyedHash("ip", "1.2.3.4")).not.toContain("1.2.3.4");
  });

  it("keeps clean utm tags and ref from the page URL", () => {
    const p = new URLSearchParams("utm_source=linkedin&utm_medium=social&utm_campaign=math-jobs&utm_term=<script>&ref=invite&e=abc");
    expect(sourceFromParams((k) => p.get(k))).toEqual({ utm: { source: "linkedin", medium: "social", campaign: "math-jobs" }, ref: "invite", invite: "abc" });
    expect(sourceFromParams(() => null)).toEqual({ invite: null });
  });
});
