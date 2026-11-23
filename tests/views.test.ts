import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import type { DB } from "@/db/client";
import { ForbiddenError, type Role } from "@/lib/auth/permissions";
import { createView, deleteView, getView, listViews, updateView } from "@/lib/server/views";
import {
  DEFAULT_COLUMNS,
  configFromParams,
  hasViewParams,
  normalizeConfig,
  paramsFromConfig,
  parseColumns,
  parsePageSize,
  sameConfig,
  serializeColumns,
  viewHref,
} from "@/lib/views";

describe("view config <-> URL", () => {
  it("round-trips filters, sort, columns and layout", () => {
    const sp = { q: "rust", domain: "Software", status: "bench", sort: "years", dir: "asc", cols: "skills,country", layout: "board", page: "3", view: "x" };
    const c = configFromParams(sp);
    expect(c).toEqual({ filters: { q: "rust", domain: "Software", status: "bench" }, sort: { by: "years", dir: "asc" }, columns: ["skills", "country"], layout: "board" });
    const back = configFromParams(Object.fromEntries(paramsFromConfig(c)));
    expect(back).toEqual(c);
    expect(paramsFromConfig(c).has("page")).toBe(false);
  });

  it("columns: defaults when missing, '-' for none, unknown ids dropped, table order kept", () => {
    expect(parseColumns(undefined)).toEqual(DEFAULT_COLUMNS);
    expect(parseColumns("-")).toEqual([]);
    expect(parseColumns("updated,bogus,domain")).toEqual(["domain", "updated"]);
    expect(serializeColumns([])).toBe("-");
    expect(paramsFromConfig({ filters: {}, sort: null, columns: [...DEFAULT_COLUMNS], layout: "table" }).toString()).toBe("");
  });

  it("compares configs and spots URLs without view params", () => {
    const a = configFromParams({ domain: "Physics", country: "India" });
    const b = configFromParams({ country: "India", domain: "Physics", page: "2" });
    expect(sameConfig(a, b)).toBe(true);
    expect(sameConfig(a, configFromParams({ domain: "Physics" }))).toBe(false);
    expect(hasViewParams({ v: "abc", page: "2" })).toBe(false);
    expect(hasViewParams({ v: "abc", layout: "board" })).toBe(true);
    expect(viewHref("abc", a)).toBe("/admin/experts?domain=Physics&country=India&v=abc");
    expect(viewHref(null, configFromParams({}))).toBe("/admin/experts");
  });

  it("cleans whatever is stored", () => {
    expect(normalizeConfig({ filters: { domain: "Law", evil: "x", q: 5 }, sort: { by: "name", dir: "sideways" }, columns: ["skills", "nope"], layout: "gallery" })).toEqual({
      filters: { domain: "Law" },
      sort: { by: "name", dir: "desc" },
      columns: ["skills"],
      layout: "table",
    });
    expect(normalizeConfig(null)).toEqual({ filters: {}, sort: null, columns: DEFAULT_COLUMNS, layout: "table" });
    expect(parsePageSize("100")).toBe(100);
    expect(parsePageSize("7")).toBe(50);
  });
});

describe("saved views in the database", () => {
  let db: DB;
  let client: PGlite;
  const u = (email: string, role: Role) => ({ email, role, partnerIds: [] as string[] });
  const rec = u("rec@xocket.sh", "recruiter");
  const other = u("other@xocket.sh", "recruiter");
  const viewer = u("viewer@xocket.sh", "viewer");
  const admin = u("admin@xocket.sh", "admin");
  const cfg = configFromParams({ domain: "Mathematics", status: "bench" });

  beforeAll(async () => {
    ({ db, client } = await openTestDb());
  });
  afterAll(async () => {
    await client.close();
  });

  it("creates personal and shared views; others see only the shared ones", async () => {
    const personal = await createView(db, rec, { name: "My maths", config: cfg, shared: false });
    const shared = await createView(db, rec, { name: "Team maths", config: cfg, shared: true });
    expect(personal.ok && shared.ok).toBe(true);
    expect((await listViews(db, rec)).map((v) => v.name)).toEqual(["My maths", "Team maths"]);
    expect((await listViews(db, other)).map((v) => v.name)).toEqual(["Team maths"]);
    if (personal.ok) expect(await getView(db, other, personal.id)).toBeNull();
    const [v] = await listViews(db, other);
    expect(v.config).toEqual(cfg);
  });

  it("needs a name and refuses a duplicate name for the same owner", async () => {
    expect(await createView(db, rec, { name: "  ", config: cfg, shared: false })).toEqual({ ok: false, reason: "Give the view a name." });
    expect(await createView(db, rec, { name: "my MATHS", config: cfg, shared: false })).toMatchObject({ ok: false });
    expect(await createView(db, other, { name: "My maths", config: cfg, shared: false })).toMatchObject({ ok: true });
  });

  it("viewers may save personal views but not share them", async () => {
    expect(await createView(db, viewer, { name: "Mine", config: cfg, shared: false })).toMatchObject({ ok: true });
    await expect(createView(db, viewer, { name: "Ours", config: cfg, shared: true })).rejects.toBeInstanceOf(ForbiddenError);
    const [mine] = await listViews(db, viewer).then((vs) => vs.filter((x) => x.ownerEmail === viewer.email));
    await expect(updateView(db, viewer, mine.id, { shared: true })).rejects.toThrow(/can't share views/);
  });

  it("only the owner or an admin may update or delete", async () => {
    const team = (await listViews(db, other)).find((v) => v.name === "Team maths")!;
    await expect(updateView(db, other, team.id, { config: configFromParams({ domain: "Physics" }) })).rejects.toThrow(/Only the person who made/);
    await expect(deleteView(db, other, team.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await updateView(db, rec, team.id, { config: configFromParams({ domain: "Physics" }) })).toEqual({ ok: true, id: team.id });
    expect((await getView(db, other, team.id))!.config.filters).toEqual({ domain: "Physics" });
    expect(await deleteView(db, admin, team.id)).toEqual({ ok: true, id: team.id });
    expect(await getView(db, rec, team.id)).toBeNull();
  });

  it("someone else's private view can't even be found", async () => {
    const [mine] = (await listViews(db, rec)).filter((v) => v.ownerEmail === rec.email);
    await expect(deleteView(db, other, mine.id)).rejects.toThrow(/no longer exists/);
    await expect(deleteView(db, rec, "not-a-uuid")).rejects.toThrow(/no longer exists/);
  });
});
