// `npm run sync:fynolabs`, the library part (scripts/sync-fynolabs.ts parses arguments and opens
// the database). Three steps:
//   1. ask the hub-sync edge function (FynoLabs' Supabase) how many rows each table has;
//   2. have it copy every table, then the stored files, into fynolabs_copy (it resumes from a
//      cursor, about 100 s per call), until every table is done;
//   3. fold fynolabs_copy into the hub's tables (map.ts), then check the counts.
// A dry run only does step 1 and reads the counts already in the hub: nothing is copied or mapped.
// The token and the database address never appear in anything printed or saved.
import type { SqlRunner } from "@/lib/import/engine/source";
import { hubCountsBySource, syncFynolabsIntoHub, type MapResult } from "./map";
import { one, rows, tableExists, type TableCounts } from "./sql";
import { COPY_SCHEMA, FYNOLABS_MAP } from "./tables";

export const DEFAULT_SYNC_URL = "https://kmnlyniplnkwfkbhehei.supabase.co/functions/v1/hub-sync";

export class SyncHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SyncHttpError";
  }
}

type Fetch = typeof fetch;
export type SourceCount = { table: string; rows: number };
export type CopyCount = { table: string; calls: number; copied: number; inserted: number; updated: number; leftOut: number; purged: number; newColumns: number };

/** A message that never contains the token or a database address. */
export function scrub(text: string, secrets: (string | undefined | null)[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s || s.length < 6) continue;
    out = out.split(s).join("***");
    try {
      const pw = decodeURIComponent(new URL(s).password);
      if (pw) out = out.split(pw).join("***");
    } catch {
      /* not a URL */
    }
  }
  return out.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "(database address)").replace(/npg_[A-Za-z0-9]+/g, "***");
}

function explain(status: number, body: Record<string, unknown> | null): string {
  if (status === 401) return "The FynoLabs side refused the token (401). FYNOLABS_SYNC_TOKEN in .env.local must be exactly the HUB_SYNC_TOKEN secret in Lovable (Cloud -> Secrets).";
  if (status === 404) return "The hub-sync function isn't there yet (404). Push the main site so Lovable deploys supabase/functions/hub-sync, then run this again.";
  const code = body && typeof body.code === "string" ? ` [${body.code}]` : "";
  const msg = body && typeof body.message === "string" ? `: ${body.message}` : body && typeof body.error === "string" ? `: ${body.error}` : "";
  return `The FynoLabs side answered ${status}${code}${msg}`;
}

export async function call(fetchFn: Fetch, url: string, token: string, params: Record<string, string>, method: "GET" | "POST"): Promise<Record<string, unknown>> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetchFn(u.toString(), { method, headers: { "x-hub-sync-token": token, "content-type": "application/json" } });
  } catch (e) {
    throw new SyncHttpError(`Couldn't reach the FynoLabs side (${scrub(e instanceof Error ? e.message : String(e), [token])}). Check the internet connection and FYNOLABS_SYNC_URL.`, 0);
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!res.ok || !body) throw new SyncHttpError(explain(res.status, body), res.status);
  return body;
}

export type RunOptions = {
  url: string;
  token: string;
  dryRun: boolean;
  fetch?: Fetch;
  /** The hub's database (for the counts, and the mapping in a real run). */
  raw: SqlRunner | null;
  /** Hub migrations: run first in a real run. */
  migrate?: () => Promise<void>;
  actorEmail: string;
  log?: (line: string) => void;
  runId?: string;
  /** Per-call time budget asked of the edge function (default: its own, ~100 s). */
  budgetMs?: number;
  /** A table that never finishes would loop forever: stop after this many calls per table. */
  maxCalls?: number;
};

export type RunResult = { ok: boolean; dryRun: boolean; problems: string[]; source: SourceCount[]; copy: CopyCount[]; map: MapResult | null; report: string; ms: number };

export async function runSync(o: RunOptions): Promise<RunResult> {
  const started = Date.now();
  const f = o.fetch ?? fetch;
  const log = o.log ?? (() => {});
  const run = o.runId ?? `run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  const extra: Record<string, string> = { run, ...(o.budgetMs ? { budget_ms: String(o.budgetMs) } : {}) };
  log("Asking FynoLabs for its table counts...");
  const t = await call(f, o.url, o.token, { op: "tables" }, "GET");
  const source = (Array.isArray(t.tables) ? t.tables : []) as SourceCount[];
  const copy: CopyCount[] = [];
  let map: MapResult | null = null;
  const problems: string[] = [];

  if (!o.dryRun) {
    if (!o.raw) throw new Error("A real run needs the hub's database (DATABASE_URL).");
    if (o.migrate) {
      log("Hub tables up to date (migrations)...");
      await o.migrate();
    }
    for (const s of source) {
      const isStorage = s.table === "storage_objects";
      const c: CopyCount = { table: s.table, calls: 0, copied: 0, inserted: 0, updated: 0, leftOut: 0, purged: 0, newColumns: 0 };
      let cursor: string | null = null;
      do {
        if (c.calls >= (o.maxCalls ?? 10_000)) throw new Error(`The copy of ${s.table} didn't finish after ${c.calls} calls.`);
        const r = await call(f, o.url, o.token, { op: isStorage ? "storage" : "copy", ...(isStorage ? {} : { table: s.table }), ...(cursor ? { cursor } : {}), ...extra }, "POST");
        c.calls++;
        c.copied += Number(r.copied ?? 0);
        c.inserted += Number(r.inserted ?? 0);
        c.updated += Number(r.updated ?? 0);
        c.leftOut += Number(r.left_out ?? 0);
        c.purged += Number(r.purged ?? 0);
        c.newColumns += Number(r.new_columns ?? 0);
        cursor = typeof r.next_cursor === "string" && r.next_cursor ? r.next_cursor : null;
        if (cursor) log(`  ${s.table}: ${c.copied.toLocaleString("en-US")} of ${s.rows.toLocaleString("en-US")} so far...`);
      } while (cursor);
      copy.push(c);
      log(`  ${s.table}: ${c.copied.toLocaleString("en-US")} ${isStorage ? "files copied" : "rows"} (${c.inserted} new, ${c.updated} changed${c.leftOut ? `, ${c.leftOut} left out: deleted on request` : ""})`);
    }
    log("Folding the copy into the hub's tables...");
    map = await syncFynolabsIntoHub(o.raw, { actorEmail: o.actorEmail, log });
  }

  // The counts: FynoLabs, fynolabs_copy, hub.
  const copyRows = new Map<string, number>();
  if (o.raw) {
    for (const s of source) {
      const name = s.table;
      if (await tableExists(o.raw, `${COPY_SCHEMA}.${name}`)) copyRows.set(name, await one(o.raw, `select count(*)::int as n from ${COPY_SCHEMA}."${name}"`));
    }
  }
  const hubBy = o.raw ? await hubCountsBySource(o.raw) : new Map<string, number>();
  if (!o.dryRun) {
    for (const s of source) {
      const c = copy.find((x) => x.table === s.table);
      const have = copyRows.get(s.table) ?? 0;
      const expected = s.rows - (c?.leftOut ?? 0);
      if (have < expected) problems.push(`fynolabs_copy.${s.table} has ${have} rows; FynoLabs has ${s.rows}${c?.leftOut ? ` (${c.leftOut} left out)` : ""}. Run again; if it repeats, send Claude the log.`);
    }
    for (const m of map?.tables ?? []) {
      if (m.source === "storage_objects" || m.note === "not copied yet") continue;
      const gap = m.copyRows - m.hubRows - m.skipped - m.removedInHub;
      if (gap !== 0) problems.push(`${m.source} -> hub.${m.hub}: ${gap} rows are neither in the hub nor explained (skipped, deleted in the hub).`);
    }
  }
  const result: RunResult = { ok: problems.length === 0, dryRun: o.dryRun, problems, source, copy, map, report: "", ms: Date.now() - started };
  result.report = formatReport(result, copyRows, hubBy, new Date());
  return result;
}

// ---------------------------------------------------------------- the report (counts only)

const n = (v: number | undefined) => (v == null ? "-" : v.toLocaleString("en-US"));

function grid(rows_: string[][]): string {
  const widths = rows_[0].map((_, i) => Math.max(...rows_.map((r) => (r[i] ?? "").length)));
  return rows_.map((r) => r.map((c, i) => (i === 0 || i === 1 || i === r.length - 1 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("   ").trimEnd()).join("\n");
}

function notesFor(m: TableCounts | undefined, c: CopyCount | undefined): string {
  const parts: string[] = [];
  if (c?.leftOut) parts.push(`${n(c.leftOut)} left out (deleted on request)`);
  if (m) {
    if (m.inserted || m.updated) parts.push(`${n(m.inserted)} new, ${n(m.updated)} updated`);
    if (m.kept) parts.push(`${n(m.kept)} edited in the hub (kept)`);
    if (m.merged) parts.push(`${n(m.merged)} merged into another record`);
    if (m.skipped) parts.push(`${n(m.skipped)} skipped (person not in the hub)`);
    if (m.removedInHub) parts.push(`${n(m.removedInHub)} deleted in the hub (not brought back)`);
    if (m.note) parts.push(m.note);
  }
  return parts.join("; ");
}

export function formatReport(r: RunResult, copyRows: Map<string, number>, hubBy: Map<string, number>, at: Date): string {
  const stamp = at.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const took = r.ms >= 60_000 ? `${Math.floor(r.ms / 60_000)} min ${Math.round((r.ms % 60_000) / 1000)} s` : `${Math.round(r.ms / 1000)} s`;
  const lines = [`${r.dryRun ? "DRY RUN (nothing copied or changed)" : "FynoLabs -> Expert Hub"}, ${stamp}${r.dryRun ? "" : `, took ${took}`}`, ""];
  const table: string[][] = [["FynoLabs table", "hub table", "FynoLabs", "fynolabs_copy", "hub", "Notes"]];
  const mapped = new Map((r.map?.tables ?? []).map((m) => [m.source, m]));
  for (const s of r.source) {
    const m = mapped.get(s.table);
    const c = r.copy.find((x) => x.table === s.table);
    const land = FYNOLABS_MAP[s.table];
    const hub = m ? m.hubRows : hubBy.get(s.table);
    table.push([s.table, land ? land.hub : "(copied only)", n(s.rows), n(copyRows.get(s.table)), n(hub), r.dryRun ? (land ? land.note : "new FynoLabs table: copied, not mapped yet") : notesFor(m, c) || (land ? "" : "new FynoLabs table: copied, not mapped yet")]);
  }
  lines.push(grid(table), "");
  if (r.map) lines.push(`Files: ${n(r.map.files.linked)} CVs and documents linked to experts (bytes stored once, in fynolabs_copy).`);
  if (r.dryRun) lines.push("Dry run: nothing was copied or changed. Check the numbers, then run it for real.");
  else if (r.problems.length) {
    lines.push(`CHECK FAILED: ${r.problems.length} problem(s):`);
    for (const p of r.problems) lines.push(`  - ${p}`);
  } else lines.push("CHECK OK: every FynoLabs row is in fynolabs_copy, and every copied row is in the hub or explained above.");
  return lines.join("\n");
}

// ---------------------------------------------------------------- arguments

export type SyncArgs = { dryRun: boolean; logFile: string | null; help: boolean; unknown: string[] };

export function parseSyncArgs(argv: readonly string[]): SyncArgs {
  const a: SyncArgs = { dryRun: false, logFile: null, help: false, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--dry-run") a.dryRun = true;
    else if (x === "--log-file") a.logFile = argv[++i] ?? null;
    else if (x.startsWith("--log-file=")) a.logFile = x.slice("--log-file=".length);
    else if (x === "--help" || x === "-h") a.help = true;
    else a.unknown.push(x);
  }
  return a;
}

export { rows };
