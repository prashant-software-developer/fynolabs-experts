"use client";
// Add payout (step 2, the expert is known). What was typed comes back with the error; the form is
// rebuilt after each try so selects keep their values too.
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { addPayoutAction, type AddPayoutState } from "./actions";

const STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming (earned, not paid yet)" },
  { value: "processing", label: "Processing (on its way)" },
  { value: "paid", label: "Paid" },
];
const CURRENCIES = ["INR", "USD"];

export function AddPayoutForm({ expertId, placements, defaultPlacement, today }: { expertId: string; placements: { value: string; label: string }[]; defaultPlacement: string; today: string }) {
  const [state, action, pending] = useActionState<AddPayoutState, FormData>(addPayoutAction, {});
  const v = (k: string, fallback = "") => state.values?.[k] ?? fallback;
  const err = (k: string) => (state.field === k ? state.message : undefined);
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-4" noValidate>
      <input type="hidden" name="expertId" value={expertId} />
      {state.message && !state.field ? <Notice tone="error">{state.message}</Notice> : null}
      {state.message && state.field ? <Notice tone="error">Check the highlighted field.</Notice> : null}
      <Field label="Project" htmlFor="placementId" error={err("placementId")} hint={placements.length ? "Optional. The expert sees the project, never the client." : "This expert has no placements; the payout shows under Other payouts."}>
        <Select id="placementId" name="placementId" defaultValue={v("placementId", defaultPlacement)} options={placements} placeholder="No project" disabled={!placements.length} />
      </Field>
      <Field label="Label" htmlFor="label" error={err("label")} hint="Shown to the expert, e.g. November 2026 or Week 47. Never the client's name.">
        <Input id="label" name="label" maxLength={120} defaultValue={v("label")} />
      </Field>
      <FieldRow>
        <Field label="Amount *" htmlFor="amount" error={err("amount")}>
          <Input id="amount" name="amount" inputMode="decimal" required defaultValue={v("amount")} placeholder="12000" />
        </Field>
        <Field label="Currency" htmlFor="currency" error={err("currency")}>
          <Select id="currency" name="currency" defaultValue={v("currency", "INR")} options={CURRENCIES} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Period start" htmlFor="periodStart" error={err("periodStart")}>
          <Input id="periodStart" name="periodStart" type="date" defaultValue={v("periodStart")} />
        </Field>
        <Field label="Period end" htmlFor="periodEnd" error={err("periodEnd")}>
          <Input id="periodEnd" name="periodEnd" type="date" defaultValue={v("periodEnd")} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Expected on" htmlFor="expectedOn" error={err("expectedOn")} hint="When the expert can expect it.">
          <Input id="expectedOn" name="expectedOn" type="date" defaultValue={v("expectedOn")} />
        </Field>
        <Field label="Status" htmlFor="status" error={err("status")}>
          <Select id="status" name="status" defaultValue={v("status", "upcoming")} options={STATUS_OPTIONS} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Paid on" htmlFor="paidOn" error={err("paidOn")} hint="Only if paid. Empty means today.">
          <Input id="paidOn" name="paidOn" type="date" max={today} defaultValue={v("paidOn")} />
        </Field>
        <Field label="Reference" htmlFor="reference" error={err("reference")} hint="UTR or transaction ID. The expert sees it.">
          <Input id="reference" name="reference" maxLength={120} defaultValue={v("reference")} />
        </Field>
      </FieldRow>
      <Field label="Internal note" htmlFor="notes" hint="Team only. The expert never sees it.">
        <Textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={v("notes")} />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
        {pending ? "Adding..." : "Add payout"}
      </button>
    </form>
  );
}
