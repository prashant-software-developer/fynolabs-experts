"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { passwordStrength } from "@/lib/auth/password-policy";
import { cn } from "@/components/ui/cn";

/** A password box with a show / hide button and (for new passwords) a strength hint. */
export function PasswordInput({
  id,
  name,
  autoComplete,
  strength = false,
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  strength?: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [value, setValue] = useState("");
  const s = strength ? passwordStrength(value) : null;
  const tones = ["bg-danger", "bg-warning", "bg-primary", "bg-success"];
  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          suppressHydrationWarning
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="none"
          maxLength={200}
          className="control h-11 pr-11"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
        <button
          type="button"
          onClick={() => setShown((x) => !x)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
        >
          {shown ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {s && value ? (
        <div className="flex items-center gap-3" aria-live="polite">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn("h-1 flex-1", i <= s.score ? tones[s.score] : "bg-secondary")} />
            ))}
          </div>
          <span className="text-xs whitespace-nowrap text-muted-foreground">{s.label}</span>
        </div>
      ) : null}
    </div>
  );
}
