// Saved views as tabs (GoHighLevel "Smart Lists"), one row for every list: the built-in tabs first
// (Pipeline / Due now…, Open / Won…, All experts), then the saved views (mine first, then the
// team's), then "+ Save view". With a saved view open: "Unsaved changes · Update view · Delete view".
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Checkbox, Input } from "@/components/ui/field";
import { Popover, SubmitButton } from "@/components/ui/client";
import { cn } from "@/components/ui/cn";
import { CountPill } from "@/components/ui/tabs";

type Action = (fd: FormData) => Promise<void>;

export type ViewTab = { href: string; label: string; active: boolean; count?: number | null; shared?: boolean; title?: string };

export function ListViewTabs({
  builtIns,
  views,
  hidden,
  currentParams,
  active,
  canShare,
  save,
  update,
  remove,
  placeholder = "View name, e.g. My hot accounts",
  hint = "Saves the current tab, filters, columns and layout as a tab.",
  inset,
}: {
  builtIns: ViewTab[];
  views: ViewTab[];
  /** Hidden fields every form here sends (e.g. collection). */
  hidden?: Record<string, string>;
  /** The current view config as a query string (what "Save view" and "Update view" store). */
  currentParams: string;
  /** The open saved view, if any. */
  active?: { id: string; name: string; dirty: boolean; manageable: boolean } | null;
  canShare: boolean;
  save: Action;
  update: Action;
  remove: Action;
  placeholder?: string;
  hint?: string;
  /** Inside a list panel (Experts): padded, no gap under it. Default: under the page header. */
  inset?: boolean;
}) {
  const fields = (
    <>
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="params" value={currentParams} />
    </>
  );
  const tab = (t: ViewTab) => (
    <Link
      key={t.href}
      href={t.href}
      aria-current={t.active ? "page" : undefined}
      title={t.title}
      className={cn(
        "-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 text-sm whitespace-nowrap transition-colors",
        t.active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {t.label}
      {t.shared ? <Users className="h-3.5 w-3.5 text-muted-foreground" aria-label="Shared with the team" /> : null}
      {t.count != null ? <CountPill value={t.count} active={t.active} /> : null}
    </Link>
  );
  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border", inset ? "px-4 sm:px-6" : "mb-6")}>
      <nav aria-label="Views" className="-mb-px flex min-w-0 gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {builtIns.map(tab)}
        {views.length ? <span className="my-3 w-px shrink-0 bg-border" aria-hidden /> : null}
        {views.map(tab)}
      </nav>
      <Popover className="relative">
        <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <Plus className="h-3.5 w-3.5" aria-hidden /> Save view
        </summary>
        <form action={save} className="z-40 mt-1 space-y-3 rounded-md border border-border bg-popover p-4 shadow-raised max-sm:fixed max-sm:inset-x-4 sm:absolute sm:left-0 sm:w-80">
          {fields}
          <p className="text-[13px] text-muted-foreground">{hint}</p>
          <Input name="name" placeholder={placeholder} maxLength={60} required aria-label="View name" />
          {canShare ? <Checkbox name="shared" value="yes" label="Share with the team" /> : <p className="text-[13px] text-muted-foreground">Personal view (your role can&apos;t share views).</p>}
          <SubmitButton size="sm" pendingText="Saving…">
            Save view
          </SubmitButton>
        </form>
      </Popover>
      {active ? (
        <div className="ml-auto flex items-center gap-2 py-1.5">
          {active.dirty ? <span className="text-[13px] text-muted-foreground">Unsaved changes</span> : null}
          {active.dirty && active.manageable ? (
            <form action={update}>
              {fields}
              <input type="hidden" name="id" value={active.id} />
              <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
                Update view
              </SubmitButton>
            </form>
          ) : null}
          {active.manageable ? (
            <form action={remove}>
              {Object.entries(hidden ?? {}).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <input type="hidden" name="id" value={active.id} />
              <SubmitButton size="sm" variant="ghost" confirm={`Delete the view "${active.name}"? The records stay as they are.`} className="text-muted-foreground">
                Delete view
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
