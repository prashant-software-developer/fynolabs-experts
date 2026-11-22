import Link from "next/link";
import { cn } from "./cn";

export function Tabs({ tabs }: { tabs: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
            t.active ? "border-accent font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900",
          )}
        >
          {t.label}
          {t.count != null ? <span className="tabular rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
