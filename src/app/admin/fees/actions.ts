"use server";
// Fees & earnings: money, so admins and finance only (fees.manage), and the Fees module.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { ids, returnPath, str, withFlash } from "@/lib/action-flash";
import { addMissingFees, markFees, missingFees, saveFeeRule } from "@/lib/server/fees";

export async function markFeesAction(fd: FormData) {
  const back = returnPath(fd, "/admin/fees");
  await bounce(back, async () => {
    const user = await authorizeIn("fees", "fees.manage");
    const db = await getDb();
    const to = str(fd, "to");
    const res = await markFees(db, user, ids(fd), { to, invoiceNumber: str(fd, "invoiceNumber"), invoicedOn: str(fd, "invoicedOn"), dueOn: str(fd, "dueOn"), paidOn: str(fd, "paidOn"), paidAmount: str(fd, "paidAmount"), voidReason: str(fd, "voidReason") });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    revalidatePath("/admin/fees");
    const skipped = res.skipped.length ? ` ${res.skipped.length} skipped (${[...new Set(res.skipped)].join(", ")}).` : "";
    redirect(withFlash(back, res.changed ? "ok" : "error", `${res.changed} marked ${to}.${skipped}`));
  });
}

export async function saveFeeRuleAction(fd: FormData) {
  const back = returnPath(fd, "/admin/fees?tab=rules");
  await bounce(back, async () => {
    const user = await authorizeIn("fees", "fees.manage");
    const db = await getDb();
    const res = await saveFeeRule(db, user, {
      id: str(fd, "id") || null,
      projectId: str(fd, "projectId"),
      trackId: str(fd, "trackId"),
      amount: str(fd, "amount"),
      currency: str(fd, "currency"),
      earnedAtStage: str(fd, "earnedAtStage"),
      paymentTermsDays: str(fd, "paymentTermsDays"),
      active: fd.get("active") === "yes",
      notes: str(fd, "notes"),
    });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    const missing = await missingFees(db, res.id);
    if (missing.length) redirect(`/admin/fees?tab=rules&missing=${res.id}`);
    redirect(withFlash("/admin/fees?tab=rules", "ok", "Rule saved."));
  });
}

export async function addMissingFeesAction(fd: FormData) {
  await bounce("/admin/fees?tab=rules", async () => {
    const user = await authorizeIn("fees", "fees.manage");
    const db = await getDb();
    const res = await addMissingFees(db, user, str(fd, "ruleId"));
    redirect(withFlash("/admin/fees", "ok", `${res.added} fee${res.added === 1 ? "" : "s"} added.`));
  });
}
