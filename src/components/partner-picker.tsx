"use client";
// Pick partners for a pod lead's scope: a search box, the chosen ones as removable chips, and a short
// scrolling list instead of every partner on the page at once. Each choice is a real checkbox named
// `name`, so the form posts the same values as before (filtered-out boxes keep their state).
import { useState } from "react";
import { Search, X } from "@/components/icons";

export function PartnerPicker({ partners, name = "partnerIds", defaultSelected = [] }: { partners: { id: string; name: string }[]; name?: string; defaultSelected?: string[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set(defaultSelected));
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const toggle = (id: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const chosen = partners.filter((p) => picked.has(p.id));
  const shown = partners.filter((p) => !needle || p.name.toLowerCase().includes(needle)).length;
  return (
    <div className="space-y-3">
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        {chosen.length ? (
          chosen.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/[0.06] py-0.5 pr-1 pl-2.5 text-[13px] text-foreground">
              {p.name}
              <button type="button" onClick={() => toggle(p.id, false)} className="rounded-full p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-foreground" aria-label={`Remove ${p.name}`}>
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))
        ) : (
          <span className="text-[13px] text-muted-foreground">No partners chosen yet.</span>
        )}
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <label className="relative block border-b border-border">
          <span className="sr-only">Find a partner</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find a partner (${partners.length})`} className="h-10 w-full bg-transparent pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground" />
        </label>
        <ul className="max-h-60 overflow-y-auto py-1">
          {partners.map((p) => {
            const hidden = Boolean(needle) && !p.name.toLowerCase().includes(needle);
            return (
              <li key={p.id} hidden={hidden}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-foreground/85 hover:bg-secondary">
                  <input type="checkbox" name={name} value={p.id} checked={picked.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} className="h-4 w-4 shrink-0 rounded-sm border-input" />
                  <span className="truncate">{p.name}</span>
                </label>
              </li>
            );
          })}
          {shown === 0 ? <li className="px-3 py-3 text-[13px] text-muted-foreground">No partner matches “{q}”.</li> : null}
        </ul>
      </div>
    </div>
  );
}
