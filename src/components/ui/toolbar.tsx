// The list-page template's toolbar: one row above a list with search, filters and, on the right,
// the result count and the layout switch. Every list page uses it the same way:
//
//   <PageHeader title subtitle actions />  ·  stats / tabs  ·
//   <Section flush>
//     <Toolbar hidden={{ tab }} clearHref={…} end={<><ResultCount … /><ViewSwitch … /></>}>
//       <SearchField … />  <FilterSelect … />  <FilterSelect … />
//     </Toolbar>
//     table or board  ·  <Pagination />
//   </Section>
import Link from "next/link";
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { buttonClass } from "./button";
import { cn } from "./cn";

export { FilterSelect } from "./client";

/**
 * A plain GET form, so it works without JavaScript: filters (FilterSelect) apply as soon as they
 * change and the search applies on Enter. `hidden`: params the form keeps (tab, layout, a saved
 * view); empty ones are left out. `submit`: a visible Apply button, for toolbars with free-text or
 * date filters. `inset` (default): the top row of a list card; `inset={false}`: a bar on its own.
 */
export function Toolbar({
  children,
  hidden,
  end,
  clearHref,
  submit,
  inset = true,
  className,
  id,
  label = "Filters",
}: {
  children?: ReactNode;
  hidden?: Record<string, string | number | null | undefined | false>;
  end?: ReactNode;
  clearHref?: string | null;
  submit?: boolean | string;
  inset?: boolean;
  className?: string;
  id?: string;
  label?: string;
}) {
  return (
    <form method="get" id={id} role="search" aria-label={label} className={cn("flex flex-wrap items-center gap-2", inset ? "border-b border-border px-4 py-3 sm:px-6" : "mb-4", className)}>
      {Object.entries(hidden ?? {}).map(([k, v]) => (v || v === 0 ? <input key={k} type="hidden" name={k} value={String(v)} /> : null))}
      {children}
      {submit ? (
        <button type="submit" className={buttonClass("secondary", "md")}>
          {submit === true ? "Apply" : submit}
        </button>
      ) : (
        <button type="submit" className="sr-only">
          Apply filters
        </button>
      )}
      {clearHref ? (
        <Link href={clearHref} className="inline-flex h-[var(--control-h)] items-center gap-1 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="h-3.5 w-3.5" aria-hidden /> Clear
        </Link>
      ) : null}
      {end ? <div className="ml-auto flex flex-wrap items-center gap-3">{end}</div> : null}
    </form>
  );
}

/** The search box: a magnifier inside the field; Enter applies it. */
export function SearchField({ name = "q", defaultValue, placeholder, label, className, form }: { name?: string; defaultValue?: string; placeholder: string; label?: string; className?: string; form?: string }) {
  return (
    <div className={cn("relative w-full min-w-0 sm:w-72 lg:w-80", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input type="text" name={name} form={form} defaultValue={defaultValue} placeholder={placeholder} aria-label={label ?? placeholder} enterKeyHint="search" autoComplete="off" className="control pl-9" />
    </div>
  );
}

/** "9 accounts" beside the list. */
export function ResultCount({ n, noun, plural, suffix }: { n: number; noun: string; plural?: string; suffix?: string }) {
  return (
    <span className="tabular text-[13px] whitespace-nowrap text-muted-foreground">
      {n.toLocaleString("en-GB")} {n === 1 ? noun : (plural ?? `${noun}s`)}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

/** A hairline between groups of controls in a toolbar. */
export function ToolbarDivider() {
  return <span className="mx-1 hidden h-6 w-px bg-border sm:inline-block" aria-hidden />;
}
