"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requirements } from "@/db/schema";
import { REQUIREMENT_STATUSES, isOneOf } from "@/lib/constants";
import { authorize, bounce, ensure, isForbidden } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { parseRequirementForm, type RequirementFormValues } from "@/lib/forms/requirement";
import { logActivity } from "@/lib/server/activity";
import { isUuid } from "@/lib/server/experts";
import { findOrCreatePartner, getRequirement } from "@/lib/server/requirements";
import { addToRequirement, moveSubmission, submissionPartnerId } from "@/lib/server/submissions";

export type RequirementFormState = { values?: RequirementFormValues; errors?: Record<string, string>; message?: string };

const back = (path: string, kind: "ok" | "error", msg: string) => `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`;
const safePath = (p: string, fallback: string) => (p.startsWith("/") && !p.startsWith("//") ? p : fallback);

export async function saveRequirement(_prev: RequirementFormState, fd: FormData): Promise<RequirementFormState> {
  const id = String(fd.get("id") ?? "");
  const { values, data, errors } = parseRequirementForm(fd);
  let user;
  try {
    user = await authorize(id ? "requirements.edit" : "requirements.create");
    // A new partner typed into the form is partner management (admins).
    if (data && !(data.partnerId && isUuid(data.partnerId))) ensure(user, "partners.manage");
  } catch (e) {
    if (isForbidden(e)) return { values, message: e.message };
    throw e;
  }
  if (!data) return { values, errors, message: "Check the highlighted fields." };
  const db = await getDb();
  const before = id ? await getRequirement(db, id) : null;
  if (id && !before) return { values, message: "This requirement no longer exists." };
  const partnerId = data.partnerId && isUuid(data.partnerId) ? data.partnerId : await findOrCreatePartner(db, data.newPartner!, user);
  const { newPartner: _np, partnerId: _p, ...fields } = data;
  // Roles that can't see rate notes can't overwrite them either.
  if (!can(user.role, "requirements.rate_note")) fields.rateNote = before?.req.rateNote ?? null;
  const now = new Date();
  if (id && before) {
    const next = { ...fields, partnerId };
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify(before.req[k] ?? null) !== JSON.stringify(next[k] ?? null));
    await db.update(requirements).set({ ...next, updatedAt: now }).where(eq(requirements.id, id));
    await logActivity(db, { entityType: "requirement", entityId: id, actor: user, action: "updated", detail: { fields: changed } });
    revalidatePath(`/requirements/${id}`);
    redirect(back(`/requirements/${id}?tab=details`, "ok", "Saved."));
  }
  const [row] = await db
    .insert(requirements)
    .values({ ...fields, partnerId, createdBy: user.email, createdAt: now, updatedAt: now })
    .returning({ id: requirements.id });
  await logActivity(db, { entityType: "requirement", entityId: row.id, actor: user, action: "created", detail: { partnerId } });
  redirect(back(`/requirements/${row.id}`, "ok", "Requirement saved. Here are the best matches."));
}

export async function setRequirementStatus(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await bounce(`/requirements/${isUuid(id) ? id : ""}`, async () => {
    const user = await authorize("requirements.edit");
    const status = String(fd.get("status") ?? "");
    if (!isUuid(id) || !isOneOf(REQUIREMENT_STATUSES, status)) redirect("/requirements");
    const db = await getDb();
    const r = await getRequirement(db, id);
    if (!r) redirect("/requirements");
    if (r.req.status !== status) {
      await db.update(requirements).set({ status, updatedAt: new Date() }).where(eq(requirements.id, id));
      await logActivity(db, { entityType: "requirement", entityId: id, actor: user, action: "status_changed", detail: { from: r.req.status, to: status } });
    }
    redirect(back(safePath(String(fd.get("returnTo") ?? ""), `/requirements/${id}`), "ok", "Status updated."));
  });
}

/** "Shortlist" on the matches tab: one person (button) or everyone ticked. */
export async function shortlist(fd: FormData) {
  const requirementId = String(fd.get("requirementId") ?? "");
  await bounce(`/requirements/${isUuid(requirementId) ? requirementId : ""}`, async () => {
    const user = await authorize("matching.shortlist");
    const one = String(fd.get("one") ?? "");
    const ids = one ? [one] : fd.getAll("ids").map(String);
    if (!isUuid(requirementId)) redirect("/requirements");
    const base = `/requirements/${requirementId}`;
    if (!ids.length) redirect(back(base, "error", "Tick at least one person."));
    const db = await getDb();
    const res = await addToRequirement(db, requirementId, ids, user);
    if (res.error) redirect(back(base, "error", res.error));
    revalidatePath(base);
    const parts = [`Shortlisted ${res.added}`];
    if (res.already) parts.push(`${res.already} already on it`);
    if (res.blocked.length) parts.push(`skipped ${res.blocked.join(", ")}`);
    redirect(back(one ? base : `${base}?tab=submissions`, "ok", `${parts.join(" · ")}.`));
  });
}

/** Status / note change for one submission (requirement page and /submissions). Pod leads: their partners only. */
export async function updateSubmission(fd: FormData) {
  const returnTo = safePath(String(fd.get("returnTo") ?? ""), "/submissions");
  await bounce(returnTo, async () => {
    const user = await authorize("submissions.update");
    const id = String(fd.get("id") ?? "");
    const to = String(fd.get("to") ?? "");
    const db = await getDb();
    const partnerId = await submissionPartnerId(db, id);
    if (!partnerId) redirect(back(returnTo, "error", "Submission not found."));
    ensure(user, "submissions.update", { partnerId });
    const partnerNote = fd.has("partnerNote") ? String(fd.get("partnerNote") ?? "").trim().slice(0, 1000) || null : undefined;
    const internalNote = fd.has("internalNote") ? String(fd.get("internalNote") ?? "").trim().slice(0, 2000) || null : undefined;
    const res = await moveSubmission(db, { id, to, partnerNote, internalNote, actor: user });
    revalidatePath(returnTo.split("?")[0]);
    if (!res.ok) redirect(back(returnTo, "error", res.reason));
    redirect(back(returnTo, "ok", res.changed ? "Submission updated." : "No changes."));
  });
}
