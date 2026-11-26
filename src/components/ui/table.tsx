import Link from "next/link";
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { ArrowDown, ArrowUp } from "@/components/icons";
import { cn } from "./cn";

/**
 * List table: a quiet header row (13px, sentence case) on the canvas tint, 56px rows divided by
 * hairlines, a soft hover. The first and last columns line up with the card's 24px edge.
 * `sticky`: the table scrolls inside its own box and the header row stays in view (long lists).
 * `dense`: 48px rows and tighter columns, for wide tables with many columns.
 */
export function Table({ children, className, sticky, dense }: { children: ReactNode; className?: string; sticky?: boolean; dense?: boolean }) {
  return (
    <div
      className={cn(
        sticky ? "max-h-[calc(100vh-14rem)] min-h-0 overflow-auto [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-30 [&_thead_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]" : "overflow-x-auto",
        dense && "[&_td]:h-12 [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_td:first-child]:pl-6 [&_th:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:last-child]:pr-6",
        className,
      )}
    >
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-border">
      <tr>{children}</tr>
    </thead>
  );
}

/**
 * One alignment everywhere (Prashant, 26 Nov 2026): every column, numbers and dates included, reads
 * from the left, so a page passing text-right or text-center to a cell is ignored here.
 */
const leftOnly = (c?: string) => c?.replace(/(^|\s)(?:[\w-]+:)*text-(?:right|center|end|start)(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-11 bg-canvas px-4 text-left align-middle text-[13px] font-medium whitespace-nowrap text-muted-foreground first:pl-6 last:pr-6", leftOnly(className))} {...props} />;
}

export function SortTh({ label, sortKey, current, dir, hrefFor, className }: { label: string; sortKey: string; current: string; dir: "asc" | "desc"; hrefFor: (sort: string, dir: "asc" | "desc") => string; className?: string }) {
  const active = current === sortKey;
  const nextDir = active ? (dir === "asc" ? "desc" : "asc") : sortKey === "name" ? "asc" : "desc";
  return (
    <Th className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={hrefFor(sortKey, nextDir)} className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground")}>
        {label}
        {active ? dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : null}
      </Link>
    </Th>
  );
}

// The body is its own layer (isolate), so links and chips raised inside a row (z-10 over a row link)
// never show through the sticky header when the list scrolls under it.
export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="relative isolate z-0 divide-y divide-border">{children}</tbody>;
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("row-hover", className)}>{children}</tr>;
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-14 px-4 py-2.5 text-left align-middle text-foreground/90 first:pl-6 last:pr-6", leftOnly(className))} {...props} />;
}

/** Primary text in a cell with a quiet second line under it (a name and its email, a job and its link). */
export function CellStack({ primary, secondary, className }: { primary: ReactNode; secondary?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="truncate">{primary}</div>
      {secondary ? <div className="truncate text-[13px] text-muted-foreground">{secondary}</div> : null}
    </div>
  );
}
