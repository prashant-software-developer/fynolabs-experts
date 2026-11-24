import type { ReactNode } from "react";
import { cn } from "./cn";
import { AdminDetailBar, AdminDetailHeading, AdminInfo, AdminPageHeader, AdminStat, AdminStatGrid, type AdminGlyphName } from "@/components/admin/kit";

/**
 * The page header, in the FynoLabs admin look. A list page: the 40px light title, the explanation
 * behind an (i), the main action on the right. A detail page (`back`): the sticky bar (Back on the
 * left, the page's actions on the right), then the section as an eyebrow and the 32px light title.
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
  if (back) {
    return (
      <>
        <AdminDetailBar backHref={back.href}>{actions}</AdminDetailBar>
        <AdminDetailHeading
          eyebrow={back.label === "Back" ? "Back" : back.label}
          title={title}
          media={media}
          badge={badge}
          meta={
            subtitle || meta ? (
              <>
                {subtitle ? <span>{subtitle}</span> : null}
                {meta}
              </>
            ) : undefined
          }
        />
      </>
    );
  }
  return (
    <>
      <AdminPageHeader title={title} info={subtitle} actions={actions} addon={badge} />
      {meta ? <div className="-mt-6 mb-10 flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-muted-foreground lg:-mt-8">{meta}</div> : null}
    </>
  );
}

/**
 * A block of a page: a hairline above, an eyebrow title (its explanation behind an (i)) and its
 * actions on the right. No box, no tint. `flush`: tables and lists that bring their own lines.
 */
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
    // Titled: a hairline above. Untitled filter forms: a hairline below (the toolbar line). Untitled flush blocks: none.
    <section className={cn("min-w-0", title || actions ? "border-t border-border pt-6" : flush ? "" : "border-b border-border pb-6", className)}>
      {title || actions ? (
        <div className={cn("flex min-h-10 flex-wrap items-center justify-between gap-3", flush ? "mb-2" : "mb-5")}>
          <div className="flex min-w-0 items-center gap-1.5">
            {title ? <h2 className="eyebrow text-foreground">{title}</h2> : null}
            {description ? <AdminInfo label="About this section">{description}</AdminInfo> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div>{children}</div>
    </section>
  );
}

export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-10", className)}>{children}</div>;
}

/** A number tile (AdminStat): small letter-spaced label, large light figure, optional glyph and link. */
export function Stat({ label, value, hint, href, glyph }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; glyph?: AdminGlyphName }) {
  return <AdminStat label={label} value={value} hint={hint} href={href} glyph={glyph} />;
}

/** Tiles share their hairlines (AdminStatGrid). */
export function StatGrid({ children, columns = 4 }: { children: ReactNode; columns?: 2 | 3 | 4 | "many" }) {
  return <AdminStatGrid columns={columns}>{children}</AdminStatGrid>;
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid border-t border-l border-border sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="min-w-0 border-r border-b border-border p-4">
          <dt className="eyebrow text-muted-foreground">{i.label}</dt>
          <dd className="mt-1 text-small break-words text-foreground">{i.value ?? <span className="text-muted-foreground/70">–</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
