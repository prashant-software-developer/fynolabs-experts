import Link from "next/link";
import { buttonClass } from "./button";
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
  const link = (p: number, text: string, disabled: boolean) =>
    disabled ? (
      <span className={buttonClass("secondary", "sm", "pointer-events-none opacity-40")} aria-disabled="true">
        {text}
      </span>
    ) : (
      <Link href={hrefFor(p)} className={buttonClass("secondary", "sm")}>
        {text}
      </Link>
    );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-small text-muted-foreground">
      <div className="flex items-center gap-4">
        <span className="tabular">
          {from}–{to} of {total}
        </span>
        {sizes && sizeHref ? (
          <span className="flex items-center gap-1" aria-label="Rows per page">
            <span className="mr-1 hidden sm:inline">Rows</span>
            {sizes.map((s) =>
              s === pageSize ? (
                <span key={s} className="tabular inline-flex h-7 min-w-8 items-center justify-center rounded-md bg-secondary px-2 font-normal text-foreground" aria-current="true">
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
          {link(current - 1, "Previous", current <= 1)}
          <span className="tabular px-1">
            {current} / {pages}
          </span>
          {link(current + 1, "Next", current >= pages)}
        </div>
      ) : null}
    </div>
  );
}
