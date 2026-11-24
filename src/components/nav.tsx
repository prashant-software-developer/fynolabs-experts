"use client";
// The admin frame, as the FynoLabs admin's (AdminNavigation.tsx, AdminProfileMenu.tsx, GlobalSearch.tsx):
// a 282px sidebar with the mark, a Search button (Ctrl K opens the command palette), the groups, and
// the profile menu at the bottom (theme switch, password, sign out). Below 1024px a slim sticky bar
// opens the same groups in a panel. No counts in the items.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Radar,
  Search,
  Send,
  Settings,
  Upload,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui/cn";
import { AdminThemeToggle } from "@/components/admin/kit-client";

/** `also`: other paths that belong to this item (Send referrals also covers the sent-referrals list). */
type NavLink = { href: string; label: string; icon: LucideIcon; also?: string[] };

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

function NavGroups({ path, access, onNavigate }: { path: string; access: NavAccess; onNavigate?: () => void }) {
  const active = activeHref(path, access);
  return (
    <>
      {groupsFor(access).map((group) => (
        <div key={group.label || "top"} className="mt-6 flex flex-col gap-1 first:mt-0">
          {group.label ? <p className="eyebrow px-3 pb-1 text-muted-foreground">{group.label}</p> : null}
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

/** The mark and wordmark. */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/admin" className="flex items-center gap-3 text-foreground">
      <LogoMark className={compact ? "h-5 w-5" : "h-6 w-6"} />
      <span className={compact ? "text-body" : "text-[1.0625rem]"}>FynoLabs</span>
    </Link>
  );
}

/* ---------- Search (Ctrl K) ---------- */

type Hit = { id: string; name: string; sub: string; href: string };
type Results = { people: Hit[]; accounts: Hit[]; jobs: Hit[] };
const OPEN_EVENT = "fyno:open-search";
export const openSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

export function CommandPalette({ access }: { access: NavAccess }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>({ people: [], accounts: [], jobs: [] });
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const pages = useMemo(() => [...groupsFor(access).flatMap((g) => g.links), settingsLink(access)].filter((l): l is NavLink => Boolean(l)), [access]);

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
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0);
    else setQ("");
  }, [open]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRes({ people: [], accounts: [], jobs: [] });
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { people: [], accounts: [], jobs: [] }))
        .then((j: Results) => setRes(j))
        .catch(() => undefined);
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const term = q.trim().toLowerCase();
  const pageHits: Hit[] = pages.filter((p) => !term || p.label.toLowerCase().includes(term)).map((p) => ({ id: p.href, name: p.label, sub: "Page", href: p.href }));
  const sections: { label: string; hits: Hit[] }[] = [
    { label: "People", hits: res.people },
    { label: "Accounts", hits: res.accounts },
    { label: "Jobs", hits: res.jobs },
    { label: "Pages", hits: pageHits.slice(0, term ? 6 : 8) },
  ].filter((s) => s.hits.length);
  const flat = sections.flatMap((s) => s.hits);
  useEffect(() => setCursor(0), [q, res]);
  const go = useCallback(
    (h: Hit) => {
      setOpen(false);
      router.push(h.href);
    },
    [router],
  );

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" className="absolute inset-0 bg-foreground/10" aria-label="Close search" onClick={() => setOpen(false)} />
      <div className="absolute top-[12vh] left-1/2 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 border border-border bg-background">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter" && flat[cursor]) go(flat[cursor]);
            }}
            placeholder="Search people, accounts, jobs"
            aria-label="Search people, accounts, jobs"
            className="h-14 min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="eyebrow border border-border px-1.5 text-muted-foreground">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {sections.length ? (
            sections.map((s) => (
              <div key={s.label} className="py-1">
                <p className="eyebrow px-4 py-2 text-muted-foreground">{s.label}</p>
                {s.hits.map((h) => {
                  const i = flat.indexOf(h);
                  return (
                    <button
                      key={s.label + h.id}
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(h)}
                      className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left", i === cursor ? "bg-foreground/[0.06]" : "")}
                    >
                      <span className="min-w-0 flex-1 truncate text-small text-foreground">{h.name}</span>
                      <span className="max-w-[40%] shrink-0 truncate text-small text-muted-foreground">{h.sub}</span>
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="px-4 py-6 text-center text-small text-muted-foreground">{term.length < 2 ? "Type two letters or more." : "Nothing found."}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Profile menu ---------- */

function ProfileMenu({ user, signOut, onNavigate }: { user: NavUser & { settingsHref?: string }; signOut: () => Promise<void>; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const settings = user.settingsHref;
  const item = "admin-hover flex h-10 w-full items-center gap-3 px-3 text-left text-small text-foreground";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account: ${user.email}`}
        className="flex w-full items-center gap-3 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <span className="min-w-0 flex-1 truncate text-small text-foreground">{user.email}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-full min-w-[220px] border border-border bg-background p-1">
          <div className="px-3 py-2.5">
            <p className="truncate text-small text-foreground">{user.email}</p>
            <p className="eyebrow mt-0.5 text-muted-foreground">{user.role}</p>
          </div>
          <div className="my-1 border-t border-border" />
          {settings ? (
            <Link href={settings} onClick={() => { setOpen(false); onNavigate?.(); }} className={item}>
              <Settings className="h-4 w-4 text-muted-foreground" aria-hidden /> Settings
            </Link>
          ) : null}
          <AdminThemeToggle withLabel />
          <Link href="/account/password" onClick={() => { setOpen(false); onNavigate?.(); }} className={item}>
            <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden /> Change password
          </Link>
          <a href="/" target="_blank" rel="noreferrer" className={item}>
            <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden /> Public job board
          </a>
          <div className="my-1 border-t border-border" />
          <form action={signOut}>
            <button type="submit" className={item}>
              <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden /> Sign out
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
  const active = activeHref(path, access);
  return (
    <aside className="sticky top-0 hidden h-screen w-[282px] shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
      <div className="px-5 pt-9 pb-6">
        <Brand />
      </div>
      <div className="px-2 pb-5">
        <button
          type="button"
          onClick={openSearch}
          className="admin-hover flex h-10 w-full items-center gap-3 border border-border px-3 text-left text-small text-muted-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">Search</span>
          <kbd className="eyebrow border border-border px-1.5">Ctrl K</kbd>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Admin sections">
        <NavGroups path={path} access={access} />
      </nav>
      <div className="border-t border-border px-5 py-4">
        <ProfileMenu user={{ ...user, settingsHref: settings?.href }} signOut={signOut} />
      </div>
    </aside>
  );
}

/** Phones and tablets (below 1024px): a slim sticky bar with the menu, the current section and search. */
export function MobileBar({ access, user, signOut }: { access: NavAccess; user: NavUser; signOut: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = currentLink(path, access);
  const settings = settingsLink(access);
  const active = activeHref(path, access);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <div className="sticky top-0 z-30 -mx-5 mb-6 flex items-center gap-3 border-b border-border bg-background/80 px-5 py-2.5 backdrop-blur-xl md:-mx-10 md:px-10 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="admin-hover -ml-2 inline-flex h-10 w-10 items-center justify-center text-foreground">
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {current ? <current.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
          <span className="eyebrow truncate text-foreground">{current?.label ?? "Admin"}</span>
        </div>
        <button type="button" onClick={openSearch} aria-label="Search" className="admin-hover -mr-2 inline-flex h-10 w-10 items-center justify-center text-foreground">
          <Search className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <button type="button" className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setOpen(false)} />
              <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col border-r border-border bg-background">
                <div className="flex items-center justify-between px-5 pt-5 pb-4">
                  <Brand compact />
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="admin-hover -mr-2 inline-flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Admin sections">
                  <NavGroups path={path} access={access} onNavigate={() => setOpen(false)} />
                  {settings ? (
                    <div className="mt-6 flex flex-col gap-1">
                      <NavItem link={settings} active={active === settings.href} onNavigate={() => setOpen(false)} />
                    </div>
                  ) : null}
                </nav>
                <div className="border-t border-border px-6 pt-4 pb-4">
                  <ProfileMenu user={user} signOut={signOut} onNavigate={() => setOpen(false)} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
