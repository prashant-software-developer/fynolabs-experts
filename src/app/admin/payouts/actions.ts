"use server";
// Payouts to experts: money, so admins and finance only (fees.manage) in the Fees module. Every
// change writes an activity row (see src/lib/server/payouts.ts).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bounce, isForbidden } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { returnPath, str, withFlash } from "@/lib/action-flash";
import { createPayout, findExpertByEmail, markPayout } from "@/lib/server/payouts";

export type AddPayoutState = { message?: string; field?: string; values?: Record<string, string>; nonce?: number };

const FIELDS = ["expertId", "placementId", "label", "amount", "currency", "periodStart", "periodEnd", "expectedOn", "status", "paidOn", "reference", "notes"] as const;
const DONE: Record<string, string> = { processing: "Marked processing.", paid: "Marked paid.", failed: "Marked failed.", void: "Payout cancelled." };

/** Add payout, step 1: the expert's email -> the form for that expert (?expert=<id>). */
export async function findPayoutExpertAction(fd: FormData) {
  const back = returnPath(fd, "/admin/payouts?add=1");
  await bounce(back, async () => {
    await authorizeIn("fees", "fees.manage");
    const expert = await findExpertByEmail(await getDb(), str(fd, "email"));
    if (!expert) redirect(withFlash(back, "error", "No expert with that email. Check it, or add them under Experts first."));
    redirect(`/admin/payouts?add=1&expert=${expert.id}`);
  });
}

/** Add payout, step 2. Errors come back to the form with what was typed. */
export async function addPayoutAction(_prev: AddPayoutState, fd: FormData): Promise<AddPayoutState> {
  const values: Record<string, string> = Object.fromEntries(FIELDS.map((k) => [k, str(fd, k)]));
  let user;
  try {
    user = await authorizeIn("fees", "fees.manage");
  } catch (e) {
    if (isForbidden(e)) return { values, message: e.message, nonce: Date.now() };
    throw e;
  }
  const res = await createPayout(await getDb(), user, { ...values, expertId: values.expertId, amount: values.amount });
  if (!res.ok) return { values, message: res.reason, field: res.field, nonce: Date.now() };
  revalidatePath("/admin/payouts");
  redirect(withFlash(`/admin/payouts?p=${res.id}`, "ok", "Payout added."));
}

/** Row and panel actions: mark processing, paid (date, reference, method), failed, or cancel (void). */
export async function markPayoutAction(fd: FormData) {
  const back = returnPath(fd, "/admin/payouts");
  await bounce(back, async () => {
    const user = await authorizeIn("fees", "fees.manage");
    const to = str(fd, "to");
    const res = await markPayout(await getDb(), user, str(fd, "id"), { to, paidOn: str(fd, "paidOn"), reference: str(fd, "reference"), method: str(fd, "method") });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    revalidatePath("/admin/payouts");
    redirect(withFlash(back, "ok", DONE[to] ?? "Saved."));
  });
}
