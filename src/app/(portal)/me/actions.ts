"use server";
// Expert portal actions. The expert id always comes from the signed-in session (ownExpertId), never
// from the form, so nobody can change someone else's record.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { ownExpertId } from "@/lib/auth/expert";
import { checkCvUpload } from "@/lib/server/cv";
import { isStep, ONBOARDING_STEPS, requestDeletion, saveStep, setOwnConsent, uploadOwnCv, type StepValues } from "@/lib/server/portal";
import { confirmAvailability } from "@/lib/server/portal-home";

export type StepFormState = { errors?: Record<string, string>; values?: StepValues; message?: string };

const msg = (path: string, kind: "ok" | "error", text: string) => `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`;

async function me(): Promise<string> {
  const id = await ownExpertId();
  if (!id) redirect("/join?callbackUrl=/me");
  return id;
}

export async function saveOnboarding(_prev: StepFormState, fd: FormData): Promise<StepFormState> {
  const step = String(fd.get("step") ?? "");
  if (!isStep(step)) return { message: "Unknown step." };
  const id = await me();
  const db = await getDb();
  const res = await saveStep(db, id, step, fd);
  if (!res.ok) return { errors: res.errors, values: res.values, message: res.message };
  revalidatePath("/me");
  const i = ONBOARDING_STEPS.findIndex((s) => s.id === step);
  const next = ONBOARDING_STEPS[i + 1];
  if (fd.get("then") === "profile" || !next) redirect(msg("/me/profile", "ok", next ? "Saved." : "All steps saved. Your profile is ready for matching."));
  redirect(`/me/onboarding?step=${next.id}&saved=${step}`);
}

/** Home: the weekly check-in ("my availability is still right"). */
export async function confirmMyAvailability() {
  const id = await me();
  await confirmAvailability(await getDb(), id);
  revalidatePath("/me", "layout");
  redirect(msg("/me", "ok", "Thanks. Your availability is confirmed for this week."));
}

export async function uploadMyCv(fd: FormData) {
  const id = await me();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) redirect(msg("/me", "error", "Choose a file first."));
  const problem = checkCvUpload(file);
  if (problem) redirect(msg("/me", "error", problem));
  const db = await getDb();
  await uploadOwnCv(db, id, { filename: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
  revalidatePath("/me");
  redirect(msg("/me", "ok", "CV uploaded. It's now the one we use."));
}

export async function setMyConsent(fd: FormData) {
  const id = await me();
  const value = String(fd.get("consent") ?? "");
  if (value !== "yes" && value !== "no") redirect("/me");
  await setOwnConsent(await getDb(), id, value);
  revalidatePath("/me");
  redirect(msg("/me", "ok", value === "yes" ? "Thanks. We may now share your profile and CV with partners for roles you apply to." : "Recorded. We won't share your profile or CV with partners."));
}

export async function requestMyDeletion(fd: FormData) {
  const id = await me();
  const res = await requestDeletion(await getDb(), id, String(fd.get("note") ?? ""));
  revalidatePath("/me");
  redirect(msg("/me", "ok", res.created ? "Request received. We will delete your data and confirm by email within 30 days." : "We already have your request and are working on it."));
}
