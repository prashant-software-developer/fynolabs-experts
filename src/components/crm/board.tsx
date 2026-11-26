// Boards (Accounts, Leads, Experts by status, job pipelines): one column per stage with its name and a
// count, white cards on a quiet column. The board scrolls inside its own box both ways, so the
// sideways scrollbar is always in reach.
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { CountPill } from "@/components/ui/tabs";

export function BoardScroller({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="max-h-[calc(100vh-14rem)] overflow-auto" role="region" aria-label={label} tabIndex={label ? 0 : undefined}>
      <div className="flex min-w-max items-start gap-4 p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** A column: title (a word or a chip), its count, and `extra` (e.g. "2 due" in red) on the right. */
export function BoardColumn({ title, count, extra, label, children, width = "w-[18.5rem]" }: { title: ReactNode; count: number; extra?: ReactNode; label: string; children: ReactNode; width?: string }) {
  return (
    <section className={cn("flex shrink-0 flex-col rounded-xl border border-border/80 bg-subtle", width)} aria-label={label}>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl bg-subtle px-3.5 pt-3 pb-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          <span className="min-w-0 truncate">{title}</span>
          <CountPill value={count} raised />
        </span>
        {extra ? <span className="shrink-0 text-xs">{extra}</span> : null}
      </header>
      <ul className="flex flex-col gap-2.5 px-2.5 pb-2.5">{children}</ul>
    </section>
  );
}

/** A card on a board: white, a hairline, lifts on hover. */
export function BoardCard({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn("rounded-lg border border-border bg-card p-3.5 shadow-card transition-[border-color,box-shadow] hover:border-foreground/15 hover:shadow-raised", className)}>{children}</li>;
}

/** The bottom row of a card: owner on the left, due date on the right. */
export function BoardCardFooter({ children }: { children: ReactNode }) {
  return <div className="flex min-h-6 items-center justify-between gap-2 text-[13px] text-muted-foreground">{children}</div>;
}

export function BoardEmpty({ children = "Nothing here" }: { children?: ReactNode }) {
  return <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground/80">{children}</li>;
}

/** "+12 more · open as table" at the foot of a column that shows only the first cards. */
export function BoardMore({ href, n }: { href: string; n: number }) {
  return (
    <li>
      <Link href={href} className="block rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
        +{n} more · open as table
      </Link>
    </li>
  );
}
