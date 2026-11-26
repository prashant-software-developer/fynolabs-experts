import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A row of pill links for a second level of choice inside a page (saved views, applicant status,
 * New / Handled): the chosen one dark, the others outlined, each with an optional count.
 */
export function PillNav({ items, label, className }: { items: { href: string; label: ReactNode; active: boolean; count?: number | null; title?: string }[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          title={i.title}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] whitespace-nowrap transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
            i.active ? "border-foreground bg-foreground font-medium text-background" : "border-border bg-background text-foreground/75 hover:border-foreground/25 hover:text-foreground",
          )}
        >
          {i.label}
          {i.count != null ? <span className={cn("tabular text-xs", i.active ? "text-background/70" : "text-muted-foreground")}>{i.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** Link tabs under the page header: 14px labels in sentence case, a count pill, a dark line under the open one. */
export function Tabs({ tabs, className }: { tabs: { href: string; label: string; active: boolean; count?: number }[]; className?: string }) {
  return (
    <nav className={cn("mb-6 flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)} aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 text-sm whitespace-nowrap transition-colors",
            t.active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          )}
        >
          {t.label}
          {t.count != null ? <CountPill value={t.count} active={t.active} /> : null}
        </Link>
      ))}
    </nav>
  );
}

/** A small count beside a tab or a board column title (`raised`: white, for grey backgrounds). */
export function CountPill({ value, active, raised, className }: { value: number | string; active?: boolean; raised?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium",
        raised ? "bg-background text-muted-foreground ring-1 ring-border" : active ? "bg-foreground/[0.08] text-foreground" : "bg-secondary text-muted-foreground",
        className,
      )}
    >
      {value}
    </span>
  );
}
