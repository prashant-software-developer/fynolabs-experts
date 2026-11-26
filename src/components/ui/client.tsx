"use client";
// Small interactive pieces. Everything else renders on the server.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buttonClass } from "./button";

/** While a side panel is open: Escape goes to `href` (closes it), and the page behind doesn't scroll. */
export function EscapeTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) router.push(href, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [href, router]);
  return null;
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  confirm,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingText?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  confirm?: string;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      type="submit"
      disabled={pending || props.disabled}
      className={buttonClass(variant, size, className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/** Ticks or unticks every `name="ids"` checkbox of the same form (including ones linked with form="..."). */
export function SelectAll({ label = "Select all", form }: { label?: string; form?: string }) {
  return (
    <input
      type="checkbox"
      form={form}
      aria-label={label}
      className="h-4 w-4 rounded-sm border-input align-middle"
      onChange={(e) => {
        const f = e.currentTarget.form;
        if (!f) return;
        const checked = e.currentTarget.checked;
        Array.from(f.elements).forEach((el) => {
          if (el instanceof HTMLInputElement && el.type === "checkbox" && el.name === "ids") el.checked = checked;
        });
      }}
    />
  );
}

/** A select that submits its form as soon as it changes (status pickers). */
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

/**
 * A list filter in a toolbar (src/components/ui/toolbar.tsx): applies as soon as it changes. A filter
 * that is set reads darker, so the active ones stand out. Sized to its words.
 */
export function FilterSelect({
  name,
  defaultValue,
  options,
  placeholder,
  label,
  className,
  form,
}: {
  name: string;
  defaultValue?: string;
  options: readonly (string | { value: string; label: string; disabled?: boolean })[];
  placeholder?: string;
  label: string;
  className?: string;
  form?: string;
}) {
  const on = Boolean(defaultValue);
  return (
    <select
      name={name}
      form={form}
      defaultValue={defaultValue ?? ""}
      aria-label={label}
      title={label}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={["control w-auto max-w-[15rem] min-w-0", on ? "border-foreground/30 font-medium text-foreground" : "text-foreground/75", className].filter(Boolean).join(" ")}
    >
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value} disabled={"disabled" in opt ? opt.disabled : undefined}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}
