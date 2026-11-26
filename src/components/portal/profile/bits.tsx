// Profile building blocks: a section card with its own message line, an on/off switch (a styled
// checkbox, no JavaScript) and the editable lists (education, experience, projects, certifications).
import type { ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { saveProfileSection } from "@/app/(portal)/me/profile/actions";
import { PortalCard } from "@/components/portal/page";
import { Notice } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/client";
import { cn } from "@/components/ui/cn";

export type Flash = { s?: string; ok?: string; error?: string };

/** A card for one part of a tab; the result of its last save shows at its top. */
export function ProfileSection({ id, title, description, flash, children, aside }: { id: string; title: string; description?: ReactNode; flash?: Flash; children: ReactNode; aside?: ReactNode }) {
  const mine = flash?.s === id;
  return (
    <PortalCard as="section" id={id} className="scroll-mt-20 px-5 py-6 sm:px-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg text-foreground">{title}</h2>
          {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {aside}
      </div>
      {mine && flash?.error ? <Notice tone="error" className="mb-5">{flash.error}</Notice> : null}
      {mine && flash?.ok ? <Notice tone="success" className="mb-5">{flash.ok}</Notice> : null}
      {children}
    </PortalCard>
  );
}

/** A switch row: label and help on the left, the switch on the right. */
export function Toggle({ name, label, help, defaultChecked }: { name: string; label: string; help?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 py-3.5">
      <span className="space-y-0.5">
        <span className="block text-[15px] text-foreground">{label}</span>
        {help ? <span className="block text-sm text-muted-foreground">{help}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-secondary ring-1 ring-border transition-colors peer-checked:bg-primary peer-checked:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring" aria-hidden />
        <span className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" aria-hidden />
      </span>
    </label>
  );
}

export function SaveRow({ children = "Save", pendingText = "Saving…" }: { children?: ReactNode; pendingText?: string }) {
  return (
    <div className="mt-6 flex justify-end">
      <SubmitButton pendingText={pendingText}>{children}</SubmitButton>
    </div>
  );
}

/**
 * One editable list. `render` shows an item; `fields(item)` returns the form fields (empty item for
 * "Add"). Editing opens in place (a <details>), so the page needs no JavaScript.
 */
export function ItemList<T>({ list, items, addLabel, emptyText, render, fields }: { list: string; items: T[]; addLabel: string; emptyText: string; render: (item: T) => ReactNode; fields: (item: T | null) => ReactNode }) {
  return (
    <div className="space-y-4">
      <details className="group rounded-lg border border-dashed border-border open:border-solid open:bg-secondary/30">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-primary [&::-webkit-details-marker]:hidden">
          <Plus className="h-4 w-4" aria-hidden /> {addLabel}
        </summary>
        <form action={saveProfileSection} className="space-y-4 border-t border-border px-4 py-4">
          <input type="hidden" name="section" value="item" />
          <input type="hidden" name="list" value={list} />
          <input type="hidden" name="index" value="-1" />
          {fields(null)}
          <div className="flex justify-end">
            <SubmitButton size="sm" pendingText="Adding…">
              Add
            </SubmitButton>
          </div>
        </form>
      </details>
      {items.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((item, i) => (
            <li key={i} className="px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">{render(item)}</div>
                <form action={saveProfileSection}>
                  <input type="hidden" name="section" value="item" />
                  <input type="hidden" name="list" value={list} />
                  <input type="hidden" name="index" value={i} />
                  <input type="hidden" name="remove" value="1" />
                  <SubmitButton size="sm" variant="ghost" pendingText="…" aria-label="Remove" confirm="Remove this entry?">
                    <Trash2 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Remove</span>
                  </SubmitButton>
                </form>
              </div>
              <details className="group mt-2">
                <summary className={cn("inline-flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden")}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                </summary>
                <form action={saveProfileSection} className="mt-3 space-y-4 rounded-lg bg-secondary/30 p-4">
                  <input type="hidden" name="section" value="item" />
                  <input type="hidden" name="list" value={list} />
                  <input type="hidden" name="index" value={i} />
                  {fields(item)}
                  <div className="flex justify-end">
                    <SubmitButton size="sm" pendingText="Saving…">
                      Save
                    </SubmitButton>
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}
