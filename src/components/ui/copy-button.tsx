"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "./button";

/** Copies `value` to the clipboard (links, invite links). Shows "Copied" for a moment. */
export function CopyButton({ value, label = "Copy", size = "sm", variant = "secondary" }: { value: string; label?: string; size?: "sm" | "md"; variant?: "primary" | "secondary" | "ghost" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass(variant, size)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          const t = document.createElement("textarea");
          t.value = value;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      aria-label={`${label}: ${value}`}
    >
      {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}
