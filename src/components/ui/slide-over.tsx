import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";

/** A panel that slides in from the right for a quick look at a record. Works without JavaScript. */
export function SlideOver({ title, closeHref, children, footer }: { title: ReactNode; closeHref: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <Link href={closeHref} scroll={false} className="absolute inset-0 bg-slate-900/20" aria-label="Close panel" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0 text-lg font-semibold text-slate-900">{title}</div>
          <Link href={closeHref} scroll={false} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close">
            <X className="h-5 w-5" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-slate-100 px-6 py-4">{footer}</div> : null}
      </aside>
    </div>
  );
}
