// A text document as readable paragraphs (headings, numbered clauses, bullets, boxes). Plain markup
// with no hooks, so both the signed copy (server) and the live sign form (client) use it.
import type { ReactNode } from "react";
import { Check } from "@/components/icons";
import type { BodyBlock, BodySeg } from "@/lib/server/portal-documents";
import { cn } from "@/components/ui/cn";

export type CheckBlock = Extract<BodyBlock, { type: "check" }>;

const humanize = (key: string) => key.replace(/_+/g, " ").trim();

/** A placeholder: its value (in the body colour), or a soft marker saying what goes there. */
function Segs({ segs, values, labels }: { segs: BodySeg[]; values?: Record<string, string>; labels?: Record<string, string> }) {
  return (
    <>
      {segs.map((s, i) => {
        if (typeof s === "string") return <span key={i}>{s}</span>;
        const v = values?.[s.key]?.trim();
        if (v) return <span key={i} className="text-foreground">{v}</span>;
        return (
          <span key={i} className="rounded-sm bg-warning-soft px-1 text-[0.92em] text-warning">
            {labels?.[s.key] ?? humanize(s.key)}
          </span>
        );
      })}
    </>
  );
}

export function DocumentBody({
  blocks,
  values,
  labels,
  renderCheck,
  className,
}: {
  blocks: BodyBlock[];
  values?: Record<string, string>;
  labels?: Record<string, string>;
  /** How a box is drawn: a checkbox in the sign form; by default a static ☐ / ☑. */
  renderCheck?: (b: CheckBlock, text: ReactNode) => ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 text-[15px] leading-relaxed text-foreground/80", className)}>
      {blocks.map((b, i) => {
        if (b.type === "gap") return <div key={i} className="h-1" aria-hidden />;
        const text = <Segs segs={b.segs} values={values} labels={labels} />;
        if (b.type === "heading")
          return (
            <h3 key={i} className="pt-3 text-[15px] font-medium text-foreground first:pt-0">
              {b.label ? <span className="mr-2.5 text-muted-foreground tabular">{b.label}</span> : null}
              {text}
            </h3>
          );
        if (b.type === "bullet")
          return (
            <p key={i} className="grid grid-cols-[1.5rem_1fr]">
              <span className="text-muted-foreground" aria-hidden>
                •
              </span>
              <span>{text}</span>
            </p>
          );
        if (b.type === "check") {
          if (renderCheck) return <div key={i}>{renderCheck(b, text)}</div>;
          return (
            <p key={i} className="grid grid-cols-[1.75rem_1fr] items-start">
              <span
                className={cn("mt-1 grid h-4 w-4 place-items-center rounded-sm border", b.ticked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background")}
                aria-label={b.ticked ? "Ticked" : "Not ticked"}
                role="img"
              >
                {b.ticked ? <Check className="h-3 w-3" weight="bold" aria-hidden /> : null}
              </span>
              <span>{text}</span>
            </p>
          );
        }
        if (b.label)
          return (
            <p key={i} className="grid grid-cols-[2.75rem_1fr]">
              <span className="text-muted-foreground tabular">{b.label}</span>
              <span>{text}</span>
            </p>
          );
        return <p key={i}>{text}</p>;
      })}
    </div>
  );
}
