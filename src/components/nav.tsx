"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Briefcase, Building2, ClipboardList, LayoutDashboard, Menu, Send, ShieldCheck, Upload, Users, X, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";

type NavLink = { href: string; label: string; icon: LucideIcon };

/** What the signed-in role may open (decided on the server, passed down). */
export type NavAccess = { import: boolean; team: boolean };

// Grouped like the website admin's sidebar: what the work is about, not where the data lives.
function groupsFor(access: NavAccess): { label: string; links: NavLink[] }[] {
  const groups: { label: string; links: NavLink[] }[] = [
    { label: "Workspace", links: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
    {
      label: "Talent",
      links: [{ href: "/experts", label: "Experts", icon: Users }, ...(access.import ? [{ href: "/import", label: "Import", icon: Upload }] : [])],
    },
    {
      label: "Delivery",
      links: [
        { href: "/requirements", label: "Requirements", icon: ClipboardList },
        { href: "/submissions", label: "Submissions", icon: Send },
        { href: "/placements", label: "Placements", icon: Briefcase },
        { href: "/partners", label: "Partners", icon: Building2 },
      ],
    },
  ];
  if (access.team) groups.push({ label: "Settings", links: [{ href: "/settings/team", label: "Team & access", icon: ShieldCheck }] });
  return groups;
}

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

function NavGroups({ path, access, onNavigate }: { path: string; access: NavAccess; onNavigate?: () => void }) {
  return (
    <>
      {groupsFor(access).map((group) => (
        <div key={group.label} className="mt-6 first:mt-0">
          <p className="eyebrow px-3 pb-1.5 text-muted-foreground">{group.label}</p>
          <ul className="space-y-0.5">
            {group.links.map((l) => {
              const active = isActive(path, l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-3 rounded-r-md border-l-2 pr-3 pl-2.5 text-sm transition-colors",
                      active
                        ? "border-foreground bg-sidebar-accent font-medium text-foreground"
                        : "border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-foreground",
                    )}
                  >
                    <l.icon className={cn("h-4 w-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} aria-hidden />
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

/** The FynoLabs mark, wordmark and the app's name. */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-foreground">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/fynolabs-mark.svg" alt="" width={24} height={24} className={compact ? "h-6 w-6" : "h-7 w-7"} />
      <span className="flex flex-col gap-0.5 whitespace-nowrap">
        <span className={cn("leading-none", compact ? "text-[15px]" : "text-base")}>FynoLabs</span>
        <span className="text-[0.625rem] leading-none tracking-[0.12em] text-primary uppercase">Expert Hub</span>
      </span>
    </Link>
  );
}

/** Desktop sidebar (from 1024px): brand, then each group under its label. Stays in view while the page scrolls. */
export function Sidebar({ access }: { access: NavAccess }) {
  const path = usePathname();
  return (
    // The outer column carries the background and line to the bottom of long pages; the inner one stays in view.
    <div className="hidden w-56 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
      <aside className="sticky top-0 flex h-screen flex-col">
        <div className="flex h-14 items-center px-5">
          <Brand />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pt-5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Main">
          <NavGroups path={path} access={access} />
        </nav>
      </aside>
    </div>
  );
}

/** The current section's name, for the top bar. */
export function CurrentSection({ access }: { access: NavAccess }) {
  const path = usePathname();
  for (const g of groupsFor(access)) {
    const hit = g.links.find((l) => isActive(path, l.href));
    if (hit) {
      return (
        <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{g.label}</span>
          <span className="hidden text-border sm:inline">/</span>
          <span className="truncate text-foreground">{hit.label}</span>
        </span>
      );
    }
  }
  return null;
}

/** Phones and tablets (below 1024px): a menu button in the top bar opens the same groups in a panel. */
export function MobileNav({ access }: { access: NavAccess }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-accent lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      {/* Portalled to <body>: the top bar's backdrop blur would otherwise trap a fixed panel inside the bar. */}
      {open
        ? createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[86%] flex-col border-r border-sidebar-border bg-sidebar shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex h-14 items-center justify-between px-5">
              <Brand compact />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="-mr-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 pt-3 pb-6" aria-label="Main">
              <NavGroups path={path} access={access} onNavigate={() => setOpen(false)} />
            </nav>
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
