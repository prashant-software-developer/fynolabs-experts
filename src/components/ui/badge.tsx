import type { ReactNode } from "react";
import { label } from "@/lib/constants";
import { cn } from "./cn";

type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "violet" | "slate";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  slate: "bg-slate-100 text-slate-500",
  blue: "bg-accent-soft text-accent-ink",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  violet: "bg-violet-50 text-violet-700",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  // experts
  applicant: "neutral",
  screening: "violet",
  bench: "blue",
  submitted: "amber",
  placed: "green",
  inactive: "slate",
  do_not_contact: "red",
  // availability
  available: "green",
  limited: "amber",
  busy: "slate",
  unavailable: "slate",
  // consent
  yes: "green",
  no: "red",
  unknown: "slate",
  // requirements
  open: "blue",
  filling: "amber",
  filled: "green",
  closed: "slate",
  // submissions
  shortlisted: "neutral",
  consent_requested: "violet",
  partner_review: "amber",
  approved: "green",
  rejected: "red",
  active: "green",
  ended: "slate",
  withdrawn: "slate",
  // placements
  paused: "amber",
};

export function StatusBadge({ value, prefix }: { value: string | null | undefined; prefix?: string }) {
  if (!value) return <span className="text-slate-400">–</span>;
  return (
    <Badge tone={STATUS_TONE[value] ?? "neutral"}>
      {prefix ? `${prefix} ` : ""}
      {label(value)}
    </Badge>
  );
}

export function Chips({ items, max = 6, tone = "neutral" }: { items: string[]; max?: number; tone?: Tone }) {
  if (!items.length) return <span className="text-slate-400">–</span>;
  const shown = items.slice(0, max);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((s) => (
        <Badge key={s} tone={tone} className="font-normal">
          {s}
        </Badge>
      ))}
      {items.length > max ? <span className="text-xs text-slate-500">+{items.length - max}</span> : null}
    </span>
  );
}
