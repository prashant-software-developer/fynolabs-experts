"use client";
// The admin frame, as the FynoLabs admin's (AdminNavigation.tsx, AdminProfileMenu.tsx, GlobalSearch.tsx):
// a 282px sidebar with the mark, a Search button (Ctrl K opens the command palette), the groups, and
// the account bar at the bottom (its menu: Refresh, Settings, password, theme, Sign out). Below 1024px a
// slim sticky bar opens the same groups in a frosted panel. No counts in the items. Classes, sizes and
// spacing are copied from those files, so both admins look the same in light and dark.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FolderKanban,
  Globe,
  Handshake,
  ChevronsUpDown,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Moon,
  Radar,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sun,
  Upload,
  User,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui/cn";
import { setAdminTheme, useAdminTheme } from "@/components/admin/kit-client";

/** `also`: other paths that belong to this item (Send referrals also covers the sent-referrals list). */
type NavLink = { href: string; label: string; icon: LucideIcon; also?: string[] };

/** One line about each page, shown in the command palette (the FynoLabs admin's MODULES hints; short ones for hub-only pages). */
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
};
/** The palette lists pages in the FynoLabs admin's order first, then the hub's own. */
const PAGE_ORDER = ["/admin", "/admin/settings", "/admin/settings/team", "/admin/messages", "/admin/accounts", "/admin/platforms", "/admin/experts", "/admin/campaigns/new", "/admin/send-referrals", "/admin/jobs", "/admin/jobs/radar"];

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

// Grouped as the FynoLabs admin: Dashboard, My work, Analytics without a label; Inbox (what came in);
// Outreach (companies, their people, the calendar, platforms); Talent (projects, experts and what we
// send them); Jobs (roles we post or pick up, then the hub's partner requests); Money. Settings sits at the bottom.
function groupsFor(access: NavAccess): { label: string; links: NavLink[] }[] {
  const groups: { label: string; links: NavLink[] }[] = [
    {
      label: "",
      links: [
        ...(can(access, "dashboard") ? [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }] : []),
        { href: "/admin/my-work", label: "My work", icon: ListChecks },
        ...(can(access, "analytics") ? [{ href: "/admin/analytics", label: "Analytics", icon: BarChart3 }] : []),
      ],
    },
    {
      label: "Inbox",
      links: [
        ...(can(access, "messages") ? [{ href: "/admin/messages", label: "Messages", icon: Mail }] : []),
        ...(can(access, "profiles") ? [{ href: "/admin/applications", label: "Applications", icon: Inbox }] : []),
      ],
    },
    {
      label: "Outreach",
      links: [
        ...(can(access, "accounts") ? [{ href: "/admin/accounts", label: "Accounts", icon: Building2 }] : []),
        ...(can(access, "leads") ? [{ href: "/admin/leads", label: "Leads", icon: Handshake }] : []),
        ...(can(access, "calendar") ? [{ href: "/admin/calendar", label: "Calendar", icon: CalendarDays }] : []),
        ...(can(access, "platforms") ? [{ href: "/admin/platforms", label: "Platforms", icon: Globe }] : []),
      ],
    },
    {
      label: "Talent",
      links: [
        ...(can(access, "projects") ? [{ href: "/admin/projects", label: "Projects", icon: FolderKanban }] : []),
        // Groups live with Experts (the Profiles | Groups switch), as in the FynoLabs admin.
        ...(can(access, "profiles") ? [{ href: "/admin/experts", label: "Experts", icon: Users, also: ["/admin/groups"] }] : []),
        ...(can(access, "referrals") ? [{ href: "/admin/campaigns/new", label: "Send emails", icon: Send }] : []),
        ...(can(access, "referrals") ? [{ href: "/admin/campaigns", label: "Campaigns", icon: Megaphone }] : []),
        ...(can(access, "send-referrals") ? [{ href: "/admin/send-referrals", label: "Send referrals", icon: UserPlus, also: ["/admin/referrals"] }] : []),
        ...(access.import ? [{ href: "/admin/import", label: "Import", icon: Upload }] : []),
      ],
    },
    {
      label: "Jobs",
      links: [
        ...(can(access, "posted-jobs") ? [{ href: "/admin/jobs", label: "Posted jobs", icon: Briefcase }] : []),
        ...(can(access, "job-radar") ? [{ href: "/admin/jobs/radar", label: "Job radar", icon: Radar }] : []),
        { href: "/admin/requirements", label: "Requirements", icon: ClipboardList },
        { href: "/admin/submissions", label: "Submissions", icon: Send },
        { href: "/admin/placements", label: "Placements", icon: Briefcase },
      ],
    },
    { label: "Money", links: access.money && can(access, "fees") ? [{ href: "/admin/fees", label: "Referral fees", icon: Wallet }] : [] },
  ];
  return groups.filter((g) => g.links.length);
}

/** The bottom item: Settings (Email replies) or, for those who only manage the team, Team & access. */
function settingsLink(access: NavAccess): NavLink | null {
  if (access.settings && can(access, "settings")) return { href: "/admin/settings", label: "Settings", icon: Settings, also: ["/admin/settings/team"] };
  if (access.team) return { href: "/admin/settings/team", label: "Settings", icon: Settings };
  return null;
}

const matches = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));

/** The one item a path belongs to: the most specific match (Job radar wins over Posted jobs on /admin/jobs/radar). */
function activeHref(path: string, access: NavAccess): string | null {
  // /admin/partners redirects to Accounts.
  const p = path === "/admin/partners" || path.startsWith("/admin/partners/") ? path.replace("/admin/partners", "/admin/accounts") : path;
  const all = [...groupsFor(access).flatMap((g) => g.links), ...[settingsLink(access)].filter((l): l is NavLink => Boolean(l))];
  let best: string | null = null;
  let len = -1;
  for (const l of all)
    for (const h of [l.href, ...(l.also ?? [])])
      if (matches(p, h) && h.length > len) {
        best = l.href;
        len = h.length;
      }
  return best;
}

function currentLink(path: string, access: NavAccess): NavLink | null {
  const href = activeHref(path, access);
  const all = [...groupsFor(access).flatMap((g) => g.links), settingsLink(access)].filter((l): l is NavLink => Boolean(l));
  return all.find((l) => l.href === href) ?? null;
}

const rowClass = (active: boolean) =>
  cn(
    "admin-hover flex h-11 w-full items-center gap-3 border-l-2 pr-3 pl-2.5 text-left text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
    active ? "border-foreground bg-foreground/[0.06] text-foreground" : "border-transparent text-foreground/75 hover:text-foreground",
  );

function NavItem({ link, active, onNavigate }: { link: NavLink; active: boolean; onNavigate?: () => void }) {
  return (
    <Link href={link.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={rowClass(active)}>
      <link.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-foreground" : "text-muted-foreground")} aria-hidden />
      {link.label}
    </Link>
  );
}

function NavGroups({ path, access, onNavigate, compact }: { path: string; access: NavAccess; onNavigate?: () => void; compact?: boolean }) {
  const active = activeHref(path, access);
  return (
    <>
      {groupsFor(access).map((group) => (
        <div key={group.label || "top"} className={cn("flex flex-col gap-1 first:mt-0", compact ? "mt-3" : "mt-6")}>
          {group.label ? <p className="px-3 pb-1 text-eyebrow tracking-widest text-muted-foreground uppercase">{group.label}</p> : null}
          {group.links.map((l) => (
            <NavItem key={l.href} link={l} active={active === l.href} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </>
  );
}

/** The FynoLabs mark: two mirrored halves of bars facing each other across a thin gap. */
export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  const bars = [
    { y: 6, half: 14 },
    { y: 16, half: 22 },
    { y: 26, half: 27 },
    { y: 36, half: 29 },
    { y: 46, half: 27 },
    { y: 56, half: 22 },
    { y: 66, half: 14 },
  ];
  return (
    <svg viewBox="0 0 72 72" className={className} aria-hidden="true" focusable="false">
      <g fill="currentColor">
        {bars.map(({ y, half }) => (
          <g key={y}>
            <rect x={36 - 3 - half} y={y} width={half} height={6} />
            <rect x={36 + 3} y={y} width={half} height={6} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** The mark and wordmark: 24px and body-lg in the sidebar, 20px and body in the phone panel. */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/admin" className={cn("flex items-center text-foreground", compact ? "gap-2.5" : "gap-3")}>
      <LogoMark className={compact ? "h-5 w-5" : "h-6 w-6"} />
      <span className={compact ? "text-body" : "text-body-lg"}>FynoLabs</span>
    </Link>
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
const OPEN_EVENT = "fyno:open-search";
export const openSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

/** While the first results load: the mark with short status lines underneath (the FynoLabs AdminLoader). */
function PaletteLoader() {
  const steps = ["Okay, fetching everything…", "Okay, checking access…", "Okay, preparing everything…", "Okay, everything active."];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % steps.length), 900);
    return () => window.clearInterval(id);
  }, [steps.length]);
  return (
    <div className="flex min-h-[320px] w-full flex-col items-center justify-center gap-5 py-16 text-center" role="status" aria-live="polite">
      <LogoMark className="h-10 w-10 animate-[pulse_1.6s_ease-in-out_infinite] text-foreground" />
      <p key={step} className="animate-fade-in text-small text-muted-foreground">
        {steps[step]}
      </p>
    </div>
  );
}

/**
 * Ctrl+K (⌘K on a Mac) on any admin page: one search across experts, accounts, leads, jobs, platforms,
 * messages and the admin pages. Only what this person can open is searched. Enter opens the result.
 */
export function CommandPalette({ access }: { access: NavAccess }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pages = useMemo(() => {
    const all = [...groupsFor(access).flatMap((g) => g.links), settingsLink(access)].filter((l): l is NavLink => Boolean(l));
    const rank = (href: string) => (PAGE_ORDER.includes(href) ? PAGE_ORDER.indexOf(href) : PAGE_ORDER.length);
    return all.map((l, i) => ({ l, i })).sort((a, b) => rank(a.l.href) - rank(b.l.href) || a.i - b.i).map(({ l }) => ({ id: l.href, title: l.label, hint: PAGE_HINTS[l.href] ?? null, href: l.href }));
  }, [access]);

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
  // Until something is typed, show a few pages and a few of each; once typing, everything that matches.
  const sections: { key: string; label: string; icon: LucideIcon; hits: Hit[] }[] = res
    ? [{ key: "pages", label: "Pages", icon: Search, hits: term ? pageHits : pageHits.slice(0, 5) }, ...RESULT_GROUPS.map((g) => ({ key: g.key as string, label: g.label, icon: g.icon, hits: res[g.key] }))].filter((s) => s.hits.length)
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
    <>
      <div className="animate-fade fixed inset-0 z-50 bg-black/80" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="animate-pop fixed top-[12vh] left-[50%] z-50 grid w-full max-w-[min(760px,calc(100vw-2rem))] translate-x-[-50%] gap-0 overflow-hidden border border-border bg-background p-0 shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)]"
      >
        <div className="flex max-h-[70vh] w-full min-w-0 flex-col pb-3">
          <div className="flex items-center gap-3 border-b border-border px-5">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
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
              className="h-16 w-full bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden shrink-0 border border-border px-2 py-0.5 text-eyebrow text-muted-foreground sm:block">Esc</kbd>
          </div>
          <div ref={list} id="admin-search-list" role="listbox" aria-label="Results" className="mt-3 min-h-0 min-w-0 flex-1 scroll-py-3 overflow-x-hidden overflow-y-auto pb-2">
            {!res ? (
              <PaletteLoader />
            ) : !count ? (
              <p className="px-5 py-12 text-center text-small text-muted-foreground">Nothing matches “{q}”.</p>
            ) : (
              sections.map((s) => (
                <div key={s.key} role="group" aria-label={s.label}>
                  <p aria-hidden="true" className={cn("px-5 pb-1 text-eyebrow tracking-widest text-muted-foreground uppercase", s.key === "pages" ? "pt-3" : "pt-4")}>
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
                        className="flex w-full min-w-0 cursor-pointer items-center gap-4 px-5 py-3 text-left data-[selected=true]:bg-foreground/[0.06]"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border text-muted-foreground" aria-hidden="true">
                          <s.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-foreground">{h.title}</span>
                          {h.hint ? <span className="block truncate text-small text-muted-foreground">{h.hint}</span> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
const EMPTY: Results = { experts: [], accounts: [], leads: [], jobs: [], platforms: [], messages: [] };

/* ---------- Account bar and its menu ---------- */

// The FynoLabs dropdown item (dropdown-menu.tsx + AdminProfileMenu's itemClass): 40px, body text, the accent wash.
const menuItem =
  "relative flex h-10 min-h-10 w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-body text-popover-foreground outline-none transition-colors select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0";
const menuIcon = "h-4 w-4 text-muted-foreground";
const MenuSeparator = () => <div role="separator" className="-mx-1 my-1 h-px bg-muted" />;

/**
 * The account at the bottom of the sidebar and the phone menu: the email and an up/down chevron. Clicking
 * it opens the account details (email, role) with Refresh, Settings, the light/dark switch and Sign out.
 */
function ProfileMenu({ user, signOut, onNavigate, size = "default" }: { user: NavUser & { settingsHref?: string }; signOut: () => Promise<void>; onNavigate?: () => void; size?: "default" | "large" }) {
  const [open, setOpen] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const theme = useAdminTheme();
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
  const settings = user.settingsHref;
  const leave = () => {
    setOpen(false);
    onNavigate?.();
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account: ${user.email}`}
        // A plain bar: no background on hover, focus or while open; keyboard focus shows a ring.
        className={cn(
          "flex w-full items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none",
          size === "large" ? "py-1.5" : "py-1",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-small text-foreground">{user.email}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label="Account"
          className="animate-pop absolute bottom-full left-0 z-50 mb-2 w-full min-w-[8rem] origin-bottom overflow-hidden border border-border bg-popover p-1 text-popover-foreground shadow-[0_4px_6px_-1px_rgb(0_0_0/0.1),0_2px_4px_-2px_rgb(0_0_0/0.1)]"
        >
          <div className="px-3 py-2.5 text-sm font-normal">
            <p className="truncate text-small text-foreground">{user.email}</p>
            <p className="mt-0.5 text-eyebrow tracking-widest text-muted-foreground uppercase">{user.role}</p>
          </div>
          <MenuSeparator />
          <button
            type="button"
            role="menuitem"
            disabled={refreshing}
            onClick={() => {
              leave();
              startRefresh(() => router.refresh());
            }}
            className={menuItem}
          >
            <RefreshCw className={cn(menuIcon, refreshing && "animate-spin")} aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {settings ? (
            <Link href={settings} role="menuitem" onClick={leave} className={menuItem}>
              <Settings className={menuIcon} aria-hidden="true" /> Settings
            </Link>
          ) : null}
          <Link href="/account/password" role="menuitem" onClick={leave} className={menuItem}>
            <KeyRound className={menuIcon} aria-hidden="true" /> Change password
          </Link>
          <a href="/" target="_blank" rel="noreferrer" role="menuitem" onClick={() => setOpen(false)} className={menuItem}>
            <ExternalLink className={menuIcon} aria-hidden="true" /> Public job board
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setAdminTheme(theme === "dark" ? "light" : "dark");
            }}
            className={menuItem}
          >
            {theme === "dark" ? <Sun className={menuIcon} aria-hidden="true" /> : <Moon className={menuIcon} aria-hidden="true" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <MenuSeparator />
          <form action={signOut}>
            <button type="submit" role="menuitem" className={menuItem}>
              <LogOut className={menuIcon} aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Sidebar and phone bar ---------- */

/** Desktop sidebar (from 1024px). Stays in view while the page scrolls. */
export function Sidebar({ access, user, signOut }: { access: NavAccess; user: NavUser; signOut: () => Promise<void> }) {
  const path = usePathname();
  const settings = settingsLink(access);
  return (
    <aside className="sticky hidden h-screen w-[282px] shrink-0 flex-col border-r border-border lg:flex" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="px-5 pt-9 pb-6">
        <Brand />
      </div>
      <div className="px-2 pb-5">
        <button
          type="button"
          onClick={openSearch}
          className="admin-hover flex h-10 w-full items-center gap-3 border border-border px-3 text-left text-small text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Search</span>
          <kbd className="border border-border px-1.5 text-eyebrow">Ctrl K</kbd>
        </button>
      </div>
      {/* On short windows the list scrolls on its own, without a visible scrollbar, rather than squeezing the spacing. */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Admin sections">
        <NavGroups path={path} access={access} />
      </nav>
      <div className="border-t border-border px-5 py-4">
        <ProfileMenu user={{ ...user, settingsHref: settings?.href }} signOut={signOut} />
      </div>
    </aside>
  );
}

// The FynoLabs ghost icon button (its icons render at 16px).
const barButton =
  "inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

/**
 * Phones and tablets (below 1024px): a slim sticky bar with the menu button, the current section and
 * search. The menu is a frosted-glass panel with every section and the account bar.
 */
export function MobileBar({ access, user, signOut }: { access: NavAccess; user: NavUser; signOut: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = currentLink(path, access);
  const settings = settingsLink(access);
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
      <div
        className="sticky z-30 -mx-5 mb-6 flex items-center gap-3 border-b border-border bg-background/80 px-5 py-2.5 backdrop-blur-xl md:-mx-10 md:px-10 lg:hidden"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className={cn(barButton, "-ml-2")}>
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {current ? <current.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
          <span className="truncate text-eyebrow tracking-widest text-foreground uppercase">{current?.label ?? "Admin"}</span>
        </div>
        <button type="button" onClick={openSearch} aria-label="Search" className={cn(barButton, "-mr-2")}>
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {open
        ? createPortal(
            <div className="lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <div className="animate-fade fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
              <div className="animate-slide-left fixed inset-y-0 left-0 z-50 flex h-full w-[86%] max-w-sm flex-col gap-0 border-r border-white/40 bg-background/85 p-0 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/60 dark:border-white/10">
                <div className="flex items-center justify-between px-5 pb-4" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
                  <Brand compact />
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className={cn(barButton, "-mr-2")}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <nav className="flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Admin sections">
                  <NavGroups path={path} access={access} onNavigate={() => setOpen(false)} compact />
                </nav>
                <div className="border-t border-border/60 px-6 pt-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
                  <ProfileMenu size="large" user={{ ...user, settingsHref: settings?.href }} signOut={signOut} onNavigate={() => setOpen(false)} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
