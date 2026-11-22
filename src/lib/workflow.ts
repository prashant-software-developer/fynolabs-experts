// The rules for moving submissions, experts and requirements between statuses.
import {
  FILLS_SLOT,
  SENT_TO_PARTNER,
  label,
  type ExpertStatus,
  type RequirementStatus,
  type SubmissionStatus,
} from "@/lib/constants";

export type MoveCheck = { ok: true } | { ok: false; reason: string };

/**
 * Can this submission move to `to`? The big rule: nobody's details go to a partner unless they
 * said yes to sharing their CV.
 */
export function checkSubmissionMove(input: {
  from: SubmissionStatus | string;
  to: SubmissionStatus | string;
  cvConsent: string;
  expertStatus: ExpertStatus | string;
  expertName?: string;
}): MoveCheck {
  const { from, to, cvConsent, expertStatus } = input;
  if (from === to) return { ok: true };
  const who = input.expertName ?? "This expert";
  const sending = (SENT_TO_PARTNER as readonly string[]).includes(to);
  const alreadySent = (SENT_TO_PARTNER as readonly string[]).includes(from);
  if (sending && !alreadySent && cvConsent !== "yes") {
    const consent = cvConsent === "no" ? "said no to sharing their CV" : "has no CV consent on record";
    return {
      ok: false,
      reason: `Can't mark as ${label(to).toLowerCase()}: ${who} ${consent}. Ask them, record the answer on their profile, then try again (use "Consent requested" meanwhile).`,
    };
  }
  if (sending && expertStatus === "do_not_contact") {
    return { ok: false, reason: `${who} is marked "Do not contact".` };
  }
  return { ok: true };
}

/** What a submission move does to the expert's own status (only moves forward). */
export function expertStatusAfter(current: ExpertStatus | string, to: SubmissionStatus | string): ExpertStatus | null {
  if ((to === "submitted" || to === "partner_review" || to === "approved") && ["applicant", "screening", "bench"].includes(current)) {
    return "submitted";
  }
  if (to === "active" && current !== "placed" && current !== "do_not_contact") return "placed";
  return null;
}

/** Requirement status from its submissions: open -> filling -> filled. Closed stays closed. */
export function requirementStatusAfter(input: {
  current: RequirementStatus | string;
  slots: number;
  statuses: string[];
}): RequirementStatus | null {
  const { current, slots, statuses } = input;
  if (current === "closed") return null;
  const filled = statuses.filter((s) => (FILLS_SLOT as readonly string[]).includes(s)).length;
  const inPlay = statuses.some((s) => (SENT_TO_PARTNER as readonly string[]).includes(s));
  let next: RequirementStatus = "open";
  if (filled >= slots) next = "filled";
  else if (inPlay || filled > 0) next = "filling";
  return next === current ? null : next;
}

export function filledCount(statuses: string[]): number {
  return statuses.filter((s) => (FILLS_SLOT as readonly string[]).includes(s)).length;
}
