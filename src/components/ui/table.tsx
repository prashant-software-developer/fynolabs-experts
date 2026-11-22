import Link from "next/link";
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "./cn";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-500">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-4 py-2.5 font-medium whitespace-nowrap", className)} {...props} />;
}

export function SortTh({ label, sortKey, current, dir, hrefFor, className }: { label: string; sortKey: string; current: string; dir: "asc" | "desc"; hrefFor: (sort: string, dir: "asc" | "desc") => string; className?: string }) {
  const active = current === sortKey;
  const nextDir = active ? (dir === "asc" ? "desc" : "asc") : sortKey === "name" ? "asc" : "desc";
  return (
    <Th className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={hrefFor(sortKey, nextDir)} className={cn("inline-flex items-center gap-1 hover:text-slate-900", active && "text-slate-900")}>
        {label}
        {active ? dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
      </Link>
    </Th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("hover:bg-slate-50/70", className)}>{children}</tr>;
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-2.5 align-top text-slate-700", className)} {...props} />;
}
