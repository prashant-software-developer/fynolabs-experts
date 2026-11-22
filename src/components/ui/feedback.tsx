import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
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

/**
 * One empty state in two sizes, as on the website:
 * "page" for a main list page (any filter or search on it), "section" for everything inside a page.
 */
export function EmptyState({ title, description, action, size = "section" }: { title: string; description?: ReactNode; action?: ReactNode; size?: "page" | "section" }) {
  return (
    <div className={cn("flex w-full flex-col items-center justify-center text-center", size === "page" ? "gap-5 px-6 py-16" : "gap-3 px-6 py-8")}>
      <div className={size === "page" ? "h-32 w-32" : "h-16 w-16"}>
        <EmptyIllustration />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="mx-auto max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
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
