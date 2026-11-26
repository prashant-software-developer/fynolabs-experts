// Small display pieces shared by the talent and outreach screens (server components).
import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "@/components/icons";
import { maskEmail } from "@/lib/auth/permissions";
import { SECTIONS, type SectionKey } from "@/lib/auth/sections";
import { PIPELINE_LINE, STAGE_TONE, stageLabel, type Tone } from "@/lib/talent";
import type { PipelineStage } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { StageSteps } from "@/components/crm/chips";
import { PageHeader, Section } from "@/components/ui/layout";
import { Tabs } from "@/components/ui/tabs";

export function ToneBadge({ tone, children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <Badge tone={tone ?? "neutral"} title={title} pill dot>
      {children}
    </Badge>
  );
}

/** A label from a map, with its tone (unknown values show as they are). */
export function MapBadge({ value, labels, tones }: { value: string | null | undefined; labels: Record<string, string>; tones?: Record<string, Tone> }) {
  if (!value) return <span className="text-muted-foreground/70">–</span>;
  return (
    <Badge tone={tones?.[value] ?? "neutral"} pill dot>
      {labels[value] ?? value.replace(/_/g, " ")}
    </Badge>
  );
}

export function StageBadge({ stage }: { stage: string | null | undefined }) {
  if (!stage) return <span className="text-muted-foreground/70">–</span>;
  return (
    <Badge tone={STAGE_TONE[stage as PipelineStage] ?? "neutral"} pill dot>
      {stageLabel(stage)}
    </Badge>
  );
}

/** The pipeline stage bar: the steps filled up to the stage, Active and after in green; Rejected greyed. */
export function StageBar({ stage, className, hideLabel = false, width = 120 }: { stage: string | null | undefined; className?: string; hideLabel?: boolean; width?: number }) {
  if (!stage) return <span className="text-muted-foreground/70">–</span>;
  const at = PIPELINE_LINE.indexOf(stage as PipelineStage);
  const rejected = stage === "rejected";
  return (
    <span className={cn("inline-flex", className)}>
      <StageSteps steps={PIPELINE_LINE} current={rejected ? -1 : at} label={stageLabel(stage)} parked={rejected} wonFrom={PIPELINE_LINE.indexOf("active")} width={width} hideLabel={hideLabel} />
    </span>
  );
}

/** An email, masked for roles that don't see contact details. */
export function Email({ value, contact }: { value: string | null | undefined; contact: boolean }) {
  if (!value) return <span className="text-muted-foreground/70">No email yet</span>;
  if (!contact) return <span title="Masked for your role">{maskEmail(value)}</span>;
  return (
    <a href={`mailto:${value}`} className="hover:text-foreground hover:underline">
      {value}
    </a>
  );
}

/** A module this person can't open (Team & access → sections), with the page title kept. */
export function SectionBlocked({ title, section }: { title: string; section: SectionKey }) {
  return (
    <>
      <PageHeader title={title} />
      <Section flush>
        <div className="flex w-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
          </span>
          <div className="space-y-1.5">
            <p className="text-[15px] font-medium text-foreground">You don&apos;t have access to {SECTIONS[section].label}</p>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">Ask an admin to give you access in Team &amp; access.</p>
          </div>
        </div>
      </Section>
    </>
  );
}

/** Link tabs with counts where the active one is chosen by the caller (keeps other params). */
export function CountTabs({ tabs }: { tabs: { href: string; label: string; active: boolean; count?: number | null }[]; label?: string }) {
  return <Tabs tabs={tabs.map((t) => ({ ...t, count: t.count ?? undefined }))} />;
}

/** Experts | Groups: the two people lists side by side as tabs. */
export function PeopleTabs({ value, counts }: { value: "profiles" | "groups"; counts?: { profiles?: number; groups?: number } }) {
  return (
    <Tabs
      tabs={[
        { href: "/admin/experts", label: "Experts", active: value === "profiles", count: counts?.profiles },
        { href: "/admin/groups", label: "Groups", active: value === "groups", count: counts?.groups },
      ]}
    />
  );
}

/** A row of facts in a side panel (a quiet label above each value). */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="quiet-label">{i.label}</dt>
          <dd className="mt-1 text-sm break-words text-foreground">{i.value ?? <span className="text-muted-foreground/70">–</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A small titled block inside a side panel (14px medium title; blocks are divided by a hairline). */
export function PanelBlock({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-4 [&+&]:mt-8 [&+&]:border-t [&+&]:border-border [&+&]:pt-7">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}
