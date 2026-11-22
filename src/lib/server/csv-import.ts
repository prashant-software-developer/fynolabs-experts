// CSV import (Talent register, old admin CRM export): preview first, then apply the same plan.
import type { DB } from "@/db/client";
import { parseCsv } from "@/lib/csv";
import { crmColumnMap, mapCrmRow } from "@/lib/import/crm";
import { detectKind, type ImportKind } from "@/lib/import/detect";
import { planImport, type ImportPlan, type PlanAction } from "@/lib/import/plan";
import { mapRegisterRow } from "@/lib/import/register";
import type { DraftRow } from "@/lib/import/types";
import { logActivity } from "./activity";
import { applyPlan, loadIndex } from "./import-apply";

export const MAX_IMPORT_ROWS = 5000;

export type CsvPreview =
  | { ok: false; message: string }
  | {
      ok: true;
      kind: ImportKind;
      headers: string[];
      mapped: Record<string, string>;
      counts: Record<PlanAction, number>;
      rows: { row: number; name: string; email: string | null; action: PlanAction; reason: string; warnings: string[] }[];
      parseErrors: string[];
    };

export function draftsFromCsv(text: string, requested: ImportKind | "auto"): { kind: ImportKind; drafts: DraftRow[]; headers: string[]; mapped: Record<string, string>; errors: string[] } | { error: string } {
  const parsed = parseCsv(text);
  if (!parsed.headers.length) return { error: "The file has no header row." };
  if (parsed.rows.length > MAX_IMPORT_ROWS) return { error: `Up to ${MAX_IMPORT_ROWS} rows per import (this file has ${parsed.rows.length}). Split it.` };
  const kind = requested === "auto" ? detectKind(parsed.headers) : requested;
  if (!kind) return { error: "Couldn't tell what this file is. It needs a Name column; pick the format by hand." };
  if (kind === "register") {
    const mapped = Object.fromEntries(parsed.headers.map((h) => [h, h]));
    return { kind, headers: parsed.headers, mapped, errors: parsed.errors, drafts: parsed.rows.map((r, i) => mapRegisterRow(r, i + 2)) };
  }
  const columns = crmColumnMap(parsed.headers);
  if (!Object.values(columns).includes("name")) return { error: "No Name column found." };
  return { kind, headers: parsed.headers, mapped: columns, errors: parsed.errors, drafts: parsed.rows.map((r, i) => mapCrmRow(r, i + 2, columns)) };
}

async function plan(db: DB, text: string, kind: ImportKind | "auto", nameMatch: "review" | "merge") {
  const d = draftsFromCsv(text, kind);
  if ("error" in d) return d;
  return { ...d, plan: planImport(d.drafts, await loadIndex(db), { nameMatch }) as ImportPlan };
}

export async function previewCsv(db: DB, text: string, kind: ImportKind | "auto", nameMatch: "review" | "merge"): Promise<CsvPreview> {
  const p = await plan(db, text, kind, nameMatch);
  if ("error" in p) return { ok: false, message: p.error };
  return {
    ok: true,
    kind: p.kind,
    headers: p.headers,
    mapped: p.mapped,
    counts: p.plan.counts,
    parseErrors: p.errors,
    rows: p.plan.rows.slice(0, 500).map((r) => ({ row: r.row, name: r.name, email: r.email, action: r.action, reason: r.reason, warnings: r.warnings })),
  };
}

export async function applyCsv(db: DB, text: string, kind: ImportKind | "auto", nameMatch: "review" | "merge", actor: string) {
  const p = await plan(db, text, kind, nameMatch);
  if ("error" in p) return { ok: false as const, message: p.error };
  const res = await applyPlan(db, p.plan, actor);
  await logActivity(db, {
    entityType: "import",
    entityId: p.kind,
    actor,
    action: "csv_import",
    detail: { kind: p.kind, rows: p.plan.rows.length, created: res.created, updated: res.updated, unchanged: res.unchanged, duplicates: res.duplicates, skipped: res.skipped },
  });
  return { ok: true as const, kind: p.kind, created: res.created, updated: res.updated, unchanged: res.unchanged, duplicates: res.duplicates, skipped: res.skipped };
}
