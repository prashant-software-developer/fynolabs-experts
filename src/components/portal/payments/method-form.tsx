"use client";
// Payments → Payout method: how the expert wants to be paid. UPI ID, PayPal or Wise email, bank
// transfer (we ask for bank details by email, never here) or a short note. Checked on the server.
import { useActionState, useEffect, useState } from "react";
import { savePayoutMethodAction, type MethodFormState } from "@/app/(portal)/me/payments/actions";
import { PAYOUT_METHOD_LABELS, PAYOUT_METHODS } from "@/lib/constants";
import { buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";

type Method = (typeof PAYOUT_METHODS)[number];

const HANDLE: Record<Exclude<Method, "bank_transfer">, { label: string; placeholder: string; hint: string; type: "text" | "email"; max: number }> = {
  upi: { label: "UPI ID", placeholder: "name@okaxis", hint: "The UPI ID you receive money on, like name@okaxis or your mobile number @ybl.", type: "text", max: 100 },
  paypal: { label: "PayPal email", placeholder: "you@example.com", hint: "The email on your PayPal account.", type: "email", max: 254 },
  wise: { label: "Wise email", placeholder: "you@example.com", hint: "The email on your Wise account.", type: "email", max: 254 },
  other: { label: "How should we pay you?", placeholder: "e.g. Payoneer, the email on my profile", hint: "A short note, up to 120 characters.", type: "text", max: 120 },
};

const pill =
  "flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground/85 transition-colors hover:bg-secondary/60 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06] has-[:checked]:text-foreground";

export function PayoutMethodForm({ method: savedMethod, handle: savedHandle }: { method: Method | null; handle: string | null }) {
  const [state, action, pending] = useActionState<MethodFormState, FormData>(savePayoutMethodAction, {});
  const [method, setMethod] = useState<string>(savedMethod ?? "");
  const [handle, setHandle] = useState<string>(savedHandle ?? "");
  // After a save, show what was stored (a UPI ID or email in lower case).
  useEffect(() => {
    if (state.ok && state.values) {
      setMethod(state.values.method);
      setHandle(state.values.handle);
    }
  }, [state]);
  const stale = Boolean(state.values && state.values.method !== method);
  const e = stale ? {} : (state.errors ?? {});
  const meta = method && method !== "bank_transfer" ? HANDLE[method as keyof typeof HANDLE] : null;
  const pick = (m: string) => {
    setMethod(m);
    setHandle(m === savedMethod ? (savedHandle ?? "") : "");
  };
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message && !stale ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      <fieldset>
        <legend className="mb-2.5 text-[13px] font-medium text-foreground/80">How should we pay you?</legend>
        <div className="flex flex-wrap gap-2">
          {PAYOUT_METHODS.map((m) => (
            <label key={m} className={pill}>
              <input type="radio" name="method" value={m} checked={method === m} onChange={() => pick(m)} className="h-4 w-4 accent-primary" />
              {PAYOUT_METHOD_LABELS[m]}
            </label>
          ))}
        </div>
        {e.method ? <p className="mt-1.5 text-xs text-destructive">{e.method}</p> : null}
      </fieldset>
      {method === "bank_transfer" ? <p className="text-sm text-muted-foreground">We&apos;ll ask for your bank details by email when your first payout is due.</p> : null}
      {meta ? (
        <Field label={meta.label} htmlFor="payout-handle" error={e.handle} hint={meta.hint} className="max-w-md">
          <Input
            id="payout-handle"
            name="handle"
            type={meta.type}
            inputMode={method === "other" ? "text" : "email"}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            value={handle}
            maxLength={meta.max}
            onChange={(ev) => setHandle(ev.target.value)}
            placeholder={meta.placeholder}
            aria-invalid={e.handle ? true : undefined}
          />
        </Field>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={pending || !method} className={buttonClass("primary", "md")}>
          {pending ? "Saving..." : "Save payout method"}
        </button>
        <p className="text-xs text-muted-foreground">We never ask for bank account or card numbers here.</p>
      </div>
    </form>
  );
}
