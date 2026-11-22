"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { PLACEMENT_STATUSES, isOneOf } from "@/lib/constants";
import { authorize, bounce, ensure, isForbidden } from "@/lib/auth/guard";
import { parsePlacementForm, type PlacementFormValues } from "@/lib/forms/placement";
import { isUuid } from "@/lib/server/experts";
import { createPlacement, getPlacement, updatePlacement, updatePlacementProgress } from "@/lib/server/placements";

export type PlacementFormState = { values?: PlacementFormValues; errors?: Record<string, string>; message?: string };

const back = (path: string, kind: "ok" | "error", msg: string) => `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`;

export async function savePlacement(_prev: PlacementFormState, fd: FormData): Promise<PlacementFormState> {
  const id = String(fd.get("id") ?? "");
  const { values, data, errors } = parsePlacementForm(fd);
  let user;
  try {
    user = await authorize(id ? "placements.edit" : "placements.create");
  } catch (e) {
    if (isForbidden(e)) return { values, message: e.message };
    throw e;
  }
  if (!data) return { values, errors, message: "Check the highlighted fields." };
  if ((data.expertId && !isUuid(data.expertId)) || !isUuid(data.partnerId) || (data.submissionId && !isUuid(data.submissionId))) {
    return { values, message: "Something in this form is out of date. Reload and try again." };
  }
  const db = await getDb();
  if (id) {
    const ok = await updatePlacement(db, id, data, user);
    if (!ok) return { values, message: "This placement no longer exists." };
    revalidatePath("/admin/placements");
    redirect(`/admin/placements/${id}?ok=${encodeURIComponent("Saved.")}`);
  }
  const newId = await createPlacement(db, data, user);
  revalidatePath("/admin/placements");
  redirect(`/admin/placements/${newId}?ok=${encodeURIComponent("Placement created.")}`);
}

const units = (raw: FormDataEntryValue | null, int: boolean): number | null | "bad" => {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000 || (int && !Number.isInteger(n))) return "bad";
  return Math.round(n * 100) / 100;
};

/** Hours approved, tasks accepted and status (pod leads for their partners; finance and admins). */
export async function savePlacementProgress(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const base = `/admin/placements/${isUuid(id) ? id : ""}`;
  await bounce(base, async () => {
    const user = await authorize("placements.progress");
    const db = await getDb();
    const row = await getPlacement(db, id);
    if (!row) redirect("/admin/placements");
    ensure(user, "placements.progress", { partnerId: row.p.partnerId });
    const hours = units(fd.get("hoursApproved"), false);
    const tasks = units(fd.get("tasksAccepted"), true);
    const status = String(fd.get("status") ?? "");
    if (hours === "bad") redirect(back(base, "error", "Hours approved: a number, 0 or more."));
    if (tasks === "bad") redirect(back(base, "error", "Tasks accepted: a whole number, 0 or more."));
    if (!isOneOf(PLACEMENT_STATUSES, status)) redirect(back(base, "error", "Pick a status."));
    await updatePlacementProgress(db, id, { hoursApproved: hours, tasksAccepted: tasks, status }, user);
    revalidatePath("/admin/placements");
    redirect(back(base, "ok", "Saved."));
  });
}
