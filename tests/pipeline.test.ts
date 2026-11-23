// The FynoLabs structure for new applications too: a public application (or a portal sign-up)
// writes one expert, a pipeline at Applied, timeline entries and the documents, like FynoLabs does.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import type { DB } from "@/db/client";
import { accounts, applications, erasures, expertActivities, expertFiles, experts, type Job } from "@/db/schema";
import { emptyJobValues, parseJobForm } from "@/lib/forms/job";
import { answerInputFrom, inputName, type FieldDef } from "@/lib/forms/job-fields";
import { checkStatement } from "@/lib/migration-guard";
import { REFUSED_MESSAGE, setApplicationStatus, submitApplication } from "@/lib/server/applications";
import { linkExpertForAccount } from "@/lib/server/accounts";
import { emailMd5 } from "@/lib/server/erasure";
import { createJob, getJob, jobFields, setJobState } from "@/lib/server/jobs";
import { timelineFor } from "@/lib/server/timeline";

let db: DB;
let client: PGlite;
let job: Job;
let fields: FieldDef[];
const admin = { email: "admin@xocket.sh", role: "admin" as const, partnerIds: [] };
const key = (k: string) => inputName(fields.find((f) => f.mapsTo === k)!.id);
const pdf = () => {
  const bytes = new TextEncoder().encode("%PDF-1.4 pipeline");
  return { name: "cv.pdf", type: "application/pdf", size: bytes.byteLength, bytes };
};
const apply = (email: string) =>
  submitApplication(db, {
    job,
    fields,
    answers: answerInputFrom({ [key("full_name")]: "Pia Pipeline", [key("email")]: email, [key("country")]: "India", [key("linkedin_url")]: `https://www.linkedin.com/in/${email.split("@")[0].toLowerCase().replace(/\W/g, "-")}`, [key("years_experience")]: "4", [key("skills")]: "Python", [key("cv")]: pdf(), [key("cv_consent")]: "yes" }),
    applicant: { kind: "guest" },
    ip: null,
    source: {},
  });

beforeAll(async () => {
  ({ db, client } = await openTestDb());
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...emptyJobValues(), title: "Pipeline test job" })) if (!Array.isArray(v)) fd.set(k, v);
  const res = await createJob(db, admin, parseJobForm(fd).data!);
  if (!res.ok) throw new Error(res.reason);
  await setJobState(db, admin, res.id, { status: "open" });
  job = (await getJob(db, res.id))!.job;
  fields = await jobFields(db, job.id);
});
afterAll(async () => {
  await client.close();
});

describe("a new public application", () => {
  it("creates the expert, a pipeline at Applied, the CV and timeline entries", async () => {
    const res = await apply("pia.pipeline@example.org");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [app] = await db.select().from(applications).where(eq(applications.id, res.applicationId));
    expect(app).toMatchObject({ stage: "new", status: "new", channel: "applied", expertId: res.expertId });
    expect(app.consentAt).toBeInstanceOf(Date);
    expect(await db.$count(expertFiles, and(eq(expertFiles.expertId, res.expertId), eq(expertFiles.kind, "cv")))).toBe(1);
    const t = await timelineFor(db, res.expertId);
    expect(t.map((x) => [x.kind, x.summary]).sort()).toEqual([
      ["application", "Applied to Pipeline test job"],
      ["consent", "Consent to share their profile and CV recorded (job form)"],
    ]);
  });

  it("applying again keeps one pipeline and adds to the timeline", async () => {
    const res = await apply("Pia.Pipeline@example.org");
    expect(res).toMatchObject({ ok: true, reapplied: true });
    if (!res.ok) return;
    expect(await db.$count(applications, eq(applications.expertId, res.expertId))).toBe(1);
    expect((await timelineFor(db, res.expertId)).some((x) => x.summary === "Applied again to Pipeline test job")).toBe(true);
  });

  it("moving the status moves the stage, and the timeline says so", async () => {
    const [e] = await db.select().from(experts).where(eq(experts.email, "pia.pipeline@example.org"));
    const [app] = await db.select().from(applications).where(eq(applications.expertId, e.id));
    await setApplicationStatus(db, { email: "rec@xocket.sh", role: "recruiter" }, job.id, [app.id], "submitted_to_partner");
    const [after] = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(after).toMatchObject({ status: "submitted_to_partner", stage: "referred" });
    expect(after.stageChangedAt.getTime()).toBeGreaterThan(app.stageChangedAt.getTime() - 1);
    const t = await timelineFor(db, e.id);
    expect(t[0]).toMatchObject({ kind: "stage", summary: "Stage: Applied -> Proposed to client", createdBy: "rec@xocket.sh" });
  });

  it("someone the FynoLabs admin erased (MD5 only) is refused, like the hub's own erasures", async () => {
    await db.insert(erasures).values({ emailMd5: emailMd5("erased.fyno@example.org"), actorEmail: "fynolabs" });
    expect(await apply("erased.fyno@example.org")).toMatchObject({ ok: false, kind: "refused", message: REFUSED_MESSAGE });
    expect(await db.$count(experts, eq(experts.email, "erased.fyno@example.org"))).toBe(0);
  });
});

describe("a portal sign-up", () => {
  it("creates one expert record with a timeline entry", async () => {
    const [acc] = await db.insert(accounts).values({ email: "new.portal@example.org", name: "New Portal", accountType: "expert", emailVerifiedAt: new Date() }).returning();
    const r = await linkExpertForAccount(db, acc);
    expect(r).toMatchObject({ ok: true, created: true });
    if (!r.ok) return;
    expect(await db.select({ kind: expertActivities.kind, summary: expertActivities.summary }).from(expertActivities).where(eq(expertActivities.expertId, r.expertId))).toEqual([{ kind: "system", summary: "Signed up on the expert portal" }]);
  });
});

describe("migration guard", () => {
  it("allows data fixes inside hub, nowhere else", () => {
    expect(checkStatement(`UPDATE "hub"."applications" SET "stage" = 'new';`)).toBeNull();
    expect(checkStatement(`INSERT INTO "hub"."settings" ("key", "value") VALUES ('a', '1');`)).toBeNull();
    expect(checkStatement(`UPDATE "public"."talent_profiles" SET "name" = 'x';`)).not.toBeNull();
    expect(checkStatement(`UPDATE "hub"."applications" SET "x" = (SELECT 1 FROM "fynolabs_copy"."leads");`)).not.toBeNull();
    expect(checkStatement(`INSERT INTO "fynolabs_copy"."leads" VALUES (1);`)).not.toBeNull();
  });
});
