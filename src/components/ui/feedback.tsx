import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

type Tone = "info" | "success" | "warning" | "error";
const tones: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: "border-accent/20 bg-accent-soft text-accent-ink", Icon: Info },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", Icon: CheckCircle2 },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", Icon: AlertTriangle },
  error: { box: "border-red-200 bg-red-50 text-red-800", Icon: XCircle },
};

export function Notice({ tone = "info", title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { box, Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title ? <div className="font-medium">{title}</div> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action, size = "section" }: { title: string; description?: ReactNode; action?: ReactNode; size?: "page" | "section" }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", size === "page" ? "py-20" : "py-10")}>
      <div className="mb-3 h-10 w-10 rounded-full border-2 border-dashed border-slate-200" aria-hidden />
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {description ? <p className="mt-1 max-w-md text-[13px] text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Messages passed through the URL after a redirect (?ok=... / ?error=...). */
export function FlashFromParams({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className="mb-6">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {ok ? <Notice tone="success">{ok}</Notice> : null}
    </div>
  );
}
