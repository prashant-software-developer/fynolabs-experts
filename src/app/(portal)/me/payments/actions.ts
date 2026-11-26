"use server";
// Payments: the expert saves how they want to be paid. The expert id always comes from the signed-in
// session (ownExpertId), never from the form. No bank account or card numbers are taken.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { ownExpertId } from "@/lib/auth/expert";
import { savePayoutMethod } from "@/lib/server/payouts";

export type MethodFormState = { ok?: boolean; message?: string; errors?: { method?: string; handle?: string }; values?: { method: string; handle: string } };

export async function savePayoutMethodAction(_prev: MethodFormState, fd: FormData): Promise<MethodFormState> {
  const id = await ownExpertId();
  if (!id) redirect("/signin?callbackUrl=%2Fme%2Fpayments");
  const values = { method: String(fd.get("method") ?? "").trim(), handle: String(fd.get("handle") ?? "").slice(0, 300) };
  const res = await savePayoutMethod(await getDb(), id, values);
  if (!res.ok) return { errors: res.errors, values };
  revalidatePath("/me/payments");
  return { ok: true, values: { method: res.method, handle: res.handle ?? "" }, message: res.changed ? "Payout method saved." : "Nothing changed." };
}
