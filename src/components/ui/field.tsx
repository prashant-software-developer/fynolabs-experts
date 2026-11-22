import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("control", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("control", className)} {...props} />;
}

export function Select({
  className,
  options,
  placeholder,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly (string | { value: string; label: string; disabled?: boolean })[];
  placeholder?: string;
}) {
  return (
    <select className={cn("control", className)} {...props}>
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

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm text-slate-700", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-[#205ff3]" {...props} />
      {label}
    </label>
  );
}

/** Two fields side by side on wide screens (form fields only; pages stay single-column). */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
