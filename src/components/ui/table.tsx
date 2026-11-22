import Link from "next/link";
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "./cn";

/**
 * Compact list table: letter-spaced header, a thin line between rows, no zebra stripes.
 * `sticky`: the table scrolls inside its own box and the header row stays in view.
 */
export function Table({ children, className, sticky, dense }: { children: ReactNode; className?: string; sticky?: boolean; dense?: boolean }) {
  return (
    <div
      className={cn(
        sticky
          ? "max-h-[calc(100vh-15rem)] min-h-0 overflow-auto [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-card [&_thead_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]"
          : "overflow-x-auto",
        // dense: tighter cells (the first and last keep their wider edge padding).
        dense && "[&_td]:px-2 [&_th]:px-2",
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

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("eyebrow h-10 px-3 align-middle whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4", className)} {...props} />;
}

export function SortTh({ label, sortKey, current, dir, hrefFor, className }: { label: string; sortKey: string; current: string; dir: "asc" | "desc"; hrefFor: (sort: string, dir: "asc" | "desc") => string; className?: string }) {
  const active = current === sortKey;
  const nextDir = active ? (dir === "asc" ? "desc" : "asc") : sortKey === "name" ? "asc" : "desc";
  return (
    <Th className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={hrefFor(sortKey, nextDir)} className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground")}>
        {label}
        {active ? dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden /> : null}
      </Link>
    </Th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("row-hover", className)}>{children}</tr>;
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-3 align-middle text-foreground/85 first:pl-4 last:pr-4", className)} {...props} />;
}
