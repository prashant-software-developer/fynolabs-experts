"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const TABS = [
  { href: "/me", label: "Profile" },
  { href: "/me/onboarding", label: "Complete profile" },
  { href: "/me/applications", label: "Applications" },
];

export function PortalTabs() {
  const path = usePathname();
  return (
    <nav className="flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Your account">
      {TABS.map((t) => {
        const active = t.href === "/me" ? path === "/me" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("eyebrow -mb-px inline-flex h-10 items-center border-b-2 whitespace-nowrap transition-colors", active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
