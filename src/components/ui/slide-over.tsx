import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { EscapeTo } from "./client";

/**
 * A panel that slides in from the right for a quick look at a record (website AdminSheet). Opened and
 * closed through the address, so it works without JavaScript; Escape closes it too.
 * The header is the record's identity, as on its full page: `media` (logo or avatar), `title` (its
 * name), `subtitle`, `addon` beside the title (a status) and `meta` (key facts as chips).
 * `footer`: the panel's actions, with "Open full …" among them.
 */
export function SlideOver({
  title,
  closeHref,
  children,
  footer,
  addon,
  media,
  subtitle,
  meta,
}: {
  title: ReactNode;
  closeHref: string;
  children: ReactNode;
  footer?: ReactNode;
  addon?: ReactNode;
  media?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <EscapeTo href={closeHref} />
      <Link href={closeHref} scroll={false} className="animate-fade absolute inset-0 bg-foreground/15 backdrop-blur-[2px]" aria-label="Close panel" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-border bg-background shadow-[0_24px_80px_-12px_rgba(0,0,0,0.22)] lg:max-w-3xl xl:max-w-4xl">
        <div className="flex items-start gap-4 border-b border-border px-6 py-5 md:px-8">
          {media ? <div className="shrink-0">{media}</div> : null}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="min-w-0 truncate text-xl font-normal tracking-[-0.01em] text-foreground">{title}</h2>
              {addon}
            </div>
            {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
            {meta ? <div className="flex flex-wrap items-center gap-2 pt-2 text-sm text-foreground/80">{meta}</div> : null}
          </div>
          <Link
            href={closeHref}
            scroll={false}
            className="-mt-1 -mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 md:px-8">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-canvas px-6 py-4 md:px-8">{footer}</div> : null}
      </aside>
    </div>
  );
}

/** A titled block inside a side panel: a 14px medium title (actions on the right), then its content. */
export function PanelSection({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 [&+&]:mt-8 [&+&]:border-t [&+&]:border-border [&+&]:pt-7">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}
