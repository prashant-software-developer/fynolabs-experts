"use server";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, returnPath, str } from "@/lib/crm/flash";
import { crmLabel } from "@/lib/crm/labels";
import { createContact, deleteContact, getContact, updateContact, type ContactInput } from "@/lib/server/contacts";

const BACK = "/admin/leads";

function inputFrom(fd: FormData): ContactInput {
  const input: ContactInput = {};
  for (const k of ["name", "role", "email", "kind", "stage", "source", "profileUrl", "sourceUrl", "nextFollowUp", "notes", "company"] as const) if (fd.has(k)) (input as Record<string, unknown>)[k] = str(fd, k);
  if (fd.has("companyId")) input.companyId = str(fd, "companyId") || null;
  return input;
}

export async function saveLead(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("leads", "crm.edit");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const id = str(fd, "id");
    if (id) {
      const r = await updateContact(db, id, inputFrom(fd), user);
      if (!r.ok) flash(back, "error", r.reason);
      flash(back, "ok", "Lead saved.");
    }
    const input = inputFrom(fd);
    const r = await createContact(db, { ...input, name: input.name ?? "" }, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", "Lead added.", { new: null, view: r.id });
  });
}

export async function setLeadStage(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("leads", "crm.edit");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const r = await updateContact(db, str(fd, "id"), { stage: str(fd, "stage") }, user);
    if (!r.ok) flash(back, "error", r.reason);
    const c = await getContact(db, str(fd, "id"));
    flash(back, "ok", `${c?.name ?? "Lead"}: ${crmLabel(str(fd, "stage"), "contact")}`);
  });
}

export async function removeLead(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("leads", "crm.delete");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const c = await getContact(db, str(fd, "id"));
    const r = await deleteContact(db, str(fd, "id"), user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", `${c?.name ?? "Lead"} deleted.`, { view: null });
  });
}

