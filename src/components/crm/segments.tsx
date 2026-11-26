import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * A segmented control of links (Table / Board, 7 / 30 / 90 days, Agenda / Week / Month): a quiet
 * track with the chosen one raised in white.
 */
export function Segments({ items, label, className }: { items: { href: string; label: ReactNode; active: boolean }[]; label: string; className?: string }) {
  return (
    <div className={cn("inline-flex h-[var(--control-h)] shrink-0 items-center gap-0.5 rounded-lg border border-border bg-subtle p-0.5", className)} role="group" aria-label={label}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "true" : undefined}
          className={cn(
            "inline-flex h-full items-center gap-1.5 rounded-md px-3 text-[13px] whitespace-nowrap transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
            i.active ? "bg-background font-medium text-foreground shadow-card ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

/** Table | Board | Pipelines: Segments for a list's layouts (each item: an icon and a word). */
export const ViewSwitch = Segments;
