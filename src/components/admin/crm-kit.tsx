// The FynoLabs CrmKit (Main Website - FyonLabs/src/components/admin/CrmKit.tsx) for the hub: the
// company mark, person mark, owner, due date, stage dot and pipeline, the hover note and the plain
// CRM table (cards below 1280px). Server components; rows open with a link that covers the row.
import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, NotebookText } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { OrgLogo } from "@/components/crm/org-logo";
import { initialsOf } from "./kit";

/** A company's logo in a fixed box, so a missing or odd-sized favicon never moves the text beside it. */
export function AccountMark({ name, domain, logoUrl, size = "sm" }: { name: string; domain?: string | null; logoUrl?: string | null; size?: "sm" | "md" }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-border bg-background", size === "md" ? "h-10 w-10" : "h-7 w-7")} aria-hidden="true">
      <OrgLogo name={name} domain={domain} logoUrl={logoUrl} size={size === "md" ? 24 : 20} className="border-0" />
    </span>
  );
}

/** A person's initials in a small square, the same shape as AccountMark. */
export function PersonMark({ name, size = "sm" }: { name: string; size?: "xs" | "sm" | "md" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border border-border bg-background tracking-wider text-foreground",
        size === "md" ? "eyebrow h-10 w-10" : size === "sm" ? "h-7 w-7 text-[0.625rem]" : "h-5 w-5 text-[0.5625rem]",
      )}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

/** Who owns it: initials plus the name ("You" reads as plain text), or "No owner". */
export function OwnerChip({ name, compact = false }: { name: string | null | undefined; compact?: boolean }) {
  if (name === "You") return <span className="text-small text-muted-foreground">You</span>;
  if (!name) return <span className="text-small text-muted-foreground/70">No owner</span>;
  return (
    <span className="flex min-w-0 items-center gap-2.5 text-small text-muted-foreground" title={`Owner: ${name}`}>
      <PersonMark name={name} size="sm" />
      {compact ? <span className="sr-only">{name}</span> : <span className="truncate">{name}</span>}
    </span>
  );
}

export type DueTone = "overdue" | "today" | "soon" | "later" | null;

const shortDate = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** A due date that reads at a glance: red when it's today or late, plain otherwise. */
export function DueChip({ date, state, empty = null }: { date: string | null | undefined; state: DueTone; empty?: ReactNode }) {
  if (!date || !state) return <>{empty}</>;
  const late = state === "overdue" || state === "today";
  return (
    <span className={cn("tabular inline-flex shrink-0 items-center gap-1.5 text-small whitespace-nowrap", late ? "text-destructive" : state === "soon" ? "text-foreground" : "text-muted-foreground")}>
      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
      {state === "today" ? "Today" : state === "overdue" ? `Late · ${shortDate(date)}` : shortDate(date)}
    </span>
  );
}

/** A stage as a small square and a word: lighter than a badge, so a column of them stays quiet. */
export function StageDot({ label, tone }: { label: string; tone: "live" | "won" | "parked" | "early" }) {
  return (
    <span className="inline-flex items-center gap-2 text-small whitespace-nowrap text-foreground">
      <span
        className={cn("h-2 w-2 shrink-0", tone === "won" ? "bg-primary" : tone === "live" ? "bg-foreground" : tone === "parked" ? "bg-muted-foreground/40" : "border border-foreground/60")}
        aria-hidden="true"
      />
      <span className={tone === "parked" ? "text-muted-foreground" : undefined}>{label}</span>
    </span>
  );
}

/**
 * A stage as a step along the pipeline: one segment per step, filled up to where the record is. Won
 * steps fill in the brand colour; a parked record (on hold, dropped, rejected) shows greyed.
 */
export function StagePipeline({ steps, current, label, parked = false, wonFrom, width = 140 }: { steps: readonly string[]; current: number; label: string; parked?: boolean; wonFrom?: number; width?: number }) {
  return (
    <span className="flex min-w-0 flex-col gap-1.5" title={`${label} · step ${Math.max(current, 0) + 1} of ${steps.length}`}>
      <span className={cn("truncate text-small", parked ? "text-muted-foreground" : "text-foreground")}>{label}</span>
      <span className="flex gap-[3px]" style={{ width }} aria-hidden="true">
        {steps.map((step, i) => (
          <span
            key={step}
            className={cn("h-1 flex-1", i > current ? "bg-foreground/10" : parked ? "bg-muted-foreground/40" : wonFrom !== undefined && current >= wonFrom ? "bg-primary" : "bg-foreground")}
          />
        ))}
      </span>
    </span>
  );
}

/** A small note icon whose text shows on hover or focus (long text that would crowd a table). */
export function HoverNote({ title, text }: { title: string; text: string | null | undefined }) {
  if (!text?.trim()) return <span className="-ml-2 inline-flex h-8 w-8 items-center justify-center text-muted-foreground/40" aria-label={`No ${title.toLowerCase()}`}>–</span>;
  return (
    <span className="group/note relative -ml-2 inline-flex">
      <button
        type="button"
        aria-label={`${title}: ${text}`}
        className="relative z-[1] inline-flex h-8 w-8 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:border-border focus-visible:text-foreground focus-visible:outline-none"
      >
        <NotebookText className="h-4 w-4" aria-hidden="true" />
      </button>
      <span role="tooltip" className="pointer-events-none invisible absolute top-1/2 right-full z-50 mr-2 w-max max-w-sm -translate-y-1/2 border border-border bg-background p-4 opacity-0 transition-opacity group-focus-within/note:visible group-focus-within/note:opacity-100 group-hover/note:visible group-hover/note:opacity-100">
        <span className="eyebrow block text-muted-foreground">{title}</span>
        <span className="mt-2 block text-small leading-relaxed font-normal whitespace-pre-wrap text-foreground">{text}</span>
      </span>
    </span>
  );
}

export type CrmColumn<T> = {
  key: string;
  label: string;
  className?: string;
  /** Hide this column below 1536px, so the columns that matter keep their room. */
  hideBelow?: "2xl";
  /** A flexible column (names, accounts) takes this share of the spare width and truncates inside it. */
  grow?: number;
  cell: (row: T) => ReactNode;
};

const sizeOf = (c: { grow?: number }) => (c.grow ? "max-w-0" : "w-px");

/**
 * A plain table for the CRM lists: one line per record, columns that line up, the whole row opens it.
 * No box: a line under the header and between rows. Below 1280px it becomes stacked cards.
 */
export function CrmTable<T>({ rows, columns, rowKey, href, rowLabel, card, select, activeKey }: {
  rows: T[];
  columns: CrmColumn<T>[];
  rowKey: (row: T) => string;
  href: (row: T) => string;
  rowLabel: (row: T) => string;
  card: (row: T) => ReactNode;
  /** A checkbox per row (for a bulk form): name, value and the form's id. */
  select?: { name: string; form: string };
  activeKey?: string | null;
}) {
  return (
    <>
      <div className="hidden border-b border-border xl:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              {select ? <th scope="col" className="w-px py-5 pl-6"><span className="sr-only">Select</span></th> : null}
              {columns.map((c) => (
                <th key={c.key} scope="col" style={c.grow ? { width: `${c.grow}%` } : undefined} className={cn("eyebrow px-6 py-5 font-normal whitespace-nowrap text-muted-foreground", sizeOf(c), c.hideBelow && "hidden 2xl:table-cell", c.className)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);
              return (
                <tr key={key} className={cn("admin-hover relative border-t border-border", activeKey === key && "bg-foreground/[0.06]")}>
                  {select ? (
                    <td className="relative z-[1] w-px py-6 pl-6 align-middle">
                      <input type="checkbox" name={select.name} value={key} form={select.form} aria-label={`Select ${rowLabel(row)}`} className="h-4 w-4" />
                    </td>
                  ) : null}
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn("px-6 py-6 align-middle whitespace-nowrap", sizeOf(c), c.grow ? "truncate" : undefined, c.hideBelow && "hidden 2xl:table-cell", c.className)}>
                      {i === 0 ? (
                        <Link href={href(row)} scroll={false} aria-label={rowLabel(row)} className="block min-w-0 truncate after:absolute after:inset-0 after:content-['']">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        <div className="relative z-[1] min-w-0 truncate [&_a]:relative">{c.cell(row)}</div>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border border-b border-border xl:hidden">
        {rows.map((row) => {
          const key = rowKey(row);
          return (
            <div key={key} className="flex min-w-0 items-stretch">
              {select ? (
                <span className="flex items-center pl-3 sm:pl-4">
                  <input type="checkbox" name={select.name} value={key} form={select.form} aria-label={`Select ${rowLabel(row)}`} className="h-4 w-4" />
                </span>
              ) : null}
              <Link href={href(row)} scroll={false} aria-label={rowLabel(row)} className="admin-hover block min-w-0 flex-1 px-3 py-5 sm:px-4 md:px-6">
                {card(row)}
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
