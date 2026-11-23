// The signed-in account as the app sees it, on every request: the session cookie (mocked here)
// is checked against hub.accounts, then the gates: a temporary password before anything else, a
// verified email before any profile, turned-off accounts and ended sessions signed out. Plus
// Team & access handing out temporary passwords.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";

const state = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(public url: string) {
      super(`REDIRECT ${url}`);
    }
  }
  return { session: null as unknown, db: null as unknown, Redirect };
});

vi.mock("@/auth", () => ({ auth: async () => state.session, signIn: async () => undefined, signOut: async () => undefined }));
vi.mock("@/db/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db/client")>()), getDb: async () => state.db }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new state.Redirect(url);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { openTestDb } from "./fixtures/db";
import type { DB } from "@/db/client";
import { accounts, activity, teamMembers, type AccountRow } from "@/db/schema";
import { apiGuard } from "@/lib/auth/api";
import { ownExpertId, portalContext } from "@/lib/auth/expert";
import { accessFor } from "@/lib/auth/account";
import { getAccount, landingFor, requireUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { accountById, passwordSignIn } from "@/lib/server/accounts";
import { addMember, listTeam, resetMemberPassword, updateMember } from "@/lib/server/team";

let db: DB;
let client: PGlite;

const signedIn = (a: AccountRow, tv = a.tokenVersion) => {
  state.session = { user: { email: a.email, accountId: a.id, kind: a.accountType, tokenVersion: tv, mustChangePassword: a.mustChangePassword, verified: Boolean(a.emailVerifiedAt) } };
};
async function where(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    if (e instanceof state.Redirect) return e.url;
    throw e;
  }
}
const admin = { email: "boss@xocket.sh", role: "admin" as const, partnerIds: [] };

beforeAll(async () => {
  ({ db, client } = await openTestDb());
  state.db = db;
  await db.insert(teamMembers).values({ email: "boss@xocket.sh", role: "admin" });
});
afterAll(async () => {
  await client.close();
});

describe("every request re-checks the account", () => {
  it("a team account with its role from Team & access", async () => {
    const [m] = await db.insert(teamMembers).values({ email: "rec@xocket.sh", role: "recruiter" }).returning();
    const [a] = await db.insert(accounts).values({ email: "rec@xocket.sh", accountType: "team", teamMemberId: m.id, passwordHash: await hashPassword("Recruiter-Pass-1") }).returning();
    signedIn(a);
    expect(await getAccount()).toMatchObject({ kind: "team", user: { email: "rec@xocket.sh", role: "recruiter", blocked: false, mustChangePassword: false } });
    expect(await requireUser()).toMatchObject({ role: "recruiter" });
    // A session issued before a password change (older token_version) is signed out.
    signedIn(a, a.tokenVersion - 1);
    expect(await getAccount()).toBeNull();
    expect(await where(requireUser())).toBe("/signin");
    // Turned off on Team & access: the login is off and every session ends.
    signedIn(a);
    await updateMember(db, admin, m.id, { active: false });
    expect(await getAccount()).toBeNull();
    const now = (await accountById(db, a.id))!;
    expect(now.disabledAt).toBeInstanceOf(Date);
    expect(now.tokenVersion).toBe(a.tokenVersion + 1);
    await updateMember(db, admin, m.id, { active: true });
    signedIn((await accountById(db, a.id))!);
    expect(await getAccount()).toMatchObject({ kind: "team" });
  });

  it("someone with a temporary password can't use anything until they change it", async () => {
    const res = await addMember(db, admin, { email: "temp@xocket.sh", name: "Temp", role: "recruiter" });
    if (!res.ok || !res.tempPassword) throw new Error("no temp password");
    const a = (await db.select().from(accounts).where(eq(accounts.email, "temp@xocket.sh")))[0];
    expect(a.mustChangePassword).toBe(true);
    signedIn(a);
    expect(await where(requireUser())).toBe("/account/password");
    const api = await apiGuard("experts.read");
    expect("status" in api && api.status).toBe(403);
    expect(landingFor((await getAccount())!, "/admin/jobs")).toBe("/account/password");
    // The middleware's first gate says the same.
    expect(accessFor("/admin", "team", { mustChangePassword: true })).toEqual({ kind: "redirect", to: "/account/password" });
    expect(accessFor("/me", "expert", { mustChangePassword: true })).toEqual({ kind: "redirect", to: "/account/password" });
    expect(accessFor("/api/experts/export", "team", { mustChangePassword: true })).toEqual({ kind: "forbidden" });
    expect(accessFor("/account/password", "team", { mustChangePassword: true })).toEqual({ kind: "next" });
    expect(accessFor("/api/auth/signout", "team", { mustChangePassword: true })).toEqual({ kind: "next" });
    // Sign-in pages stay open, so an ended session that still carries the flag can't loop.
    expect(accessFor("/signin", "team", { mustChangePassword: true })).toEqual({ kind: "next" });
  });

  it("an expert sees no profile before their email is verified", async () => {
    const [a] = await db.insert(accounts).values({ email: "unverified@example.org", accountType: "expert", passwordHash: await hashPassword("Expert-Pass-12") }).returning();
    signedIn(a);
    expect(await where(portalContext("/me"))).toBe("/verify-email");
    expect(await ownExpertId()).toBeNull();
    expect(landingFor((await getAccount())!, "/jobs/x")).toBe("/verify-email");
    expect(accessFor("/me", "expert", { verified: false })).toEqual({ kind: "redirect", to: "/verify-email" });
    expect(accessFor("/api/me/export", "expert", { verified: false })).toEqual({ kind: "forbidden" });
    await db.update(accounts).set({ emailVerifiedAt: new Date() }).where(eq(accounts.id, a.id));
    const ctx = await portalContext("/me");
    expect(ctx.kind).toBe("expert");
    expect(await ownExpertId()).toBe(ctx.kind === "expert" ? ctx.expertId : "x");
    expect(landingFor((await getAccount())!, "/jobs/x")).toBe("/jobs/x");
    // Experts are never team.
    expect(await where(requireUser())).toBe("/team-only");
    state.session = null;
    expect(await where(portalContext("/me"))).toBe("/signin?callbackUrl=%2Fme");
  });
});

describe("Team & access: temporary passwords", () => {
  it("add member: a temporary password shown once (returned), stored only as a hash, never logged", async () => {
    const res = await addMember(db, admin, { email: "New.Person@xocket.sh", name: "New Person", role: "finance" });
    if (!res.ok || !res.tempPassword) throw new Error("no temp password");
    const pw = res.tempPassword;
    const [a] = await db.select().from(accounts).where(eq(accounts.email, "new.person@xocket.sh"));
    expect(a).toMatchObject({ accountType: "team", mustChangePassword: true, createdBy: "boss@xocket.sh" });
    expect(a.passwordHash).not.toContain(pw);
    expect(await verifyPassword(pw, a.passwordHash)).toBe(true);
    const logs = await db.select().from(activity);
    expect(JSON.stringify(logs)).not.toContain(pw);
    // Listing the team never brings it back.
    const team = await listTeam(db);
    expect(JSON.stringify(team)).not.toContain(pw);
    expect(team.find((m) => m.email === "new.person@xocket.sh")?.login).toMatchObject({ hasPassword: true, mustChangePassword: true, lastLoginAt: null });
    // The temporary password signs in (then the gate above applies).
    const login = await passwordSignIn(db, { email: "new.person@xocket.sh", password: pw, ip: "192.0.2.10" });
    expect(login.ok && login.account.mustChangePassword).toBe(true);
  });

  it("reset password: a new temporary password, the old one stops working, sessions end; never for yourself", async () => {
    const [m] = await db.select().from(teamMembers).where(eq(teamMembers.email, "new.person@xocket.sh"));
    const before = (await db.select().from(accounts).where(eq(accounts.email, "new.person@xocket.sh")))[0];
    const res = await resetMemberPassword(db, admin, m.id);
    if (!res.ok || !res.tempPassword) throw new Error("no temp password");
    const after = (await db.select().from(accounts).where(eq(accounts.email, "new.person@xocket.sh")))[0];
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect(await verifyPassword(res.tempPassword, after.passwordHash)).toBe(true);
    expect(await verifyPassword(res.tempPassword, before.passwordHash)).toBe(false);
    const [boss] = await db.select().from(teamMembers).where(eq(teamMembers.email, "boss@xocket.sh"));
    expect(await resetMemberPassword(db, admin, boss.id)).toMatchObject({ ok: false, reason: expect.stringMatching(/Change password/) });
    await expect(resetMemberPassword(db, { email: "v@xocket.sh", role: "viewer", partnerIds: [] }, m.id)).rejects.toThrow(/can't manage team/);
    // Turned off: no reset until it's on again.
    await updateMember(db, admin, m.id, { active: false });
    expect(await resetMemberPassword(db, admin, m.id)).toMatchObject({ ok: false });
    expect(await passwordSignIn(db, { email: "new.person@xocket.sh", password: res.tempPassword, ip: "192.0.2.11" })).toEqual({ ok: false, code: "disabled" });
  });

  it("an expert login with a team member's email becomes a team login (with a fresh password)", async () => {
    const [ex] = await db.insert(accounts).values({ email: "switch@gmail.com", accountType: "expert", passwordHash: await hashPassword("Their-Own-Pass-1"), emailVerifiedAt: new Date() }).returning();
    const res = await addMember(db, admin, { email: "switch@gmail.com", role: "viewer" });
    expect(res.ok && res.note).toMatch(/expert account/);
    const [a] = await db.select().from(accounts).where(eq(accounts.id, ex.id));
    expect(a).toMatchObject({ accountType: "team", mustChangePassword: true, tokenVersion: ex.tokenVersion + 1 });
    expect(await verifyPassword("Their-Own-Pass-1", a.passwordHash)).toBe(false);
  });

  it("the last admin can't be demoted or turned off, and nobody can turn themselves off", async () => {
    const [boss] = await db.select().from(teamMembers).where(eq(teamMembers.email, "boss@xocket.sh"));
    expect(await updateMember(db, admin, boss.id, { active: false })).toMatchObject({ ok: false, reason: expect.stringMatching(/deactivate yourself/) });
    expect(await updateMember(db, { ...admin, email: "other@xocket.sh" }, boss.id, { role: "viewer" })).toMatchObject({ ok: false, reason: expect.stringMatching(/last admin/) });
    expect(await updateMember(db, { ...admin, email: "other@xocket.sh" }, boss.id, { active: false })).toMatchObject({ ok: false, reason: expect.stringMatching(/last admin/) });
  });
});
