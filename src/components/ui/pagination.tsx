import Link from "next/link";
import { cn } from "./cn";

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number, text: string, disabled: boolean) =>
    disabled ? (
      <span className="rounded-md px-3 py-1.5 text-slate-300">{text}</span>
    ) : (
      <Link href={hrefFor(p)} className={cn("rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100")}>
        {text}
      </Link>
    );
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-500">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        {link(page - 1, "Previous", page <= 1)}
        <span className="tabular px-2">
          {page} / {pages}
        </span>
        {link(page + 1, "Next", page >= pages)}
      </div>
    </div>
  );
}
