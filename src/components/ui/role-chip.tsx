// A team member's role as a small soft-tinted chip with a dot: blue for Admin, then one quiet colour
// per role, grey for Viewer. Used in the account menu and on Team & access.
import { cn } from "./cn";

const TONES: Record<string, { chip: string; dot: string }> = {
  admin: { chip: "bg-primary/[0.08] text-primary", dot: "bg-primary" },
  recruiter: { chip: "bg-info-soft text-info", dot: "bg-info" },
  "pod lead": { chip: "bg-progress-soft text-progress", dot: "bg-progress" },
  finance: { chip: "bg-success-soft text-success", dot: "bg-success" },
  viewer: { chip: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground/60" },
};

/** `role`: the role's label ("Admin", "Pod lead") or key ("pod_lead"). */
export function RoleChip({ role, className }: { role: string; className?: string }) {
  const key = role.replace(/_/g, " ").trim().toLowerCase();
  const tone = TONES[key] ?? TONES.viewer;
  const label = key ? key[0].toUpperCase() + key.slice(1) : "Member";
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full pr-2.5 pl-2 text-[11.5px] leading-none font-medium", tone.chip, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden />
      {label}
    </span>
  );
}
