"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { experts } from "@/db/schema";
import { authorize, bounce, isForbidden } from "@/lib/auth/guard";
import { canSeeMoney } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { CV_CONSENT, EXPERT_STATUSES, isOneOf } from "@/lib/constants";
import { parseExpertForm, type ExpertFormValues } from "@/lib/forms/expert";
import { logActivity } from "@/lib/server/activity";
import { checkCvUpload, saveUploadedCv } from "@/lib/server/cv";
import { deleteExpertOnRequest, findDuplicates, getExpert, isUuid, type Duplicate } from "@/lib/server/experts";
import { addToRequirement } from "@/lib/server/submissions";
import { createView, deleteView, updateView } from "@/lib/server/views";
import { configFromParams, viewHref } from "@/lib/views";

export type ExpertFormState = {
  values?: ExpertFormValues;
  errors?: Record<string, string>;
  message?: string;
  duplicates?: Duplicate[];
  needsConfirm?: boolean;
};

const back = (path: string, kind: "ok" | "error", msg: string) => `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`;
const safePath = (p: string, fallback: string) => (p.startsWith("/") && !p.startsWith("//") ? p : fallback);

export async function saveExpert(_prev: ExpertFormState, fd: FormData): Promise<ExpertFormState> {
  const id = String(fd.get("id") ?? "");
  const { values, data, errors } = parseExpertForm(fd);
  let user;
  try {
    user = await authorize(id ? "experts.edit" : "experts.create");
  } catch (e) {
    if (isForbidden(e)) return { values, message: e.message };
    throw e;
  }
  if (!data) return { values, errors, message: "Check the highlighted fields." };
  const db = await getDb();
  const before = id ? await getExpert(db, id) : null;
  if (id && !before) return { values, message: "This expert no longer exists." };
  // Roles that can't see money can't set it either: the stored rate expectation stays as it was.
  if (!canSeeMoney(user.role)) data.rateExpectationUsd = before?.rateExpectationUsd ?? null;

  const dups = await findDuplicates(db, { email: data.email, linkedinUrl: data.linkedinUrl, excludeId: id || undefined });
  const emailDup = dups.find((d) => d.matchedBy === "email");
  if (emailDup) {
    return { values, errors: { email: "Another expert already has this email." }, duplicates: dups, message: "This email is already in the hub." };
  }
  const linkedinDups = dups.filter((d) => d.matchedBy === "linkedin");
  if (linkedinDups.length && fd.get("confirmDuplicate") !== "yes") {
    return { values, duplicates: linkedinDups, needsConfirm: true, message: "Someone with this LinkedIn URL is already in the hub." };
  }

  const now = new Date();
  if (id && before) {
    const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(data[k] ?? null));
    if (!changed.length) redirect(back(`/experts/${id}`, "ok", "No changes."));
    await db
      .update(experts)
      .set({ ...data, updatedAt: now, ...(changed.includes("cvConsent") ? { cvConsentAt: data.cvConsent === "unknown" ? null : now } : {}) })
      .where(eq(experts.id, id));
    await logActivity(db, { entityType: "expert", entityId: id, actor: user, action: "updated", detail: { fields: changed } });
    revalidatePath(`/experts/${id}`);
    redirect(back(`/experts/${id}`, "ok", "Saved."));
  }

  const [row] = await db
    .insert(experts)
    .values({ ...data, primarySource: "manual", cvConsentAt: data.cvConsent === "unknown" ? null : now, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning({ id: experts.id });
  if (!row) return { values, errors: { email: "Another expert already has this email." }, message: "This email is already in the hub." };
  await logActivity(db, { entityType: "expert", entityId: row.id, actor: user, action: "created", detail: { source: "manual" } });
  redirect(back(`/experts/${row.id}`, "ok", "Expert added."));
}

export async function uploadCv(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await bounce(`/experts/${isUuid(id) ? id : ""}`, async () => {
    const user = await authorize("experts.cv_upload");
    const file = fd.get("file");
    if (!isUuid(id)) redirect("/experts");
    if (!(file instanceof File)) redirect(back(`/experts/${id}`, "error", "Choose a file first."));
    const problem = checkCvUpload(file);
    if (problem) redirect(back(`/experts/${id}`, "error", problem));
    const db = await getDb();
    await saveUploadedCv(db, id, { filename: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }, user);
    revalidatePath(`/experts/${id}`);
    redirect(back(`/experts/${id}`, "ok", "CV uploaded and set as current."));
  });
}

export async function recordConsent(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await bounce(`/experts/${isUuid(id) ? id : ""}`, async () => {
    const user = await authorize("experts.edit");
    const value = String(fd.get("consent") ?? "");
    if (!isUuid(id) || !isOneOf(CV_CONSENT, value)) redirect("/experts");
    const db = await getDb();
    const e = await getExpert(db, id);
    if (!e) redirect("/experts");
    const returnTo = safePath(String(fd.get("returnTo") ?? ""), `/experts/${id}`);
    if (e.cvConsent === value) redirect(back(returnTo, "ok", "No change."));
    const now = new Date();
    await db.update(experts).set({ cvConsent: value, cvConsentAt: value === "unknown" ? null : now, updatedAt: now }).where(eq(experts.id, id));
    await logActivity(db, { entityType: "expert", entityId: id, actor: user, action: "cv_consent_recorded", detail: { value } });
    redirect(back(returnTo, "ok", `CV consent recorded: ${value}.`));
  });
}

/** Status select on the board cards. */
export async function setExpertStatus(fd: FormData) {
  const returnTo = safePath(String(fd.get("returnTo") ?? ""), "/experts");
  await bounce(returnTo, async () => {
    const user = await authorize("experts.edit");
    const id = String(fd.get("id") ?? "");
    const status = String(fd.get("status") ?? "");
    if (!isUuid(id) || !isOneOf(EXPERT_STATUSES, status)) redirect(back(returnTo, "error", "Unknown expert or status."));
    const db = await getDb();
    const e = await getExpert(db, id);
    if (!e) redirect(back(returnTo, "error", "This expert no longer exists."));
    if (e.status !== status) {
      await db.update(experts).set({ status, updatedAt: new Date() }).where(eq(experts.id, id));
      await logActivity(db, { entityType: "expert", entityId: id, actor: user, action: "status_changed", detail: { from: e.status, to: status } });
    }
    revalidatePath("/experts");
    redirect(back(returnTo, "ok", e.status === status ? "No change." : `${e.fullName}: status changed.`));
  });
}

export async function appendNote(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await bounce(`/experts/${isUuid(id) ? id : ""}`, async () => {
    const user = await authorize("experts.notes");
    const text = String(fd.get("note") ?? "").trim().slice(0, 2000);
    if (!isUuid(id)) redirect("/experts");
    if (!text) redirect(back(`/experts/${id}`, "error", "Write a note first."));
    const db = await getDb();
    const e = await getExpert(db, id);
    if (!e) redirect("/experts");
    const stamp = `${new Date().toISOString().slice(0, 10)} · ${user.email.split("@")[0]}`;
    const notes = [`${stamp}: ${text}`, e.notes].filter(Boolean).join("\n");
    await db
      .update(experts)
      .set({ notes, updatedAt: new Date(), ...(fd.get("contacted") === "yes" ? { lastContactedAt: new Date() } : {}) })
      .where(eq(experts.id, id));
    await logActivity(db, { entityType: "expert", entityId: id, actor: user, action: "note_added" });
    redirect(back(`/experts/${id}`, "ok", "Note added."));
  });
}

export async function deleteExpert(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await bounce(`/experts/${isUuid(id) ? id : ""}`, async () => {
    const user = await authorize("experts.delete");
    if (!isUuid(id)) redirect("/experts");
    if (String(fd.get("confirm") ?? "").trim() !== "DELETE") redirect(back(`/experts/${id}?tab=edit`, "error", "Type DELETE to confirm."));
    const db = await getDb();
    await deleteExpertOnRequest(db, id, user);
    revalidatePath("/experts");
    redirect(back("/experts", "ok", "Expert deleted. Only a hash of their email is kept, so imports skip them."));
  });
}

export async function addSelectedToRequirement(fd: FormData) {
  const returnTo = String(fd.get("returnTo") ?? "/experts");
  const safeReturn = safePath(returnTo, "/experts");
  await bounce(safeReturn, async () => {
    const user = await authorize("matching.shortlist");
    const ids = fd.getAll("ids").map(String);
    const requirementId = String(fd.get("requirementId") ?? "");
    if (!isUuid(requirementId)) redirect(back(safeReturn, "error", "Pick a requirement first."));
    if (!ids.length) redirect(back(safeReturn, "error", "Tick at least one expert."));
    const db = await getDb();
    const res = await addToRequirement(db, requirementId, ids, user);
    if (res.error) redirect(back(safeReturn, "error", res.error));
    const parts = [`Shortlisted ${res.added}`];
    if (res.already) parts.push(`${res.already} already on it`);
    if (res.blocked.length) parts.push(`skipped ${res.blocked.join(", ")}`);
    revalidatePath(`/requirements/${requirementId}`);
    redirect(back(`/requirements/${requirementId}?tab=submissions`, "ok", `${parts.join(" · ")}.`));
  });
}

// ---------- Saved views ----------

const paramsOf = (fd: FormData) => Object.fromEntries(new URLSearchParams(String(fd.get("params") ?? "")).entries());

export async function saveExpertView(fd: FormData) {
  await bounce("/experts", async () => {
    const user = await requireUser();
    const config = configFromParams(paramsOf(fd));
    const db = await getDb();
    const res = await createView(db, user, { name: fd.get("name"), config, shared: fd.get("shared") === "yes" });
    if (!res.ok) redirect(back(viewHref(null, config), "error", res.reason));
    redirect(back(viewHref(res.id, config), "ok", "View saved."));
  });
}

export async function updateExpertView(fd: FormData) {
  await bounce("/experts", async () => {
    const user = await requireUser();
    const id = String(fd.get("id") ?? "");
    const config = configFromParams(paramsOf(fd));
    const db = await getDb();
    const shared = fd.has("shared") ? fd.get("shared") === "yes" : undefined;
    const res = await updateView(db, user, id, { config, ...(shared !== undefined ? { shared } : {}) });
    if (!res.ok) redirect(back(viewHref(id, config), "error", res.reason));
    redirect(back(viewHref(id, config), "ok", "View updated."));
  });
}

export async function deleteExpertView(fd: FormData) {
  await bounce("/experts", async () => {
    const user = await requireUser();
    const db = await getDb();
    const res = await deleteView(db, user, String(fd.get("id") ?? ""));
    if (!res.ok) redirect(back("/experts", "error", res.reason));
    redirect(back("/experts", "ok", "View deleted."));
  });
}
