"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { ids, returnPath, withFlash } from "@/lib/action-flash";
import { setHandled } from "@/lib/server/inbound";

/** Mark applications handled (or open again). Experts module + applications.manage. */
export async function markHandled(fd: FormData) {
  const back = returnPath(fd, "/admin/applications");
  await bounce(back, async () => {
    const user = await authorizeIn("profiles", "applications.manage");
    const handled = fd.get("handled") !== "no";
    const db = await getDb();
    const res = await setHandled(db, user, ids(fd), handled);
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash(back, "ok", res.changed ? `${res.changed} marked ${handled ? "handled" : "open"}.` : "No change."));
  });
}
