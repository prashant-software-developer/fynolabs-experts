// npm run expert:create: the test expert login (src/lib/server/test-expert.ts) on PGlite, then the
// script itself run as a real command against a local PGlite folder (the test-only HUB_TEST_DB switch).
// It must sign in as an expert with a linked, verified record, and never touch team emails, real
// experts, someone else's login or people deleted on request.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import { openLocalDbWithClient } from "@/db/local/open";
import type { DB } from "@/db/client";
import { accounts, erasures, experts, teamMembers } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { accountFromRow } from "@/lib/auth/team-access";
import { emailHash } from "@/lib/normalize";
import { accountByEmail, passwordSignIn } from "@/lib/server/accounts";
import { TEST_CREATED_BY, checkTestExpert, upsertTestExpert } from "@/lib/server/test-expert";

const PW = "Testing-The-Portal-7";
const actor = "cli:test";

describe("upsertTestExpert", () => {
  let db: DB;
  let client: PGlite;
  beforeAll(async () => {
    ({ db, client } = await openTestDb());
  });
  afterAll(async () => {
    await client.close();
  });

  it("creates a verified expert login linked to a 'Test Expert' record tagged test, that signs in to the portal", async () => {
    const res = await upsertTestExpert(db, { email: "Test.Expert@Example.com", password: PW, generated: false, actor });
    expect(res).toMatchObject({ ok: true, email: "test.expert@example.com", created: true, expertName: "Test Expert", passwordChanged: true, mustChangePassword: false });
    const a = (await accountByEmail(db, "test.expert@example.com"))!;
    expect(a).toMatchObject({ accountType: "expert", createdBy: TEST_CREATED_BY, disabledAt: null, mustChangePassword: false });
    expect(a.emailVerifiedAt).toBeInstanceOf(Date);
    const [e] = await db.select().from(experts).where(eq(experts.id, a.expertId!));
    expect(e).toMatchObject({ fullName: "Test Expert", email: "test.expert@example.com" });
    expect(e.tags).toContain("test");
    const signIn = await passwordSignIn(db, { email: "test.expert@example.com", password: PW, ip: "198.51.100.7" });
    expect(signIn.ok).toBe(true);
    expect(await accountFromRow(db, a)).toMatchObject({ kind: "expert", verified: true, expertId: a.expertId });
  });

  it("running it again: no password keeps it; a new one ends other sessions; still one login and one record", async () => {
    const before = (await accountByEmail(db, "test.expert@example.com"))!;
    const keep = await upsertTestExpert(db, { email: "test.expert@example.com", password: null, generated: false, actor });
    expect(keep).toMatchObject({ ok: true, created: false, passwordChanged: false });
    expect((await accountByEmail(db, "test.expert@example.com"))!.passwordHash).toBe(before.passwordHash);
    const reset = await upsertTestExpert(db, { email: "test.expert@example.com", password: "Another-Test-Pass-8", generated: true, actor });
    expect(reset).toMatchObject({ ok: true, created: false, passwordChanged: true, mustChangePassword: true });
    const after = (await accountByEmail(db, "test.expert@example.com"))!;
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect(await verifyPassword("Another-Test-Pass-8", after.passwordHash)).toBe(true);
    expect(after.expertId).toBe(before.expertId);
    expect(await db.$count(experts, eq(experts.email, "test.expert@example.com"))).toBe(1);
  });

  it("a name can be given for a new record", async () => {
    const res = await upsertTestExpert(db, { email: "qa.maths@example.com", name: "QA Maths Expert", password: PW, generated: false, actor });
    expect(res).toMatchObject({ ok: true, expertName: "QA Maths Expert" });
  });

  it("refuses team emails, real experts, someone else's login and people deleted on request, changing nothing", async () => {
    await db.insert(teamMembers).values({ email: "riddhima@partner.example", name: "R", role: "recruiter", active: true });
    await db.insert(experts).values({ fullName: "Asha Real", email: "asha.real@example.org", primarySource: "manual", status: "bench" });
    await db.insert(accounts).values({ email: "signed.up@example.org", name: "S", accountType: "expert", passwordHash: await hashPassword(PW), createdBy: "sign-up" });
    await db.insert(erasures).values({ emailSha256: emailHash("gone@example.org"), actorEmail: "admin@xocket.sh" });
    const cases: [string, RegExp][] = [
      ["someone@xocket.sh", /team email/],
      ["riddhima@partner.example", /team email/],
      ["asha.real@example.org", /belongs to an expert already in the hub/],
      ["signed.up@example.org", /wasn't made for testing/],
      ["gone@example.org", /deleted on request/],
      ["not-an-email", /isn't a valid email/],
    ];
    const accountsBefore = await db.$count(accounts);
    const expertsBefore = await db.$count(experts);
    for (const [email, why] of cases) {
      const check = await checkTestExpert(db, email);
      expect(check.ok, email).toBe(false);
      const res = await upsertTestExpert(db, { email, password: PW, generated: false, actor });
      expect(res.ok, email).toBe(false);
      if (!res.ok) expect(res.reason, email).toMatch(why);
    }
    expect(await db.$count(accounts)).toBe(accountsBefore);
    expect(await db.$count(experts)).toBe(expertsBefore);
    const [asha] = await db.select().from(experts).where(eq(experts.email, "asha.real@example.org"));
    expect(asha.tags ?? []).not.toContain("test");
  });
});

describe("npm run expert:create (the script)", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "expert-create-"));
  const dir = path.join(tmp, "db");
  const cli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const run = (args: string[], env: Record<string, string> = {}, input = "") => {
    const r = spawnSync(process.execPath, [cli, "scripts/create-test-expert.ts", ...args], {
      cwd: process.cwd(),
      // Only these variables: never the real .env.local values (loadEnv never overrides what is set here).
      env: { PATH: process.env.PATH ?? "", HOME: tmp, DATABASE_URL: "", CONFIRM_DB: "", HUB_TEST_DB: "pglite", HUB_TEST_DB_DIR: dir, ...env } as unknown as NodeJS.ProcessEnv,
      input,
      encoding: "utf8",
      timeout: 120_000,
    });
    return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
  };
  const printed = (out: string) => /shown once, saved nowhere\):\s+(\S+)/.exec(out)?.[1] ?? null;
  async function inDb<T>(fn: (db: DB) => Promise<T>): Promise<T> {
    const { db, client } = await openLocalDbWithClient({ dataDir: dir });
    try {
      return await fn(db);
    } finally {
      await client.close();
    }
  }
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("refuses without CONFIRM_DB=yes, and refuses a team email", () => {
    const unconfirmed = run(["--email", "test.expert@example.com", "--generate"]);
    expect(unconfirmed.code).toBe(1);
    expect(unconfirmed.out).toMatch(/Refusing: set CONFIRM_DB=yes/);
    const team = run(["--email", "prashant@xocket.sh", "--generate"], { CONFIRM_DB: "yes" });
    expect(team.code).toBe(1);
    expect(team.out).toMatch(/is a team email/);
    expect(team.out).toMatch(/Nothing was changed/);
  });

  it("creates the login with a generated password printed once (to be changed at the first sign-in); again keeps it on 'no'", async () => {
    const r = run(["--email", "test.expert@example.com", "--generate"], { CONFIRM_DB: "yes" });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Created the test expert login test\.expert@example\.com \(email verified; expert record "Test Expert", tagged test\)/);
    const pw = printed(r.out)!;
    expect(r.out.split(pw)).toHaveLength(2);
    const a = await inDb(async (db) => (await accountByEmail(db, "test.expert@example.com"))!);
    expect(a).toMatchObject({ accountType: "expert", mustChangePassword: true });
    expect(await verifyPassword(pw, a.passwordHash)).toBe(true);
    const keep = run(["--email", "test.expert@example.com"], { CONFIRM_DB: "yes" }, "no\n");
    expect(keep.code).toBe(0);
    expect(keep.out).toMatch(/already a test expert login\. Reset the password\? \(yes\/no\)/);
    expect(keep.out).toMatch(/password was not changed/);
    expect((await inDb(async (db) => (await accountByEmail(db, "test.expert@example.com"))!)).passwordHash).toBe(a.passwordHash);
  });
});
