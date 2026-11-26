// The 26 Nov 2026 job board clean-up (src/lib/jobs/board-2026-11.ts): every new role passes the
// public-copy rules (no pay, no client's name), can be saved and opened, and the lists don't overlap.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import type { DB } from "@/db/client";
import { partners } from "@/db/schema";
import { DOMAINS, EMPLOYMENT_TYPES } from "@/lib/constants";
import { KEEP_INTERNAL, KEEP_PUBLIC, NEW_JOBS } from "@/lib/jobs/board-2026-11";
import { createJob, getJob, jobCopyProblems, setJobState } from "@/lib/server/jobs";

let db: DB;
let client: PGlite;
beforeAll(async () => {
  ({ db, client } = await openTestDb({ demo: false }));
});
afterAll(async () => {
  await client.close();
});

describe("job board 26 Nov 2026", () => {
  it("new roles never mention pay or the partner they're for", () => {
    for (const j of NEW_JOBS) {
      expect(jobCopyProblems(j, [], j.partnerName), j.title).toEqual([]);
      expect(`${j.title} ${j.summary} ${j.description}`, j.title).not.toMatch(/rustlabs|terac|trainplex|snorkel|afterquery|deccan/i);
      expect(j.domains.every((d) => (DOMAINS as readonly string[]).includes(d)), j.title).toBe(true);
      expect((EMPLOYMENT_TYPES as readonly string[]).includes(j.employmentType)).toBe(true);
      expect(j.closesOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("keeps, adds and closes different jobs (no title in two lists, no duplicates)", () => {
    const titles = [...KEEP_PUBLIC, ...KEEP_INTERNAL, ...NEW_JOBS.map((j) => j.title)];
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("each new role saves, links its partner internally and opens on the public board", async () => {
    const [rl] = await db.insert(partners).values({ name: "RustLabs" }).returning();
    for (const n of NEW_JOBS) {
      const { partnerName, ...data } = n;
      const r = await createJob(db, { email: "test@xocket.sh", role: "admin" }, { ...data, partnerId: partnerName === "RustLabs" ? rl.id : null, requirementId: null, internalRateNote: null, featured: false, visibility: "public" });
      expect(r, n.title).toMatchObject({ ok: true });
      if (!r.ok) continue;
      expect(await setJobState(db, { email: "test@xocket.sh", role: "admin" }, r.id, { status: "open", visibility: "public" }), n.title).toMatchObject({ ok: true });
      const found = await getJob(db, r.id);
      expect(found?.job).toMatchObject({ status: "open", visibility: "public", publicCompanyLabel: "AI data partner (via FynoLabs)" });
    }
  });
});
