"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { canSeeMoney } from "@/lib/auth/permissions";
import { authorizeIn } from "@/lib/auth/section-guard";
import { str, withFlash } from "@/lib/action-flash";
import { updateJobPosting } from "@/lib/server/job-posting";

/** The FynoLabs posted-job fields on the job's Details tab. Jobs module + jobs.manage. */
export async function saveJobPosting(fd: FormData) {
  const id = str(fd, "id");
  const back = `/admin/jobs/${id}?tab=details`;
  await bounce(back, async () => {
    const user = await authorizeIn("posted-jobs", "jobs.manage");
    const db = await getDb();
    const res = await updateJobPosting(db, user, id, { companyName: str(fd, "companyName"), badge: str(fd, "badge"), applyUrl: str(fd, "applyUrl"), projectId: str(fd, "projectId"), trackId: str(fd, "trackId"), requireGithub: fd.get("requireGithub") === "yes", payUnit: str(fd, "payUnit") }, canSeeMoney(user.role));
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    revalidatePath(`/admin/jobs/${id}`);
    redirect(withFlash(back, "ok", res.changed.length ? "Posting details saved." : "No changes."));
  });
}
