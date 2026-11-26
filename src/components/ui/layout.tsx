import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "./cn";

/**
 * The top of every admin page: title (28px) with a one-line description, the page's actions on the
 * right. Record pages add `media` (a logo or an avatar before the title), `badge` (after the title)
 * and `meta` (a row of key facts as chips under the description: stage, owner, due date, source).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  meta,
  media,
  badge,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  meta?: ReactNode;
  media?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="mb-8 space-y-4">
      {back ? (
        <Link href={back.href} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          {media ? <div className="shrink-0">{media}</div> : null}
          <div className="min-w-0 space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="page-title min-w-0 break-words text-foreground">{title}</h1>
              {badge}
            </div>
            {subtitle ? <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
            {meta ? <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-foreground/80">{meta}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/**
 * A card: rounded, a hairline border and a whisper of shadow, with an optional title bar (16px title,
 * one quiet line under it, actions on the right). `flush` drops the inner padding (tables, lists,
 * boards) and clips the content to the card's corners; `allowOverflow` keeps menus inside it visible.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  flush,
  allowOverflow,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
  allowOverflow?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card shadow-card", flush && !allowOverflow && "overflow-hidden", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0 space-y-0.5">
            {title ? <h2 className="text-base font-medium text-foreground">{title}</h2> : null}
            {description ? <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "" : "p-6"}>{children}</div>
    </section>
  );
}

export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

/**
 * A number tile: a quiet label, the figure, an optional hint. Tiles are separate cards in a grid;
 * a tile with `href` lifts on hover. `glyph` is accepted from older markup and not drawn.
 */
export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; glyph?: string }) {
  const body = (
    <>
      <div className="truncate text-[13px] font-medium text-muted-foreground">{label}</div>
      <div className="figure mt-2 truncate text-foreground">{value}</div>
      {hint ? <div className="mt-1.5 truncate text-[13px] text-muted-foreground">{hint}</div> : null}
    </>
  );
  const box = "block min-w-0 rounded-xl border border-border bg-card px-5 py-4 shadow-card";
  return href ? (
    <Link href={href} className={cn(box, "transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-raised")}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

const STAT_COLUMNS = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", many: "md:grid-cols-4 xl:grid-cols-6" } as const;

export function StatGrid({ children, columns = 4 }: { children: ReactNode; columns?: keyof typeof STAT_COLUMNS }) {
  return <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", STAT_COLUMNS[columns])}>{children}</div>;
}

/**
 * A record's key facts in one card under its header (owner, next step due, people, last activity):
 * a quiet label over each value, divided by hairlines. Values can be chips, avatars or text.
 */
export function FactsBar({ items, className }: { items: { label: string; value: ReactNode; hint?: ReactNode; href?: string }[]; className?: string }) {
  return (
    <dl className={cn("mb-8 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card shadow-card sm:flex sm:divide-x sm:divide-border", className)}>
      {items.map((i) => {
        const value = i.value ?? <span className="text-muted-foreground/70">–</span>;
        return (
          // A fact with `href` is clickable as a whole (the link's ::after covers the cell).
          <div key={i.label} className={cn("relative min-w-0 flex-1 px-5 py-4", i.href && "transition-colors hover:bg-foreground/[0.02]")}>
            <dt className="quiet-label truncate">{i.label}</dt>
            <dd className="mt-1.5 flex min-h-6 min-w-0 items-center text-[15px] text-foreground">
              {i.href ? (
                <Link href={i.href} className="min-w-0 truncate after:absolute after:inset-0 after:content-[''] hover:text-primary">
                  {value}
                </Link>
              ) : (
                value
              )}
            </dd>
            {i.hint ? <dd className="mt-0.5 truncate text-[13px] text-muted-foreground">{i.hint}</dd> : null}
          </div>
        );
      })}
    </dl>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="quiet-label">{i.label}</dt>
          <dd className="mt-1 text-sm break-words text-foreground">{i.value ?? <span className="text-muted-foreground/70">–</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
