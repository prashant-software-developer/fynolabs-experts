"use server";
// Send emails (campaigns): templates, prepare a draft (recipients worked out on the server, with the
// skip reasons), edit, approve, cancel, send. Send emails module; campaigns.manage / .approve.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { ids, returnPath, str, withFlash } from "@/lib/action-flash";
import { approveCampaign, cancelCampaign, deleteEmailTemplate, expertIdsFor, MAX_RECIPIENTS, prepareCampaign, saveEmailTemplate, sendCampaignBatch, updateCampaignDraft, type RecipientSource } from "@/lib/server/campaigns";

const campaignFields = (fd: FormData) => ({
  name: str(fd, "name"),
  kind: str(fd, "kind"),
  templateId: str(fd, "templateId"),
  subject: str(fd, "subject"),
  body: String(fd.get("body") ?? ""),
  jobId: str(fd, "jobId"),
  projectId: str(fd, "projectId"),
  followUp: fd.get("followUp") === "yes",
  followUpSubject: str(fd, "followUpSubject"),
  followUpBody: String(fd.get("followUpBody") ?? ""),
  followUpAfterDays: str(fd, "followUpAfterDays") || "4",
});

export async function saveTemplateAction(fd: FormData) {
  const back = returnPath(fd, "/admin/campaigns?tab=templates");
  await bounce(back, async () => {
    const user = await authorizeIn("referrals", "campaigns.manage");
    const db = await getDb();
    const res = await saveEmailTemplate(db, user, { id: str(fd, "id") || null, name: str(fd, "name"), kind: str(fd, "kind"), subject: str(fd, "subject"), body: String(fd.get("body") ?? ""), projectId: str(fd, "projectId") });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash("/admin/campaigns?tab=templates", "ok", "Template saved."));
  });
}

export async function deleteTemplateAction(fd: FormData) {
  await bounce("/admin/campaigns?tab=templates", async () => {
    const user = await authorizeIn("referrals", "campaigns.manage");
    const db = await getDb();
    const res = await deleteEmailTemplate(db, user, str(fd, "id"));
    if (!res.ok) redirect(withFlash("/admin/campaigns?tab=templates", "error", res.reason));
    redirect(withFlash("/admin/campaigns?tab=templates", "ok", "Template deleted. Campaigns made from it keep their copy."));
  });
}

/** Who it goes to: the people picked on Experts, a saved view, the experts filters, a job, a project or a group. */
function sourceFrom(fd: FormData, viewerEmail: string): RecipientSource | null {
  switch (str(fd, "source")) {
    case "experts":
      return { kind: "experts", ids: [...ids(fd), ...str(fd, "expertIds").split(",").filter(Boolean)] };
    case "view":
      return { kind: "view", viewId: str(fd, "viewId"), viewerEmail };
    case "filters":
      return { kind: "filters", params: str(fd, "params"), viewerEmail };
    case "job":
      return { kind: "job", jobId: str(fd, "sourceJobId"), stage: str(fd, "stage") || undefined };
    case "project":
      return { kind: "project", projectId: str(fd, "sourceProjectId"), stage: str(fd, "stage") || undefined };
    case "group":
      return { kind: "group", groupId: str(fd, "groupId") };
    default:
      return null;
  }
}

export async function prepareCampaignAction(fd: FormData) {
  const back = returnPath(fd, "/admin/campaigns/new");
  await bounce(back, async () => {
    const user = await authorizeIn("referrals", "campaigns.manage");
    const db = await getDb();
    const src = sourceFrom(fd, user.email);
    if (!src) redirect(withFlash(back, "error", "Pick who it goes to."));
    const people = await expertIdsFor(db, src);
    if (people.length > MAX_RECIPIENTS) redirect(withFlash(back, "error", `That's more than ${MAX_RECIPIENTS.toLocaleString("en-US")} people. Narrow it down (a saved view with more filters, a stage).`));
    const res = await prepareCampaign(db, user, { ...campaignFields(fd), expertIds: people });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    revalidatePath("/admin/campaigns");
    redirect(withFlash(`/admin/campaigns/${res.id}`, "ok", `Draft ready: ${res.toSend} will get it, ${res.skipped} skipped. Read it through, then approve.`));
  });
}

export async function updateDraftAction(fd: FormData) {
  const id = str(fd, "id");
  const back = returnPath(fd, `/admin/campaigns/${id}`);
  await bounce(back, async () => {
    const user = await authorizeIn("referrals", "campaigns.manage");
    const db = await getDb();
    const res = await updateCampaignDraft(db, user, id, campaignFields(fd));
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash(back, "ok", "Draft saved."));
  });
}

export async function approveCampaignAction(fd: FormData) {
  const id = str(fd, "id");
  const back = returnPath(fd, `/admin/campaigns/${id}`);
  await bounce(back, async () => {
    const user = await authorizeIn("referrals", "campaigns.approve");
    const db = await getDb();
    const res = await approveCampaign(db, user, id);
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash(back, "ok", `Approved: ${res.toSend} to send. Sending starts once email is set up.`));
  });
}

export async function cancelCampaignAction(fd: FormData) {
  const id = str(fd, "id");
  const back = returnPath(fd, `/admin/campaigns/${id}`);
  await bounce(back, async () => {
    const user = await authorizeIn("referrals", "campaigns.manage");
    const db = await getDb();
    const res = await cancelCampaign(db, user, id);
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash(back, "ok", "Cancelled. Nothing more will go out."));
  });
}

export async function sendCampaignAction(fd: FormData) {
  const id = str(fd, "id");
  const back = returnPath(fd, `/admin/campaigns/${id}`);
  await bounce(back, async () => {
    const user = await authorizeIn("referrals", "campaigns.approve");
    const db = await getDb();
    const res = await sendCampaignBatch(db, user, id);
    redirect(withFlash(back, "error", res.reason));
  });
}
