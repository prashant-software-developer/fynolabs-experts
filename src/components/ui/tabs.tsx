import Link from "next/link";
import { cn } from "./cn";

/** Link tabs under the page header: letter-spaced labels, a dark line under the open one (website AdminTabs). */
export function Tabs({ tabs }: { tabs: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <nav className="mb-6 flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "eyebrow -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors",
            t.active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count != null ? <span className="tabular text-muted-foreground">({t.count})</span> : null}
        </Link>
      ))}
    </nav>
  );
}
