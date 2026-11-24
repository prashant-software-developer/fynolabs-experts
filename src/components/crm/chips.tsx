// Stage chips and bars, due-date chips and owner labels for the CRM screens (FynoLabs wording).
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { StagePipeline } from "@/components/admin/crm-kit";
import { CONTACT_STEPS, STAGE_STEPS, crmLabel, dueState, isParked, stageGroup } from "@/lib/crm/labels";
import { shortDay } from "@/lib/crm/dates";

const GROUP_TONE = { early: "neutral", talks: "info", won: "success", parked: "muted" } as const;

export function StageChip({ stage }: { stage: string }) {
  return <Badge tone={GROUP_TONE[stageGroup(stage)]}>{crmLabel(stage)}</Badge>;
}

/** The 7 steps from Researching to Active (FynoLabs StagePipeline): filled up to the stage; won in the brand blue, parked grey. */
export function StageBar({ stage, compact }: { stage: string; compact?: boolean }) {
  const parked = isParked(stage);
  const step = (STAGE_STEPS as readonly string[]).indexOf(stage);
  if (compact) return <span className={cn("text-small whitespace-nowrap", parked ? "text-muted-foreground" : "text-foreground")}>{crmLabel(stage)}</span>;
  return <StagePipeline steps={STAGE_STEPS} current={parked ? -1 : step} label={crmLabel(stage)} parked={parked} wonFrom={(STAGE_STEPS as readonly string[]).indexOf("pilot")} />;
}

/** Leads: New → Won in 6 steps; Lost shows an empty grey bar. */
export function ContactStageBar({ stage }: { stage: string }) {
  const step = (CONTACT_STEPS as readonly string[]).indexOf(stage);
  const lost = stage === "lost";
  return <StagePipeline steps={CONTACT_STEPS} current={lost ? -1 : step} label={crmLabel(stage, "contact")} parked={lost} wonFrom={(CONTACT_STEPS as readonly string[]).indexOf("won")} />;
}

export function ContactStageChip({ stage }: { stage: string }) {
  return <Badge tone={stage === "won" ? "success" : stage === "lost" ? "muted" : stage === "new" ? "outline" : "neutral"}>{crmLabel(stage, "contact")}</Badge>;
}

/** "Late · 5 Nov" / "Today" in red, the date in 3 days in normal text, later dates muted. */
export function DueChip({ due, today, stage, empty = "–" }: { due: string | null | undefined; today: string; stage?: string | null; empty?: string }) {
  const s = dueState(due, today, stage);
  if (!due || !s) return <span className="text-muted-foreground/70">{due ? shortDay(due, today) : empty}</span>;
  const text = s === "overdue" ? `Late · ${shortDay(due, today)}` : s === "today" ? "Today" : shortDay(due, today);
  return (
    <span className={cn("inline-flex items-center gap-1 text-small whitespace-nowrap", s === "overdue" || s === "today" ? "font-normal text-danger" : s === "soon" ? "text-foreground/85" : "text-muted-foreground")}>
      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {text}
    </span>
  );
}

const STATUS_TONE: Record<string, "neutral" | "muted" | "info" | "success" | "warning" | "danger" | "progress"> = {
  planned: "neutral",
  waiting: "warning",
  done: "success",
  cancelled: "muted",
  active: "success",
  paused: "warning",
  inactive: "muted",
  closed: "muted",
};

export function StatusChip({ value, ctx }: { value: string; ctx?: "platform_status" | "calendar" }) {
  return <Badge tone={STATUS_TONE[value] ?? "neutral"}>{crmLabel(value, ctx)}</Badge>;
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-background text-[0.625rem] tracking-wider text-foreground", className)} aria-hidden>
      {initials || "?"}
    </span>
  );
}

/** A small dot for high priority. */
export function PriorityDot({ priority }: { priority: string }) {
  if (priority !== "high") return null;
  return <span className="eyebrow ml-2 inline-flex border border-primary px-1.5 align-middle leading-4 text-primary" title="High priority">High</span>;
}

/** Eyebrow-style fact tiles for side panels: label over value, empty ones hidden. */
export function Facts({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  const shown = items.filter((i) => i.value != null && i.value !== "" && i.value !== false);
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-2 border-t border-l border-border sm:grid-cols-3">
      {shown.map((i) => (
        <div key={i.label} className="min-w-0 border-r border-b border-border p-4">
          <dt className="eyebrow text-muted-foreground">{i.label}</dt>
          <dd className="mt-1 text-small break-words text-foreground">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
