// The field-by-field rule for records both FynoLabs and the hub can change (experts, companies,
// jobs, pipelines). Pure functions, fully tested.
//
// For each field, with FynoLabs' value `incoming`, the hub's value `hub`, what the sync last wrote
// there (`written`, from hub.legacy_map) and, for experts, what the Engine copy would have written:
//   1. FynoLabs has no value                    -> keep the hub's (the sync never blanks a field)
//   2. the hub already has FynoLabs' value       -> nothing to do (and the sync now "owns" it)
//   3. the sync wrote this field before          -> update it only if the hub still has that value;
//                                                   otherwise someone changed it in the hub: keep
//   4. the hub field is empty                    -> fill it
//   5. the hub has Engine's value                -> FynoLabs wins (the curated record)
//   6. anything else (a team edit, an expert's own answer) -> keep
// Lists (skills, languages, tags) that are kept still gain FynoLabs' new items.
import { canonical } from "@/lib/import/engine/hub";

export type Json = unknown;
export const same = (a: Json, b: Json) => canonical(a ?? null) === canonical(b ?? null);

/** Empty, or the default a field has before anyone fills it in. */
export function isBlank(v: Json, blank: readonly Json[] = []): boolean {
  if (v == null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return blank.some((b) => same(b, v));
}

export type Decision = "own" | "set" | "keep" | "skip";

export function decide(f: { hub: Json; incoming: Json; hasWritten: boolean; written?: Json; engine?: Json; blank?: readonly Json[] }): Decision {
  if (isBlank(f.incoming, f.blank)) return "skip";
  if (same(f.hub, f.incoming)) return "own";
  if (f.hasWritten) return same(f.hub, f.written) ? "set" : "keep";
  if (isBlank(f.hub, f.blank)) return "set";
  if (f.engine !== undefined && !isBlank(f.engine, f.blank) && same(f.hub, f.engine)) return "set";
  return "keep";
}

/** Items of `extra` not in `base` (case-insensitive), appended. */
export function union(base: string[], extra: string[]): string[] {
  const out = [...base];
  for (const x of extra) if (!out.some((o) => o.toLowerCase() === x.toLowerCase())) out.push(x);
  return out;
}

export type MergeResult = { patch: Record<string, Json>; written: Record<string, Json>; kept: string[] };

/**
 * Applies decide() to every field. `lists` are unioned when kept. Returns the patch for the hub row,
 * the new `written` values (to store in legacy_map) and the fields kept because of a hub edit.
 */
export function mergeFields(
  hub: Record<string, Json>,
  incoming: Record<string, Json>,
  written: Record<string, Json> | null | undefined,
  opts: { engine?: Record<string, Json>; blanks?: Record<string, readonly Json[]>; lists?: readonly string[] } = {},
): MergeResult {
  const patch: Record<string, Json> = {};
  const next: Record<string, Json> = { ...(written ?? {}) };
  const kept: string[] = [];
  for (const f of Object.keys(incoming)) {
    const d = decide({
      hub: hub[f],
      incoming: incoming[f],
      hasWritten: Boolean(written && f in written),
      written: written?.[f],
      engine: opts.engine && f in opts.engine ? opts.engine[f] : undefined,
      blank: opts.blanks?.[f],
    });
    if (d === "own") next[f] = incoming[f];
    else if (d === "set") {
      patch[f] = incoming[f];
      next[f] = incoming[f];
    } else if (d === "keep") {
      kept.push(f);
      if (opts.lists?.includes(f) && Array.isArray(hub[f]) && Array.isArray(incoming[f])) {
        const u = union(hub[f] as string[], incoming[f] as string[]);
        if (u.length !== (hub[f] as string[]).length) patch[f] = u;
      }
    }
  }
  return { patch, written: next, kept };
}
