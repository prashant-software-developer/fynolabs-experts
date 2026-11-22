import { SENT_TO_PARTNER, SUBMISSION_STATUSES, label } from "@/lib/constants";
import { checkSubmissionMove } from "@/lib/workflow";
import { updateSubmission } from "@/app/(app)/requirements/actions";
import { SubmitButton } from "./ui/client";

/** Status picker for one submission. Options that need CV consent are disabled, with the reason. */
export function SubmissionStatusForm({
  id,
  status,
  cvConsent,
  expertStatus,
  expertName,
  partnerNote,
  returnTo,
}: {
  id: string;
  status: string;
  cvConsent: string;
  expertStatus: string;
  expertName: string;
  partnerNote: string | null;
  returnTo: string;
}) {
  const blocked = SUBMISSION_STATUSES.filter((s) => !checkSubmissionMove({ from: status, to: s, cvConsent, expertStatus }).ok);
  const needsConsent = blocked.some((s) => (SENT_TO_PARTNER as readonly string[]).includes(s)) && cvConsent !== "yes";
  return (
    <form action={updateSubmission} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <select name="to" defaultValue={status} className="control h-8 w-auto text-[13px]" aria-label={`Status for ${expertName}`}>
        {SUBMISSION_STATUSES.map((s) => (
          <option key={s} value={s} disabled={blocked.includes(s)}>
            {label(s)}
            {blocked.includes(s) ? " (needs CV consent)" : ""}
          </option>
        ))}
      </select>
      <input name="partnerNote" defaultValue={partnerNote ?? ""} placeholder="Note for partner" className="control h-8 w-44 text-[13px]" aria-label="Note for partner" />
      <SubmitButton size="sm" variant="secondary">
        Save
      </SubmitButton>
      {needsConsent ? <span className="w-full text-xs text-warning">Can&apos;t submit yet: CV consent is {label(cvConsent).toLowerCase()}.</span> : null}
    </form>
  );
}
