"use client";
// A company or platform logo: the saved logo, else the site's icon, else the first letter.
import { useState } from "react";
import { cn } from "@/components/ui/cn";

export function OrgLogo({ name, logoUrl, domain, size = 28, className }: { name: string; logoUrl?: string | null; domain?: string | null; size?: number; className?: string }) {
  // Reserved example domains (fixtures) have no icon: skip the lookup.
  const lookup = domain && !/(^|\.)example\.(com|org|net)$/i.test(domain) ? domain : null;
  const sources = [logoUrl, lookup ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(lookup)}&sz=64` : null].filter((s): s is string => Boolean(s));
  const [i, setI] = useState(0);
  const src = sources[i];
  const box = cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background", className);
  if (!src) {
    return (
      <span className={cn(box, "text-[11px] font-medium text-muted-foreground")} style={{ width: size, height: size }} aria-hidden>
        {(name.trim()[0] ?? "?").toUpperCase()}
      </span>
    );
  }
  return (
    <span className={box} style={{ width: size, height: size }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size - 6}
        height={size - 6}
        className="h-[calc(100%-6px)] w-[calc(100%-6px)] object-contain"
        onError={() => setI((n) => n + 1)}
        onLoad={(e) => {
          // A 16px answer from the icon service is its "no icon" globe: try the next one.
          if (e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth <= 16 && !src.startsWith("data:") && src !== logoUrl) setI((n) => n + 1);
        }}
        referrerPolicy="no-referrer"
      />
    </span>
  );
}
