// Stage chips and bars, due-date chips and owner labels for the CRM screens (FynoLabs wording).
import { CalendarDays } from "lucide-react";
import { Avatar, type AvatarSize } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { CONTACT_STEPS, STAGE_STEPS, crmLabel, dueState, isParked, stageGroup } from "@/lib/crm/labels";
import { shortDay } from "@/lib/crm/dates";

const GROUP_TONE = { early: "neutral", talks: "info", won: "success", parked: "muted" } as const;

/**
 * Where a record is on its way: the stage name over a row of thin rounded steps, filled up to the
 * stage (dark), green from the winning step on, grey when it is parked (on hold, dropped, rejected, lost).
 */
export function StageSteps({ steps, current, label, parked = false, wonFrom, width = 140, hideLabel = false }: { steps: readonly string[]; current: number; label: string; parked?: boolean; wonFrom?: number; width?: number; hideLabel?: boolean }) {
  const won = wonFrom !== undefined && current >= wonFrom;
  return (
    <span className="flex min-w-0 flex-col gap-1.5" title={`${label} · step ${Math.max(current, 0) + 1} of ${steps.length}`}>
      {hideLabel ? null : <span className={cn("truncate text-sm", parked ? "text-muted-foreground" : "text-foreground")}>{label}</span>}
      <span className="flex gap-[3px]" style={{ width }} aria-hidden="true">
        {steps.map((step, i) => (
          <span key={step} className={cn("h-1.5 flex-1 rounded-full", i > current ? "bg-foreground/[0.08]" : parked ? "bg-muted-foreground/40" : won ? "bg-success" : "bg-foreground/70")} />
        ))}
      </span>
    </span>
  );
}

export function StageChip({ stage }: { stage: string }) {
  return (
    <Badge tone={GROUP_TONE[stageGroup(stage)]} pill dot>
      {crmLabel(stage)}
    </Badge>
  );
}

/** The 7 steps from Researching to Active (FynoLabs StagePipeline): filled up to the stage; won in green, parked grey. */
export function StageBar({ stage, compact }: { stage: string; compact?: boolean }) {
  const parked = isParked(stage);
  const step = (STAGE_STEPS as readonly string[]).indexOf(stage);
  if (compact) return <span className={cn("text-small whitespace-nowrap", parked ? "text-muted-foreground" : "text-foreground")}>{crmLabel(stage)}</span>;
  return <StageSteps steps={STAGE_STEPS} current={parked ? -1 : step} label={crmLabel(stage)} parked={parked} wonFrom={(STAGE_STEPS as readonly string[]).indexOf("pilot")} />;
}

/** Leads: New → Won in 6 steps; Lost shows an empty grey bar. */
export function ContactStageBar({ stage }: { stage: string }) {
  const step = (CONTACT_STEPS as readonly string[]).indexOf(stage);
  const lost = stage === "lost";
  return <StageSteps steps={CONTACT_STEPS} current={lost ? -1 : step} label={crmLabel(stage, "contact")} parked={lost} wonFrom={(CONTACT_STEPS as readonly string[]).indexOf("won")} />;
}

export function ContactStageChip({ stage }: { stage: string }) {
  return (
    <Badge tone={stage === "won" ? "success" : stage === "lost" ? "muted" : stage === "new" ? "outline" : stage === "call" || stage === "proposal" ? "info" : "neutral"} pill dot>
      {crmLabel(stage, "contact")}
    </Badge>
  );
}

/**
 * Due dates as chips: overdue in red ("Overdue · 5 Nov"), today in amber, the next 3 days in normal
 * text, later dates muted (each with a calendar icon). Nothing due: `empty`.
 */
export function DueChip({ due, today, stage, empty = "–" }: { due: string | null | undefined; today: string; stage?: string | null; empty?: string }) {
  const s = dueState(due, today, stage);
  if (!due || !s) return <span className="text-muted-foreground/70">{due ? shortDay(due, today) : empty}</span>;
  if (s === "overdue" || s === "today") {
    return (
      <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full pr-2.5 pl-2 text-xs leading-none font-medium whitespace-nowrap", s === "overdue" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
        <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
        {s === "overdue" ? `Overdue · ${shortDay(due, today)}` : "Today"}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap", s === "soon" ? "text-foreground/85" : "text-muted-foreground")}>
      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {shortDay(due, today)}
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
  return (
    <Badge tone={STATUS_TONE[value] ?? "neutral"} pill dot>
      {crmLabel(value, ctx)}
    </Badge>
  );
}

/** A person's initials in a soft round avatar (see src/components/ui/avatar.tsx). */
export function Initials({ name, className, size = "md" }: { name: string; className?: string; size?: AvatarSize }) {
  return <Avatar name={name} size={size} className={className} />;
}

/** A short code (a project's P101, a requirement's reference) as a small grey tag. */
export function CodeTag({ code, className }: { code: string; className?: string }) {
  return <code className={cn("rounded-md border border-border bg-canvas px-1.5 py-0.5 font-mono text-xs whitespace-nowrap text-foreground/80", className)}>{code}</code>;
}

/** High priority as a small amber chip (normal priority shows nothing). */
export function PriorityDot({ priority }: { priority: string }) {
  if (priority !== "high") return null;
  return (
    <Badge tone="warning" pill className="ml-2 align-middle" title="High priority">
      High
    </Badge>
  );
}

/** Facts for side panels: a quiet label over each value, empty ones hidden. */
export function Facts({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  const shown = items.filter((i) => i.value != null && i.value !== "" && i.value !== false);
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
      {shown.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="quiet-label">{i.label}</dt>
          <dd className="mt-1 text-sm break-words text-foreground">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
