"use client";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { bytes } from "@/lib/format";
import { cn } from "./cn";

/** A drop zone for a file inside a bigger form (no submit button of its own). */
export function FilePicker({ name, accept, label, hint, id, invalid, disabled }: { name: string; accept?: string; label: string; hint: string; id?: string; invalid?: boolean; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  return (
    <label
      htmlFor={id}
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
        "flex min-w-0 cursor-pointer items-center gap-3 rounded-md border border-dashed bg-background px-3 py-3 transition-colors hover:border-foreground/25 hover:bg-secondary/40 focus-within:border-ring",
        invalid ? "border-destructive" : "border-input",
        over && "border-primary bg-primary/[0.04]",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <input ref={input} id={id} type="file" name={name} accept={accept} disabled={disabled} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
        <Upload className="h-4 w-4 text-foreground/70" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{file ? file.name : label}</span>
        <span className="block truncate text-xs text-muted-foreground">{file ? `${bytes(file.size)} · ready` : hint}</span>
      </span>
      <span className="hidden shrink-0 text-[13px] font-medium text-primary sm:inline">{file ? "Change" : "Choose file"}</span>
    </label>
  );
}
