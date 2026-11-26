"use server";
// The Leads list's bulk bar: change stage or type, set the follow-up, link to an account, delete.
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, returnPath, str } from "@/lib/crm/flash";
import { bulkLeads, bulkSummary, type LeadBulkOp } from "@/lib/server/crm-bulk";

const BACK = "/admin/leads";

export async function bulkLeadsAction(fd: FormData) {
  const back = returnPath(fd, BACK);
  await bounce(back, async () => {
    const op = str(fd, "op");
    const ids = fd.getAll("ids");
    let change: LeadBulkOp;
    if (op === "stage") change = { op, stage: str(fd, "stage") };
    else if (op === "kind") change = { op, kind: str(fd, "kind") };
    else if (op === "follow_up") change = { op, date: str(fd, "followUpDate") || null };
    else if (op === "account") change = { op, companyId: str(fd, "companyId") === "none" ? null : str(fd, "companyId") || null };
    else if (op === "delete") change = { op };
    else flash(back, "error", "Pick an action first.");
    if (change.op === "account" && change.companyId === null && str(fd, "companyId") !== "none") flash(back, "error", "Pick an account.");
    const user = await authorizeIn("leads", change.op === "delete" ? "crm.delete" : "crm.edit");
    const db = await getDb();
    const r = await bulkLeads(db, ids, change, user);
    if (!r.ok) flash(back, "error", r.reason);
    revalidatePath(BACK);
    flash(back, r.changed || !r.skipped.length ? "ok" : "error", `Leads: ${bulkSummary(r, change.op === "delete" ? "deleted" : "changed")}`, { view: null });
  });
}
