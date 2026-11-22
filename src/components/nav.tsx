"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/experts", label: "Experts" },
  { href: "/requirements", label: "Requirements" },
  { href: "/submissions", label: "Submissions" },
  { href: "/placements", label: "Placements" },
  { href: "/partners", label: "Partners" },
  { href: "/import", label: "Import" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto" aria-label="Main">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              active ? "bg-accent-soft font-medium text-accent-ink" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
