"use server";
// Job radar: approve, discard, restore, and publish a role as a hub job (a draft, internal).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { ensure } from "@/lib/auth/permissions";
import { authorizeIn } from "@/lib/auth/section-guard";
import { ids, returnPath, str, withFlash } from "@/lib/action-flash";
import { publishAsJob, setRadarStatus } from "@/lib/server/radar";

export async function setRadarStatusAction(fd: FormData) {
  const back = returnPath(fd, "/admin/jobs/radar");
  await bounce(back, async () => {
    const user = await authorizeIn("job-radar", "radar.manage");
    const db = await getDb();
    const status = str(fd, "status");
    const res = await setRadarStatus(db, user, ids(fd), status);
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    revalidatePath("/admin/jobs/radar");
    const words: Record<string, string> = { approved: "approved", discarded: "discarded", new: "restored" };
    redirect(withFlash(back, "ok", res.changed ? `${res.changed} ${words[status] ?? status}.` : "No change."));
  });
}

export async function publishRadarAction(fd: FormData) {
  const back = returnPath(fd, "/admin/jobs/radar");
  await bounce(back, async () => {
    const user = await authorizeIn("job-radar", "radar.manage");
    ensure(user, "jobs.manage");
    const db = await getDb();
    const res = await publishAsJob(db, user, str(fd, "id"));
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash(`/admin/jobs/${res.id}?tab=details`, "ok", res.created ? "Job created as an internal draft from the radar role. Check the details, then open it when you're ready." : "This role already has a job."));
  });
}
