"use server";
// Jobs: details, the form builder, sharing, applicants and invites. Admins and recruiters only
// (jobs.manage / applications.manage); every action checks on the server and is logged.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { authorize, bounce, isForbidden } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { isOneOf, JOB_STATUSES } from "@/lib/constants";
import { parseJobForm, type JobFormValues } from "@/lib/forms/job";
import { cleanLongText } from "@/lib/normalize";
import { saveApplicationNote, setApplicationStatus } from "@/lib/server/applications";
import { sendEmail, emailConfigured } from "@/lib/server/email";
import { isUuid } from "@/lib/server/experts";
import { applyTemplate, changeField, createJob, getJob, markInvited, saveTemplate, setJobState, updateJob, type FieldOp } from "@/lib/server/jobs";
import { addToRequirement } from "@/lib/server/submissions";
import { inviteToken } from "@/lib/server/tokens";
import { siteName, siteUrl } from "@/lib/site";
import { experts } from "@/db/schema";
import { eq } from "drizzle-orm";

export type JobFormState = { values?: JobFormValues; errors?: Record<string, string>; message?: string };

const msg = (path: string, kind: "ok" | "error", text: string) => `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`;
const jobPath = (id: string, tab?: string, extra = "") => `/admin/jobs/${id}${tab ? `?tab=${tab}${extra}` : extra ? `?${extra.replace(/^&/, "")}` : ""}`;

export async function saveJob(_prev: JobFormState, fd: FormData): Promise<JobFormState> {
  const id = String(fd.get("id") ?? "");
  const { values, data, errors } = parseJobForm(fd);
  let user;
  try {
    user = await authorize("jobs.manage");
  } catch (e) {
    if (isForbidden(e)) return { values, message: e.message };
    throw e;
  }
  if (!data) return { values, errors, message: "Check the highlighted fields." };
  const db = await getDb();
  const before = id ? await getJob(db, id) : null;
  if (id && !before) return { values, message: "This job no longer exists." };
  // Roles that can't see money can't set the internal rate note either.
  if (!can(user.role, "jobs.rate_note")) data.internalRateNote = before?.job.internalRateNote ?? null;
  const res = id ? await updateJob(db, user, id, data) : await createJob(db, user, data);
  if (!res.ok) return { values, message: res.reason, errors: res.field ? { [res.field]: res.reason } : undefined };
  revalidatePath("/admin/jobs");
  if (id) redirect(msg(jobPath(id, "details"), "ok", res.changed.length ? "Saved." : "No changes."));
  redirect(msg(jobPath(res.id, "form"), "ok", "Job created as a draft with the standard application form. Adjust the questions, then open it on the Share tab."));
}

/** Every form-builder button (add, save, move, duplicate, delete) posts here with `op`. */
export async function changeFormField(fd: FormData) {
  const jobId = String(fd.get("jobId") ?? "");
  const back = jobPath(isUuid(jobId) ? jobId : "", "form");
  await bounce(back, async () => {
    const user = await authorize("jobs.manage");
    if (!isUuid(jobId)) redirect("/admin/jobs");
    const op = String(fd.get("op") ?? "");
    const id = String(fd.get("fieldId") ?? "");
    let change: FieldOp;
    if (op === "add") change = { op: "add", type: String(fd.get("type") ?? ""), label: String(fd.get("label") ?? "").trim() || undefined, afterId: String(fd.get("afterId") ?? "") || null };
    else if (op === "update")
      change = {
        op: "update",
        id,
        raw: { type: fd.get("type"), label: fd.get("label"), helpText: fd.get("helpText"), required: fd.get("required") === "yes", choices: String(fd.get("choices") ?? ""), mapsTo: String(fd.get("mapsTo") ?? "") || null },
      };
    else if (op === "up" || op === "down") change = { op: "move", id, dir: op };
    else if (op === "delete") change = { op: "delete", id };
    else if (op === "duplicate") change = { op: "duplicate", id };
    else redirect(back);
    const db = await getDb();
    const res = await changeField(db, user, jobId, change);
    revalidatePath(`/admin/jobs/${jobId}`);
    if (!res.ok) redirect(msg(back, "error", res.reason));
    const anchor = res.fieldId ? `&field=${res.fieldId}#q-${res.fieldId}` : "";
    redirect(`${back}&ok=${encodeURIComponent(res.message)}${anchor}`);
  });
}

export async function saveFormTemplate(fd: FormData) {
  const jobId = String(fd.get("jobId") ?? "");
  const back = jobPath(isUuid(jobId) ? jobId : "", "form");
  await bounce(back, async () => {
    const user = await authorize("jobs.manage");
    if (!isUuid(jobId)) redirect("/admin/jobs");
    const res = await saveTemplate(await getDb(), user, jobId, { name: fd.get("name"), shared: fd.get("shared") === "yes" });
    redirect(msg(back, res.ok ? "ok" : "error", res.ok ? "Saved as a template." : res.reason));
  });
}

export async function applyFormTemplate(fd: FormData) {
  const jobId = String(fd.get("jobId") ?? "");
  const back = jobPath(isUuid(jobId) ? jobId : "", "form");
  await bounce(back, async () => {
    const user = await authorize("jobs.manage");
    if (!isUuid(jobId)) redirect("/admin/jobs");
    const res = await applyTemplate(await getDb(), user, jobId, String(fd.get("templateId") ?? ""));
    revalidatePath(`/admin/jobs/${jobId}`);
    redirect(msg(back, res.ok ? "ok" : "error", res.ok ? "The form now follows the template." : res.reason));
  });
}

/** Share tab and header buttons: status, visibility, featured, closing date. */
export async function setJobSharing(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const returnTo = String(fd.get("returnTo") ?? "") || jobPath(isUuid(id) ? id : "", "share");
  const back = returnTo.startsWith("/admin/") ? returnTo : jobPath(id, "share");
  await bounce(back, async () => {
    const user = await authorize("jobs.manage");
    if (!isUuid(id)) redirect("/admin/jobs");
    const status = String(fd.get("status") ?? "");
    const patch = {
      ...(status && isOneOf(JOB_STATUSES, status) ? { status } : {}),
      ...(fd.has("visibility") ? { visibility: String(fd.get("visibility")) } : {}),
      ...(fd.has("featuredSet") ? { featured: fd.get("featured") === "yes" } : {}),
      ...(fd.has("closesOn") ? { closesOn: String(fd.get("closesOn") ?? "") || null } : {}),
    };
    const res = await setJobState(await getDb(), user, id, patch);
    revalidatePath(`/admin/jobs/${id}`);
    revalidatePath("/");
    if (!res.ok) redirect(msg(back, "error", res.reason));
    const said = patch.status === "open" ? "Job is open. Share the link." : patch.status === "closed" ? "Job closed: the page now says it no longer takes applications." : patch.status === "paused" ? "Applications paused." : res.changed.length ? "Saved." : "No changes.";
    redirect(msg(back, "ok", said));
  });
}

export async function setApplicantsStatus(fd: FormData) {
  const jobId = String(fd.get("jobId") ?? "");
  const returnTo = String(fd.get("returnTo") ?? "");
  const back = returnTo.startsWith("/admin/jobs/") ? returnTo : jobPath(jobId, "applicants");
  await bounce(back, async () => {
    const user = await authorize("applications.manage");
    if (!isUuid(jobId)) redirect("/admin/jobs");
    const one = String(fd.get("one") ?? "");
    const ids = one ? [one] : fd.getAll("ids").map(String);
    const res = await setApplicationStatus(await getDb(), user, jobId, ids, String(fd.get("status") ?? ""));
    revalidatePath(`/admin/jobs/${jobId}`);
    if (!res.ok) redirect(msg(back, "error", res.reason));
    redirect(msg(back, "ok", res.changed ? `Status changed for ${res.changed}.` : "No changes."));
  });
}

export async function saveApplicantNote(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const returnTo = String(fd.get("returnTo") ?? "");
  const back = returnTo.startsWith("/admin/jobs/") ? returnTo : "/admin/jobs";
  await bounce(back, async () => {
    const user = await authorize("applications.manage");
    const res = await saveApplicationNote(await getDb(), user, id, cleanLongText(fd.get("note"), 2000));
    if (!res.ok) redirect(msg(back, "error", res.reason));
    redirect(msg(back, "ok", res.changed ? "Note saved." : "No changes."));
  });
}

/** Matches tab: record that we invited someone (and email them when email is set up). */
export async function inviteToJob(fd: FormData) {
  const jobId = String(fd.get("jobId") ?? "");
  const back = jobPath(isUuid(jobId) ? jobId : "", "matches");
  await bounce(back, async () => {
    const user = await authorize("jobs.manage");
    const expertId = String(fd.get("expertId") ?? "");
    if (!isUuid(jobId) || !isUuid(expertId)) redirect(back);
    const db = await getDb();
    const found = await getJob(db, jobId);
    if (!found) redirect("/admin/jobs");
    let note = "Marked as invited.";
    let emailed = false;
    if (emailConfigured()) {
      const [e] = await db.select({ email: experts.email, fullName: experts.fullName }).from(experts).where(eq(experts.id, expertId)).limit(1);
      if (e?.email) {
        const link = `${await siteUrl()}/jobs/${found.job.slug}?ref=invite&e=${inviteToken(expertId)}`;
        const sent = await sendEmail({
          to: e.email,
          subject: `A role that fits your profile: ${found.job.title}`,
          text: `Hi ${e.fullName.split(" ")[0]},\n\nWe think this role fits your experience: ${found.job.title}.\n\nRead more and apply here: ${link}\n\n${siteName()}`,
        });
        emailed = sent.sent;
        note = sent.sent ? "Invite sent by email and recorded." : `Recorded. ${sent.reason}`;
      }
    } else note = "Recorded as invited. Email isn't set up, so nothing was sent: copy the invite link and send it yourself.";
    const res = await markInvited(db, user, jobId, expertId, emailed);
    if (!res.ok) redirect(msg(back, "error", res.reason));
    redirect(msg(back, "ok", note));
  });
}

/** Matches tab: put people on the linked requirement's shortlist. */
export async function shortlistFromJob(fd: FormData) {
  const jobId = String(fd.get("jobId") ?? "");
  const back = jobPath(isUuid(jobId) ? jobId : "", "matches");
  await bounce(back, async () => {
    const user = await authorize("matching.shortlist");
    const db = await getDb();
    const found = isUuid(jobId) ? await getJob(db, jobId) : null;
    if (!found?.job.requirementId) redirect(msg(back, "error", "This job isn't linked to a requirement."));
    const one = String(fd.get("one") ?? "");
    const ids = one ? [one] : fd.getAll("ids").map(String);
    const res = await addToRequirement(db, found.job.requirementId, ids, user);
    if (res.error) redirect(msg(back, "error", res.error));
    revalidatePath(`/admin/requirements/${found.job.requirementId}`);
    const parts = [`Shortlisted ${res.added} on the requirement`];
    if (res.already) parts.push(`${res.already} already on it`);
    if (res.blocked.length) parts.push(`skipped ${res.blocked.join(", ")}`);
    redirect(msg(back, "ok", `${parts.join(" · ")}.`));
  });
}
