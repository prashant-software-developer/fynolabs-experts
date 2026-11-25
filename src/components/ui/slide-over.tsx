import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { EscapeTo } from "./client";

/**
 * A panel that slides in from the right for a quick look at a record (website AdminSheet). Opened and
 * closed through the address, so it works without JavaScript; Escape closes it too. `addon` sits
 * beside the title (a status).
 */
export function SlideOver({ title, closeHref, children, footer, addon }: { title: ReactNode; closeHref: string; children: ReactNode; footer?: ReactNode; addon?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <EscapeTo href={closeHref} />
      <Link href={closeHref} scroll={false} className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px]" aria-label="Close panel" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-border bg-background shadow-[0_24px_80px_-12px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 truncate text-xl font-light text-foreground">{title}</div>
            {addon}
          </div>
          <Link
            href={closeHref}
            scroll={false}
            className="-mr-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 md:px-8">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4 md:px-8">{footer}</div> : null}
      </aside>
    </div>
  );
}
