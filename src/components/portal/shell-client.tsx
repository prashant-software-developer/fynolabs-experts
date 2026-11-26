"use client";
// The expert portal's navigation: the rail items (desktop), the phone menu and the account menu.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CircleHelp, FileSignature, GraduationCap, House, KeyRound, LogOut, Menu, Search, UserRound, Wallet, X, type LucideIcon } from "@/components/icons";
import { signOutNow } from "@/app/(auth)/actions";
import { cn } from "@/components/ui/cn";

export type PortalSection = "home" | "jobs" | "learn" | "payments" | "documents" | "profile";
export type PortalAttention = Partial<Record<PortalSection, number>>;

export const PORTAL_NAV: { key: PortalSection; href: string; label: string; icon: LucideIcon }[] = [
  { key: "home", href: "/me", label: "Home", icon: House },
  { key: "jobs", href: "/me/jobs", label: "Jobs", icon: Search },
  { key: "learn", href: "/me/learn", label: "Learn", icon: GraduationCap },
  { key: "payments", href: "/me/payments", label: "Payments", icon: Wallet },
  { key: "documents", href: "/me/documents", label: "Documents", icon: FileSignature },
  { key: "profile", href: "/me/profile", label: "Profile", icon: UserRound },
];

/** Which section a portal path belongs to (the onboarding steps count as Profile, applications as Home). */
export function sectionFor(path: string): PortalSection {
  if (path.startsWith("/me/onboarding") || path.startsWith("/me/profile")) return "profile";
  const hit = PORTAL_NAV.filter((n) => n.key !== "home").find((n) => path === n.href || path.startsWith(`${n.href}/`));
  return hit?.key ?? "home";
}

function Dot({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none text-primary-foreground tabular" aria-hidden>
      {n > 9 ? "9+" : n}
    </span>
  );
}

/** The rail: one tile per section (icon above a short label). */
export function PortalRail({ attention }: { attention?: PortalAttention }) {
  const active = sectionFor(usePathname());
  return (
    <nav className="mt-8 flex flex-col items-center gap-1.5" aria-label="Your portal">
      {PORTAL_NAV.map((n) => {
        const on = active === n.key;
        const count = attention?.[n.key];
        return (
          <Link
            key={n.key}
            href={n.href}
            aria-current={on ? "page" : undefined}
            aria-label={count ? `${n.label} (${count} to do)` : undefined}
            className={cn(
              "flex w-[72px] flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-[11px] leading-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              on ? "bg-primary/[0.08] text-primary" : "text-foreground/65 hover:bg-foreground/[0.04] hover:text-foreground",
            )}
          >
            <span className="relative">
              <n.icon className="h-5 w-5" strokeWidth={on ? 2 : 1.6} aria-hidden />
              <Dot n={count} />
            </span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Avatar({ name, avatarUrl, size = 36 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  if (avatarUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" width={size} height={size} className="rounded-full border border-border object-cover" style={{ width: size, height: size }} />;
  return (
    <span className="grid place-items-center rounded-full border border-border bg-secondary text-[13px] text-foreground" style={{ width: size, height: size }} aria-hidden>
      {initials}
    </span>
  );
}

const menuItem = "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-foreground/85 transition-colors hover:bg-foreground/[0.04] hover:text-foreground";

function AccountLinks({ onPick }: { onPick?: () => void }) {
  return (
    <>
      <Link href="/me/profile" className={menuItem} onClick={onPick}>
        <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden /> Profile
      </Link>
      <Link href="/account/password" className={menuItem} onClick={onPick}>
        <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden /> Change password
      </Link>
      <a href="mailto:hello@fynolabs.si" className={menuItem} onClick={onPick}>
        <CircleHelp className="h-4 w-4 text-muted-foreground" aria-hidden /> Help
      </a>
      <div role="separator" className="my-1 h-px bg-border" />
      <form action={signOutNow}>
        <button type="submit" className={menuItem}>
          <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden /> Sign out
        </button>
      </form>
    </>
  );
}

/** The avatar at the bottom of the rail; opens a small menu above it. */
export function PortalAccountMenu({ name, email, avatarUrl }: { name: string; email: string; avatarUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Your account: ${email}`}
        className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-2 text-[11px] leading-none text-foreground/65 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Avatar name={name} avatarUrl={avatarUrl} />
        <span className="max-w-[72px] truncate">{name.split(/\s+/)[0] || "You"}</span>
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-0 left-full z-50 ml-3 w-64 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <div role="separator" className="my-1 h-px bg-border" />
          <AccountLinks onPick={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

/** Phones and tablets: a top bar with the mark, the current section and a menu with everything. */
export function PortalMobileBar({ name, email, avatarUrl, attention }: { name: string; email: string; avatarUrl?: string | null; attention?: PortalAttention }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = PORTAL_NAV.find((n) => n.key === sectionFor(path));
  useEffect(() => setOpen(false), [path]);
  const todo = Object.values(attention ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <Link href="/me" aria-label="Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/fynolabs-mark.svg" alt="" width={24} height={24} className="h-6 w-6" />
        </Link>
        <span className="text-sm text-foreground">{current?.label ?? "Home"}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="relative ml-auto grid h-9 w-9 place-items-center rounded-md text-foreground/80 hover:bg-foreground/[0.04]"
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          {!open && todo ? <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden /> : null}
        </button>
      </div>
      {open ? (
        <div className="border-t border-border px-3 pt-2 pb-3">
          <nav className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label="Your portal">
            {PORTAL_NAV.map((n) => {
              const on = current?.key === n.key;
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs", on ? "bg-primary/[0.08] text-primary" : "text-foreground/75 hover:bg-foreground/[0.04]")}
                >
                  <span className="relative">
                    <n.icon className="h-5 w-5" aria-hidden />
                    <Dot n={attention?.[n.key]} />
                  </span>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex items-center gap-3 px-3 py-2">
              <Avatar name={name} avatarUrl={avatarUrl} size={32} />
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
            </div>
            <AccountLinks onPick={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
