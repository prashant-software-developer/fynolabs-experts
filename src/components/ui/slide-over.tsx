import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { EscapeTo } from "@/components/admin/kit-client";

/**
 * The side panel (FynoLabs AdminSheet): 60% wide from 1024px, 85% on tablets, full width on phones;
 * a 1px line on the left, no shadow; title bar with close, scrolling body, sticky footer. Opened and
 * closed through the address (works without JavaScript; Escape closes it too).
 */
export function SlideOver({ title, closeHref, children, footer, addon }: { title: ReactNode; closeHref: string; children: ReactNode; footer?: ReactNode; addon?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <EscapeTo href={closeHref} />
      <Link href={closeHref} scroll={false} className="absolute inset-0 bg-foreground/10" aria-label="Close panel" />
      <aside className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-background md:w-[85vw] lg:w-[60%]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 md:px-10 md:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="min-w-0 truncate text-xl font-normal text-foreground md:text-2xl">{title}</h2>
            {addon}
          </div>
          <Link
            href={closeHref}
            scroll={false}
            className="admin-hover -mr-3 inline-flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 md:px-10 md:py-8">{children}</div>
        {footer ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:gap-3 md:px-10 md:py-4">{footer}</div> : null}
      </aside>
    </div>
  );
}
