"use server";
// Documents (admin): templates experts sign in the portal, and sending a document to one expert.
// Every action checks the Experts module and experts.edit on the server; every write records who.
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, str } from "@/lib/crm/flash";
import { DEFAULT_DOCUMENTS } from "@/lib/documents/defaults";
import { deleteTemplate, PORTAL_DOCUMENTS_URL, saveTemplate, sendDocument, upsertDefaultTemplate, type UploadFile } from "@/lib/server/portal-documents";

const BACK = "/admin/documents";

async function fileFrom(fd: FormData, key: string): Promise<UploadFile | null> {
  const f = fd.get(key);
  return f instanceof File && f.size > 0 ? { filename: f.name, mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) } : null;
}

/** The template editor keeps what was typed when something needs fixing (a long text isn't lost). */
export type TemplateFormState = { error?: string; values?: Record<string, string> };

export async function saveTemplateAction(_prev: TemplateFormState, fd: FormData): Promise<TemplateFormState> {
  const values: Record<string, string> = {
    title: str(fd, "title"),
    kind: str(fd, "kind"),
    description: str(fd, "description"),
    body: str(fd, "body"),
    position: str(fd, "position"),
    requiredForAll: fd.get("requiredForAll") === "yes" ? "yes" : "",
    active: fd.get("active") === "yes" ? "yes" : "",
    removePdf: fd.get("removePdf") === "yes" ? "yes" : "",
  };
  let result: TemplateFormState = {};
  await bounce(`${BACK}?tab=templates`, async () => {
    const user = await authorizeIn("profiles", "experts.edit");
    const db = await getDb();
    const r = await saveTemplate(db, user, {
      id: str(fd, "id") || null,
      title: values.title,
      kind: values.kind,
      description: values.description,
      body: values.body,
      requiredForAll: values.requiredForAll === "yes",
      active: values.active === "yes",
      position: values.position,
      pdf: await fileFrom(fd, "pdf"),
      removePdf: values.removePdf === "yes",
    });
    if (!r.ok) {
      result = { error: r.reason, values };
      return;
    }
    revalidatePath(BACK);
    flash(`${BACK}?tab=templates`, "ok", r.created ? `“${values.title.trim()}” added.` : `“${values.title.trim()}” saved.`);
  });
  return result;
}

export async function deleteTemplateForm(fd: FormData) {
  await bounce(`${BACK}?tab=templates`, async () => {
    const user = await authorizeIn("profiles", "experts.edit");
    const db = await getDb();
    const r = await deleteTemplate(db, user, str(fd, "id"));
    if (!r.ok) flash(`${BACK}?tab=templates`, "error", r.reason);
    revalidatePath(BACK);
    flash(`${BACK}?tab=templates`, "ok", r.deleted ? `“${r.title}” deleted.` : `“${r.title}” has sent or signed copies, so it was turned off instead of deleted.`);
  });
}

export async function sendDocumentForm(fd: FormData) {
  await bounce(`${BACK}?tab=send`, async () => {
    const user = await authorizeIn("profiles", "experts.edit");
    const db = await getDb();
    const r = await sendDocument(db, user, {
      email: str(fd, "email"),
      templateId: str(fd, "templateId") || null,
      pdf: await fileFrom(fd, "pdf"),
      title: str(fd, "title") || null,
      kind: str(fd, "kind") || null,
      dueOn: str(fd, "dueOn") || null,
      note: str(fd, "note") || null,
    });
    if (!r.ok) flash(`${BACK}?tab=send`, "error", r.reason);
    revalidatePath(BACK);
    flash(`${BACK}?tab=sent`, "ok", `“${r.title}” is on ${r.expertName}'s Documents page. No email was sent: tell them to sign it at ${PORTAL_DOCUMENTS_URL}`);
  });
}

/** "Add the default documents": the portal's NDA and Data Submission and Ownership Agreement, for every expert. */
export async function addDefaultDocumentsForm() {
  await bounce(`${BACK}?tab=templates`, async () => {
    const user = await authorizeIn("profiles", "experts.edit");
    const db = await getDb();
    const done: string[] = [];
    for (const d of DEFAULT_DOCUMENTS) {
      const r = await upsertDefaultTemplate(db, user, { title: d.title, kind: d.kind, body: d.body, position: d.position, description: d.description });
      done.push(`${d.title}: ${{ created: "added", updated: "brought up to date", unchanged: "already up to date", skipped: "left as it is" }[r.status]}`);
    }
    revalidatePath(BACK);
    flash(`${BACK}?tab=templates`, "ok", `${done.join(". ")}. Every expert now sees them on their Documents page until they sign.`);
  });
}
