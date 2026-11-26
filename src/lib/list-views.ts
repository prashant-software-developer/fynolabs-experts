// Saved views, columns and paging for the CRM lists (Accounts, Leads), the same idea as the
// Experts list (src/lib/views.ts): a view stores the filters (the built-in tab included), the
// columns and the layout, and maps to and from the URL so every view is a plain link. Pure, tested.
import { one, type SearchParams } from "@/lib/filters";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "@/lib/views";

export type ListColumn = { id: string; label: string };

export type ListSpec = {
  collection: "accounts" | "leads";
  path: string;
  /** URL keys that are filters (the built-in tab is one of them). */
  filterKeys: readonly string[];
  columns: readonly ListColumn[];
  defaultColumns: readonly string[];
  /** The first column, always shown. */
  fixed: string;
};

export type ListViewConfig = {
  filters: Record<string, string>;
  sort: null;
  columns: string[];
  layout: "table" | "board";
};

export const ACCOUNT_LIST: ListSpec = {
  collection: "accounts",
  path: "/admin/accounts",
  filterKeys: ["tab", "q", "kind", "stage", "owner", "line", "tag"],
  fixed: "Account",
  columns: [
    { id: "stage", label: "Stage" },
    { id: "owner", label: "Owner" },
    { id: "next", label: "Next step" },
    { id: "due", label: "Due" },
    { id: "route", label: "Route" },
    { id: "kind", label: "Type" },
    { id: "line", label: "Business line" },
    { id: "priority", label: "Priority" },
    { id: "tags", label: "Tags" },
    { id: "people", label: "People" },
    { id: "location", label: "Location" },
    { id: "activity", label: "Last activity" },
    { id: "added", label: "Added" },
    { id: "updated", label: "Updated" },
  ],
  defaultColumns: ["stage", "owner", "next", "due", "route"],
};

export const LEAD_LIST: ListSpec = {
  collection: "leads",
  path: "/admin/leads",
  filterKeys: ["tab", "q", "stage", "kind", "source", "company", "followUp"],
  fixed: "Person",
  columns: [
    { id: "role", label: "Role" },
    { id: "account", label: "Account" },
    { id: "stage", label: "Stage" },
    { id: "email", label: "Email / profile" },
    { id: "kind", label: "Type" },
    { id: "source", label: "Source" },
    { id: "followUp", label: "Next follow-up" },
    { id: "added", label: "Added" },
    { id: "updated", label: "Updated" },
  ],
  defaultColumns: ["role", "account", "stage", "email", "source", "followUp"],
};

export const LIST_SPECS = { accounts: ACCOUNT_LIST, leads: LEAD_LIST } as const;
export const isListCollection = (c: string): c is ListSpec["collection"] => c === "accounts" || c === "leads";

/** The cookie that remembers one person's columns for a list (set by the Columns picker). */
export const columnsCookie = (collection: string) => `hub_cols_${collection}`;

/** URL keys that belong to a view (page, size, the open panel and flashes don't). */
export const listViewKeys = (s: ListSpec) => [...s.filterKeys, "cols", "layout"];

/** "stage,owner" -> known columns in table order; "-" means none; missing means the defaults. */
export function parseListColumns(s: ListSpec, raw: string | undefined | null): string[] {
  if (raw == null || raw.trim() === "") return [...s.defaultColumns];
  if (raw.trim() === "-") return [];
  const wanted = new Set(raw.split(",").map((x) => x.trim()));
  return s.columns.map((c) => c.id).filter((id) => wanted.has(id));
}

export function serializeListColumns(s: ListSpec, cols: readonly string[]): string {
  const clean = s.columns.map((c) => c.id).filter((id) => cols.includes(id));
  return clean.length ? clean.join(",") : "-";
}

const isDefault = (s: ListSpec, cols: readonly string[]) => serializeListColumns(s, cols) === serializeListColumns(s, s.defaultColumns);

/** The view config the URL describes. `cookieCols`: the person's remembered columns, used when the URL has none. */
export function listConfigFromParams(s: ListSpec, sp: SearchParams, cookieCols?: string | null): ListViewConfig {
  const filters: Record<string, string> = {};
  for (const k of s.filterKeys) {
    const v = one(sp[k]).slice(0, 200);
    if (v) filters[k] = v;
  }
  const cols = sp.cols !== undefined ? one(sp.cols) : (cookieCols ?? undefined);
  return { filters, sort: null, columns: parseListColumns(s, cols), layout: one(sp.layout) === "board" ? "board" : "table" };
}

/** Cleans whatever is stored in the jsonb column, so an old or hand-edited view can't break the page. */
export function normalizeListConfig(s: ListSpec, raw: unknown): ListViewConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (r.filters && typeof r.filters === "object" ? r.filters : {}) as Record<string, unknown>;
  const filters: Record<string, string> = {};
  for (const k of s.filterKeys) if (typeof f[k] === "string" && (f[k] as string).trim()) filters[k] = (f[k] as string).trim().slice(0, 200);
  const columns = Array.isArray(r.columns) ? s.columns.map((c) => c.id).filter((id) => (r.columns as unknown[]).includes(id)) : [...s.defaultColumns];
  return { filters, sort: null, columns, layout: r.layout === "board" ? "board" : "table" };
}

export function listParamsFromConfig(s: ListSpec, c: ListViewConfig): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of s.filterKeys) if (c.filters[k]) p.set(k, c.filters[k]);
  if (!isDefault(s, c.columns)) p.set("cols", serializeListColumns(s, c.columns));
  if (c.layout === "board") p.set("layout", "board");
  return p;
}

export function sameListConfig(s: ListSpec, a: ListViewConfig, b: ListViewConfig): boolean {
  const k = (c: ListViewConfig) => {
    const p = listParamsFromConfig(s, c);
    p.sort();
    return p.toString();
  };
  return k(a) === k(b);
}

/** True when the URL says nothing about filters, columns or layout (a bare ?v= link). */
export function hasListViewParams(s: ListSpec, sp: SearchParams): boolean {
  return listViewKeys(s).some((k) => one(sp[k]) !== "" || (k === "cols" && sp.cols !== undefined));
}

/** The link for a saved view (id), or for the list itself with that config (id null). */
export function listViewHref(s: ListSpec, id: string | null, c: ListViewConfig, extra?: Record<string, string | undefined>): string {
  const p = listParamsFromConfig(s, c);
  if (id) p.set("v", id);
  for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v);
  const q = p.toString();
  return q ? `${s.path}?${q}` : s.path;
}

/** Paging over a list held in memory: the page asked for (clamped), its rows and the page count. */
export function pageOf<T>(rows: T[], pageRaw: string | undefined | null, sizeRaw: string | undefined | null) {
  const size = (PAGE_SIZES as readonly number[]).includes(Number(sizeRaw)) ? Number(sizeRaw) : DEFAULT_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const asked = Math.floor(Number(pageRaw));
  const page = Number.isFinite(asked) && asked >= 1 ? Math.min(asked, pages) : 1;
  return { page, size, pages, total: rows.length, rows: rows.slice((page - 1) * size, page * size) };
}
