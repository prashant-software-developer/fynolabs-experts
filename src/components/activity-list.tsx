import Link from "next/link";
import type { Activity } from "@/db/schema";
import { label } from "@/lib/constants";
import { ago, fmtDateTime } from "@/lib/format";
import { EmptyState } from "./ui/feedback";

const VERBS: Record<string, string> = {
  created: "created",
  updated: "edited",
  updated_by_import: "filled in by an import",
  status_changed: "changed status",
  notes_changed: "changed notes",
  shortlisted: "shortlisted",
  cv_uploaded: "uploaded a CV",
  cv_downloaded: "downloaded a CV",
  cv_consent_recorded: "recorded CV consent",
  note_added: "added a note",
  deleted_on_request: "deleted on request",
  jobs_site_sync: "ran the jobs-site sync",
  csv_import: "imported a CSV",
  roster_exported: "exported a roster",
  demo_data_loaded: "loaded demo data",
};

function hrefFor(a: Activity): string | null {
  const d = (a.detail ?? {}) as Record<string, unknown>;
  switch (a.entityType) {
    case "expert":
      return a.action === "deleted_on_request" ? null : `/experts/${a.entityId}`;
    case "requirement":
      return `/requirements/${a.entityId}`;
    case "submission":
      return typeof d.requirementId === "string" ? `/requirements/${d.requirementId}?tab=submissions` : null;
    case "placement":
      return `/placements/${a.entityId}`;
    case "partner":
      return `/partners`;
    default:
      return a.entityType === "import" ? "/import" : null;
  }
}

function describe(a: Activity): string {
  const d = (a.detail ?? {}) as Record<string, unknown>;
  const verb = VERBS[a.action] ?? a.action.replace(/_/g, " ");
  const bits: string[] = [`${label(a.entityType)} ${verb}`];
  if (d.from && d.to) bits.push(`${label(String(d.from))} → ${label(String(d.to))}`);
  else if (d.to) bits.push(label(String(d.to)));
  if (Array.isArray(d.fields) && d.fields.length) bits.push(`(${(d.fields as string[]).slice(0, 6).join(", ")}${d.fields.length > 6 ? ", ..." : ""})`);
  if (typeof d.value === "string") bits.push(label(d.value));
  if (typeof d.created === "number") bits.push(`+${d.created} new, ${d.updated ?? 0} filled`);
  if (d.automatic) bits.push("(automatic)");
  return bits.join(" ");
}

export function ActivityList({ items, showEntity = true }: { items: Activity[]; showEntity?: boolean }) {
  if (!items.length) return <EmptyState title="Nothing yet" description="Every change made here will be listed." />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a) => {
        const href = showEntity ? hrefFor(a) : null;
        const text = describe(a);
        return (
          <li key={a.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
            <div className="min-w-0">
              {href ? (
                <Link href={href} className="text-slate-800 hover:text-accent">
                  {text}
                </Link>
              ) : (
                <span className="text-slate-800">{text}</span>
              )}
              <span className="ml-2 text-xs text-slate-400">{a.actorEmail}</span>
            </div>
            <time className="shrink-0 text-xs text-slate-400" title={fmtDateTime(a.createdAt)}>
              {ago(a.createdAt)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
