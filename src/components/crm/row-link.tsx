import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * The record's name, as a link that covers its whole table row (the row is the click target, as on
 * the FynoLabs admin). Put `relative` on the row; other links in the row need `relative z-10`.
 */
export function RowLink({ href, children, className, title }: { href: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <Link href={href} scroll={false} title={title} className={cn("font-normal text-foreground after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring", className)}>
      {children}
    </Link>
  );
}
