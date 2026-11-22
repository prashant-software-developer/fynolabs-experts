"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Columns3 } from "lucide-react";
import { DEFAULT_COLUMNS, EXPERT_COLUMNS, serializeColumns } from "@/lib/views";
import { buttonClass } from "./ui/button";
import { cn } from "./ui/cn";

/** Show or hide table columns (Name always stays). The choice lives in the URL (?cols=), so views keep it. */
export function ColumnPicker({ selected }: { selected: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const apply = (next: string[]) => {
    const p = new URLSearchParams(params.toString());
    const value = serializeColumns(next);
    if (value === serializeColumns(DEFAULT_COLUMNS)) p.delete("cols");
    else p.set("cols", value);
    p.delete("ok");
    p.delete("error");
    start(() => router.replace(`/experts${p.size ? `?${p.toString()}` : ""}`, { scroll: false }));
  };
  const toggle = (id: string) => apply(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]);
  return (
    <details className="relative">
      <summary className={cn(buttonClass("secondary", "sm"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
        <Columns3 className="h-3.5 w-3.5" aria-hidden /> Columns
        <span className="tabular text-muted-foreground">{selected.length + 1}</span>
      </summary>
      <div className="absolute left-0 z-40 mt-1 w-56 rounded-md border border-border bg-popover p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]" aria-busy={pending}>
        <p className="eyebrow px-2 pt-1 pb-2 text-muted-foreground">Show columns</p>
        <label className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground">
          <input type="checkbox" checked disabled className="h-4 w-4" /> Name (always)
        </label>
        {EXPERT_COLUMNS.map((c) => (
          <label key={c.id} className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-foreground/85 hover:bg-accent">
            <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
            {c.label}
          </label>
        ))}
        <div className="mt-1 flex justify-between border-t border-border px-2 pt-2 text-[13px]">
          <button type="button" onClick={() => apply([...DEFAULT_COLUMNS])} className="text-muted-foreground hover:text-foreground">
            Reset
          </button>
          <button type="button" onClick={() => apply(EXPERT_COLUMNS.map((c) => c.id))} className="text-muted-foreground hover:text-foreground">
            Show all
          </button>
        </div>
      </div>
    </details>
  );
}
