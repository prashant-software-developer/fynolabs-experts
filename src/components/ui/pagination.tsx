import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "./button";
import { FilterSelect } from "./client";
import { cn } from "./cn";

/**
 * "x–y of N", Previous / Next, and (with sizeHref) a choice of page size.
 * Shown whenever there are rows, so the count is always visible.
 */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  sizes,
  sizeHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
  sizes?: readonly number[];
  sizeHref?: (size: number) => string;
}) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  const link = (p: number, text: string, icon: "prev" | "next", disabled: boolean) => {
    const body = icon === "prev" ? (<><ChevronLeft className="h-4 w-4" aria-hidden /> {text}</>) : (<>{text} <ChevronRight className="h-4 w-4" aria-hidden /></>);
    return disabled ? (
      <span className={buttonClass("secondary", "sm", "pointer-events-none opacity-40 shadow-none")} aria-disabled="true">
        {body}
      </span>
    ) : (
      <Link href={hrefFor(p)} className={buttonClass("secondary", "sm")}>
        {body}
      </Link>
    );
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3 text-[13px] text-muted-foreground">
      <div className="flex items-center gap-5">
        <span className="tabular">
          <span className="text-foreground">
            {from}–{to}
          </span>{" "}
          of {total}
        </span>
        {sizes && sizeHref ? (
          <span className="flex items-center gap-1" aria-label="Rows per page">
            <span className="mr-1 hidden sm:inline">Rows</span>
            {sizes.map((s) =>
              s === pageSize ? (
                <span key={s} className="tabular inline-flex h-7 min-w-8 items-center justify-center rounded-md bg-secondary px-2 font-medium text-foreground" aria-current="true">
                  {s}
                </span>
              ) : (
                <Link key={s} href={sizeHref(s)} className={cn("tabular inline-flex h-7 min-w-8 items-center justify-center rounded-md px-2 transition-colors hover:bg-accent hover:text-foreground")}>
                  {s}
                </Link>
              ),
            )}
          </span>
        ) : null}
      </div>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          {link(current - 1, "Previous", "prev", current <= 1)}
          <span className="tabular px-1">
            {current} / {pages}
          </span>
          {link(current + 1, "Next", "next", current >= pages)}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Above a table, on the right of its toolbar: "Total N records · Page 1 of M" and a page size
 * choice. Sits inside the toolbar's GET form, so a new size applies at once (back to page 1).
 */
export function PageSummary({ total, page, pageSize, sizes, noun = "records" }: { total: number; page: number; pageSize: number; sizes: readonly number[]; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <span className="flex items-center gap-3">
      <span className="tabular text-[13px] whitespace-nowrap text-muted-foreground">
        Total <span className="text-foreground">{total.toLocaleString("en-GB")}</span> {noun}
        <span className="max-sm:hidden">
          {" "}
          · Page {Math.min(page, pages)} of {pages}
        </span>
      </span>
      <FilterSelect name="size" defaultValue={String(pageSize)} options={sizes.map((s) => ({ value: String(s), label: `${s} / page` }))} label="Rows per page" className="h-8 text-[13px]" />
    </span>
  );
}
