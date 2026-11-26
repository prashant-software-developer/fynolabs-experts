"use client";
// The record page's left panel (GHL-style "All fields"): collapsible field groups and a search box
// that filters the field rows as you type. Plain DOM filtering: every row carries `data-field`, its
// group `data-group`; while searching the panel gets `data-searching`, which opens every group and
// hides the extras (forms, uploads) so only matching rows show.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Search, X } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * A collapsible group of fields. Until it's toggled, it's open on desktop (1280px+) and closed on
 * smaller screens (the panels stack there, so the activity isn't pushed far down); pure CSS, no flash.
 */
export function FieldGroup({ title, actions, children, defaultOpen = true, count }: { title: string; actions?: ReactNode; children: ReactNode; defaultOpen?: boolean; count?: number }) {
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? (defaultOpen ? "desktop" : false);
  const body = useRef<HTMLDivElement>(null);
  // The first click flips what's on screen now (open on desktop, closed on a phone).
  const flip = () => setToggled(toggled ?? (body.current ? getComputedStyle(body.current).display !== "none" : Boolean(defaultOpen)) ? false : true);
  return (
    <section data-group className="border-t border-border">
      <div className="flex items-center gap-2 pr-3 pl-5">
        <button type="button" onClick={flip} aria-expanded={open !== false} className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left text-[13px] font-medium text-foreground hover:text-primary">
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[searching]/fields:rotate-0", open === false && "-rotate-90", open === "desktop" && "-rotate-90 xl:rotate-0")} aria-hidden />
          <span className="truncate">{title}</span>
          {count != null ? <span className="tabular text-xs font-normal text-muted-foreground">{count}</span> : null}
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-1 group-data-[searching]/fields:hidden">{actions}</div> : null}
      </div>
      <div ref={body} className={cn("space-y-3 px-5 pb-4", open === true ? "block" : open === "desktop" ? "hidden xl:block" : "hidden", "group-data-[searching]/fields:block")}>{children}</div>
    </section>
  );
}

/** "Search fields": hides the rows (and then the groups) whose label and value don't contain the text. */
export function FieldSearch({ placeholder = "Search fields" }: { placeholder?: string }) {
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = box.current?.closest<HTMLElement>("[data-fields]");
    if (!root) return;
    const term = q.trim().toLowerCase();
    if (term) root.setAttribute("data-searching", "");
    else root.removeAttribute("data-searching");
    let any = false;
    root.querySelectorAll<HTMLElement>("[data-group]").forEach((g) => {
      let shown = 0;
      g.querySelectorAll<HTMLElement>("[data-field]").forEach((f) => {
        const hit = !term || (f.textContent ?? "").toLowerCase().includes(term);
        f.hidden = !hit;
        if (hit) shown++;
      });
      g.hidden = Boolean(term) && shown === 0;
      if (shown) any = true;
    });
    const none = root.querySelector<HTMLElement>("[data-no-match]");
    if (none) none.hidden = !term || any;
  }, [q]);
  return (
    <div ref={box} className="px-5 pb-4">
      <label className="relative block">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
          }}
          placeholder={placeholder}
          className="control h-8 pr-8 pl-8 text-[13px] [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-1.5 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Clear search">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </label>
      <p data-no-match hidden className="mt-3 text-[13px] text-muted-foreground">
        No field matches &ldquo;{q}&rdquo;.
      </p>
    </div>
  );
}
