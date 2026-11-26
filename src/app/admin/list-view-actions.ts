"use server";
// Saved views (tabs) on the Accounts and Leads lists: save the current filters as a tab, update it,
// delete it. The rules (who may share, change or delete) live in src/lib/server/views.ts.
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, str } from "@/lib/crm/flash";
import { LIST_SPECS, isListCollection, listConfigFromParams, listViewHref, type ListSpec } from "@/lib/list-views";
import { createView, deleteView, getView, updateView } from "@/lib/server/views";

const paramsOf = (fd: FormData) => Object.fromEntries(new URLSearchParams(str(fd, "params")).entries());

function specOf(fd: FormData): ListSpec {
  const c = str(fd, "collection");
  return isListCollection(c) ? LIST_SPECS[c] : LIST_SPECS.accounts;
}

export async function saveListView(fd: FormData) {
  const spec = specOf(fd);
  await bounce(spec.path, async () => {
    const user = await authorizeIn(spec.collection);
    const config = listConfigFromParams(spec, paramsOf(fd));
    const db = await getDb();
    const res = await createView(db, user, { name: fd.get("name"), config, shared: fd.get("shared") === "yes" }, spec.collection);
    if (!res.ok) flash(listViewHref(spec, null, config), "error", res.reason);
    flash(listViewHref(spec, res.id, config), "ok", "View saved.");
  });
}

export async function updateListView(fd: FormData) {
  const spec = specOf(fd);
  await bounce(spec.path, async () => {
    const user = await authorizeIn(spec.collection);
    const id = str(fd, "id");
    const config = listConfigFromParams(spec, paramsOf(fd));
    const db = await getDb();
    if (!(await getView(db, user, id, spec.collection))) flash(spec.path, "error", "That view no longer exists.");
    const res = await updateView(db, user, id, { config });
    if (!res.ok) flash(listViewHref(spec, id, config), "error", res.reason);
    flash(listViewHref(spec, id, config), "ok", "View updated.");
  });
}

export async function deleteListView(fd: FormData) {
  const spec = specOf(fd);
  await bounce(spec.path, async () => {
    const user = await authorizeIn(spec.collection);
    const id = str(fd, "id");
    const db = await getDb();
    if (!(await getView(db, user, id, spec.collection))) flash(spec.path, "error", "That view no longer exists.");
    const res = await deleteView(db, user, id);
    if (!res.ok) flash(spec.path, "error", res.reason);
    flash(spec.path, "ok", "View deleted.");
  });
}
