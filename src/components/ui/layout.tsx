import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "./cn";

/** Page title (light, as on the website admin) with the page's actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  meta?: ReactNode;
}) {
  return (
    <header className="mb-8 space-y-3">
      {back ? (
        <Link href={back.href} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-title text-foreground">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/75">{meta}</div> : null}
    </header>
  );
}

/** A bordered block with an optional title bar. `flush` removes the inner padding (tables, lists). */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("rounded-md border border-border bg-card", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 space-y-0.5">
            {title ? <h2 className="text-[15px] font-medium text-foreground">{title}</h2> : null}
            {description ? <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

/** A number tile: small letter-spaced label, large light figure (website AdminStat). */
export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="eyebrow text-muted-foreground">{label}</div>
      <div className="tabular mt-2 truncate text-stat text-foreground">{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div> : null}
    </>
  );
  const box = "block min-w-0 border-r border-b border-border bg-card px-5 py-5";
  return href ? (
    <Link href={href} className={cn(box, "row-hover focus-visible:relative")}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** Tiles share their borders, like the website's stat grid. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 overflow-hidden rounded-md border-t border-l border-border md:grid-cols-4">{children}</div>;
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="eyebrow text-muted-foreground">{i.label}</dt>
          <dd className="mt-1 text-sm break-words text-foreground">{i.value ?? <span className="text-muted-foreground/70">–</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
