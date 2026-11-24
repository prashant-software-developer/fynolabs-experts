"use server";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, returnPath, str } from "@/lib/crm/flash";
import { emailConfigured } from "@/lib/server/email";
import { deleteMessage, discardDraft, recordReply, saveDraft, setHandled } from "@/lib/server/messages";

const BACK = "/admin/messages";

export async function setMessageHandled(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("messages", "messages.manage");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const handled = str(fd, "handled") === "yes";
    const r = await setHandled(db, str(fd, "id"), handled, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", handled ? "Marked as handled." : "Marked as open.");
  });
}

/** One form, three buttons: save the draft, record a reply sent from your own email app, or send (only with email set up). */
export async function replyToMessage(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("messages", "messages.manage");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const id = str(fd, "id");
    const intent = str(fd, "intent");
    const input = { subject: str(fd, "subject"), body: str(fd, "body") };
    if (intent === "discard") {
      await discardDraft(db, id, user);
      flash(back, "ok", "Draft discarded.");
    }
    if (intent === "send" || intent === "logged") {
      const send = intent === "send";
      if (send && !emailConfigured()) flash(back, "error", "Email isn't set up yet, so nothing was sent. Copy the reply or open it in your email app, then press “I sent it”.");
      const r = await recordReply(db, id, { ...input, send }, user);
      if (!r.ok) flash(back, "error", r.reason);
      flash(back, "ok", send ? "Reply sent." : "Reply recorded. The draft is cleared.");
    }
    const r = await saveDraft(db, id, input, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", "Draft saved.");
  });
}

export async function removeMessage(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("messages", "crm.delete");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const r = await deleteMessage(db, str(fd, "id"), user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", "Deleted message.", { view: null });
  });
}
