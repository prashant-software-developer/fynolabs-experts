// People in the admin: an initials avatar in a soft tone picked from the name (so the same person
// always gets the same colour), and Person: the avatar with the name beside it (owners, contacts).
import { cn } from "./cn";

/** "Prashant Kumar Singh" → "PS"; "pavel.podlead@example.com" → "PP"; "Rhea" → "RH". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").split("@")[0].split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return "?";
  const pick = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
  return pick.toUpperCase();
}

// Quiet identity tones (no brand blue: that stays for actions and links).
const TONES = [
  "bg-violet-50 text-violet-800 ring-violet-200/70",
  "bg-teal-50 text-teal-800 ring-teal-200/70",
  "bg-amber-50 text-amber-800 ring-amber-200/70",
  "bg-rose-50 text-rose-800 ring-rose-200/70",
  "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  "bg-slate-100 text-slate-700 ring-slate-200/80",
  "bg-orange-50 text-orange-800 ring-orange-200/70",
  "bg-cyan-50 text-cyan-800 ring-cyan-200/70",
];

function toneFor(name: string): string {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

// 20, 24, 28 (table rows), 36, 40 and 48px (record and panel headers).
const SIZES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-7 w-7 text-[10.5px]",
  lg: "h-9 w-9 text-xs",
  xl: "h-10 w-10 text-[13px]",
  "2xl": "h-12 w-12 text-[15px]",
} as const;
export type AvatarSize = keyof typeof SIZES;

export function Avatar({ name, size = "md", className, title }: { name: string | null | undefined; size?: AvatarSize; className?: string; title?: string }) {
  const n = (name ?? "").trim();
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-wide ring-1 select-none", n ? toneFor(n) : "bg-secondary text-muted-foreground ring-border", SIZES[size], className)}
    >
      {n ? initialsOf(n) : "?"}
    </span>
  );
}

/** An owner or a contact: avatar and name. Nobody: a quiet dash (or `empty`). */
export function Person({ name, size = "sm", className, empty = "–", sub }: { name: string | null | undefined; size?: AvatarSize; className?: string; empty?: string; sub?: React.ReactNode }) {
  const n = (name ?? "").trim();
  if (!n) return <span className="text-muted-foreground/70">{empty}</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Avatar name={n} size={size} />
      <span className="min-w-0">
        <span className="block truncate">{n}</span>
        {sub ? <span className="block truncate text-[13px] text-muted-foreground">{sub}</span> : null}
      </span>
    </span>
  );
}
