"use client";
// The bulk actions bar of a list (Experts, Accounts, Leads), GoHighLevel style: tick rows, and a bar
// appears above the table with "3 selected", the actions, Export CSV, Delete and Clear. The row
// checkboxes and every control point at one empty <form id=…> with form="…", so the bar and the
// table can sit anywhere on the page and the board's own forms never nest.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Download, Trash2, X } from "@/components/icons";
import { buttonClass } from "./button";
import { Popover } from "./client";
import { cn } from "./cn";

const boxes = (form: string) => Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="ids"][form="${form}"]`));

export function BulkBar({
  form,
  noun,
  plural,
  exportHref,
  deleteOp,
  children,
}: {
  form: string;
  noun: string;
  plural?: string;
  /** CSV of the ticked rows: opened as `${exportHref}?ids=a,b,c`. */
  exportHref?: string | null;
  /** The op value of a bulk delete (asks first), or nothing when the role may not delete. */
  deleteOp?: string | null;
  children?: ReactNode;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const sync = useCallback(() => {
    const all = boxes(form);
    const on = all.filter((b) => b.checked).map((b) => b.value);
    setPicked(on);
    const head = document.querySelector<HTMLInputElement>(`input[data-select-all][form="${form}"]`);
    if (head) {
      head.checked = all.length > 0 && on.length === all.length;
      head.indeterminate = on.length > 0 && on.length < all.length;
    }
  }, [form]);
  useEffect(() => {
    sync();
    const onChange = () => sync();
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [sync]);

  const clear = () => {
    boxes(form).forEach((b) => (b.checked = false));
    sync();
  };
  const n = picked.length;
  if (!n) return null;
  const words = n === 1 ? noun : (plural ?? `${noun}s`);
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/[0.04] px-4 py-2 sm:px-6">
      {/* The form's default button, disabled: Enter in a field of the bar submits nothing, instead of
          running the first action on the page (which used to clear the owner of every ticked expert). */}
      <button type="submit" form={form} disabled hidden aria-hidden tabIndex={-1} />
      <span className="tabular mr-1 text-[13px] font-medium text-foreground">
        {n} selected
      </span>
      <span className="hidden h-5 w-px bg-border sm:inline-block" aria-hidden />
      {children}
      {exportHref ? (
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => (window.location.href = `${exportHref}${exportHref.includes("?") ? "&" : "?"}ids=${picked.join(",")}`)}>
          <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
        </button>
      ) : null}
      {deleteOp ? (
        <button
          type="submit"
          form={form}
          name="op"
          value={deleteOp}
          className={buttonClass("secondary", "sm", "text-danger hover:border-danger/40")}
          onClick={(e) => {
            if (!window.confirm(`Delete ${n} ${words}? This cannot be undone.`)) e.preventDefault();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </button>
      ) : null}
      <button type="button" onClick={clear} className="ml-auto inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground">
        <X className="h-3.5 w-3.5" aria-hidden /> Clear
      </button>
    </div>
  );
}

/** One action in the bar: a button that opens a small panel with its field and Apply. */
export function BulkMenu({ label, icon, children, wide }: { label: string; icon?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <Popover className="relative">
      <summary className={cn(buttonClass("secondary", "sm"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
        {icon}
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </summary>
      <div className={cn("z-40 mt-1 space-y-3 rounded-md border border-border bg-popover p-3 shadow-raised max-sm:fixed max-sm:inset-x-4 sm:absolute sm:left-0", wide ? "sm:w-96" : "sm:w-72")}>{children}</div>
    </Popover>
  );
}

/** The Apply button inside a BulkMenu: submits the bulk form with this op. */
export function BulkApply({ form, op, children = "Apply" }: { form: string; op: string; children?: ReactNode }) {
  return (
    <button type="submit" form={form} name="op" value={op} className={buttonClass("primary", "sm")}>
      {children}
    </button>
  );
}
