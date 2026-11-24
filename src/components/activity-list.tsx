import Link from "next/link";
import type { Activity } from "@/db/schema";
import { roleLabel } from "@/lib/auth/permissions";
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
  experts_exported: "exported experts",
  placements_exported: "exported placements",
  role_changed: "changed role",
  scope_changed: "changed partner scope",
  deactivated: "turned access off",
  reactivated: "turned access back on",
  signed_up: "signed up",
  email_verified: "confirmed the email",
  locked: "locked after too many wrong passwords",
  password_changed: "changed the password",
  password_reset: "had the password reset",
  temporary_password_set: "got a temporary password",
  // CRM and operations (Phase 3b)
  stage_changed: "moved stage",
  activity_logged: "logged an activity",
  deleted: "deleted",
  marked_done: "marked done",
  handled: "marked handled",
  reopened: "marked open",
  draft_saved: "saved a reply draft",
  draft_discarded: "discarded a reply draft",
  reply_sent: "replied",
  reply_logged: "recorded a reply",
  reply_failed: "reply failed",
  tracks_saved: "changed tracks",
  team_saved: "changed the team",
  documents_saved: "changed required documents",
  fee_rules_saved: "changed fee rules",
  linked_to_project: "linked to a project",
  unlinked_from_project: "unlinked from its project",
};

/** Entity names that read differently from the value lists in constants (companies are "Accounts" since Phase 3b). */
const ENTITY_LABELS: Record<string, string> = { partner: "Account", calendar_event: "Calendar event", setting: "Setting" };

function hrefFor(a: Activity): string | null {
  const d = (a.detail ?? {}) as Record<string, unknown>;
  switch (a.entityType) {
    case "expert":
      return a.action === "deleted_on_request" ? null : `/admin/experts/${a.entityId}`;
    case "requirement":
      return `/admin/requirements/${a.entityId}`;
    case "submission":
      return typeof d.requirementId === "string" ? `/admin/requirements/${d.requirementId}?tab=submissions` : null;
    case "placement":
      return `/admin/placements/${a.entityId}`;
    case "partner":
      return a.action === "deleted" ? null : `/admin/accounts/${a.entityId}`;
    case "contact":
      return a.action === "deleted" ? null : `/admin/leads?view=${a.entityId}`;
    case "calendar_event":
      return a.action === "deleted" ? null : `/admin/calendar?event=${a.entityId}`;
    case "platform":
      return a.action === "deleted" ? null : `/admin/platforms/${a.entityId}`;
    case "project":
      return a.action === "deleted" ? null : `/admin/projects/${a.entityId}`;
    case "message":
      return a.action === "deleted" ? null : `/admin/messages?view=${a.entityId}`;
    case "setting":
      return "/admin/settings";
    case "team_member":
      return `/admin/settings/team`;
    default:
      return a.entityType === "import" ? "/admin/import" : null;
  }
}

function describe(a: Activity): string {
  const d = (a.detail ?? {}) as Record<string, unknown>;
  const verb = VERBS[a.action] ?? a.action.replace(/_/g, " ");
  const bits: string[] = [`${ENTITY_LABELS[a.entityType] ?? label(a.entityType)} ${verb}`];
  if (d.from && d.to) bits.push(`${label(String(d.from))} → ${label(String(d.to))}`);
  else if (d.to) bits.push(label(String(d.to)));
  if (Array.isArray(d.fields) && d.fields.length) bits.push(`(${(d.fields as string[]).slice(0, 6).join(", ")}${d.fields.length > 6 ? ", ..." : ""})`);
  if (typeof d.value === "string") bits.push(label(d.value));
  if (typeof d.created === "number") bits.push(`+${d.created} new, ${d.updated ?? 0} filled`);
  if (d.automatic) bits.push("(automatic)");
  return bits.join(" ");
}

export function ActivityList({ items, showEntity = true }: { items: Activity[]; showEntity?: boolean }) {
  if (!items.length) return <EmptyState padded={false} title="Nothing yet" description="Every change made here will be listed." />;
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => {
        const href = showEntity ? hrefFor(a) : null;
        const text = describe(a);
        return (
          <li key={a.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
            <div className="min-w-0">
              {href ? (
                <Link href={href} className="text-foreground hover:text-primary">
                  {text}
                </Link>
              ) : (
                <span className="text-foreground">{text}</span>
              )}
              <span className="ml-2 text-xs text-muted-foreground/70">
                {a.actorEmail}
                {a.actorRole ? ` · ${roleLabel(a.actorRole)}` : ""}
              </span>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground/70" title={fmtDateTime(a.createdAt)}>
              {ago(a.createdAt)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
