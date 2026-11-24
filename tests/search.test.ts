// The admin's Ctrl K search (src/lib/server/search.ts): six sections with a title and one line of
// context, a few of each until something is typed, emails masked for viewers and never searched by
// them, and only the sections the person may open. In-memory PGlite with the fictional test data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { DB } from "@/db/client";
import { SEARCH_IDLE_LIMIT, searchAdmin } from "@/lib/server/search";
import { seedCrm } from "./fixtures/crm-data";
import { openTestDb } from "./fixtures/db";

let db: DB;
let client: PGlite;
beforeAll(async () => {
  ({ db, client } = await openTestDb({ demo: true }));
  await seedCrm(db);
});
afterAll(async () => {
  await client.close();
});

const admin = { role: "admin" as const, sections: null };
const viewer = { role: "viewer" as const, sections: null };

describe("admin search", () => {
  it("shows a few of each section until something is typed", async () => {
    const r = await searchAdmin(db, admin, "");
    expect(Object.keys(r)).toEqual(["experts", "accounts", "leads", "jobs", "platforms", "messages"]);
    for (const hits of Object.values(r)) expect(hits.length).toBeLessThanOrEqual(SEARCH_IDLE_LIMIT);
    expect(r.experts.length).toBeGreaterThan(0);
    expect(r.platforms.length).toBeGreaterThan(0);
    expect(r.experts[0].href).toMatch(/^\/admin\/experts\//);
    expect(r.leads.every((h) => h.href.startsWith("/admin/leads?view="))).toBe(true);
    expect(r.messages.every((h) => h.href.startsWith("/admin/messages?view="))).toBe(true);
  });

  it("finds platforms by name with domain and kind as the context line", async () => {
    const r = await searchAdmin(db, admin, "gridwork");
    expect(r.platforms[0]).toMatchObject({ title: "Gridwork (demo)", hint: "example.com · platform" });
    expect(r.experts).toEqual([]);
  });

  it("masks emails for viewers and does not search by them", async () => {
    const full = await searchAdmin(db, admin, "");
    const withEmail = full.experts.find((h) => h.hint?.includes("@"));
    expect(withEmail).toBeTruthy();
    const masked = await searchAdmin(db, viewer, "");
    for (const h of [...masked.experts, ...masked.leads, ...masked.messages]) {
      const email = h.hint?.split(" · ").find((p) => p.includes("@"));
      if (email) expect(email).toMatch(/^.•••@/);
    }
    const local = withEmail!.hint!.split(" · ")[0].split("@")[0];
    const byEmail = await searchAdmin(db, viewer, `${local}@`);
    expect(byEmail.experts).toEqual([]);
    expect((await searchAdmin(db, admin, `${local}@`)).experts.length).toBeGreaterThan(0);
  });

  it("leaves out sections the person cannot open, and treats % and _ as text", async () => {
    const r = await searchAdmin(db, { role: "recruiter" as const, sections: ["profiles"] }, "");
    expect(r.experts.length).toBeGreaterThan(0);
    expect([r.accounts, r.leads, r.platforms, r.messages]).toEqual([[], [], [], []]);
    const none = await searchAdmin(db, admin, "%_%");
    expect(Object.values(none).flat()).toEqual([]);
  });
});
