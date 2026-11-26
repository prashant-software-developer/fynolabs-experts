// A company's activity log, newest first, grouped by day (Today, Yesterday, "Mon, 3 Nov"): a rail
// with one round icon per kind (email, call, meeting...), what happened, who logged it and when.
import { AtSign, CalendarDays, CheckSquare, Mail, Phone, Shuffle, StickyNote, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { crmLabel } from "@/lib/crm/labels";
import { dateIST, relativeDay } from "@/lib/crm/dates";
import type { CompanyActivityRow } from "@/lib/server/companies";

const KINDS: Record<string, { icon: LucideIcon; tone: string }> = {
  note: { icon: StickyNote, tone: "bg-secondary text-foreground/70" },
  email: { icon: Mail, tone: "bg-info-soft text-info" },
  call: { icon: Phone, tone: "bg-success-soft text-success" },
  meeting: { icon: CalendarDays, tone: "bg-progress-soft text-progress" },
  linkedin: { icon: AtSign, tone: "bg-info-soft text-info" },
  task: { icon: CheckSquare, tone: "bg-warning-soft text-warning" },
  stage: { icon: Shuffle, tone: "bg-secondary text-foreground/70" },
};

const dayTitle = (iso: string, today: string) =>
  relativeDay(iso, today) && relativeDay(iso, today) !== "Tomorrow"
    ? relativeDay(iso, today)!
    : new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(iso.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}), timeZone: "UTC" });

const timeIST = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** "pavel.podlead@example.com" → "Pavel Podlead" (who logged it). */
const who = (email: string) =>
  email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");

export function ActivityTimeline({ items, today, compact, showCompany }: { items: CompanyActivityRow[]; today: string; compact?: boolean; showCompany?: boolean }) {
  const groups: { day: string; items: CompanyActivityRow[] }[] = [];
  for (const a of items) {
    const day = dateIST(a.happenedAt);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(a);
    else groups.push({ day, items: [a] });
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.day}>
          {compact ? null : <p className="mb-3 text-[13px] font-medium text-muted-foreground">{dayTitle(g.day, today)}</p>}
          <ol className="relative">
            {g.items.map((a, i) => {
              const k = KINDS[a.kind] ?? KINDS.note;
              const last = i === g.items.length - 1;
              return (
                <li key={a.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                  {/* The rail joins one icon to the next. */}
                  {!last ? <span className="absolute top-8 bottom-0 left-[13.5px] w-px bg-border" aria-hidden /> : null}
                  <span className={cn("relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card", k.tone)}>
                    <k.icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm text-foreground">
                      {showCompany && a.companyName ? <span className="font-medium">{a.companyName}: </span> : null}
                      {a.summary}
                      {a.contactName ? <span className="text-muted-foreground"> · {a.contactName}</span> : null}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {crmLabel(a.kind)} · {compact ? `${dayTitle(g.day, today)}, ` : ""}
                      {timeIST(a.happenedAt)}
                      {a.createdBy ? ` · ${who(a.createdBy)}` : ""}
                    </p>
                    {a.detail && !compact ? <p className="mt-2 line-clamp-6 rounded-lg bg-canvas px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line text-foreground/80">{a.detail}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
