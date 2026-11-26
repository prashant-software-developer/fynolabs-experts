// The one loader of the app (27 Nov 2026, Prashant: loaders weren't consistent, and sat at the top).
// A thin ring in the current text colour: Spinner inside buttons while they save, PageLoader centred in
// the page area while a page loads (every loading.tsx uses it). Pure CSS, so it works on the server.
import { cn } from "./cn";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80", className)}
    />
  );
}

/** Centred in the space a page would fill, with a quiet line under it. */
export function PageLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
      <Spinner className="h-6 w-6 text-primary" label={label} />
      <span className="text-[13px]">{label}…</span>
    </div>
  );
}
