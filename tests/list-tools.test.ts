// The CRM list tools (27 Nov 2026): saved views (tabs) on Accounts and Leads, the columns and paging
// helpers, the bulk bar's server logic (stage, owner, priority, tags, type, follow-up, account,
// delete) and the CSV exports (lead emails masked for roles that can't see contacts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { openTestDb } from "./fixtures/db";
import type { DB } from "@/db/client";
import { activity, companyActivities, placements, teamMembers } from "@/db/schema";
import type { Role } from "@/lib/auth/permissions";
import { parseCsv } from "@/lib/csv";
import {
  ACCOUNT_LIST,
  LEAD_LIST,
  hasListViewParams,
  listConfigFromParams,
  listParamsFromConfig,
  listViewHref,
  normalizeListConfig,
  pageOf,
  parseListColumns,
  sameListConfig,
} from "@/lib/list-views";
import { createCompany, getCompany } from "@/lib/server/companies";
import { allContacts, createContact, getContact } from "@/lib/server/contacts";
import { bulkAccounts, bulkLeads, bulkSummary, cleanIds } from "@/lib/server/crm-bulk";
import { accountsCsv, idsParam, leadsCsv, pickRows } from "@/lib/server/crm-export";
import { createView, deleteView, getListView, getView, listListViews, listViews, updateView } from "@/lib/server/views";
import { configFromParams } from "@/lib/views";

describe("list view config <-> URL (Accounts, Leads)", () => {
  it("round-trips the tab, filters, columns and layout; page, size and the panel are not part of a view", () => {
    const sp = { tab: "due", q: "acme", stage: "talking", owner: "me", cols: "stage,owner,tags", layout: "board", page: "2", size: "25", view: "x", v: "y" };
    const c = listConfigFromParams(ACCOUNT_LIST, sp);
    expect(c).toEqual({ filters: { tab: "due", q: "acme", stage: "talking", owner: "me" }, sort: null, columns: ["stage", "owner", "tags"], layout: "board" });
    expect(listConfigFromParams(ACCOUNT_LIST, Object.fromEntries(listParamsFromConfig(ACCOUNT_LIST, c)))).toEqual(c);
    const p = listParamsFromConfig(ACCOUNT_LIST, c);
    expect(["page", "size", "view", "v"].some((k) => p.has(k))).toBe(false);
  });

  it("columns: URL first, then the remembered cookie, then the defaults; unknown ids dropped", () => {
    expect(listConfigFromParams(LEAD_LIST, {}).columns).toEqual(LEAD_LIST.defaultColumns);
    expect(listConfigFromParams(LEAD_LIST, {}, "kind,role").columns).toEqual(["role", "kind"]);
    expect(listConfigFromParams(LEAD_LIST, { cols: "stage" }, "kind,role").columns).toEqual(["stage"]);
    expect(parseListColumns(LEAD_LIST, "-")).toEqual([]);
    expect(parseListColumns(LEAD_LIST, "bogus,email")).toEqual(["email"]);
    expect(listParamsFromConfig(LEAD_LIST, listConfigFromParams(LEAD_LIST, {})).toString()).toBe("");
  });

  it("cleans stored configs, compares them and builds links", () => {
    expect(normalizeListConfig(ACCOUNT_LIST, { filters: { stage: "pilot", evil: "x", q: 3 }, columns: ["due", "nope"], layout: "gallery", sort: { by: "x" } })).toEqual({ filters: { stage: "pilot" }, sort: null, columns: ["due"], layout: "table" });
    expect(normalizeListConfig(ACCOUNT_LIST, null).columns).toEqual(ACCOUNT_LIST.defaultColumns);
    const a = listConfigFromParams(ACCOUNT_LIST, { stage: "pilot", kind: "client" });
    expect(sameListConfig(ACCOUNT_LIST, a, listConfigFromParams(ACCOUNT_LIST, { kind: "client", stage: "pilot", page: "3" }))).toBe(true);
    expect(sameListConfig(ACCOUNT_LIST, a, listConfigFromParams(ACCOUNT_LIST, { stage: "pilot" }))).toBe(false);
    expect(hasListViewParams(ACCOUNT_LIST, { v: "abc", page: "2", size: "25" })).toBe(false);
    expect(hasListViewParams(ACCOUNT_LIST, { v: "abc", tab: "all" })).toBe(true);
    expect(listViewHref(ACCOUNT_LIST, "abc", a, { size: "25" })).toBe("/admin/accounts?kind=client&stage=pilot&v=abc&size=25");
    expect(listViewHref(LEAD_LIST, null, listConfigFromParams(LEAD_LIST, {}))).toBe("/admin/leads");
  });

  it("pages a list held in memory", () => {
    const rows = Array.from({ length: 120 }, (_, i) => i);
    expect(pageOf(rows, null, null)).toMatchObject({ page: 1, size: 50, pages: 3, total: 120 });
    expect(pageOf(rows, "3", "50").rows).toEqual(rows.slice(100));
    expect(pageOf(rows, "9", "25")).toMatchObject({ page: 5, size: 25, pages: 5 });
    expect(pageOf(rows, "-1", "7")).toMatchObject({ page: 1, size: 50 });
    expect(pageOf([], "2", "25")).toMatchObject({ page: 1, pages: 1, total: 0, rows: [] });
  });
});

const u = (email: string, role: Role) => ({ email, role, partnerIds: [] as string[] });
const rec = u("rec@xocket.sh", "recruiter");
const other = u("other@xocket.sh", "recruiter");
const admin = u("admin@xocket.sh", "admin");

describe("saved views on Accounts and Leads", () => {
  let db: DB;
  let client: PGlite;
  beforeAll(async () => {
    ({ db, client } = await openTestDb());
  });
  afterAll(async () => {
    await client.close();
  });

  it("keeps each list's views apart and cleans them by the list's own rules", async () => {
    const cfg = listConfigFromParams(ACCOUNT_LIST, { tab: "due", owner: "me", cols: "stage,tags" });
    const acc = await createView(db, rec, { name: "My due", config: cfg, shared: true }, "accounts");
    const lead = await createView(db, rec, { name: "My due", config: listConfigFromParams(LEAD_LIST, { followUp: "due" }), shared: false }, "leads");
    const exp = await createView(db, rec, { name: "My due", config: configFromParams({ status: "bench" }), shared: false });
    expect(acc.ok && lead.ok && exp.ok).toBe(true);
    if (!acc.ok || !lead.ok || !exp.ok) return;
    expect((await listListViews(db, rec, "accounts")).map((v) => [v.name, v.config])).toEqual([["My due", cfg]]);
    expect((await listListViews(db, rec, "leads"))[0].config.filters).toEqual({ followUp: "due" });
    expect((await listViews(db, rec)).map((v) => v.id)).toEqual([exp.id]);
    // A view opens only on its own list.
    expect(await getListView(db, rec, acc.id, "accounts")).not.toBeNull();
    expect(await getListView(db, rec, acc.id, "leads")).toBeNull();
    expect(await getView(db, rec, acc.id)).toBeNull();
  });

  it("shares with the team; only the owner or an admin changes or deletes", async () => {
    const [shared] = await listListViews(db, other, "accounts");
    expect(shared.name).toBe("My due");
    expect(await listListViews(db, other, "leads")).toEqual([]);
    const next = listConfigFromParams(ACCOUNT_LIST, { tab: "all", stage: "pilot" });
    await expect(updateView(db, other, shared.id, { config: next })).rejects.toThrow(/Only the person who made/);
    expect(await updateView(db, rec, shared.id, { config: next })).toEqual({ ok: true, id: shared.id });
    expect((await getListView(db, other, shared.id, "accounts"))!.config.filters).toEqual({ tab: "all", stage: "pilot" });
    expect(await deleteView(db, admin, shared.id)).toEqual({ ok: true, id: shared.id });
    expect(await listListViews(db, rec, "accounts")).toEqual([]);
  });
});

describe("bulk actions on Accounts and Leads", () => {
  let db: DB;
  let client: PGlite;
  const ids: string[] = [];
  let memberId = "";
  beforeAll(async () => {
    ({ db, client } = await openTestDb());
    const [m] = await db.insert(teamMembers).values({ email: "nitin@xocket.sh", name: "Nitin", role: "recruiter" }).returning();
    memberId = m.id;
    for (const name of ["Acme", "Beta Labs", "Gamma"]) {
      const r = await createCompany(db, { name, tags: name === "Acme" ? ["warm"] : [] }, rec);
      if (r.ok) ids.push(r.id);
    }
  });
  afterAll(async () => {
    await client.close();
  });

  it("cleans the ticked ids", () => {
    expect(cleanIds(["x", ids[0], ids[0], "", null, ids[1]])).toEqual([ids[0], ids[1]]);
  });

  it("changes the stage of each, with the stage activity and the log, and counts the ones already there", async () => {
    const r = await bulkAccounts(db, [ids[0], ids[1]], { op: "stage", stage: "talking" }, rec);
    expect(r).toEqual({ ok: true, changed: 2, unchanged: 0, skipped: [] });
    expect((await getCompany(db, ids[0]))!.stage).toBe("talking");
    const acts = await db.select().from(companyActivities).where(and(eq(companyActivities.companyId, ids[1]), eq(companyActivities.kind, "stage")));
    expect(acts.map((a) => a.summary)).toEqual(["Researching → Talking"]);
    const logged = await db.select().from(activity).where(and(eq(activity.entityId, ids[0]), eq(activity.action, "stage_changed")));
    expect(logged).toHaveLength(1);
    const again = await bulkAccounts(db, [ids[0], ids[2]], { op: "stage", stage: "talking" }, rec);
    expect(again).toMatchObject({ changed: 1, unchanged: 1 });
    expect(await bulkAccounts(db, ids, { op: "stage", stage: "won-ish" }, rec)).toEqual({ ok: false, reason: "Pick a stage." });
    expect(await bulkAccounts(db, ["nope"], { op: "stage", stage: "talking" }, rec)).toEqual({ ok: false, reason: "Tick at least one account." });
  });

  it("assigns an owner and a priority", async () => {
    expect(await bulkAccounts(db, ids, { op: "owner", owner: `tm:${memberId}` }, rec)).toMatchObject({ changed: 3 });
    expect((await getCompany(db, ids[2]))!.ownerMemberName).toBe("Nitin");
    expect(await bulkAccounts(db, ids, { op: "owner", owner: `tm:${memberId}` }, rec)).toMatchObject({ changed: 0, unchanged: 3 });
    expect(await bulkAccounts(db, [ids[0]], { op: "owner", owner: "none" }, rec)).toMatchObject({ changed: 1 });
    expect((await getCompany(db, ids[0]))!.ownerTeamMemberId).toBeNull();
    expect(await bulkAccounts(db, [ids[1]], { op: "priority", priority: "high" }, rec)).toMatchObject({ changed: 1 });
    expect((await getCompany(db, ids[1]))!.priority).toBe("high");
  });

  it("adds and removes tags without touching the others", async () => {
    expect(await bulkAccounts(db, ids, { op: "add_tags", tags: "Q1, warm" }, rec)).toMatchObject({ changed: 3 });
    expect((await getCompany(db, ids[0]))!.tags).toEqual(["warm", "q1"]);
    expect((await getCompany(db, ids[1]))!.tags).toEqual(["q1", "warm"]);
    expect(await bulkAccounts(db, ids, { op: "remove_tags", tags: "warm" }, rec)).toMatchObject({ changed: 3 });
    expect((await getCompany(db, ids[0]))!.tags).toEqual(["q1"]);
    expect(await bulkAccounts(db, ids, { op: "add_tags", tags: " , " }, rec)).toEqual({ ok: false, reason: "Type at least one tag." });
  });

  it("deletes, skipping an account that has placements", async () => {
    const [p] = await db.select().from(placements).limit(1);
    const keep = p?.partnerId ?? null;
    const extra = await createCompany(db, { name: "Delta" }, rec);
    if (!extra.ok) throw new Error(extra.reason);
    const r = await bulkAccounts(db, [extra.id, ...(keep ? [keep] : [])], { op: "delete" }, admin);
    expect(r).toMatchObject({ ok: true, changed: 1 });
    expect(await getCompany(db, extra.id)).toBeNull();
    if (r.ok) expect(bulkSummary(r, "deleted")).toMatch(/^1 deleted/);
  });

  it("leads: stage, type, follow-up, account and delete", async () => {
    const lids: string[] = [];
    for (const name of ["Asha", "Ben", "Chen"]) {
      const r = await createContact(db, { name, email: `${name.toLowerCase()}@example.com` }, rec);
      if (r.ok) lids.push(r.id);
    }
    expect(await bulkLeads(db, lids, { op: "stage", stage: "call" }, rec)).toMatchObject({ changed: 3 });
    expect((await getContact(db, lids[0]))!.stage).toBe("call");
    expect(await bulkLeads(db, lids, { op: "kind", kind: "partner" }, rec)).toMatchObject({ changed: 3 });
    expect(await bulkLeads(db, lids, { op: "kind", kind: "partner" }, rec)).toMatchObject({ changed: 0, unchanged: 3 });
    expect(await bulkLeads(db, [lids[1]], { op: "follow_up", date: "2026-12-01" }, rec)).toMatchObject({ changed: 1 });
    expect((await getContact(db, lids[1]))!.nextFollowUp).toBe("2026-12-01");
    expect(await bulkLeads(db, [lids[1]], { op: "follow_up", date: null }, rec)).toMatchObject({ changed: 1 });
    expect((await getContact(db, lids[1]))!.nextFollowUp).toBeNull();
    expect(await bulkLeads(db, lids, { op: "account", companyId: ids[0] }, rec)).toMatchObject({ changed: 3 });
    expect((await getContact(db, lids[2]))!.companyName).toBe("Acme");
    expect(await bulkLeads(db, [lids[2]], { op: "account", companyId: null }, rec)).toMatchObject({ changed: 1 });
    expect((await getContact(db, lids[2]))!.companyId).toBeNull();
    expect(await bulkLeads(db, lids, { op: "stage", stage: "maybe" }, rec)).toEqual({ ok: false, reason: "Pick a stage." });
    expect(await bulkLeads(db, lids, { op: "delete" }, admin)).toMatchObject({ changed: 3 });
    expect(await getContact(db, lids[0])).toBeNull();
    const logged = await db.select().from(activity).where(and(eq(activity.entityId, lids[0]), eq(activity.action, "deleted")));
    expect(logged).toHaveLength(1);
  });

  it("exports: the ticked rows only; lead emails masked for roles without contact rights", async () => {
    const r = await createContact(db, { name: "Dana", email: "dana.lee@example.com", companyId: ids[0] }, rec);
    expect(r.ok).toBe(true);
    const leads = await allContacts(db);
    const plain = parseCsv(leadsCsv(leads, "recruiter"));
    expect(plain.rows.find((x) => x.Name === "Dana")!.Email).toBe("dana.lee@example.com");
    const masked = parseCsv(leadsCsv(leads, "viewer"));
    expect(masked.rows.find((x) => x.Name === "Dana")!.Email).not.toContain("dana.lee");
    expect(masked.rows.find((x) => x.Name === "Dana")!.Account).toBe("Acme");
    const acme = (await getCompany(db, ids[0]))!;
    const beta = (await getCompany(db, ids[1]))!;
    expect(pickRows([acme, beta], [beta.id]).map((c) => c.name)).toEqual(["Beta Labs"]);
    expect(pickRows([acme, beta], [])).toHaveLength(2);
    const csv = parseCsv(accountsCsv([acme]));
    expect(csv.rows[0]).toMatchObject({ Account: "Acme", Stage: "Talking", Tags: "q1" });
    expect(idsParam(new URLSearchParams("ids=a,b&ids=c"))).toEqual(["a", "b", "c"]);
  });
});
