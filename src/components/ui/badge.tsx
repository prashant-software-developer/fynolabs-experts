import type { ReactNode } from "react";
import { label } from "@/lib/constants";
import { cn } from "./cn";

/**
 * Status pills: soft tints, never the primary blue (that is kept for the main action and links).
 * "outline" is for skills and tags, so they read differently from statuses.
 */
type Tone = "neutral" | "muted" | "info" | "progress" | "success" | "warning" | "danger" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-secondary text-foreground/80",
  muted: "bg-secondary text-muted-foreground",
  info: "bg-info-soft text-info",
  progress: "bg-progress-soft text-progress",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  outline: "border border-border bg-background text-foreground/80",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-xs leading-none font-medium whitespace-nowrap", tones[tone], className)}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  // experts
  applicant: "neutral",
  screening: "progress",
  bench: "info",
  submitted: "warning",
  placed: "success",
  inactive: "muted",
  do_not_contact: "danger",
  // availability
  available: "success",
  limited: "warning",
  busy: "muted",
  unavailable: "muted",
  // consent
  yes: "success",
  no: "danger",
  unknown: "muted",
  // requirements
  open: "info",
  filling: "warning",
  filled: "success",
  closed: "muted",
  // submissions
  shortlisted: "neutral",
  consent_requested: "progress",
  partner_review: "warning",
  approved: "success",
  rejected: "danger",
  active: "success",
  ended: "muted",
  withdrawn: "muted",
  // placements
  paused: "warning",
};

export function StatusBadge({ value, prefix }: { value: string | null | undefined; prefix?: string }) {
  if (!value) return <span className="text-muted-foreground/70">–</span>;
  return (
    <Badge tone={STATUS_TONE[value] ?? "neutral"}>
      {prefix ? `${prefix} ` : ""}
      {label(value)}
    </Badge>
  );
}

export function Chips({ items, max = 6, tone = "outline" }: { items: string[]; max?: number; tone?: Tone }) {
  if (!items.length) return <span className="text-muted-foreground/70">–</span>;
  const shown = items.slice(0, max);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((s) => (
        <Badge key={s} tone={tone === "neutral" ? "outline" : tone} className="font-normal">
          {s}
        </Badge>
      ))}
      {items.length > max ? <span className="self-center text-xs text-muted-foreground">+{items.length - max}</span> : null}
    </span>
  );
}
