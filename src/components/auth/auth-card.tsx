import type { ReactNode } from "react";

/** The heading over an auth card: a small blue label, a light title and one line of help. */
export function AuthHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="space-y-2 text-center">
      {eyebrow ? <p className="eyebrow text-primary">{eyebrow}</p> : null}
      <h1 className="text-title text-foreground">{title}</h1>
      {children ? <p className="text-sm leading-relaxed text-muted-foreground">{children}</p> : null}
    </div>
  );
}

/** The one card on an auth page. */
export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="space-y-5 rounded-md border border-border bg-card px-6 py-7 sm:px-8">{children}</div>;
}

/** "or with your email": between the Google / LinkedIn buttons and the form. */
export function OrDivider({ label = "or with your email" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" /> {label} <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** A line of links under the card. */
export function AuthFootnote({ children }: { children: ReactNode }) {
  return <div className="text-center text-small leading-relaxed text-muted-foreground">{children}</div>;
}
