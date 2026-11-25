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
