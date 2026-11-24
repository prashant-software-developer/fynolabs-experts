"use server";
// Send referrals: record referrals (one per person) and change outcomes. The Send referrals module
// and referrals.manage are checked on the server; do not contact and the consent rule are enforced
// in recordReferrals.
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { ids, returnPath, str, withFlash } from "@/lib/action-flash";
import { groupExpertIds, recordReferrals, setReferralOutcome } from "@/lib/server/referrals";

export async function recordReferralsAction(fd: FormData) {
  const back = returnPath(fd, "/admin/send-referrals");
  await bounce(back, async () => {
    const user = await authorizeIn("send-referrals", "referrals.manage");
    const db = await getDb();
    const groupId = str(fd, "groupId");
    const people = [...ids(fd), ...(fd.get("wholeGroup") === "yes" && groupId ? await groupExpertIds(db, groupId) : [])];
    const res = await recordReferrals(db, user, {
      expertIds: people,
      platformId: str(fd, "platformId") || null,
      projectId: str(fd, "projectId") || null,
      destination: str(fd, "destination") || null,
      referralUrl: str(fd, "referralUrl") || null,
      method: str(fd, "method"),
      personalNote: str(fd, "personalNote") || null,
      consentConfirmed: fd.get("consentConfirmed") === "yes",
      allowRepeat: fd.get("allowRepeat") === "yes",
    });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    const skipped = res.items.filter((i) => i.result !== "recorded");
    const why = skipped.slice(0, 6).map((i) => `${i.name} (${i.why})`);
    const msg = `${res.recorded} referral${res.recorded === 1 ? "" : "s"} recorded.${skipped.length ? ` Not recorded: ${why.join("; ")}${skipped.length > 6 ? `; and ${skipped.length - 6} more` : ""}.` : ""}`;
    redirect(withFlash(res.recorded ? "/admin/referrals" : back, res.recorded ? "ok" : "error", msg));
  });
}

export async function changeReferralOutcome(fd: FormData) {
  const back = returnPath(fd, "/admin/referrals");
  await bounce(back, async () => {
    const user = await authorizeIn("send-referrals", "referrals.manage");
    const db = await getDb();
    const res = await setReferralOutcome(db, user, ids(fd), str(fd, "outcome"), str(fd, "at") || null);
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash(back, "ok", res.changed ? `Outcome changed for ${res.changed}.` : "No change."));
  });
}
