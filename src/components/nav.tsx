"use client";
// The admin frame, in Expert Hub's own design: a 240px sidebar (the FynoLabs mark with "Expert Hub",
// about ten modules, Settings and the public job board at the bottom), and a top bar with the module's
// name and its pages as tabs, search (Ctrl K) and your account (email and role; its menu has Settings,
// password, the job board, Refresh and Sign out). Below 1024px a menu button opens the same groups.
// Which items show is decided on the server (roles and per-section access) and passed in as NavAccess.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { RoleChip } from "@/components/ui/role-chip";
import { Spinner } from "@/components/ui/spinner";
import {
  BadgeCheck,
  Banknote,
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  FileSignature,
  FolderKanban,
  Globe,
  GraduationCap,
  Handshake,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Radar,
  RefreshCw,
  Search,
  Send,
  Settings,
  User,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui/cn";

/** `also`: other paths that belong to this item (Send referrals also covers the sent-referrals list). */
type NavLink = { href: string; label: string; icon: LucideIcon; also?: string[] };

/** One line about each page, shown in the search palette. */
const PAGE_HINTS: Record<string, string> = {
  "/admin": "Counts and trends, plus visitor sources",
  "/admin/settings": "Email replies, team and access",
  "/admin/settings/team": "Team and access",
  "/admin/messages": "Read and reply to contact messages",
  "/admin/accounts": "Accounts, the people at them and the outreach pipeline",
  "/admin/platforms": "Platforms, agencies and referral links",
  "/admin/experts": "Everyone who applied, their job pipelines, documents and timeline, plus groups",
  "/admin/campaigns/new": "Bulk emails to experts",
  "/admin/send-referrals": "Referral links to experts",
  "/admin/jobs": "Jobs on the site, applicants and CVs",
  "/admin/jobs/radar": "Scan, approve and publish platform roles",
  "/admin/my-work": "Your next steps, follow-ups and calls",
  "/admin/analytics": "Visitors, sources and page views",
  "/admin/applications": "New applications waiting for review",
  "/admin/leads": "The people at each account and their follow-ups",
  "/admin/calendar": "Calls, meetings, follow-ups and deadlines",
  "/admin/projects": "Live projects, their experts and documents",
  "/admin/campaigns": "Sent emails and how they did",
  "/admin/import": "Add experts from a CSV file",
  "/admin/requirements": "What partners asked for",
  "/admin/submissions": "Experts put forward to partners",
  "/admin/placements": "Experts placed on partner work",
  "/admin/fees": "Fees owed and paid for referrals",
  "/admin/documents": "Agreements experts sign in their portal: templates, sent and signed",
  "/admin/learn": "Courses, booklets and quizzes on the expert portal",
  "/admin/payouts": "What we pay experts, per project: upcoming, processing, paid",
};

/** What the signed-in person may open (decided on the server, passed down). */
export type NavAccess = {
  import: boolean;
  team: boolean;
  /** Referral fees (money). */
  money?: boolean;
  /** Admin settings (Settings → Email replies). */
  settings?: boolean;
  /** Per-section access (src/lib/auth/sections.ts): a section left out or true is shown. */
  open?: Partial<Record<string, boolean>>;
};

export type NavUser = { name: string; email: string; role: string };

/** Shown unless the person's sections leave it out. */
const can = (access: NavAccess, section: string) => access.open?.[section] !== false;

/** Settings tabs: Email replies (admins) and Team & access (whoever manages the team). */
function settingsLinks(access: NavAccess): NavLink[] {
  return [
    ...(access.settings && can(access, "settings") ? [{ href: "/admin/settings", label: "General", icon: Settings }] : []),
    ...(access.team ? [{ href: "/admin/settings/team", label: "Team & access", icon: Users }] : []),
  ];
}

/**
 * GHL-style modules (27 Nov 2026, Prashant): about ten modules on the left, each one icon and a name;
 * a module's pages are tabs along the top of the page (ModuleTabs), so new pages never grow the sidebar.
 * The sidebar link opens the module's first page the person may see.
 */
type Module = { label: string; icon: LucideIcon; links: NavLink[]; bottom?: boolean };

function groupsFor(access: NavAccess): Module[] {
  const modules: Module[] = [
    {
      label: "Home",
      icon: LayoutDashboard,
      links: [...(can(access, "dashboard") ? [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }] : []), { href: "/admin/my-work", label: "My work", icon: ListChecks }],
    },
    {
      label: "Inbox",
      icon: Inbox,
      links: [
        ...(can(access, "messages") ? [{ href: "/admin/messages", label: "Messages", icon: Mail }] : []),
        ...(can(access, "profiles") ? [{ href: "/admin/applications", label: "Applications", icon: Inbox }] : []),
      ],
    },
    { label: "Calendar", icon: CalendarDays, links: can(access, "calendar") ? [{ href: "/admin/calendar", label: "Calendar", icon: CalendarDays }] : [] },
    {
      label: "Partners",
      icon: Building2,
      links: [
        ...(can(access, "accounts") ? [{ href: "/admin/accounts", label: "Accounts", icon: Building2 }] : []),
        ...(can(access, "leads") ? [{ href: "/admin/leads", label: "Leads", icon: Handshake }] : []),
        ...(can(access, "platforms") ? [{ href: "/admin/platforms", label: "Platforms", icon: Globe }] : []),
      ],
    },
    {
      label: "Experts",
      icon: Users,
      links: can(access, "profiles")
        ? [
            { href: "/admin/experts", label: "All experts", icon: Users },
            { href: "/admin/groups", label: "Groups", icon: FolderKanban },
            ...(access.import ? [{ href: "/admin/import", label: "Import", icon: UserPlus }] : []),
          ]
        : [],
    },
    {
      // Called "Expert portal" for someone who may open Documents or Learn but not Projects.
      label: can(access, "projects") ? "Projects" : "Expert portal",
      icon: FolderKanban,
      links: [
        ...(can(access, "projects") ? [{ href: "/admin/projects", label: "Projects", icon: FolderKanban }] : []),
        ...(can(access, "profiles") ? [{ href: "/admin/documents", label: "Documents", icon: FileSignature }] : []),
        ...(access.settings && can(access, "settings") ? [{ href: "/admin/learn", label: "Learn", icon: GraduationCap }] : []),
      ],
    },
    {
      label: "Jobs",
      icon: Briefcase,
      links: [
        ...(can(access, "posted-jobs") ? [{ href: "/admin/jobs", label: "Posted jobs", icon: Briefcase }] : []),
        { href: "/admin/requirements", label: "Requirements", icon: ClipboardList },
        { href: "/admin/submissions", label: "Submissions", icon: FileCheck2 },
        { href: "/admin/placements", label: "Placements", icon: BadgeCheck },
        ...(can(access, "job-radar") ? [{ href: "/admin/jobs/radar", label: "Job radar", icon: Radar }] : []),
      ],
    },
    {
      label: "Outreach",
      icon: Megaphone,
      links: [
        ...(can(access, "referrals") ? [{ href: "/admin/campaigns", label: "Campaigns", icon: Megaphone }] : []),
        ...(can(access, "referrals") ? [{ href: "/admin/campaigns/new", label: "Send emails", icon: Send }] : []),
        ...(can(access, "send-referrals") ? [{ href: "/admin/send-referrals", label: "Send referrals", icon: UserPlus, also: ["/admin/referrals"] }] : []),
      ],
    },
    {
      label: "Payments",
      icon: Banknote,
      links:
        access.money && can(access, "fees")
          ? [
              { href: "/admin/payouts", label: "Expert payouts", icon: Banknote },
              { href: "/admin/fees", label: "Referral fees", icon: Wallet },
            ]
          : [],
    },
    { label: "Reporting", icon: BarChart3, links: can(access, "analytics") ? [{ href: "/admin/analytics", label: "Analytics", icon: BarChart3 }] : [] },
    { label: "Settings", icon: Settings, links: settingsLinks(access), bottom: true },
  ];
  return modules.filter((g) => g.links.length);
}

const matches = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));

/** The page a path belongs to, and its module: the most specific match (Job radar wins over Posted jobs on /admin/jobs/radar). */
function current(path: string, access: NavAccess): { group: string; module: Module; link: NavLink } | null {
  // /admin/partners redirects to Accounts.
  const p = path === "/admin/partners" || path.startsWith("/admin/partners/") ? path.replace("/admin/partners", "/admin/accounts") : path;
  let best: { group: string; module: Module; link: NavLink } | null = null;
  let len = -1;
  for (const g of groupsFor(access))
    for (const l of g.links)
      for (const h of [l.href, ...(l.also ?? [])])
        if (matches(p, h) && h.length > len) {
          best = { group: g.label, module: g, link: l };
          len = h.length;
        }
  return best;
}

function ModuleLink({ m, on, onNavigate }: { m: Module; on: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={m.links[0].href}
      onClick={onNavigate}
      aria-current={on ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
        on ? "bg-sidebar-accent font-medium text-foreground before:absolute before:inset-y-2 before:-left-3 before:w-0.5 before:rounded-full before:bg-primary" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <m.icon className={cn("h-4 w-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
      {m.label}
    </Link>
  );
}

function NavGroups({ path, access, onNavigate }: { path: string; access: NavAccess; onNavigate?: () => void }) {
  const active = current(path, access)?.group;
  const modules = groupsFor(access);
  return (
    <ul className="space-y-0.5">
      {modules
        .filter((m) => !m.bottom)
        .map((m) => (
          <li key={m.label}>
            <ModuleLink m={m} on={active === m.label} onNavigate={onNavigate} />
          </li>
        ))}
    </ul>
  );
}

function BottomModules({ path, access, onNavigate }: { path: string; access: NavAccess; onNavigate?: () => void }) {
  const active = current(path, access)?.group;
  return (
    <>
      {groupsFor(access)
        .filter((m) => m.bottom)
        .map((m) => (
          <ModuleLink key={m.label} m={m} on={active === m.label} onNavigate={onNavigate} />
        ))}
    </>
  );
}

/** The top bar's left side: the module's name, then its pages as tabs (one-page modules show only the name). */
export function ModuleTabs({ access }: { access: NavAccess }) {
  const path = usePathname();
  const hit = current(path, access);
  if (!hit) return null;
  const { module: m, link } = hit;
  return (
    <div className="flex h-14 min-w-0 items-stretch gap-6">
      <span className="flex shrink-0 items-center text-[15px] font-medium text-foreground">{m.label}</span>
      {m.links.length > 1 ? (
        <nav aria-label={`${m.label} pages`} className="-mb-px flex min-w-0 items-stretch gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {m.links.map((l) => {
            const on = l.href === link.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex shrink-0 items-center border-b-2 text-sm whitespace-nowrap transition-colors", on ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

/** The FynoLabs mark, wordmark and the app's name. */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 text-foreground">
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
  // On a short window the list scrolls: keep the current page in view.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [path]);
  return (
    // The outer column carries the background and line to the bottom of long pages; the inner one stays in view.
    <div className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
      <aside className="sticky top-0 flex h-screen flex-col">
        <div className="flex h-14 items-center px-6">
          <Brand />
        </div>
        <nav ref={navRef} className="flex-1 overflow-y-auto px-3 pt-4 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Main">
          <NavGroups path={path} access={access} />
        </nav>
        <div className="space-y-0.5 border-t border-sidebar-border px-3 py-3">
          <BottomModules path={path} access={access} />
          <a href="/" target="_blank" rel="noreferrer" className="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-foreground">
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            Public job board
          </a>
        </div>
      </aside>
    </div>
  );
}

/** Where you are, for the top bar: Group / Page. */
export function CurrentSection({ access }: { access: NavAccess }) {
  const path = usePathname();
  const hit = current(path, access);
  if (!hit) return null;
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <span className="hidden sm:inline">{hit.group}</span>
      <span className="hidden text-border sm:inline">/</span>
      <span className="truncate text-foreground">{hit.link.label}</span>
    </span>
  );
}

/* ---------- Search (Ctrl K) ---------- */

type Hit = { id: string; title: string; hint: string | null; href: string };
type Results = { experts: Hit[]; accounts: Hit[]; leads: Hit[]; jobs: Hit[]; platforms: Hit[]; messages: Hit[] };
const RESULT_GROUPS: { key: keyof Results; label: string; icon: LucideIcon }[] = [
  { key: "experts", label: "Experts", icon: User },
  { key: "accounts", label: "Accounts", icon: Building2 },
  { key: "leads", label: "Leads", icon: Handshake },
  { key: "jobs", label: "Posted jobs", icon: Briefcase },
  { key: "platforms", label: "Platforms", icon: Globe },
  { key: "messages", label: "Messages", icon: Mail },
];
const EMPTY: Results = { experts: [], accounts: [], leads: [], jobs: [], platforms: [], messages: [] };
const OPEN_EVENT = "hub:open-search";
export const openSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

/** The search field in the top bar: opens the palette (so does Ctrl K / ⌘K anywhere in the admin). */
export function SearchButton() {
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label="Search (Ctrl K)"
      className="inline-flex h-9 items-center gap-2 rounded-lg border-input text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-md:w-9 max-md:justify-center md:w-64 md:border md:bg-canvas md:px-3 md:hover:border-foreground/25 md:hover:bg-background"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden flex-1 text-left md:inline">Search…</span>
      <kbd className="hidden rounded border border-border bg-secondary px-1.5 text-[11px] leading-5 text-muted-foreground md:inline">Ctrl K</kbd>
    </button>
  );
}

/**
 * Ctrl+K (⌘K on a Mac) on any admin page: one search across experts, accounts, leads, jobs, platforms,
 * messages and the admin pages. Only what this person can open is searched. Arrow keys move, Enter opens.
 */
export function CommandPalette({ access }: { access: NavAccess }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pages = useMemo(
    () => groupsFor(access).flatMap((g) => g.links.map((l) => ({ id: l.href, title: g.links.length > 1 ? `${g.label}: ${l.label}` : l.label, hint: PAGE_HINTS[l.href] ?? null, href: l.href, icon: l.icon }))),
    [access],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);
  // Fresh each time it opens; the page behind doesn't scroll while it is open.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setRes(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    const ctl = new AbortController();
    const t = setTimeout(
      () => {
        fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
          .then((r) => (r.ok ? (r.json() as Promise<Results>) : EMPTY))
          .then((j) => setRes({ ...EMPTY, ...j }))
          .catch((e: unknown) => {
            if (!(e instanceof DOMException && e.name === "AbortError")) setRes((r) => r ?? EMPTY);
          });
      },
      term ? 150 : 0,
    );
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open]);

  const term = q.trim();
  const needles = term.toLowerCase().split(/\s+/).filter(Boolean);
  const pageHits = pages.filter((p) => needles.every((n) => `page ${p.title} ${p.hint ?? ""}`.toLowerCase().includes(n)));
  // Until something is typed, a few pages and a few of each; once typing, everything that matches.
  const sections: { key: string; label: string; hits: (Hit & { icon: LucideIcon })[] }[] = res
    ? [
        { key: "pages", label: "Pages", hits: term ? pageHits : pageHits.slice(0, 5) },
        ...RESULT_GROUPS.map((g) => ({ key: g.key as string, label: g.label, hits: res[g.key].map((h) => ({ ...h, icon: g.icon })) })),
      ].filter((s) => s.hits.length)
    : [];
  const flat = sections.flatMap((s) => s.hits.map((h) => ({ ...h, key: `${s.key}-${h.id}` })));
  const count = flat.length;
  useEffect(() => setCursor(0), [q, res]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  if (!open) return null;
  let index = -1;
  return createPortal(
    <div className="admin-ui fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Search">
      <div className="animate-fade absolute inset-0 bg-foreground/15 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="animate-pop absolute top-[12vh] left-1/2 flex max-h-[70vh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)]">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => (count ? (c + 1) % count : 0));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => (count ? (c - 1 + count) % count : 0));
              } else if (e.key === "Home") {
                e.preventDefault();
                setCursor(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setCursor(Math.max(count - 1, 0));
              } else if (e.key === "Enter" && flat[cursor]) {
                e.preventDefault();
                go(flat[cursor].href);
              } else if (e.key === "Tab") e.preventDefault();
            }}
            placeholder="Search experts, accounts, leads, jobs, platforms, messages…"
            aria-label="Search experts, accounts, leads, jobs, platforms and messages"
            role="combobox"
            aria-expanded="true"
            aria-controls="admin-search-list"
            aria-activedescendant={flat[cursor] ? `admin-search-${flat[cursor].key}` : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-secondary px-1.5 text-[11px] leading-5 text-muted-foreground sm:block">Esc</kbd>
        </div>
        <div ref={list} id="admin-search-list" role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
          {!res ? (
            <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-muted-foreground" role="status">
              <Spinner className="h-4 w-4 text-primary" /> Searching…
            </p>
          ) : !count ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">Nothing matches “{q}”.</p>
          ) : (
            sections.map((s) => (
              <div key={s.key} role="group" aria-label={s.label} className="pb-1">
                <p aria-hidden="true" className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                  {s.label}
                </p>
                {s.hits.map((h) => {
                  index += 1;
                  const i = index;
                  const key = `${s.key}-${h.id}`;
                  return (
                    <div
                      key={key}
                      id={`admin-search-${key}`}
                      role="option"
                      aria-selected={i === cursor}
                      data-selected={i === cursor}
                      onPointerMove={() => i !== cursor && setCursor(i)}
                      onClick={() => go(h.href)}
                      className="mx-2 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 data-[selected=true]:bg-accent"
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground/70" aria-hidden="true">
                        <h.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{h.title}</span>
                        {h.hint ? <span className="block truncate text-xs text-muted-foreground">{h.hint}</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Account menu (top bar) ---------- */

const menuItem =
  "flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm text-foreground/85 outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50";
const menuIcon = "h-4 w-4 shrink-0 text-muted-foreground";

/**
 * Your email and role in the top bar. Opens a small menu: Settings (when you may), Change password,
 * Public job board, Refresh, Sign out. Arrow keys move through it; Escape closes it.
 */
export function AccountMenu({ user, access, signOut }: { user: NavUser; access: NavAccess; signOut: () => Promise<void> }) {
  const settingsHref = settingsLinks(access)[0]?.href;
  const [open, setOpen] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector<HTMLElement>("button[aria-haspopup]")?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
      if (!items.length) return;
      e.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? Math.min(at + 1, items.length - 1) : Math.max(at - 1, 0);
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account: ${user.email} (${user.role})`}
        className={cn(
          "inline-flex h-10 items-center gap-2.5 rounded-lg pr-2 pl-1.5 text-[13px] text-foreground/80 transition-colors hover:bg-foreground/[0.04] hover:text-foreground",
          open && "bg-foreground/[0.04] text-foreground",
        )}
      >
        <Avatar name={user.name || user.email} size="md" />
        <span className="hidden max-w-[16rem] truncate md:inline">{user.email}</span>
        <RoleChip role={user.role} />
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div ref={menu} role="menu" aria-label="Account" className="animate-pop absolute top-full right-0 z-50 mt-1.5 w-64 origin-top-right rounded-md border border-border bg-popover p-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]">
          <div className="flex items-start gap-3 px-2.5 py-2.5">
            <Avatar name={user.name || user.email} size="lg" />
            <div className="min-w-0 space-y-1.5">
              <div>
                <p className="truncate text-sm text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <RoleChip role={user.role} />
            </div>
          </div>
          <div role="separator" className="-mx-1 my-1 h-px bg-border" />
          {settingsHref ? (
            <Link href={settingsHref} role="menuitem" className={menuItem}>
              <Settings className={menuIcon} aria-hidden /> Settings
            </Link>
          ) : null}
          <Link href="/account/password" role="menuitem" className={menuItem}>
            <KeyRound className={menuIcon} aria-hidden /> Change password
          </Link>
          <a href="/" target="_blank" rel="noreferrer" role="menuitem" onClick={() => setOpen(false)} className={menuItem}>
            <ExternalLink className={menuIcon} aria-hidden /> Public job board
          </a>
          <button
            type="button"
            role="menuitem"
            disabled={refreshing}
            onClick={() => {
              setOpen(false);
              startRefresh(() => router.refresh());
            }}
            className={menuItem}
          >
            <RefreshCw className={cn(menuIcon, refreshing && "animate-spin")} aria-hidden /> {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <div role="separator" className="-mx-1 my-1 h-px bg-border" />
          <form action={signOut}>
            <button type="submit" role="menuitem" className={menuItem}>
              <LogOut className={menuIcon} aria-hidden /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Phones and tablets ---------- */

/** Below 1024px: a menu button in the top bar opens the same groups in a panel. */
export function MobileNav({ access }: { access: NavAccess }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
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
            <div className="admin-ui fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <button type="button" className="animate-fade absolute inset-0 bg-foreground/15 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setOpen(false)} />
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
                <div className="space-y-0.5 border-t border-sidebar-border px-3 py-3">
                  <BottomModules path={path} access={access} onNavigate={() => setOpen(false)} />
                  <a href="/" target="_blank" rel="noreferrer" className="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground">
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    Public job board
                  </a>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
