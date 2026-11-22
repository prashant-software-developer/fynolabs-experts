import Link from "next/link";
import { buttonClass } from "./button";

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
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
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        {link(page - 1, "Previous", page <= 1)}
        <span className="tabular px-1">
          {page} / {pages}
        </span>
        {link(page + 1, "Next", page >= pages)}
      </div>
    </div>
  );
}
