"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Columns3 } from "@/components/icons";
import { DEFAULT_COLUMNS, EXPERT_COLUMNS, serializeColumns } from "@/lib/views";
import { buttonClass } from "./ui/button";
import { Popover } from "./ui/client";
import { cn } from "./ui/cn";

/**
 * Show or hide table columns (the first column always stays). The choice goes in the URL (?cols=), so
 * a saved view keeps it, and in a cookie (`cookie`), so the list opens with the same columns next
 * time for this person. Defaults: the Experts list.
 */
export function ColumnPicker({
  selected,
  columns = EXPERT_COLUMNS,
  defaults = DEFAULT_COLUMNS,
  path = "/admin/experts",
  cookie = "hub_cols_experts",
  fixed = "Name",
}: {
  selected: string[];
  columns?: readonly { id: string; label: string }[];
  defaults?: readonly string[];
  path?: string;
  cookie?: string | null;
  fixed?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const ser = (cols: readonly string[]) => (columns === EXPERT_COLUMNS ? serializeColumns(cols) : columns.map((c) => c.id).filter((id) => cols.includes(id)).join(",") || "-");
  const apply = (next: string[]) => {
    const p = new URLSearchParams(params.toString());
    const value = ser(next);
    const isDefault = value === ser(defaults);
    if (isDefault) p.delete("cols");
    else p.set("cols", value);
    if (cookie) document.cookie = `${cookie}=${isDefault ? "" : encodeURIComponent(value)}; path=/admin; max-age=${isDefault ? 0 : 60 * 60 * 24 * 365}; samesite=lax`;
    p.delete("ok");
    p.delete("error");
    start(() => router.replace(`${path}${p.size ? `?${p.toString()}` : ""}`, { scroll: false }));
  };
  const toggle = (id: string) => apply(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]);
  return (
    <Popover className="relative">
      <summary className={cn(buttonClass("secondary", "md"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
        <Columns3 className="h-4 w-4" aria-hidden /> Columns
        <span className="tabular text-muted-foreground">{selected.length + 1}</span>
      </summary>
      <div className="z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover p-2 shadow-raised max-sm:fixed max-sm:inset-x-4 sm:absolute sm:right-0 sm:w-60" aria-busy={pending}>
        <p className="px-2 pt-1 pb-2 text-[13px] font-medium text-foreground">Show columns</p>
        <label className="flex h-9 items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground">
          <input type="checkbox" checked disabled className="h-4 w-4" /> {fixed} (always)
        </label>
        {columns.map((c) => (
          <label key={c.id} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-foreground/85 hover:bg-accent">
            <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
            {c.label}
          </label>
        ))}
        <div className="mt-1 flex justify-between border-t border-border px-2 pt-2 text-[13px]">
          <button type="button" onClick={() => apply([...defaults])} className="text-muted-foreground hover:text-foreground">
            Reset
          </button>
          <button type="button" onClick={() => apply(columns.map((c) => c.id))} className="text-muted-foreground hover:text-foreground">
            Show all
          </button>
        </div>
      </div>
    </Popover>
  );
}
