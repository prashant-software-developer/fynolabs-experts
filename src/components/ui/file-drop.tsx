"use client";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { bytes } from "@/lib/format";
import { buttonClass } from "./button";
import { SubmitButton } from "./client";
import { cn } from "./cn";

/**
 * A drop zone instead of the browser's "Choose File" control: click or drop a file, see its name,
 * then send it. Lives inside a <form action={...}>; the input is named `name`.
 */
export function FileDrop({ name, accept, label, hint, submitLabel, pendingText = "Uploading..." }: { name: string; accept?: string; label: string; hint: string; submitLabel: string; pendingText?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (!f || !input.current) return;
          const dt = new DataTransfer();
          dt.items.add(f);
          input.current.files = dt.files;
          setFile(f);
        }}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md border border-dashed border-input bg-background px-3 py-2.5 transition-colors hover:border-foreground/25 hover:bg-secondary/40 focus-within:border-ring",
          over && "border-primary bg-primary/[0.04]",
        )}
      >
        <input ref={input} type="file" name={name} accept={accept} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
          <Upload className="h-4 w-4 text-foreground/70" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{file ? file.name : label}</span>
          <span className="block truncate text-xs text-muted-foreground">{file ? `${bytes(file.size)} · ready to upload` : hint}</span>
        </span>
        <span className={buttonClass("ghost", "sm", "hidden sm:inline-flex")}>{file ? "Change" : "Choose file"}</span>
      </label>
      <SubmitButton size="sm" variant={file ? "primary" : "secondary"} disabled={!file} pendingText={pendingText}>
        {submitLabel}
      </SubmitButton>
    </div>
  );
}
