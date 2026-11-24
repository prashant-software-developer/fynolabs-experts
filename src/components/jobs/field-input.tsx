// One question of a job's application form, rendered by type. Used by the public form and the
// builder's preview, so both always look the same.
import type { ReactNode } from "react";
import { inputName, type FieldDef } from "@/lib/forms/field-meta";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { cn } from "@/components/ui/cn";
import { FilePicker } from "@/components/ui/file-picker";

const pill =
  "inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground/85 transition-colors hover:bg-foreground/[0.06] has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06] has-[:checked]:text-foreground";

export function FieldInput({
  field,
  value,
  error,
  disabled,
  readOnly,
  fileNote,
}: {
  field: FieldDef;
  value?: string | string[];
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Under a file question (e.g. "We'll use the CV you already gave us"). */
  fileNote?: ReactNode;
}) {
  const id = `q-${field.id}`;
  const name = inputName(field.id);
  const str = Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const choices = field.options?.choices ?? [];
  const req = field.required && field.type !== "consent";
  const describedBy = [field.helpText ? `${id}-help` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  const common = { id, name, disabled, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy } as const;

  if (field.type === "section") {
    return (
      <div className="space-y-1 border-t border-border pt-6 first:border-t-0 first:pt-0">
        <h3 className="text-[15px] font-normal text-foreground">{field.label}</h3>
        {field.helpText ? <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{field.helpText}</p> : null}
      </div>
    );
  }

  let control: ReactNode;
  switch (field.type) {
    case "long_text":
      control = <textarea {...common} rows={5} defaultValue={str} readOnly={readOnly} className="control" />;
      break;
    case "email":
      control = <input {...common} type="email" autoComplete="email" defaultValue={str} readOnly={readOnly} className={cn("control", readOnly && "bg-foreground/[0.06]")} />;
      break;
    case "phone":
      control = <input {...common} type="tel" autoComplete="tel" defaultValue={str} className="control" />;
      break;
    case "url":
      control = <input {...common} type="url" inputMode="url" placeholder={field.mapsTo === "linkedin_url" ? "https://www.linkedin.com/in/..." : "https://"} defaultValue={str} className="control" />;
      break;
    case "number":
      control = <input {...common} type="number" step="any" inputMode="decimal" defaultValue={str} className="control sm:max-w-48" />;
      break;
    case "years":
      control = <input {...common} type="number" min={0} max={70} step={1} inputMode="numeric" defaultValue={str} className="control sm:max-w-48" />;
      break;
    case "date":
      control = <input {...common} type="date" defaultValue={str} className="control sm:max-w-56" />;
      break;
    case "country":
      control = (
        <select {...common} defaultValue={str} className="control" autoComplete="country-name">
          <option value="">Choose a country</option>
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      );
      break;
    case "single_select":
      control =
        choices.length <= 4 ? (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
            {choices.map((c) => (
              <label key={c} className={pill}>
                <input type="radio" name={name} value={c} defaultChecked={str === c} disabled={disabled} className="h-4 w-4" />
                {c}
              </label>
            ))}
          </div>
        ) : (
          <select {...common} defaultValue={str} className="control">
            <option value="">Choose one</option>
            {choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        );
      break;
    case "multi_select":
      control = (
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`}>
          {choices.map((c) => (
            <label key={c} className={cn(pill, "py-1.5")}>
              <input type="checkbox" name={name} value={c} defaultChecked={list.includes(c)} disabled={disabled} className="h-4 w-4" />
              {c}
            </label>
          ))}
        </div>
      );
      break;
    case "checkboxes":
      control = (
        <div className="space-y-2" role="group" aria-labelledby={`${id}-label`}>
          {choices.map((c) => (
            <label key={c} className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground/85">
              <input type="checkbox" name={name} value={c} defaultChecked={list.includes(c)} disabled={disabled} className="mt-0.5 h-4 w-4 shrink-0" />
              {c}
            </label>
          ))}
        </div>
      );
      break;
    case "yes_no":
      control = (
        <div className="flex gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
          {["yes", "no"].map((c) => (
            <label key={c} className={cn(pill, "min-w-20 justify-center")}>
              <input type="radio" name={name} value={c} defaultChecked={str === c} disabled={disabled} className="h-4 w-4" />
              {c === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      );
      break;
    case "skills":
      control = <input {...common} defaultValue={str} placeholder="e.g. Python, numerical methods, LaTeX" className="control" />;
      break;
    case "file":
      control = (
        <div className="space-y-1.5">
          <FilePicker id={id} name={name} accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" label={field.label} hint={field.helpText ? "Click or drop a file here." : "PDF or Word, up to 10 MB. Click or drop a file."} invalid={Boolean(error)} disabled={disabled} />
          {fileNote ? <p className="text-xs text-muted-foreground">{fileNote}</p> : null}
        </div>
      );
      break;
    case "consent":
      control = (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-4 py-3 text-sm leading-relaxed text-foreground/85">
          <input type="checkbox" name={name} value="yes" defaultChecked={str === "yes" || str === "true"} disabled={disabled} className="mt-0.5 h-4 w-4 shrink-0" aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
          <span>
            {field.label}
            {field.required ? <span className="text-destructive"> *</span> : null}
          </span>
        </label>
      );
      break;
    default:
      control = <input {...common} defaultValue={str} readOnly={readOnly} className={cn("control", readOnly && "bg-foreground/[0.06]")} />;
  }

  return (
    <div className="min-w-0 space-y-1.5" id={`field-${field.id}`}>
      {field.type !== "consent" ? (
        <label id={`${id}-label`} htmlFor={["single_select", "multi_select", "checkboxes", "yes_no"].includes(field.type) && (field.type !== "single_select" || choices.length <= 4) ? undefined : id} className="block text-small font-normal text-foreground/85">
          {field.label}
          {req ? <span className="text-destructive"> *</span> : null}
        </label>
      ) : null}
      {field.helpText && field.type !== "consent" ? (
        <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">
          {field.helpText}
        </p>
      ) : null}
      {control}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
