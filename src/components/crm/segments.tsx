import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** A small set of link buttons (Table / Board, 7 / 30 / 90 days, Month / Week / Agenda). */
export function Segments({ items, label }: { items: { href: string; label: ReactNode; active: boolean }[]; label: string }) {
  return (
    <div className="inline-flex border border-input" role="group" aria-label={label}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "true" : undefined}
          className={cn("inline-flex h-10 items-center gap-2 border-l border-input px-4 text-small whitespace-nowrap transition-colors first:border-l-0", i.active ? "bg-foreground/[0.06] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground")}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
