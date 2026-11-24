import type { ReactNode } from "react";
import { label } from "@/lib/constants";
import { StatusBadge as KitStatusBadge, statusKind, type StatusKind } from "@/components/admin/kit";
import { cn } from "./cn";

/**
 * Badges in the FynoLabs admin look: an uppercase label in a square 1px outline, one hue. The tone
 * names stay for older markup and map onto the three status kinds: positive (brand blue), finished
 * (border + muted text) and everything else (foreground outline). "outline" is for skills and tags.
 */
type Tone = "neutral" | "muted" | "info" | "progress" | "success" | "warning" | "danger" | "outline";

const TONE_KIND: Record<Exclude<Tone, "outline">, StatusKind> = {
  neutral: "neutral",
  muted: "finished",
  info: "neutral",
  progress: "neutral",
  success: "positive",
  warning: "neutral",
  danger: "neutral",
};
const KIND_CLASS: Record<StatusKind, string> = {
  positive: "border-primary text-primary",
  finished: "border-border text-muted-foreground",
  neutral: "border-foreground/70 text-foreground",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  if (tone === "outline") {
    return (
      <span title={title} className={cn("inline-flex h-6 items-center border border-border px-2 text-small leading-none whitespace-nowrap text-foreground", className)}>
        {children}
      </span>
    );
  }
  return (
    <span title={title} className={cn("eyebrow inline-flex h-6 items-center border px-2 leading-none whitespace-nowrap", KIND_CLASS[TONE_KIND[tone]], className)}>
      {children}
    </span>
  );
}

/** Hub statuses that read as positive or finished beyond the shared list in the kit. */
const KIND: Record<string, StatusKind> = {
  bench: "neutral",
  screening: "neutral",
  applicant: "neutral",
  submitted: "neutral",
  placed: "positive",
  do_not_contact: "finished",
  limited: "neutral",
  filling: "neutral",
  filled: "positive",
  shortlisted: "neutral",
  consent_requested: "neutral",
  partner_review: "neutral",
};

export function StatusBadge({ value, prefix }: { value: string | null | undefined; prefix?: string }) {
  if (!value) return <span className="text-muted-foreground/70">–</span>;
  return <KitStatusBadge status={value} kind={KIND[value] ?? statusKind(value)} label={`${prefix ? `${prefix} ` : ""}${label(value)}`} />;
}

/** Skills and tags. `oneLine`: never wraps; the rest is "+n" and the full list is in the tooltip. */
export function Chips({ items, max = 6, tone = "outline", oneLine }: { items: string[]; max?: number; tone?: Tone; oneLine?: boolean }) {
  if (!items.length) return <span className="text-muted-foreground/70">–</span>;
  const shown = items.slice(0, max);
  return (
    <span className={cn("gap-1.5", oneLine ? "flex w-full max-w-full flex-nowrap items-center overflow-hidden" : "inline-flex flex-wrap")} title={items.length > max || oneLine ? items.join(", ") : undefined}>
      {shown.map((s, i) => (
        <Badge key={s} tone={tone === "neutral" ? "outline" : tone} className={cn(oneLine && (i === 0 ? "max-w-[60%] shrink-0" : "min-w-0 shrink"))}>
          {oneLine ? <span className="min-w-0 truncate">{s}</span> : s}
        </Badge>
      ))}
      {items.length > max ? <span className="shrink-0 self-center text-small text-muted-foreground">+{items.length - max}</span> : null}
    </span>
  );
}
