// The expert portal's database side: linking a verified login to the expert record, onboarding steps,
// completeness, their applications (expert-facing wording, no internal notes) and deletion requests.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import { rowsOf, type DB } from "@/db/client";
import { accounts, applications, dataRequests, erasures, experts, jobs } from "@/db/schema";
import { linkExpertForAccount } from "@/lib/server/accounts";
import { deleteExpertOnRequest } from "@/lib/server/experts";
import { emailHash } from "@/lib/normalize";
import { completeness, ownApplications, ownProfile, requestDeletion, saveStep } from "@/lib/server/portal";

let db: DB;
let client: PGlite;
/** A verified expert login (as after sign-up and the emailed code), linked to its record. */
async function linkExpertAccount(db: DB, a: { email: string; name: string }) {
  const email = a.email.toLowerCase();
  let [row] = await db.select().from(accounts).where(eq(accounts.email, email));
  if (!row) [row] = await db.insert(accounts).values({ email, name: a.name, accountType: "expert", emailVerifiedAt: new Date() }).returning();
  return linkExpertForAccount(db, row);
}
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  ({ db, client } = await openTestDb({ demo: true }));
});
afterAll(async () => {
  await client.close();
});

describe("linking an expert account", () => {
  it("links an existing record by email, creates one on first sign-in, never brings back someone deleted", async () => {
    const asha = await linkExpertAccount(db, { email: "Asha-Example@Example.com", name: "Asha" });
    expect(asha).toMatchObject({ ok: true, created: false });
    const [row] = await db.select().from(experts).where(eq(experts.email, "asha-example@example.com"));
    expect(asha.ok && asha.expertId).toBe(row.id);
    expect(row.portalJoinedAt).toBeInstanceOf(Date);
    const fresh = await linkExpertAccount(db, { email: "first.time@example.org", name: "First Time" });
    expect(fresh).toMatchObject({ ok: true, created: true });
    const [f] = await db.select().from(experts).where(eq(experts.email, "first.time@example.org"));
    expect(f).toMatchObject({ fullName: "First Time", primarySource: "portal", status: "applicant" });
    expect(await linkExpertAccount(db, { email: "first.time@example.org", name: "Again" })).toMatchObject({ ok: true, created: false });
    await db.insert(erasures).values({ emailSha256: emailHash("forgotten@example.org"), actorEmail: "admin@xocket.sh" });
    expect(await linkExpertAccount(db, { email: "forgotten@example.org", name: "F" })).toEqual({ ok: false, reason: "erased" });
    expect(await db.$count(experts, eq(experts.email, "forgotten@example.org"))).toBe(0);
  });
});

describe("onboarding steps", () => {
  it("checks each step, saves it, and tracks progress and completeness", async () => {
    const link = await linkExpertAccount(db, { email: "steps@example.org", name: "Step Person" });
    if (!link.ok) throw new Error("no link");
    const id = link.expertId;
    expect(await saveStep(db, id, "basics", fd({ fullName: "", country: "Atlantis", linkedinUrl: "github.com/x" }))).toMatchObject({ ok: false, errors: { fullName: expect.any(String), country: expect.any(String), linkedinUrl: expect.any(String) } });
    expect(await saveStep(db, id, "basics", fd({ fullName: "Step Person", country: "india", city: "Pune", phone: "+91 98765 43210", linkedinUrl: "linkedin.com/in/step-person" }))).toEqual({ ok: true });
    expect(await saveStep(db, id, "expertise", fd({ skills: "" }))).toMatchObject({ ok: false, errors: { skills: expect.any(String) } });
    expect(await saveStep(db, id, "expertise", fd({ headline: "Statistician", domain: "Data science", skills: "R, statistics", languages: "English" }))).toEqual({ ok: true });
    expect(await saveStep(db, id, "experience", fd({ yearsExperience: "99" }))).toMatchObject({ ok: false });
    expect(await saveStep(db, id, "experience", fd({ yearsExperience: "4", highestDegree: "PhD", fieldOfStudy: "Statistics" }))).toEqual({ ok: true });
    expect(await saveStep(db, id, "cv", fd({}))).toMatchObject({ ok: false, errors: { file: expect.stringMatching(/CV/) } });
    expect(await saveStep(db, id, "availability", fd({ availability: "limited", hoursPerWeek: "12" }))).toEqual({ ok: true });
    expect(await saveStep(db, id, "consent", fd({ consent: "maybe" }))).toMatchObject({ ok: false });
    expect(await saveStep(db, id, "consent", fd({ consent: "yes" }))).toEqual({ ok: true });
    const p = (await ownProfile(db, id))!;
    expect(p).toMatchObject({ fullName: "Step Person", country: "India", skills: ["r", "statistics"], yearsExperience: 4, availability: "limited", hoursPerWeek: 12, cvConsent: "yes" });
    expect(p.onboardingDone).toEqual(["basics", "expertise", "experience", "availability", "consent"]);
    const c = completeness(p, false);
    expect(c.percent).toBe(92);
    expect(c.missing.map((m) => m.label)).toEqual(["CV"]);
    expect(completeness(p, true).percent).toBe(100);
    expect(p).not.toHaveProperty("notes");
    expect(p).not.toHaveProperty("rateExpectationUsd");
  });
});

describe("their applications and data requests", () => {
  it("shows the expert-facing status and never the team's note", async () => {
    const [riya] = await db.select().from(experts).where(eq(experts.email, "demo.expert@example.com"));
    await db.update(applications).set({ internalNote: "Secret team note", status: "submitted_to_partner" }).where(eq(applications.expertId, riya.id));
    const apps = await ownApplications(db, riya.id);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ title: "Scientific Coding Expert - Mathematics", statusLabel: "Profile shared for the role", linkable: true });
    expect(JSON.stringify(apps)).not.toContain("Secret team note");
    const [draft] = await db.select().from(jobs).where(eq(jobs.status, "draft")).limit(1);
    await db.insert(applications).values({ jobId: draft.id, expertId: riya.id, answers: {} });
    expect((await ownApplications(db, riya.id)).find((a) => a.slug === draft.slug)?.linkable).toBe(false);
  });

  it("records one open deletion request at a time; deleting the expert removes their applications and closes the request", async () => {
    const [riya] = await db.select().from(experts).where(eq(experts.email, "demo.expert@example.com"));
    expect((await requestDeletion(db, riya.id, "Please delete")).created).toBe(true);
    expect((await requestDeletion(db, riya.id, "Again")).created).toBe(false);
    expect(await deleteExpertOnRequest(db, riya.id, "admin@xocket.sh")).toBe(true);
    expect(await db.$count(applications, eq(applications.expertId, riya.id))).toBe(0);
    const [req] = await db.select().from(dataRequests);
    expect(req).toMatchObject({ expertId: null, status: "done", handledBy: "admin@xocket.sh" });
    const left = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from hub.activity where detail->>'expertId' = ${riya.id} and entity_type = 'application'`));
    expect(left[0].n).toBe(0);
    // Signing in again with that email doesn't bring the record back.
    expect(await linkExpertAccount(db, { email: "demo.expert@example.com", name: "Riya" })).toEqual({ ok: false, reason: "erased" });
  });
});
