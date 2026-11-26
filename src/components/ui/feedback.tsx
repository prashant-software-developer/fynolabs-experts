import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock, XCircle, type LucideIcon } from "@/components/icons";
import { cn } from "./cn";

type Tone = "info" | "success" | "warning" | "error";
// The website's notice: a thin line on the left and a soft tint, text in the body colour.
const tones: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border-primary bg-secondary/70", icon: "text-primary", Icon: Info },
  success: { box: "border-success bg-success-soft", icon: "text-success", Icon: CheckCircle2 },
  warning: { box: "border-warning bg-warning-soft", icon: "text-warning", Icon: AlertTriangle },
  error: { box: "border-danger bg-danger-soft", icon: "text-danger", Icon: XCircle },
};

export function Notice({ tone = "info", title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { box, icon, Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-r-md border-l-2 px-4 py-3 text-sm text-foreground/85", box, className)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", icon)} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <div className="font-medium text-foreground">{title}</div> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

/** The website's empty-state drawing: dotted orbit, a ring and one blue point. */
function EmptyIllustration() {
  return (
    <svg viewBox="0 0 240 240" className="h-full w-full overflow-visible" fill="none" aria-hidden="true">
      <circle cx="120" cy="120" r="96" className="stroke-border" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
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

/** The same drawing, small enough to sit in a line of text. */
function MiniMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 overflow-visible" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" className="stroke-border" strokeDasharray="1.5 2.5" />
      <circle cx="12" cy="12" r="5" className="stroke-border" />
      <circle cx="12" cy="12" r="2" className="fill-primary" />
    </svg>
  );
}

/**
 * One empty state in two sizes, as on the website:
 * "page" (the large drawing) for a main list page and any filter or search on it;
 * "section" (one line with an icon) for everything inside a page. `padded={false}` when the
 * surrounding section already has padding.
 */
export function EmptyState({
  title,
  description,
  action,
  size = "section",
  icon: Icon,
  padded = true,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  size?: "page" | "section";
  icon?: LucideIcon;
  padded?: boolean;
}) {
  if (size === "section") {
    return (
      <div className={cn("flex w-full flex-wrap items-center gap-x-3 gap-y-2", padded && "px-6 py-5")}>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden /> : <MiniMark />}
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{title}</span>
          {description ? <span> · {description}</span> : null}
        </p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <div className="h-28 w-28">
        <EmptyIllustration />
      </div>
      <div className="space-y-1.5">
        <p className="text-[15px] font-medium text-foreground">{title}</p>
        {description ? <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** A page this role can't open: same layout as an empty page, with the reason. */
export function NoAccess({ what, role }: { what: string; role: string }) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
      </span>
      <div className="space-y-1.5">
        <p className="text-[15px] font-medium text-foreground">{what} isn&apos;t available to your role</p>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">You&apos;re signed in as {role}. Ask an admin if you need access.</p>
      </div>
    </div>
  );
}

/** Messages passed through the URL after a redirect (?ok=... / ?error=...). */
export function FlashFromParams({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className="mb-6 space-y-2">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {ok ? <Notice tone="success">{ok}</Notice> : null}
    </div>
  );
}
