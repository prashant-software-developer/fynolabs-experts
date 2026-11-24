// Small display pieces shared by the talent and outreach screens (server components).
import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { maskEmail } from "@/lib/auth/permissions";
import { SECTIONS, type SectionKey } from "@/lib/auth/sections";
import { PIPELINE_LINE, STAGE_TONE, stageLabel, type Tone } from "@/lib/talent";
import type { PipelineStage } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { StagePipeline } from "@/components/admin/crm-kit";
import { PageHeader, Section } from "@/components/ui/layout";
import { AdminTabs } from "@/components/admin/kit";

export function ToneBadge({ tone, children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <Badge tone={tone ?? "neutral"} title={title}>
      {children}
    </Badge>
  );
}

/** A label from a map, with its tone (unknown values show as they are). */
export function MapBadge({ value, labels, tones }: { value: string | null | undefined; labels: Record<string, string>; tones?: Record<string, Tone> }) {
  if (!value) return <span className="text-muted-foreground/70">–</span>;
  return <Badge tone={tones?.[value] ?? "neutral"}>{labels[value] ?? value.replace(/_/g, " ")}</Badge>;
}

export function StageBadge({ stage }: { stage: string | null | undefined }) {
  if (!stage) return <span className="text-muted-foreground/70">–</span>;
  return <Badge tone={STAGE_TONE[stage as PipelineStage] ?? "neutral"}>{stageLabel(stage)}</Badge>;
}

/** The FynoLabs stage bar (PipelineBar): eight steps filled up to the stage, Active and after in the brand blue; Rejected greyed. */
export function StageBar({ stage, className }: { stage: string | null | undefined; className?: string }) {
  if (!stage) return <span className="text-muted-foreground/70">–</span>;
  const at = PIPELINE_LINE.indexOf(stage as PipelineStage);
  const rejected = stage === "rejected";
  return (
    <span className={cn("inline-flex", className)}>
      <StagePipeline steps={PIPELINE_LINE} current={rejected ? -1 : at} label={stageLabel(stage)} parked={rejected} wonFrom={PIPELINE_LINE.indexOf("active")} width={120} />
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
          <span className="inline-flex h-12 w-12 items-center justify-center border border-border">
            <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-normal text-foreground">You don&apos;t have access to {SECTIONS[section].label}.</p>
            <p className="mx-auto max-w-md text-small leading-relaxed text-muted-foreground">Ask an admin to give you access in Team &amp; access.</p>
          </div>
        </div>
      </Section>
    </>
  );
}

/** Link tabs with counts where the active one is chosen by the caller (keeps other params). */
export function CountTabs({ tabs, label = "Views" }: { tabs: { href: string; label: string; active: boolean; count?: number | null }[]; label?: string }) {
  return (
    <div className="tabs-line mb-8 border-b border-border pb-4">
      <AdminTabs tabs={tabs} label={label} />
    </div>
  );
}

/** A row of facts in a side panel (label above value). */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid border-t border-l border-border sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0 border-r border-b border-border p-4">
          <dt className="eyebrow text-muted-foreground">{i.label}</dt>
          <dd className="mt-1 text-small break-words text-foreground">{i.value ?? <span className="text-muted-foreground/70">–</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A small titled block inside a side panel. */
export function PanelBlock({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-4 [&+&]:mt-10">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <h3 className="eyebrow text-muted-foreground">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}
