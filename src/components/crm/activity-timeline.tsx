// A company's activity log, newest first, grouped by day (Today, Yesterday, "Mon, 3 Nov").
import { AtSign, CalendarDays, CheckSquare, Mail, Phone, Shuffle, StickyNote, type LucideIcon } from "lucide-react";
import { crmLabel } from "@/lib/crm/labels";
import { dateIST, relativeDay } from "@/lib/crm/dates";
import type { CompanyActivityRow } from "@/lib/server/companies";

const ICONS: Record<string, LucideIcon> = { note: StickyNote, email: Mail, call: Phone, meeting: CalendarDays, linkedin: AtSign, task: CheckSquare, stage: Shuffle };

const dayTitle = (iso: string, today: string) =>
  relativeDay(iso, today) && relativeDay(iso, today) !== "Tomorrow"
    ? relativeDay(iso, today)!
    : new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(iso.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}), timeZone: "UTC" });

const timeIST = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function ActivityTimeline({ items, today, compact, showCompany }: { items: CompanyActivityRow[]; today: string; compact?: boolean; showCompany?: boolean }) {
  const groups: { day: string; items: CompanyActivityRow[] }[] = [];
  for (const a of items) {
    const day = dateIST(a.happenedAt);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(a);
    else groups.push({ day, items: [a] });
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.day}>
          {compact ? null : <p className="eyebrow mb-2 text-muted-foreground">{dayTitle(g.day, today)}</p>}
          <ul className="space-y-3">
            {g.items.map((a) => {
              const Icon = ICONS[a.kind] ?? StickyNote;
              return (
                <li key={a.id} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      {showCompany && a.companyName ? <span className="font-medium">{a.companyName}: </span> : null}
                      {a.summary}
                      {a.contactName ? <span className="text-muted-foreground"> · {a.contactName}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {crmLabel(a.kind)} · {compact ? `${dayTitle(g.day, today)}, ` : ""}
                      {timeIST(a.happenedAt)}
                      {a.createdBy ? ` · ${a.createdBy.split("@")[0]}` : ""}
                    </p>
                    {a.detail && !compact ? <p className="mt-1 line-clamp-6 text-small whitespace-pre-line text-foreground/75">{a.detail}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
