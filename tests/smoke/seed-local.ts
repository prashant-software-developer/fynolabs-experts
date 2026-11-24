// Local smoke tests only (never a real database): fills a PGlite folder with the fictional test
// data (experts, jobs, the CRM side, the talent screens) and three logins: an admin, a viewer and an expert, all with
// the password in SMOKE_PASSWORD. Then run the app on that folder:
//
//   HUB_TEST_DB_DIR=.data/smoke SMOKE_PASSWORD=... npx tsx tests/smoke/seed-local.ts
//   HUB_TEST_DB=pglite HUB_TEST_DB_DIR=.data/smoke AUTH_SECRET=dev-only-secret npm run dev
//
// Sign in as smoke.admin@example.com, smoke.viewer@example.com or smoke.expert@example.com.
import { eq } from "drizzle-orm";
import { openLocalDbWithClient } from "../../src/db/local/open";
import { accounts, teamMembers } from "../../src/db/schema";
import { hashPassword } from "../../src/lib/auth/password";
import { upsertAdminAccount } from "../../src/lib/server/admin-account";
import { seedIfEmpty } from "../fixtures/demo-data";
import { seedJobsIfEmpty } from "../fixtures/demo-jobs";
import { seedCrm } from "../fixtures/crm-data";
import { seedTalentIfEmpty } from "../fixtures/talent-data";

async function main() {
  if ((process.env.DATABASE_URL ?? "").trim()) throw new Error("Refusing: DATABASE_URL is set. This is for a local PGlite folder only.");
  const dir = (process.env.HUB_TEST_DB_DIR ?? "").trim();
  const password = process.env.SMOKE_PASSWORD ?? "";
  if (!dir) throw new Error("Set HUB_TEST_DB_DIR to the PGlite folder.");
  if (password.length < 10) throw new Error("Set SMOKE_PASSWORD (10+ characters).");
  const { db, client } = await openLocalDbWithClient({ dataDir: dir, jobsStub: true });
  const fresh = await seedIfEmpty(db);
  await seedJobsIfEmpty(db);
  if (fresh) {
    await seedCrm(db);
    await seedTalentIfEmpty(db, { alongside: true });
  }
  await upsertAdminAccount(db, { email: "smoke.admin@example.com", name: "Smoke Admin", password, generated: false, actor: "smoke-seed" });
  const hash = await hashPassword(password);
  const now = new Date();
  const [viewerMember] = await db.insert(teamMembers).values({ email: "smoke.viewer@example.com", name: "Smoke Viewer", role: "viewer", createdBy: "smoke-seed" }).onConflictDoNothing().returning();
  const vm = viewerMember ?? (await db.select().from(teamMembers).where(eq(teamMembers.email, "smoke.viewer@example.com")))[0];
  await db.insert(accounts).values({ email: "smoke.viewer@example.com", name: "Smoke Viewer", accountType: "team", teamMemberId: vm.id, passwordHash: hash, passwordSetAt: now, emailVerifiedAt: now, createdBy: "smoke-seed" }).onConflictDoNothing();
  await db.insert(accounts).values({ email: "smoke.expert@example.com", name: "Smoke Expert", accountType: "expert", expertId: null, passwordHash: hash, passwordSetAt: now, emailVerifiedAt: now, createdBy: "smoke-seed" }).onConflictDoNothing();
  await client.close();
  console.log(`Seeded ${dir} (fresh: ${fresh}).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
