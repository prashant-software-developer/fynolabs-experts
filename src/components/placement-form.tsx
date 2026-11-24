"use client";
import Link from "next/link";
import { useActionState, useState, useTransition, type FormEvent } from "react";
import { savePlacement, type PlacementFormState } from "@/app/admin/placements/actions";
import { PLACEMENT_BASIS, PLACEMENT_STATUSES, label } from "@/lib/constants";
import type { PlacementFormValues } from "@/lib/forms/placement";
import { computeMoney, formatMoney } from "@/lib/money";
import { Button } from "./ui/button";
import { Field, FieldRow, Input, Select, Textarea } from "./ui/field";
import { Notice } from "./ui/feedback";

const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));

export function PlacementForm({ id, initial, partners, expertLabel, cancelHref }: { id?: string; initial: PlacementFormValues; partners: { id: string; name: string }[]; expertLabel: string | null; cancelHref: string }) {
  const [state, dispatch, pending] = useActionState<PlacementFormState, FormData>(savePlacement, {});
  const [, startTransition] = useTransition();
  const [v, setV] = useState(initial);
  const err = state.errors ?? {};
  const set = (k: keyof PlacementFormValues, value: string) => setV((o) => ({ ...o, [k]: value }));
  const m = computeMoney({
    basis: v.basis,
    rateToExpert: num(v.rateToExpert),
    rateFromPartner: num(v.rateFromPartner),
    hoursApproved: num(v.hoursApproved),
    tasksAccepted: num(v.tasksAccepted),
    earnedByExpert: num(v.earnedByExpert),
    revenue: num(v.revenue),
  });
  const unit = v.basis === "per_task" ? "task" : "hour";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="expertId" value={v.expertId} />
      <input type="hidden" name="submissionId" value={v.submissionId} />
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <fieldset className="space-y-4">
        <legend className="eyebrow mb-3 text-muted-foreground">Placement</legend>
        {expertLabel ? <p className="text-sm text-foreground/70">Expert: <span className="font-normal text-foreground">{expertLabel}</span></p> : null}
        <FieldRow>
          <Field label="Project" error={err.projectName} htmlFor="projectName" hint="Internal name (field or task type).">
            <Input id="projectName" name="projectName" value={v.projectName} onChange={(e) => set("projectName", e.target.value)} />
          </Field>
          <Field label="Partner" error={err.partnerId} htmlFor="partnerId">
            <Select id="partnerId" name="partnerId" value={v.partnerId} onChange={(e) => set("partnerId", e.target.value)} options={partners.map((p) => ({ value: p.id, label: p.name }))} placeholder="Choose..." />
          </Field>
        </FieldRow>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Start" htmlFor="startDate">
            <Input id="startDate" name="startDate" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label="End" error={err.endDate} htmlFor="endDate">
            <Input id="endDate" name="endDate" type="date" value={v.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" value={v.status} onChange={(e) => set("status", e.target.value)} options={PLACEMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="eyebrow mb-3 text-muted-foreground">Pay (internal)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Basis" htmlFor="basis">
            <Select id="basis" name="basis" value={v.basis} onChange={(e) => set("basis", e.target.value)} options={PLACEMENT_BASIS.map((s) => ({ value: s, label: label(s) }))} />
          </Field>
          <Field label={`Rate to expert (per ${unit})`} error={err.rateToExpert} htmlFor="rateToExpert">
            <Input id="rateToExpert" name="rateToExpert" inputMode="decimal" value={v.rateToExpert} onChange={(e) => set("rateToExpert", e.target.value)} />
          </Field>
          <Field label={`Rate from partner (per ${unit})`} error={err.rateFromPartner} htmlFor="rateFromPartner">
            <Input id="rateFromPartner" name="rateFromPartner" inputMode="decimal" value={v.rateFromPartner} onChange={(e) => set("rateFromPartner", e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Currency" error={err.currency} htmlFor="currency">
            <Input id="currency" name="currency" value={v.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} />
          </Field>
          <Field label="Hours approved" error={err.hoursApproved} htmlFor="hoursApproved">
            <Input id="hoursApproved" name="hoursApproved" inputMode="decimal" value={v.hoursApproved} onChange={(e) => set("hoursApproved", e.target.value)} />
          </Field>
          <Field label="Tasks accepted" error={err.tasksAccepted} htmlFor="tasksAccepted">
            <Input id="tasksAccepted" name="tasksAccepted" inputMode="numeric" value={v.tasksAccepted} onChange={(e) => set("tasksAccepted", e.target.value)} />
          </Field>
        </div>
        <FieldRow>
          <Field label="Earned by expert" error={err.earnedByExpert} htmlFor="earnedByExpert" hint={v.earnedByExpert ? "Typed in." : `Leave empty to use ${unit}s x rate.`}>
            <Input id="earnedByExpert" name="earnedByExpert" inputMode="decimal" value={v.earnedByExpert} onChange={(e) => set("earnedByExpert", e.target.value)} placeholder={m.earned != null ? String(m.earned) : ""} />
          </Field>
          <Field label="Revenue (from partner)" error={err.revenue} htmlFor="revenue" hint={v.revenue ? "Typed in." : `Leave empty to use ${unit}s x rate.`}>
            <Input id="revenue" name="revenue" inputMode="decimal" value={v.revenue} onChange={(e) => set("revenue", e.target.value)} placeholder={m.revenue != null ? String(m.revenue) : ""} />
          </Field>
        </FieldRow>
        <p className="tabular text-sm text-foreground/70">
          Expert earns <b>{formatMoney(m.earned, v.currency || "USD")}</b> · revenue <b>{formatMoney(m.revenue, v.currency || "USD")}</b> · margin <b>{formatMoney(m.margin, v.currency || "USD")}</b>
        </p>
        <Field label="Notes (internal)" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </fieldset>
      <div className="flex items-center gap-3 border-t border-border pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : id ? "Save changes" : "Create placement"}
        </Button>
        <Link href={cancelHref} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  );
}
