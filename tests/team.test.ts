import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import { rowsOf, type DB } from "@/db/client";
import { partners, teamMembers } from "@/db/schema";
import { ForbiddenError, type Role } from "@/lib/auth/permissions";
import { addMember, checkMemberChange, updateMember } from "@/lib/server/team";

describe("member change rules (pure)", () => {
  const base = { actorEmail: "boss@xocket.sh", otherAdmins: 1 };
  it("protects the last admin", () => {
    expect(checkMemberChange({ ...base, otherAdmins: 0, target: { email: "a@xocket.sh", role: "admin", active: true }, next: { role: "recruiter", active: true } })).toMatch(/last admin/);
    expect(checkMemberChange({ ...base, otherAdmins: 0, target: { email: "a@xocket.sh", role: "admin", active: true }, next: { role: "admin", active: false } })).toMatch(/last admin/);
    expect(checkMemberChange({ ...base, otherAdmins: 1, target: { email: "a@xocket.sh", role: "admin", active: true }, next: { role: "recruiter", active: true } })).toBeNull();
    // An ADMIN_EMAILS person stays admin whatever their row says, so the change is harmless.
    expect(checkMemberChange({ ...base, otherAdmins: 0, envAdmins: ["a@xocket.sh"], target: { email: "a@xocket.sh", role: "admin", active: true }, next: { role: "viewer", active: true } })).toBeNull();
  });
  it("stops admins demoting or deactivating themselves", () => {
    expect(checkMemberChange({ ...base, otherAdmins: 5, target: { email: "boss@xocket.sh", role: "admin", active: true }, next: { role: "viewer", active: true } })).toMatch(/own role/);
    expect(checkMemberChange({ ...base, otherAdmins: 5, target: { email: "boss@xocket.sh", role: "admin", active: true }, next: { role: "admin", active: false } })).toMatch(/deactivate yourself/);
    expect(checkMemberChange({ ...base, target: { email: "boss@xocket.sh", role: "admin", active: true }, next: { role: "admin", active: true } })).toBeNull();
  });
});

describe("team & access in the database", () => {
  let db: DB;
  let client: PGlite;
  let partnerA: string;
  let partnerB: string;
  const savedEnv = { ADMIN_EMAILS: process.env.ADMIN_EMAILS, ALLOWED_DOMAIN: process.env.ALLOWED_DOMAIN };
  const admin = (email = "boss@xocket.sh") => ({ email, role: "admin" as Role, partnerIds: [] as string[] });

  beforeAll(async () => {
    ({ db, client } = await openTestDb());
    process.env.ALLOWED_DOMAIN = "xocket.sh";
    process.env.ADMIN_EMAILS = "";
    [{ id: partnerA }, { id: partnerB }] = await db.insert(partners).values([{ name: "Team Partner A" }, { name: "Team Partner B" }]).returning({ id: partners.id });
  });
  afterEach(() => {
    process.env.ADMIN_EMAILS = "";
  });
  afterAll(async () => {
    process.env.ADMIN_EMAILS = savedEnv.ADMIN_EMAILS;
    process.env.ALLOWED_DOMAIN = savedEnv.ALLOWED_DOMAIN;
    await client.close();
  });

  it("only admins can manage the team", async () => {
    await expect(addMember(db, { email: "r@xocket.sh", role: "recruiter", partnerIds: [] }, { email: "x@xocket.sh", role: "viewer" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateMember(db, { email: "f@xocket.sh", role: "finance", partnerIds: [] }, "00000000-0000-0000-0000-000000000000", { role: "admin" })).rejects.toThrow(/can't manage team/);
  });

  it("adds members (lower-case email, unique), keeps pod-lead scope to real partners, logs with the actor's role", async () => {
    const boss = await addMember(db, admin(), { email: "Boss@Xocket.sh", name: "Boss", role: "admin" });
    expect(boss).toMatchObject({ ok: true, changed: true });
    const pl = await addMember(db, admin(), { email: "pod@xocket.sh", role: "pod_lead", partnerIds: [partnerA, "junk", "00000000-0000-0000-0000-000000000000"] });
    expect(pl.ok).toBe(true);
    const [row] = await db.select().from(teamMembers).where(eq(teamMembers.email, "pod@xocket.sh"));
    expect(row.partnerIds).toEqual([partnerA]);
    expect(await addMember(db, admin(), { email: "pod@xocket.sh", role: "viewer" })).toMatchObject({ ok: false });
    expect(await addMember(db, admin(), { email: "not an email", role: "viewer" })).toEqual({ ok: false, reason: "Type a full email address." });
    expect(await addMember(db, admin(), { email: "x@xocket.sh", role: "owner" })).toEqual({ ok: false, reason: "Pick a role." });
    // An outside address on the list is team too: it gets a team login with a temporary password.
    const outside = await addMember(db, admin(), { email: "contractor@gmail.com", role: "viewer" });
    expect(outside.ok && outside.tempPassword).toMatch(/^.{20}$/);
    const log = rowsOf<{ actor_email: string; actor_role: string; action: string }>(
      await db.execute(sql`select actor_email, actor_role, action from hub.activity where entity_type = 'team_member' and entity_id = ${row.id}`),
    );
    expect(log).toEqual([{ actor_email: "boss@xocket.sh", actor_role: "admin", action: "created" }]);
  });

  it("changes role, scope and access, logging each change", async () => {
    const [pod] = await db.select().from(teamMembers).where(eq(teamMembers.email, "pod@xocket.sh"));
    expect(await updateMember(db, admin(), pod.id, { partnerIds: [partnerA, partnerB] })).toMatchObject({ ok: true, changed: true });
    expect(await updateMember(db, admin(), pod.id, { partnerIds: [partnerB, partnerA] })).toMatchObject({ ok: true, changed: false });
    expect(await updateMember(db, admin(), pod.id, { role: "recruiter" })).toMatchObject({ ok: true });
    expect(await updateMember(db, admin(), pod.id, { active: false })).toMatchObject({ ok: true });
    expect(await updateMember(db, admin(), pod.id, { active: true })).toMatchObject({ ok: true });
    const actions = rowsOf<{ action: string }>(await db.execute(sql`select action from hub.activity where entity_id = ${pod.id} order by created_at`)).map((r) => r.action);
    expect(actions).toEqual(["created", "scope_changed", "role_changed", "deactivated", "reactivated"]);
    const [after] = await db.select().from(teamMembers).where(eq(teamMembers.id, pod.id));
    expect(after).toMatchObject({ role: "recruiter", active: true });
  });

  it("can't demote or deactivate yourself, or the last admin", async () => {
    const [boss] = await db.select().from(teamMembers).where(eq(teamMembers.email, "boss@xocket.sh"));
    // Yourself
    expect(await updateMember(db, admin(), boss.id, { role: "viewer" })).toMatchObject({ ok: false, reason: expect.stringMatching(/own role/) });
    expect(await updateMember(db, admin(), boss.id, { active: false })).toMatchObject({ ok: false, reason: expect.stringMatching(/deactivate yourself/) });
    // Someone else acting (an ADMIN_EMAILS admin with no row): boss is the last admin row, but the env admin counts
    process.env.ADMIN_EMAILS = "prashant@xocket.sh";
    const envAdmin = admin("prashant@xocket.sh");
    expect(await updateMember(db, envAdmin, boss.id, { role: "finance" })).toMatchObject({ ok: true });
    expect(await updateMember(db, envAdmin, boss.id, { role: "admin" })).toMatchObject({ ok: true });
    // Without ADMIN_EMAILS boss really is the last admin
    process.env.ADMIN_EMAILS = "";
    expect(await updateMember(db, admin("someone@xocket.sh"), boss.id, { role: "viewer" })).toMatchObject({ ok: false, reason: expect.stringMatching(/last admin/) });
    expect(await updateMember(db, admin("someone@xocket.sh"), boss.id, { active: false })).toMatchObject({ ok: false, reason: expect.stringMatching(/last admin/) });
    // A second admin makes it possible
    await addMember(db, admin(), { email: "second@xocket.sh", role: "admin" });
    expect(await updateMember(db, admin("second@xocket.sh"), boss.id, { role: "recruiter" })).toMatchObject({ ok: true });
  });
});
