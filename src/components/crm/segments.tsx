import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** A small set of link buttons (Table / Board, 7 / 30 / 90 days, Month / Week / Agenda). */
export function Segments({ items, label }: { items: { href: string; label: ReactNode; active: boolean }[]; label: string }) {
  return (
    <div className="inline-flex rounded-md border border-input p-0.5" role="group" aria-label={label}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "true" : undefined}
          className={cn("inline-flex h-7 items-center gap-1.5 rounded-[3px] px-2.5 text-[13px] whitespace-nowrap transition-colors", i.active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
