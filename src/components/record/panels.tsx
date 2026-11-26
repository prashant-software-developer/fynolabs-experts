// Record pages (expert, account) in three panels, like a GoHighLevel contact (Prashant, 27 Nov 2026):
// left, the record's identity, quick actions and all its fields in groups; centre, the activity
// timeline and the record's other content as tabs; right, what's coming up and related records.
// From 1280px the three panels fill the space beside the sidebar and each scrolls on its own;
// narrower, they stack (left, centre, right). `data-record-page` lets the admin frame drop its
// 1400px column and padding for these pages (layout.tsx).
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/components/ui/cn";

const PANEL = "min-w-0 rounded-lg border border-border bg-card xl:rounded-none xl:border-0 xl:overflow-y-auto xl:overscroll-contain";

export function RecordLayout({ left, center, right }: { left: ReactNode; center: ReactNode; right: ReactNode }) {
  return (
    <div data-record-page className="space-y-4 px-4 py-5 sm:px-6 xl:grid xl:h-[calc(100dvh-3.5rem)] xl:grid-cols-[300px_minmax(0,1fr)_280px] xl:space-y-0 xl:p-0 2xl:grid-cols-[340px_minmax(0,1fr)_320px]">
      <aside aria-label="Fields" className={cn(PANEL, "xl:border-r xl:border-border")}>
        {left}
      </aside>
      <div className="min-w-0 xl:overflow-y-auto xl:overscroll-contain">{center}</div>
      <aside aria-label="Up next and related" className={cn(PANEL, "xl:border-l xl:border-border")}>
        {right}
      </aside>
    </div>
  );
}

/** The top of the left panel: back link, logo or avatar, name, chips, then the quick actions. */
export function RecordIdentity({ back, media, title, subtitle, chips, actions }: { back: { href: string; label: string }; media: ReactNode; title: ReactNode; subtitle?: ReactNode; chips?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="space-y-4 px-5 pt-4 pb-5">
      <Link href={back.href} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {back.label}
      </Link>
      <div className="flex min-w-0 items-start gap-3">
        <div className="shrink-0">{media}</div>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-lg leading-snug font-medium tracking-[-0.01em] break-words text-foreground">{title}</h1>
          {subtitle ? <p className="text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {chips ? <div className="flex flex-wrap items-center gap-1.5">{chips}</div> : null}
      {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

/** The fields part of the left panel (search box and groups go inside). */
export function RecordFields({ children }: { children: ReactNode }) {
  return (
    <div data-fields className="group/fields">
      {children}
    </div>
  );
}

/**
 * One field: its label on the left, the value beside it (a dash when empty); `stack` puts a long
 * value (skills, a next step) under the label instead. Searched by its text.
 */
export function Prop({ label, children, stack }: { label: string; children?: ReactNode; stack?: boolean }) {
  const empty = children == null || children === "" || children === false;
  return (
    <div data-field className={cn("min-w-0 text-[13px] leading-5", stack && !empty ? "space-y-1" : "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3")}>
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-foreground">{empty ? <span className="text-muted-foreground/60">–</span> : children}</div>
    </div>
  );
}

/** Content in a field group that isn't a field (a form, an upload): hidden while searching. */
export function GroupExtra({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("group-data-[searching]/fields:hidden", className)}>{children}</div>;
}

/** A small quick-action button under the name (email, copy, profile, edit). */
export const quickAction =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary [&_svg]:h-3.5 [&_svg]:w-3.5";

/** The centre panel: tabs pinned at its top, then the open tab's content. */
export function RecordCenter({ tabs, children }: { tabs: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="xl:sticky xl:top-0 xl:z-10 xl:border-b xl:border-border xl:bg-canvas/95 xl:px-6 xl:backdrop-blur-sm [&>nav]:mb-4 xl:[&>nav]:mb-0 xl:[&>nav]:border-b-0">{tabs}</div>
      <div className="space-y-5 xl:px-6 xl:py-6">{children}</div>
    </div>
  );
}

/** A block in the right panel: a small title (a count or link on the right), then its rows. */
export function SideBlock({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-border px-5 py-4 last:border-b-0", className)}>
      <div className="mb-3 flex min-h-5 items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
        {action ? <div className="shrink-0 text-xs">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A row in a right-panel block: an icon or avatar, a title (a link), one quiet line, something on the right. */
export function SideItem({ href, icon, title, sub, aside }: { href?: string; icon?: ReactNode; title: ReactNode; sub?: ReactNode; aside?: ReactNode }) {
  const body = (
    <>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13px] text-foreground", href && "group-hover/item:text-primary")}>{title}</span>
        {sub ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{sub}</span> : null}
      </span>
      {aside ? <span className="shrink-0">{aside}</span> : null}
    </>
  );
  const cls = "group/item -mx-2 flex min-w-0 items-start gap-2.5 rounded-md px-2 py-1.5";
  return <li>{href ? <Link href={href} className={cn(cls, "transition-colors hover:bg-foreground/[0.03]")}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}

/** Numbers at the bottom of the right panel, two per row, each a link to its tab. */
export function SideCounts({ items }: { items: { label: string; value: number | string; href?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
      {items.map((i) => {
        const inner = (
          <>
            <dt className="truncate text-xs text-muted-foreground">{i.label}</dt>
            <dd className="tabular mt-0.5 text-base font-medium text-foreground">{i.value}</dd>
          </>
        );
        return i.href ? (
          <Link key={i.label} href={i.href} className="block bg-card px-3 py-2.5 transition-colors hover:bg-secondary/40">
            {inner}
          </Link>
        ) : (
          <div key={i.label} className="bg-card px-3 py-2.5">
            {inner}
          </div>
        );
      })}
    </dl>
  );
}
