// npm run admin:create (scripts/create-admin.ts), run as a real command against a local PGlite
// folder (the test-only HUB_TEST_DB switch): the guards, creating the owner's admin, running it
// again (keep or reset the password), typed and generated passwords. The plain password is only
// ever printed (generated) and never lands in the database files.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openLocalDbWithClient } from "@/db/local/open";
import { accounts, teamMembers } from "@/db/schema";
import { passwordProblem, verifyPassword } from "@/lib/auth/password";

const tmp = mkdtempSync(path.join(os.tmpdir(), "admin-create-"));
const dir = path.join(tmp, "db");
const cli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const run = (args: string[], env: Record<string, string> = {}, input = "") => {
  const r = spawnSync(process.execPath, [cli, "scripts/create-admin.ts", ...args], {
    cwd: process.cwd(),
    // Only these variables: never the real .env.local values (loadEnv never overrides what is set here).
    env: { PATH: process.env.PATH ?? "", HOME: tmp, DATABASE_URL: "", CONFIRM_DB: "", HUB_TEST_DB: "pglite", HUB_TEST_DB_DIR: dir, ...env } as unknown as NodeJS.ProcessEnv,
    input,
    encoding: "utf8",
    timeout: 120_000,
  });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
};
async function inDb<T>(fn: (db: Awaited<ReturnType<typeof openLocalDbWithClient>>["db"]) => Promise<T>): Promise<T> {
  const { db, client } = await openLocalDbWithClient({ dataDir: dir });
  try {
    return await fn(db);
  } finally {
    await client.close();
  }
}
const owner = () => inDb(async (db) => (await db.select().from(accounts).where(eq(accounts.email, "prashant@xocket.sh")))[0]);
const printedPassword = (out: string) => /shown once, saved nowhere\):\s+(\S+)/.exec(out)?.[1] ?? null;
function filesContain(root: string, needle: string): boolean {
  const buf = Buffer.from(needle);
  for (const name of readdirSync(root)) {
    const p = path.join(root, name);
    if (statSync(p).isDirectory()) {
      if (filesContain(p, needle)) return true;
    } else if (readFileSync(p).includes(buf)) return true;
  }
  return false;
}

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("npm run admin:create", () => {
  it("refuses without CONFIRM_DB=yes, and explains the Neon steps without a database", () => {
    const unconfirmed = run(["--email", "prashant@xocket.sh", "--generate"]);
    expect(unconfirmed.code).toBe(1);
    expect(unconfirmed.out).toMatch(/Refusing: set CONFIRM_DB=yes/);
    expect(() => statSync(dir)).toThrow(); // nothing was created
    const none = run(["--email", "prashant@xocket.sh", "--generate"], { HUB_TEST_DB: "", CONFIRM_DB: "yes" });
    expect(none.code).toBe(1);
    expect(none.out).toMatch(/neon\.tech/);
    expect(none.out).toMatch(/DATABASE_URL=the string you copied/);
  });

  it("never prints a database password, even when the database can't be reached", () => {
    const r = run(["--email", "prashant@xocket.sh", "--generate"], { HUB_TEST_DB: "", CONFIRM_DB: "yes", DATABASE_URL: "postgresql://owner:Sup3r-Secret-pw@ep-nowhere-123.example.invalid/neondb?sslmode=require" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/owner@ep-nowhere-123\.example\.invalid\/neondb/);
    expect(r.out).not.toMatch(/Sup3r-Secret-pw/);
  });

  it("creates the owner's admin: team member with role admin, a verified team account, a strong generated password printed once", async () => {
    const r = run(["--email", "Prashant@Xocket.sh", "--name", "Prashant", "--generate"], { CONFIRM_DB: "yes" });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Created the admin account for prashant@xocket\.sh \(role: admin, email verified\)/);
    const pw = printedPassword(r.out)!;
    expect(pw).toHaveLength(20);
    expect(passwordProblem(pw, "prashant@xocket.sh")).toBeNull();
    expect(r.out.split(pw)).toHaveLength(2); // printed exactly once
    const a = await owner();
    expect(a).toMatchObject({ accountType: "team", name: "Prashant", mustChangePassword: true, disabledAt: null });
    expect(a.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await verifyPassword(pw, a.passwordHash)).toBe(true);
    const [m] = await inDb((db) => db.select().from(teamMembers).where(eq(teamMembers.email, "prashant@xocket.sh")));
    expect(m).toMatchObject({ role: "admin", active: true });
    expect(a.teamMemberId).toBe(m.id);
    expect(filesContain(dir, pw)).toBe(false);
  });

  it("running it again: keeps the password on 'no', resets it on 'yes'; still one account and one team row", async () => {
    const before = await owner();
    const keep = run(["--email", "prashant@xocket.sh", "--reset", "no"], { CONFIRM_DB: "yes" });
    expect(keep.code).toBe(0);
    expect(keep.out).toMatch(/password was not changed/);
    expect((await owner()).passwordHash).toBe(before.passwordHash);
    // Asked interactively (stdin): "yes", then a typed password twice.
    const typed = run(["--email", "prashant@xocket.sh"], { CONFIRM_DB: "yes" }, "yes\nPrashant-Owns-This-1\nPrashant-Owns-This-1\n");
    expect(typed.code).toBe(0);
    expect(typed.out).toMatch(/Reset the password\? \(yes\/no\)/);
    expect(typed.out).toMatch(/Your password is set/);
    expect(typed.out).not.toContain("Prashant-Owns-This-1");
    const after = await owner();
    expect(after.mustChangePassword).toBe(false);
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect(await verifyPassword("Prashant-Owns-This-1", after.passwordHash)).toBe(true);
    const counts = await inDb(async (db) => ({ a: await db.$count(accounts), m: await db.$count(teamMembers) }));
    expect(counts).toEqual({ a: 1, m: 1 });
    expect(filesContain(dir, "Prashant-Owns-This-1")).toBe(false);
  });

  it("typed passwords follow the rules; three bad tries change nothing; Enter generates one", async () => {
    const before = await owner();
    const bad = run(["--email", "prashant@xocket.sh", "--reset", "yes"], { CONFIRM_DB: "yes" }, "short\npassword123\nGood-Enough-Pass-9\nDifferent-Pass-99\n");
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/at least 10 characters/);
    expect(bad.out).toMatch(/too common/);
    expect(bad.out).toMatch(/didn't match/);
    expect((await owner()).passwordHash).toBe(before.passwordHash);
    const enter = run(["--email", "prashant@xocket.sh", "--reset", "yes"], { CONFIRM_DB: "yes" }, "\n");
    expect(enter.code).toBe(0);
    const pw = printedPassword(enter.out)!;
    expect(await verifyPassword(pw, (await owner()).passwordHash)).toBe(true);
    expect((await owner()).mustChangePassword).toBe(true);
  });
});
