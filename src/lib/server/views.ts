// Saved views (hub.saved_views). Each function takes the signed-in user and checks the rules itself:
// anyone may save personal views; sharing needs views.share; only the owner or an admin may change
// or delete one; everyone sees their own views plus the shared ones.
import { and, asc, eq, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { savedViews, type SavedView } from "@/db/schema";
import { canManageView, canSeeView, ensure, ForbiddenError, type Subject } from "@/lib/auth/permissions";
import { cleanText } from "@/lib/normalize";
import { LIST_SPECS, isListCollection, normalizeListConfig, type ListViewConfig } from "@/lib/list-views";
import { normalizeConfig, type ViewConfig } from "@/lib/views";
import { isUuid } from "./experts";

export type ViewUser = Subject;
export type ViewResult = { ok: true; id: string } | { ok: false; reason: string };
export type ViewRow = Omit<SavedView, "config"> & { config: ViewConfig };
/** A saved view on the Accounts or Leads list. */
export type ListViewRow = Omit<SavedView, "config"> & { config: ListViewConfig };

/** Each list cleans its own config: Accounts and Leads by their list spec, the rest as Experts. */
const normalizeFor = (collection: string, raw: unknown) => (isListCollection(collection) ? normalizeListConfig(LIST_SPECS[collection], raw) : normalizeConfig(raw));
const toRow = (v: SavedView): ViewRow => ({ ...v, config: normalizeFor(v.collection, v.config) as ViewConfig });

export async function listListViews(db: DB, user: ViewUser, collection: "accounts" | "leads"): Promise<ListViewRow[]> {
  return (await listViews(db, user, collection)) as unknown as ListViewRow[];
}

export async function getListView(db: DB, user: ViewUser, id: string, collection: "accounts" | "leads"): Promise<ListViewRow | null> {
  return (await getView(db, user, id, collection)) as unknown as ListViewRow | null;
}

export async function listViews(db: DB, user: ViewUser, collection = "experts"): Promise<ViewRow[]> {
  ensure(user, "views.save");
  const rows = await db
    .select()
    .from(savedViews)
    .where(and(eq(savedViews.collection, collection), or(eq(savedViews.ownerEmail, user.email), eq(savedViews.shared, true))))
    .orderBy(sql`case when ${savedViews.ownerEmail} = ${user.email} then 0 else 1 end`, asc(savedViews.name));
  return rows.map(toRow);
}

export async function getView(db: DB, user: ViewUser, id: string, collection = "experts"): Promise<ViewRow | null> {
  if (!isUuid(id)) return null;
  const [v] = await db.select().from(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.collection, collection))).limit(1);
  if (!v || !canSeeView(user, v)) return null;
  return toRow(v);
}

function cleanName(raw: unknown): string | null {
  const n = cleanText(raw, 60);
  return n && n.length >= 1 ? n : null;
}

export async function createView(db: DB, user: ViewUser, input: { name: unknown; config: ViewConfig | ListViewConfig; shared: boolean }, collection = "experts"): Promise<ViewResult> {
  ensure(user, "views.save");
  if (input.shared) ensure(user, "views.share");
  const name = cleanName(input.name);
  if (!name) return { ok: false, reason: "Give the view a name." };
  const [clash] = await db
    .select({ id: savedViews.id })
    .from(savedViews)
    .where(and(eq(savedViews.collection, collection), eq(savedViews.ownerEmail, user.email), sql`lower(${savedViews.name}) = ${name.toLowerCase()}`))
    .limit(1);
  if (clash) return { ok: false, reason: `You already have a view called "${name}".` };
  const now = new Date();
  const [row] = await db
    .insert(savedViews)
    .values({ ownerEmail: user.email, name, collection, config: normalizeFor(collection, input.config) as unknown as Record<string, unknown>, shared: input.shared, createdAt: now, updatedAt: now })
    .returning({ id: savedViews.id });
  return { ok: true, id: row.id };
}

async function manageable(db: DB, user: ViewUser, id: string, verb: string): Promise<SavedView> {
  const [v] = isUuid(id) ? await db.select().from(savedViews).where(eq(savedViews.id, id)).limit(1) : [];
  if (!v || !canSeeView(user, v)) throw new ForbiddenError("views.save", "That view no longer exists.");
  if (!canManageView(user, v)) throw new ForbiddenError("views.manage_any", `Only the person who made "${v.name}" (or an admin) can ${verb} it.`);
  return v;
}

export async function updateView(db: DB, user: ViewUser, id: string, patch: { name?: unknown; config?: ViewConfig | ListViewConfig; shared?: boolean }): Promise<ViewResult> {
  ensure(user, "views.save");
  const v = await manageable(db, user, id, "change");
  if (patch.shared === true && !v.shared) ensure(user, "views.share");
  const set: Partial<typeof savedViews.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) return { ok: false, reason: "Give the view a name." };
    set.name = name;
  }
  if (patch.config) set.config = normalizeFor(v.collection, patch.config) as unknown as Record<string, unknown>;
  if (patch.shared !== undefined) set.shared = patch.shared;
  await db.update(savedViews).set(set).where(eq(savedViews.id, v.id));
  return { ok: true, id: v.id };
}

export async function deleteView(db: DB, user: ViewUser, id: string): Promise<ViewResult> {
  ensure(user, "views.save");
  const v = await manageable(db, user, id, "delete");
  await db.delete(savedViews).where(eq(savedViews.id, v.id));
  return { ok: true, id: v.id };
}
