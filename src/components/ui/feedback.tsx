import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

import { EmptyState as KitEmptyState } from "@/components/admin/kit";

type Tone = "info" | "success" | "warning" | "error";
// One hue: a line on the left (brand blue; red only for errors), no tinted boxes.
const tones: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border-primary", icon: "text-primary", Icon: Info },
  success: { box: "border-primary", icon: "text-primary", Icon: CheckCircle2 },
  warning: { box: "border-foreground", icon: "text-foreground", Icon: AlertTriangle },
  error: { box: "border-destructive", icon: "text-destructive", Icon: XCircle },
};

export function Notice({ tone = "info", title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { box, icon, Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 border-l-2 px-4 py-3 text-small text-muted-foreground", box, className)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", icon)} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <div className="text-foreground">{title}</div> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

/**
 * The one empty state (FynoLabs EmptyState): the drawing and one sentence. "page" for a main sidebar
 * page and any tab, filter or search on it; "section" for everything below. `icon` and `padded` are
 * kept for older markup.
 */
export function EmptyState({
  title,
  description,
  action,
  size = "section",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  size?: "page" | "section";
  icon?: LucideIcon;
  padded?: boolean;
}) {
  return (
    <KitEmptyState
      size={size}
      action={action}
      label={
        description ? (
          <>
            {/[.!?:]$/.test(title.trim()) ? title : `${title}.`} {description}
          </>
        ) : (
          title
        )
      }
    />
  );
}

/** A page this role can't open: the page-size empty state with the reason. */
export function NoAccess({ what, role }: { what: string; role: string }) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center border border-border">
        <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
      </span>
      <p className="mx-auto max-w-md text-small text-muted-foreground">
        <span className="text-foreground">{what} isn&apos;t available to your role.</span> You&apos;re signed in as {role}. Ask an admin if you need access.
      </p>
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
