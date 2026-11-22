"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/session";
import { parsePlacementForm, type PlacementFormValues } from "@/lib/forms/placement";
import { isUuid } from "@/lib/server/experts";
import { createPlacement, updatePlacement } from "@/lib/server/placements";

export type PlacementFormState = { values?: PlacementFormValues; errors?: Record<string, string>; message?: string };

export async function savePlacement(_prev: PlacementFormState, fd: FormData): Promise<PlacementFormState> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  const { values, data, errors } = parsePlacementForm(fd);
  if (!data) return { values, errors, message: "Check the highlighted fields." };
  if ((data.expertId && !isUuid(data.expertId)) || !isUuid(data.partnerId) || (data.submissionId && !isUuid(data.submissionId))) {
    return { values, message: "Something in this form is out of date. Reload and try again." };
  }
  const db = await getDb();
  if (id) {
    const ok = await updatePlacement(db, id, data, user.email);
    if (!ok) return { values, message: "This placement no longer exists." };
    revalidatePath("/placements");
    redirect(`/placements/${id}?ok=${encodeURIComponent("Saved.")}`);
  }
  const newId = await createPlacement(db, data, user.email);
  revalidatePath("/placements");
  redirect(`/placements/${newId}?ok=${encodeURIComponent("Placement created.")}`);
}
