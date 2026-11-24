"use client";
// Interactive bits of the talent screens. Each is a plain form underneath, so the server action and
// its checks do the work; JavaScript only shows the right fields.
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS, REJECT_REASONS } from "@/lib/constants";
import { REJECT_REASON_LABELS } from "@/lib/talent";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

type Action = (fd: FormData) => void | Promise<void>;

function Pending({ children, pendingText = "Saving...", className, variant = "secondary", formAction, name, value, disabled, form }: { children: ReactNode; pendingText?: string; className?: string; variant?: "primary" | "secondary" | "ghost" | "danger"; formAction?: Action; name?: string; value?: string; disabled?: boolean; form?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" form={form} formAction={formAction} name={name} value={value} disabled={pending || disabled} className={buttonClass(variant, "sm", className)}>
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * Change a pipeline's stage. Any stage but Rejected saves as soon as it's picked; Rejected asks why
 * first (the reason is required, as in the FynoLabs list).
 */
export function StageForm({ action, id, stage, rejectReason, returnTo, compact }: { action: Action; id: string; stage: string; rejectReason?: string | null; returnTo: string; compact?: boolean }) {
  const [to, setTo] = useState(stage);
  const [reason, setReason] = useState(rejectReason ?? "");
  const asking = to === "rejected" && (stage !== "rejected" || reason !== (rejectReason ?? ""));
  return (
    <form action={action} className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <select
        name="stage"
        value={to}
        aria-label="Stage"
        className={cn("control w-auto", compact ? "h-7 text-xs" : "h-8 text-small")}
        onChange={(e) => {
          setTo(e.currentTarget.value);
          if (e.currentTarget.value !== "rejected") e.currentTarget.form?.requestSubmit();
        }}
      >
        {PIPELINE_STAGES.map((s) => (
          <option key={s} value={s}>
            {PIPELINE_STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      {to === "rejected" ? (
        <>
          <select name="rejectReason" value={reason} onChange={(e) => setReason(e.currentTarget.value)} aria-label="Why rejected" required className={cn("control w-auto", compact ? "h-7 text-xs" : "h-8 text-small")}>
            <option value="">Why?</option>
            {REJECT_REASONS.map((r) => (
              <option key={r} value={r}>
                {REJECT_REASON_LABELS[r]}
              </option>
            ))}
          </select>
          {asking ? (
            <Pending variant="danger" disabled={!reason} pendingText="Saving...">
              Reject
            </Pending>
          ) : null}
        </>
      ) : null}
      <noscript>
        <button className="text-sm">Save</button>
      </noscript>
    </form>
  );
}

/** Platform and referral link: picking a platform (or a project) fills in its saved referral link, unless one was typed. */
export function ReferralTarget({
  platforms,
  projects,
  platformId,
  projectId,
  link,
}: {
  platforms: { id: string; name: string; referralUrl: string | null }[];
  projects: { id: string; label: string; referralUrl: string | null; platformId: string | null }[];
  platformId?: string;
  projectId?: string;
  link?: string;
}) {
  const [pf, setPf] = useState(platformId ?? "");
  const [pj, setPj] = useState(projectId ?? "");
  const [url, setUrl] = useState(link ?? "");
  const [typed, setTyped] = useState(Boolean(link));
  const fill = (next: string | null | undefined) => {
    if (!typed && next) setUrl(next);
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="min-w-0 space-y-1.5">
        <span className="block eyebrow text-muted-foreground">Platform</span>
        <select
          name="platformId"
          value={pf}
          className="control"
          onChange={(e) => {
            setPf(e.currentTarget.value);
            fill(platforms.find((p) => p.id === e.currentTarget.value)?.referralUrl);
          }}
        >
          <option value="">No platform record</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 space-y-1.5">
        <span className="block eyebrow text-muted-foreground">Project</span>
        <select
          name="projectId"
          value={pj}
          className="control"
          onChange={(e) => {
            setPj(e.currentTarget.value);
            const p = projects.find((x) => x.id === e.currentTarget.value);
            if (p?.platformId && !pf) setPf(p.platformId);
            fill(p?.referralUrl ?? platforms.find((x) => x.id === p?.platformId)?.referralUrl);
          }}
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 space-y-1.5 sm:col-span-2">
        <span className="block eyebrow text-muted-foreground">Referral link</span>
        <input
          name="referralUrl"
          value={url}
          onChange={(e) => {
            setUrl(e.currentTarget.value);
            setTyped(Boolean(e.currentTarget.value));
          }}
          placeholder="https://…"
          className="control"
          inputMode="url"
        />
        <span className="block text-xs text-muted-foreground">Picking a platform or project fills in its saved referral link.</span>
      </label>
    </div>
  );
}

/** A select whose choice shows the matching extra fields (bulk actions). Children are keyed by option value. */
export function ChoiceFields({ name, options, fields, placeholder, className, form }: { name: string; options: { value: string; label: string }[]; fields: Record<string, ReactNode>; placeholder: string; className?: string; form?: string }) {
  const [v, setV] = useState("");
  return (
    <>
      <select name={name} form={form} value={v} onChange={(e) => setV(e.currentTarget.value)} className={cn("control h-8 w-auto text-small", className)} aria-label={placeholder}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {v && fields[v] ? fields[v] : null}
    </>
  );
}

export { Pending as PendingButton };
