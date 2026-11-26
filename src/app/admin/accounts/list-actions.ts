"use server";
// The Accounts list's bulk bar: change stage, owner or priority, add or remove tags, delete.
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, returnPath, str } from "@/lib/crm/flash";
import { bulkAccounts, bulkSummary, type AccountBulkOp } from "@/lib/server/crm-bulk";

const BACK = "/admin/accounts";

export async function bulkAccountsAction(fd: FormData) {
  const back = returnPath(fd, BACK);
  await bounce(back, async () => {
    const op = str(fd, "op");
    const ids = fd.getAll("ids");
    let change: AccountBulkOp;
    if (op === "stage") change = { op, stage: str(fd, "stage") };
    else if (op === "owner") change = { op, owner: str(fd, "owner") };
    else if (op === "priority") change = { op, priority: str(fd, "priority") };
    else if (op === "add_tags" || op === "remove_tags") change = { op, tags: str(fd, op === "add_tags" ? "addTags" : "removeTags") };
    else if (op === "delete") change = { op };
    else flash(back, "error", "Pick an action first.");
    const user = await authorizeIn("accounts", change.op === "delete" ? "crm.delete" : "crm.edit");
    const db = await getDb();
    const r = await bulkAccounts(db, ids, change, user);
    if (!r.ok) flash(back, "error", r.reason);
    revalidatePath(BACK);
    flash(back, r.changed || !r.skipped.length ? "ok" : "error", `Accounts: ${bulkSummary(r, change.op === "delete" ? "deleted" : "changed")}`, { view: null });
  });
}
