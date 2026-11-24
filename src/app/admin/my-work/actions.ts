"use server";
import { getDb } from "@/db/client";
import { authorize, bounce } from "@/lib/auth/guard";
import { flash, returnPath, str } from "@/lib/crm/flash";
import { todayIST } from "@/lib/crm/dates";
import { markContacted } from "@/lib/server/my-work";

/** "Contacted" on a prospect: outreach contacted, a follow-up in 3 days. Needs the right to edit experts. */
export async function markProspectContacted(fd: FormData) {
  await bounce("/admin/my-work", async () => {
    const user = await authorize("experts.edit");
    const db = await getDb();
    const back = returnPath(fd, "/admin/my-work?tab=prospects");
    const r = await markContacted(db, str(fd, "expertId"), todayIST(), user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", `${str(fd, "name") || "Expert"}: contacted. A follow-up is set for 3 days from now.`);
  });
}
