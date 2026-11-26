"use server";
// Experts: pipelines, outreach, do not contact, timeline notes, documents and the bulk actions of the
// list. Every action checks the Experts module and the role on the server; every write records who.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { ids, returnPath, str, withFlash } from "@/lib/action-flash";
import { normalizeTags } from "@/lib/normalize";
import { addToJob, setPipelineStage, updatePipeline } from "@/lib/server/pipelines";
import { addTimelineNote, changeTags, setDocumentStatus, setDoNotContact, updateOutreach } from "@/lib/server/expert-records";
import { addGroupMembers } from "@/lib/server/referrals";
import { prepareCampaign } from "@/lib/server/campaigns";
import { isUuid } from "@/lib/server/experts";

const opt = (fd: FormData, k: string) => (fd.has(k) ? str(fd, k) : undefined);

export async function movePipelineStage(fd: FormData) {
  const back = returnPath(fd, "/admin/experts");
  await bounce(back, async () => {
    const user = await authorizeIn("profiles", "applications.manage");
    const db = await getDb();
    const res = await setPipelineStage(db, user, str(fd, "id"), { stage: str(fd, "stage"), rejectReason: str(fd, "rejectReason") || null, ...(fd.has("startedOn") ? { startedOn: str(fd, "startedOn") || null } : {}), ...(fd.has("endedOn") ? { endedOn: str(fd, "endedOn") || null } : {}), detail: str(fd, "detail") || null });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    revalidatePath("/admin/experts");
    redirect(withFlash(back, "ok", res.changed ? `${res.summary ?? "Stage changed"}.` : "No change."));
  });
}

export async function savePipeline(fd: FormData) {
  const back = returnPath(fd, "/admin/experts");
  await bounce(back, async () => {
    const user = await authorizeIn("profiles", "applications.manage");
    const db = await getDb();
    const id = str(fd, "id");
    const res = await updatePipeline(db, user, id, { ownerTeamMemberId: opt(fd, "ownerTeamMemberId"), nextAction: opt(fd, "nextAction"), nextActionDue: opt(fd, "nextActionDue"), trackId: opt(fd, "trackId") });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    // Contract dates go through the stage rules (the end can't be before the start).
    if (fd.has("startedOn") || fd.has("endedOn")) {
      const stage = str(fd, "currentStage");
      const dates = await setPipelineStage(db, user, id, { stage, startedOn: str(fd, "startedOn") || null, endedOn: str(fd, "endedOn") || null });
      if (!dates.ok) redirect(withFlash(back, "error", dates.reason));
    }
    redirect(withFlash(back, "ok", res.changed.length || fd.has("startedOn") ? "Pipeline saved." : "No change."));
  });
}

export async function addExpertsToJob(fd: FormData) {
  const back = returnPath(fd, "/admin/experts");
  await bounce(back, async () => {
    const user = await authorizeIn("profiles", "applications.manage");
    const db = await getDb();
    const res = await addToJob(db, user, { expertIds: ids(fd), jobId: str(fd, "jobId"), stage: str(fd, "startStage") });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    const parts = [`${res.added} added to ${res.jobTitle}`];
    if (res.already) parts.push(`${res.already} already on it`);
    if (res.skipped) parts.push(`${res.skipped} skipped (do not contact)`);
    redirect(withFlash(back, "ok", `${parts.join(", ")}.`));
  });
}

export async function saveOutreach(fd: FormData) {
  const id = str(fd, "id");
  const back = returnPath(fd, `/admin/experts/${isUuid(id) ? id : ""}`);
  await bounce(back, async () => {
    const user = await authorizeIn("profiles", "experts.edit");
    const db = await getDb();
    const res = await updateOutreach(db, user, [id], {
      ownerTeamMemberId: opt(fd, "ownerTeamMemberId"),
      outreachStatus: opt(fd, "outreachStatus"),
      nextAction: opt(fd, "nextAction"),
      nextActionDue: opt(fd, "nextActionDue"),
      sourceChannel: opt(fd, "sourceChannel"),
      sourceDetail: opt(fd, "sourceDetail"),
    });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    if (fd.has("dncShown")) {
      const dnc = await setDoNotContact(db, user, [id], fd.get("dnc") === "yes", str(fd, "dncReason") || null);
      if (!dnc.ok) redirect(withFlash(back, "error", dnc.reason));
    }
    revalidatePath(`/admin/experts/${id}`);
    redirect(withFlash(back, "ok", "Saved."));
  });
}

export async function addExpertNote(fd: FormData) {
  const id = str(fd, "id");
  const back = returnPath(fd, `/admin/experts/${isUuid(id) ? id : ""}`);
  await bounce(back, async () => {
    const user = await authorizeIn("profiles", "experts.notes");
    const db = await getDb();
    const res = await addTimelineNote(db, user, id, str(fd, "note"), str(fd, "applicationId") || null);
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash(back, "ok", "Note added."));
  });
}

export async function changeDocumentStatus(fd: FormData) {
  const back = returnPath(fd, "/admin/experts");
  await bounce(back, async () => {
    const user = await authorizeIn("profiles", "experts.edit");
    const db = await getDb();
    const res = await setDocumentStatus(db, user, str(fd, "id"), str(fd, "status"));
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash(back, "ok", res.changed ? `Document: ${res.label}.` : "No change."));
  });
}

/** The experts list's bulk actions (the ticked people). */
export async function bulkExperts(fd: FormData) {
  const back = returnPath(fd, "/admin/experts");
  await bounce(back, async () => {
    const op = str(fd, "op");
    const picked = ids(fd);
    if (!op) redirect(withFlash(back, "error", "Pick an action first."));
    if (!picked.length) redirect(withFlash(back, "error", "Tick at least one expert."));
    const db = await getDb();
    if (op === "owner" || op === "outreach") {
      const user = await authorizeIn("profiles", "experts.edit");
      const res = await updateOutreach(db, user, picked, op === "owner" ? { ownerTeamMemberId: str(fd, "ownerTeamMemberId") || null } : { outreachStatus: str(fd, "outreachStatus") || null });
      if (!res.ok) redirect(withFlash(back, "error", res.reason));
      redirect(withFlash(back, "ok", `${op === "owner" ? "Owner" : "Outreach"} set for ${res.updated}.`));
    }
    if (op === "add_tags" || op === "remove_tags") {
      const user = await authorizeIn("profiles", "experts.edit");
      const res = await changeTags(db, user, picked, normalizeTags(str(fd, "tags")), op === "remove_tags");
      if (!res.ok) redirect(withFlash(back, "error", res.reason));
      redirect(withFlash(back, "ok", `Tags ${op === "remove_tags" ? "removed from" : "added to"} ${res.updated}.`));
    }
    if (op === "dnc") {
      const user = await authorizeIn("profiles", "experts.edit");
      const res = await setDoNotContact(db, user, picked, true, str(fd, "dncReason") || null);
      if (!res.ok) redirect(withFlash(back, "error", res.reason));
      redirect(withFlash(back, "ok", `${res.updated} marked do not contact.`));
    }
    if (op === "add_job") {
      const user = await authorizeIn("profiles", "applications.manage");
      const res = await addToJob(db, user, { expertIds: picked, jobId: str(fd, "jobId"), stage: str(fd, "startStage") });
      if (!res.ok) redirect(withFlash(back, "error", res.reason));
      redirect(withFlash(back, "ok", `${res.added} added to ${res.jobTitle}${res.already ? `, ${res.already} already on it` : ""}${res.skipped ? `, ${res.skipped} skipped (do not contact)` : ""}.`));
    }
    if (op === "add_group") {
      const user = await authorizeIn("profiles", "groups.manage");
      const groupId = str(fd, "groupId");
      const res = await addGroupMembers(db, user, groupId, { expertIds: picked });
      if (!res.ok) redirect(withFlash(back, "error", res.reason));
      redirect(withFlash(back, "ok", `${res.added} added to the group${res.already ? `, ${res.already} already in it` : ""}${res.noEmail ? `, ${res.noEmail} without an email left out` : ""}.`));
    }
    if (op === "email") {
      const user = await authorizeIn("referrals", "campaigns.manage");
      // A draft with these people; the wording is written on the campaign's page before approving.
      const res = await prepareCampaign(db, user, { name: `Selection ${new Date().toISOString().slice(0, 10)}`, kind: "outreach", subject: "", body: "", expertIds: picked, allowEmpty: true });
      if (!res.ok) redirect(withFlash(back, "error", res.reason));
      redirect(withFlash(`/admin/campaigns/${res.id}`, "ok", `Draft ready: ${res.toSend} will get it, ${res.skipped} skipped. Write the email, then approve.`));
    }
    if (op === "refer") {
      await authorizeIn("send-referrals", "referrals.manage");
      redirect(`/admin/send-referrals?ids=${picked.slice(0, 200).join(",")}`);
    }
    redirect(withFlash(back, "error", "Unknown action."));
  });
}
