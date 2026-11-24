import Link from "next/link";
import { cn } from "./cn";

/** Link tabs under the page header (FynoLabs AdminTabs): uppercase labels with counts, the open one underlined, a line below. */
export function Tabs({ tabs }: { tabs: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <nav className="tabs-line mb-8 flex gap-x-5 overflow-x-auto border-b border-border pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "eyebrow tabular inline-flex h-10 shrink-0 items-center whitespace-nowrap underline-offset-8 transition-colors",
            t.active ? "text-foreground underline" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count != null ? ` (${t.count})` : ""}
        </Link>
      ))}
    </nav>
  );
}
