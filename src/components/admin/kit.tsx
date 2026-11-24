// The FynoLabs admin kit (Main Website - FyonLabs/src/components/admin/AdminKit.tsx), ported to the
// hub as server components. Every admin page uses these, so layout, hierarchy, toolbars, rows, hover
// and status styling stay identical to the FynoLabs admin:
//
// Page:    AdminPageHeader (40px light title + main action) · AdminToolbar (tabs with counts · search · filters)
// Lists:   AdminList > AdminRow (media · title · description · aside · actions)
// Media:   RowAvatar (people) · RowLogo (platforms, agencies) · RowIcon (everything else)
// Stats:   AdminStatGrid > AdminStat (with an AdminGlyph line mark, linking to its page)
// Detail:  AdminDetailBar (Back · Unsaved · Delete · Save) + AdminDetailHeading + AdminDetailSection
// Status:  StatusBadge (one outline style: brand blue for positive, muted for finished, foreground else)
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Check, MoreVertical, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { OrgLogo } from "@/components/crm/org-logo";
import { AdminInfo } from "./kit-client";

export { AdminInfo };

/* ---------- Labels and fields ---------- */

/** Small uppercase section label used above lists, fields and groups. */
export function AdminLabel({ children, className, as: As = "p" }: { children: ReactNode; className?: string; as?: "p" | "span" | "h2" | "h3" | "dt" }) {
  return <As className={cn("eyebrow text-muted-foreground", className)}>{children}</As>;
}

/** The label above every form field. */
export function AdminFieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="eyebrow text-muted-foreground">
      {children}
    </label>
  );
}

/** One form field: label (with an optional (i)), the control, then an optional hint or error. */
export function AdminField({ label, htmlFor, info, hint, error, className, children }: { label: string; htmlFor?: string; info?: ReactNode; hint?: ReactNode; error?: string | null; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex h-5 items-center gap-1.5">
        <AdminFieldLabel htmlFor={htmlFor}>{label}</AdminFieldLabel>
        {info ? <AdminInfo label={`About ${label}`}>{info}</AdminInfo> : null}
      </div>
      <div className="mt-2 flex-1">{children}</div>
      {error ? <p className="mt-2 text-small text-destructive">{error}</p> : hint ? <div className="mt-2 text-small text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/* ---------- Page ---------- */

/** The page title on the left (40px light) and the page's main action on the right, on one line. */
export function AdminPageHeader({ title, info, actions, addon }: { title: ReactNode; info?: ReactNode; actions?: ReactNode; addon?: ReactNode }) {
  return (
    <div className="mb-6 flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-4 lg:mb-12">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-[2rem] leading-tight font-light text-foreground sm:text-heading">{title}</h1>
        {info ? <AdminInfo label="About this page">{info}</AdminInfo> : null}
        {addon}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">{actions}</div> : null}
    </div>
  );
}

/**
 * Filter tabs on the left; search, filters and ⋮ on the right, with a line below. Tabs and search share
 * one row from 1280px; narrower, the search goes under the tabs.
 */
export function AdminToolbar({ start, children, className }: { start?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:gap-5 sm:pb-7 xl:flex-row xl:items-center xl:justify-between", className)}>
      <div className="min-w-0">{start}</div>
      {children ? <div className="flex w-full flex-wrap items-center gap-3 xl:w-auto xl:flex-nowrap">{children}</div> : null}
    </div>
  );
}

export type AdminTabLink = { href: string; label: string; active: boolean; count?: number | null };

/** Tabs as links (the URL holds the view): uppercase labels with counts, the open one underlined. */
export function AdminTabs({ tabs, label = "Views" }: { tabs: AdminTabLink[]; label?: string }) {
  return (
    <nav className="-mb-1 flex items-center gap-x-5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={label}>
      {tabs.map((t) => (
        <Link
          key={t.href + t.label}
          href={t.href}
          scroll={false}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "eyebrow tabular flex h-10 shrink-0 items-center whitespace-nowrap underline-offset-8 transition-colors focus-visible:text-foreground",
            t.active ? "text-foreground underline" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {typeof t.count === "number" ? ` (${t.count})` : ""}
        </Link>
      ))}
    </nav>
  );
}

/** Search for a list page: a GET form (works without JavaScript), the other filters kept as hidden fields. */
export function AdminSearch({ name = "q", value, placeholder, keep, action, className }: { name?: string; value?: string; placeholder: string; keep?: Record<string, string | undefined>; action?: string; className?: string }) {
  return (
    <form method="get" action={action} role="search" className={cn("relative min-w-0 flex-1 basis-[8rem] sm:w-[240px] sm:flex-none sm:basis-auto", className)}>
      {Object.entries(keep ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input type="search" name={name} defaultValue={value} placeholder={placeholder} aria-label={placeholder} className="control pl-9" />
    </form>
  );
}

/** A heads-up on a page (not an error): a line on the left in the brand colour. */
export function AdminNotice({ children, className, tone = "info" }: { children: ReactNode; className?: string; tone?: "info" | "error" }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cn("border-l-2 px-4 py-3 text-small text-muted-foreground", tone === "error" ? "border-destructive text-foreground" : "border-primary", className)}>
      {children}
    </p>
  );
}

/* ---------- Empty state ---------- */

function EmptyIllustration() {
  return (
    <svg viewBox="0 0 240 240" className="h-full w-full" fill="none" aria-hidden="true">
      <circle cx="120" cy="120" r="96" className="stroke-border" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
      <circle cx="120" cy="120" r="56" className="stroke-border" vectorEffect="non-scaling-stroke" />
      <path d="M120 24v32M120 184v32M24 120h32M184 120h32" className="stroke-border" vectorEffect="non-scaling-stroke" />
      <circle cx="120" cy="120" r="8" className="fill-primary" />
      <circle cx="120" cy="24" r="4" className="fill-primary" />
      <circle cx="216" cy="120" r="3" className="stroke-muted-foreground" vectorEffect="non-scaling-stroke" />
      <circle cx="120" cy="216" r="3" className="stroke-muted-foreground" vectorEffect="non-scaling-stroke" />
      <circle cx="24" cy="120" r="3" className="stroke-muted-foreground" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * The one empty state: the same drawing and one sentence, in two sizes. "page": a main sidebar page
 * (every tab, filter and search on it); "section": everything below (detail pages, tabs, panels, pickers).
 */
export function EmptyState({ label, size, action }: { label: ReactNode; size: "page" | "section"; action?: ReactNode }) {
  return size === "section" ? (
    <div className="flex w-full flex-col items-center gap-4 pt-10 pb-12 text-center">
      <div className="h-20 w-20">
        <EmptyIllustration />
      </div>
      <p className="max-w-md text-small text-muted-foreground">{label}</p>
      {action ? <div>{action}</div> : null}
    </div>
  ) : (
    <div className="flex w-full flex-col items-center gap-6 bg-background pt-16 pb-16 text-center">
      <div className="h-48 w-48">
        <EmptyIllustration />
      </div>
      <p className="max-w-md text-small text-muted-foreground">{label}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

/* ---------- Stats ---------- */

const statCols = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1",
  many: "grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
} as const;

/** Tiles share their hairlines (no boxes, no shadows). */
export function AdminStatGrid({ columns = 4, children, className }: { columns?: keyof typeof statCols; children: ReactNode; className?: string }) {
  return <div className={cn("grid border-t border-l border-border", statCols[columns], className)}>{children}</div>;
}

/** A KPI tile. With `href` it links to the page behind the number. */
export function AdminStat({ label, value, glyph, href, hint }: { label: string; value: ReactNode; glyph?: AdminGlyphName; href?: string; hint?: ReactNode }) {
  const body = (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <AdminLabel>{label}</AdminLabel>
        <p className="tabular mt-2 truncate text-2xl font-light text-foreground sm:mt-3 sm:text-stat">{value}</p>
        {hint ? <p className="mt-1 truncate text-small text-muted-foreground">{hint}</p> : null}
      </div>
      {glyph ? <AdminGlyph name={glyph} className="hidden opacity-90 transition-opacity group-hover:opacity-100 sm:block" /> : null}
    </div>
  );
  const box = "min-w-0 border-r border-b border-border bg-background p-4 sm:p-5 md:p-6";
  return href ? (
    <Link href={href} className={cn("admin-hover group block", box)}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

/* ---------- KPI glyphs ---------- */

/** Small abstract marks for KPI tiles: soft hairlines and one accent in the brand colour. */
const glyphs = {
  rising: (
    <>
      <path d="M4 34H14V26H24V18H34" className="stroke-muted-foreground" strokeOpacity={0.45} />
      <path d="M4 36H36" className="stroke-muted-foreground" strokeOpacity={0.45} strokeDasharray="1 3" />
      <circle cx="34" cy="18" r="3" className="fill-primary" />
    </>
  ),
  orbit: (
    <>
      <circle cx="20" cy="20" r="16" className="stroke-muted-foreground" strokeOpacity={0.45} strokeDasharray="1.5 3" />
      <circle cx="20" cy="20" r="9" className="stroke-muted-foreground" strokeOpacity={0.45} />
      <circle cx="20" cy="20" r="3" className="fill-primary" />
    </>
  ),
  people: (
    <>
      <path d="M9 26L20 13L31 26Z" className="stroke-muted-foreground" strokeOpacity={0.45} />
      <circle cx="9" cy="26" r="3" className="fill-background stroke-muted-foreground" strokeOpacity={0.6} />
      <circle cx="31" cy="26" r="3" className="fill-background stroke-muted-foreground" strokeOpacity={0.6} />
      <circle cx="20" cy="13" r="3.5" className="fill-primary" />
    </>
  ),
  grid: (
    <>
      {[8, 20, 32].flatMap((x) => [8, 20, 32].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" className="fill-muted-foreground" fillOpacity={0.45} />))}
      <rect x="16" y="16" width="8" height="8" className="fill-primary" />
    </>
  ),
  lines: (
    <>
      <path d="M12 12H34M12 20H28M12 28H32" className="stroke-muted-foreground" strokeOpacity={0.45} />
      <circle cx="6" cy="12" r="2.5" className="fill-primary" />
      <circle cx="6" cy="20" r="1.5" className="fill-muted-foreground" fillOpacity={0.45} />
      <circle cx="6" cy="28" r="1.5" className="fill-muted-foreground" fillOpacity={0.45} />
    </>
  ),
  funnel: (
    <>
      <path d="M4 8C16 8 20 20 30 20M4 20H30M4 32C16 32 20 20 30 20" className="stroke-muted-foreground" strokeOpacity={0.45} />
      <path d="M30 20H37" className="stroke-primary" strokeWidth="2" />
      <circle cx="30" cy="20" r="2.5" className="fill-primary" />
    </>
  ),
  relay: (
    <>
      <path d="M8 28C8 14 32 14 32 28" className="stroke-muted-foreground" strokeOpacity={0.45} strokeDasharray="1.5 3" />
      <circle cx="8" cy="28" r="3" className="fill-background stroke-muted-foreground" strokeOpacity={0.6} />
      <circle cx="32" cy="28" r="3.5" className="fill-primary" />
    </>
  ),
  signal: (
    <>
      <path d="M6 34V26M13 34V20M27 34V22M34 34V28" className="stroke-muted-foreground" strokeOpacity={0.45} />
      <path d="M20 34V10" className="stroke-primary" strokeWidth="2" />
      <path d="M2 34H38" className="stroke-muted-foreground" strokeOpacity={0.45} />
    </>
  ),
} as const;

export type AdminGlyphName = keyof typeof glyphs;
export const GLYPH_NAMES = Object.keys(glyphs) as AdminGlyphName[];

export function AdminGlyph({ name, className }: { name: AdminGlyphName; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-12 w-12 shrink-0", className)} fill="none" strokeWidth="1" aria-hidden="true">
      {glyphs[name]}
    </svg>
  );
}

/* ---------- Rows ---------- */

export function AdminList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border border-b border-border", className)}>{children}</div>;
}

const rowClass = "flex w-full items-start gap-4 px-3 py-5 text-left sm:items-center sm:gap-5 sm:px-4 sm:py-6 md:px-6";

/**
 * One list row. With `href` the whole row opens it (hover wash); without, it is static (no wash, so a
 * wash always means "clickable"). `actions` sit on the right and never trigger the row.
 */
export function AdminRow({ href, scroll, ariaLabel, media, title, description, children, aside, actions, active }: {
  href?: string;
  scroll?: boolean;
  ariaLabel?: string;
  media?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  active?: boolean;
}) {
  const body = (
    <>
      {media}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body text-foreground">{title}</div>
        {description ? <div className="mt-0.5 text-small break-words text-muted-foreground">{description}</div> : null}
        {children}
        {aside ? <div className="tabular mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground sm:hidden">{aside}</div> : null}
      </div>
      {aside ? <div className="tabular hidden shrink-0 items-center gap-3 text-small text-muted-foreground sm:flex">{aside}</div> : null}
    </>
  );
  if (!href) {
    return (
      <div className={rowClass}>
        {body}
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    );
  }
  // The link covers the row; actions sit above it so their clicks never open the row.
  return (
    <div className={cn("admin-hover relative", active && "bg-foreground/[0.06]")}>
      <Link href={href} scroll={scroll} aria-label={ariaLabel} aria-current={active ? "true" : undefined} className={rowClass}>
        {body}
        {actions ? (
          <span className="invisible flex shrink-0 items-center gap-2" aria-hidden>
            {actions}
          </span>
        ) : null}
      </Link>
      {actions ? <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2 sm:right-4 md:right-6">{actions}</div> : null}
    </div>
  );
}

const mediaBox = "flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-background";

export const initialsOf = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";

/** People: initials. */
export function RowAvatar({ name }: { name: string }) {
  return (
    <span className={cn(mediaBox, "eyebrow text-foreground")} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

/** Platforms and agencies: their logo. */
export function RowLogo({ name, logoUrl, domain }: { name: string; logoUrl?: string | null; domain?: string | null }) {
  return (
    <span className={mediaBox} aria-hidden="true">
      <OrgLogo name={name} logoUrl={logoUrl} domain={domain} size={24} className="border-0" />
    </span>
  );
}

/** Everything else: the section's navigation icon. */
export function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className={cn(mediaBox, "text-muted-foreground")} aria-hidden="true">
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function RowCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn("flex h-[18px] w-[18px] shrink-0 items-center justify-center border-[1.5px]", checked ? "border-foreground bg-foreground text-background" : "border-muted-foreground/80 bg-transparent")}
      aria-hidden="true"
    >
      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
  );
}

/** Small action inside a list row (Open, Approve, Discard): quiet until hovered. */
export const rowButtonClass =
  "inline-flex h-9 shrink-0 items-center gap-1.5 border border-input bg-background px-3 text-small font-normal text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground";

/** The ⋮ menu (no JavaScript needed: a <details> that opens below the button). */
export function AdminRowMenu({ children, label = "More actions" }: { children: ReactNode; label?: string }) {
  return (
    <details className="group/menu relative">
      <summary
        aria-label={label}
        className="admin-hover flex h-10 w-10 cursor-pointer list-none items-center justify-center border border-input text-foreground hover:border-foreground [&::-webkit-details-marker]:hidden"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-40 mt-1 min-w-[200px] border border-border bg-background p-1">{children}</div>
    </details>
  );
}

/** One link in an AdminRowMenu. */
export function AdminMenuItem({ href, children, destructive }: { href: string; children: ReactNode; destructive?: boolean }) {
  return (
    <Link href={href} className={cn("admin-hover block px-3 py-2.5 text-small", destructive ? "text-destructive" : "text-foreground")}>
      {children}
    </Link>
  );
}

/* ---------- Status ---------- */

const POSITIVE = new Set(["active", "open", "approved", "hired", "live", "selected", "placed", "won", "published", "paid", "verified", "signed", "available", "filled", "done", "yes"]);
const MUTED = new Set(["closed", "inactive", "discarded", "rejected", "declined", "handled", "draft", "sent", "ended", "withdrawn", "lost", "void", "cancelled", "canceled", "archived", "unknown", "unavailable", "busy", "dropped", "expired", "paused", "on_hold", "no"]);

export type StatusKind = "positive" | "finished" | "neutral";
export const statusKind = (status: string): StatusKind => (POSITIVE.has(status) ? "positive" : MUTED.has(status) ? "finished" : "neutral");

const KIND_CLASS: Record<StatusKind, string> = {
  positive: "border-primary text-primary",
  finished: "border-border text-muted-foreground",
  neutral: "border-foreground text-foreground",
};

/** One badge style for every status: an uppercase label in a square 1px outline. */
export function StatusBadge({ status, label, kind, title }: { status: string; label?: ReactNode; kind?: StatusKind; title?: string }) {
  return (
    <span title={title} className={cn("eyebrow inline-flex shrink-0 items-center border px-2.5 py-1 whitespace-nowrap", KIND_CLASS[kind ?? statusKind(status)])}>
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

/* ---------- Panel and detail content ---------- */

/** Small fact tiles (icon, label, value) for the top of a detail page or panel. */
export function AdminFacts({ facts, compact = false }: { facts: { icon?: LucideIcon; label: string; value?: ReactNode }[]; compact?: boolean }) {
  const shown = facts.filter((f) => f.value !== undefined && f.value !== null && f.value !== "");
  if (!shown.length) return null;
  return (
    <dl className={cn("grid border-t border-l border-border", compact ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2")}>
      {shown.map(({ icon: Icon, label, value }) => (
        <div key={label} className={cn("flex min-w-0 border-r border-b border-border bg-background", compact ? "gap-2 p-3" : "gap-3 p-4")}>
          {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
          <div className="min-w-0">
            <dt className="eyebrow text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-small break-words text-foreground">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** Skills or keywords as square outline tags. */
export function AdminTags({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((tag, i) => (
        <li key={`${tag}-${i}`} className="border border-border px-2.5 py-1 text-small text-foreground">
          {tag}
        </li>
      ))}
    </ul>
  );
}

/** A titled block inside a side panel. */
export function AdminSheetSection({ label, info, actions, children }: { label: string; info?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="[&+&]:mt-10">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <AdminLabel as="h3">{label}</AdminLabel>
          {info ? <AdminInfo label={`About ${label}`}>{info}</AdminInfo> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Sticky bar on detail pages: Back on the left; Unsaved, other actions and Save on the right. Its line and
 * frosted background run the full width of the column (the ::before); its content lines up with the page.
 */
export function AdminDetailBar({ backHref, backLabel = "Back", dirty, children }: { backHref: string; backLabel?: string; dirty?: boolean; children?: ReactNode }) {
  return (
    <div
      data-detail
      className="sticky top-0 z-20 -mx-5 mb-[41px] before:absolute before:top-0 before:-bottom-px before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:border-b before:border-border before:bg-background/80 before:backdrop-blur-xl before:content-[''] md:-mx-10 md:mb-[57px] lg:-mt-12"
    >
      <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-2 px-5 py-2.5 sm:gap-4 sm:py-4 md:px-10">
        <Link href={backHref} className="inline-flex h-10 shrink-0 items-center gap-2 border border-input bg-background px-4 text-small text-foreground transition-colors hover:border-foreground/40 max-[369px]:px-3">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> <span className="max-[369px]:sr-only">{backLabel}</span>
        </Link>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          {dirty ? (
            <span className="hidden sm:block">
              <AdminLabel>Unsaved</AdminLabel>
            </span>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Eyebrow (the section it belongs to), title (32px light) with optional media and badge. */
export function AdminDetailHeading({ eyebrow, title, badge, media, info, meta }: { eyebrow: ReactNode; title: ReactNode; badge?: ReactNode; media?: ReactNode; info?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-10">
      <AdminLabel>{eyebrow}</AdminLabel>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:mt-6 sm:gap-x-4">
        <span className="flex min-w-0 items-center gap-3 sm:gap-4">
          {media}
          <h1 className="min-w-0 text-[2rem] leading-tight font-light text-foreground [overflow-wrap:anywhere] sm:text-heading">{title}</h1>
          {info ? <AdminInfo label="About this page">{info}</AdminInfo> : null}
        </span>
        {badge ? <span className="flex shrink-0 flex-wrap items-center gap-2">{badge}</span> : null}
      </div>
      {meta ? <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-muted-foreground">{meta}</div> : null}
    </div>
  );
}

/** A section of a detail page: a hairline above, generous space, an eyebrow title and its actions. */
export function AdminDetailSection({ label, info, actions, children, className }: { label?: ReactNode; info?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mt-12 border-t border-border pt-10 first:mt-0 first:border-t-0 first:pt-0", className)}>
      {label || actions ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {label ? (
              <AdminLabel as="h2" className="text-foreground">
                {label}
              </AdminLabel>
            ) : null}
            {info ? <AdminInfo label="More information">{info}</AdminInfo> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The sideways-scrolling row of board lanes (no scrollbar; swipe or Shift + wheel). */
export function BoardScroller({ children }: { children: ReactNode }) {
  return <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>;
}

/** One board lane: a label with its count, then cards, each a hairline box. */
export function BoardLane({ label, count, children }: { label: ReactNode; count?: number; children: ReactNode }) {
  return (
    <section className="w-[280px] shrink-0 snap-start">
      <div className="flex h-10 items-center justify-between border-b border-border">
        <AdminLabel as="h3" className="text-foreground">
          {label}
        </AdminLabel>
        {typeof count === "number" ? <span className="tabular text-small text-muted-foreground">{count}</span> : null}
      </div>
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** The Experts │ Groups switch (groups are lists of people to email or refer), as in the FynoLabs admin. */
export function PeopleTabs({ value, counts }: { value: "profiles" | "groups"; counts?: { profiles?: number; groups?: number } }) {
  return (
    <div className="tabs-line mb-8 border-b border-border pb-4">
      <AdminTabs
        label="People"
        tabs={[
          { href: "/admin/experts", label: "Experts", active: value === "profiles", count: counts?.profiles },
          { href: "/admin/groups", label: "Groups", active: value === "groups", count: counts?.groups },
        ]}
      />
    </div>
  );
}
