// Building blocks for expert portal pages: the page title, cards, the underlined tabs and a small
// section heading. Light and roomy, as the FynoLabs public site; one column, sections stacked.
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** The page title (and an action on the right, e.g. a button). */
export function PortalHeader({ title, subtitle, action, aside }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:mb-10">
      <div className="min-w-0 space-y-2">
        <h1 className="flex flex-wrap items-center gap-3 text-title text-foreground">{title}</h1>
        {subtitle ? <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action || aside ? <div className="flex flex-wrap items-center gap-3">{aside}{action}</div> : null}
    </header>
  );
}

/** A white card with a hairline border. */
export function PortalCard({ children, className, as: Tag = "div", id }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "li"; id?: string }) {
  return (
    <Tag id={id} className={cn("rounded-xl border border-border bg-card", className)}>
      {children}
    </Tag>
  );
}

/** A heading for a block on a page (and an optional link or action on the right). */
export function PortalSectionTitle({ children, action, count, className }: { children: ReactNode; action?: ReactNode; count?: number; className?: string }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center justify-between gap-3", className)}>
      <h2 className="text-lg text-foreground">
        {children}
        {count != null ? <span className="ml-1.5 text-muted-foreground tabular">({count})</span> : null}
      </h2>
      {action}
    </div>
  );
}

/** Underlined tabs (links), with an optional count chip; scrolls sideways on phones. */
export function PortalTabs({ tabs, label = "Sections" }: { tabs: { href: string; label: string; active: boolean; count?: number }[]; label?: string }) {
  return (
    <nav className="mb-6 flex gap-7 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={label}>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          scroll={false}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-11 items-center gap-2 border-b-2 text-[15px] whitespace-nowrap transition-colors",
            t.active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count ? (
            <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] tabular", t.active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/70")}>{t.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** A quiet line for "nothing here yet" inside a card or tab. */
export function PortalEmpty({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-[15px] text-foreground">{title}</p>
      {description ? <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
