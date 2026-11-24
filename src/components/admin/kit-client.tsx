"use client";
// The client half of the admin kit: the (i) explanation, Escape-to-close for side panels, the
// selection bar for ticked rows, and the admin light / dark theme.
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Info, Moon, Sun } from "lucide-react";

/** An (i) next to a label; the explanation shows on hover or focus, and on a tap on phones. */
export function AdminInfo({ children, label = "More information" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-0 z-50 mb-2 w-max max-w-xs border border-border bg-background px-3 py-2 text-left text-small leading-relaxed font-normal tracking-normal text-foreground normal-case"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

/** Escape closes the side panel (goes to its close address). */
export function EscapeTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) router.push(href, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [href, router]);
  return null;
}

/**
 * Bar fixed to the bottom while rows of a form are ticked: the count, Clear, and the form's actions.
 * Counts the checked `name` boxes that belong to `form`.
 */
export function AdminSelectionBar({ form, name = "ids", noun, children }: { form: string; name?: string; noun: [string, string]; children: ReactNode }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const f = document.getElementById(form) as HTMLFormElement | null;
    const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`)).filter((b) => b.form === f || b.getAttribute("form") === form);
    const update = () => setCount(boxes().filter((b) => b.checked).length);
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [form, name]);
  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`).forEach((b) => {
      if (b.checked) {
        b.checked = false;
        b.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  };
  if (!count) return null;
  return (
    <div className="sticky bottom-0 z-30 -mx-5 mt-8 border-t border-border bg-background px-5 pt-4 md:-mx-10 md:px-10" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          <span className="tabular text-body text-foreground">
            {count} {count === 1 ? noun[0] : noun[1]} selected
          </span>
          <button type="button" onClick={clear} className="text-small text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Clear
          </button>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:gap-3">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Light / dark (admin only) ---------- */

export type AdminTheme = "light" | "dark";
export const THEME_KEY = "fyno.admin-theme";
const EVENT = "fyno:admin-theme";

/** Runs before the first paint on admin pages (inline in the layout), so dark pages don't flash white. */
export const THEME_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

const read = (): AdminTheme => {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function useAdminTheme(): AdminTheme {
  return useSyncExternalStore(subscribe, read, () => "light");
}

export function setAdminTheme(theme: AdminTheme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private window: this page only */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Keeps the dark class in step on admin pages and takes it off when leaving the admin. */
export function AdminThemeSync() {
  const theme = useAdminTheme();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  useEffect(() => () => document.documentElement.classList.remove("dark"), []);
  return null;
}

/** The sun / moon switch (in the profile menu). */
export function AdminThemeToggle({ withLabel }: { withLabel?: boolean }) {
  const theme = useAdminTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setAdminTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={withLabel ? "admin-hover flex h-10 w-full items-center gap-3 px-3 text-left text-small text-foreground" : "admin-hover inline-flex h-10 w-10 items-center justify-center border border-input text-foreground"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      {withLabel ? (theme === "dark" ? "Light mode" : "Dark mode") : null}
    </button>
  );
}
