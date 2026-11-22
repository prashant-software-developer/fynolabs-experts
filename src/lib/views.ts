// Saved views for the experts list: what a view stores (filters, sort, columns, layout) and how it
// maps to and from the URL, so every view is a plain link. Pure functions, tested.
import { one, type SearchParams } from "@/lib/filters";

export const EXPERT_COLUMNS = [
  { id: "domain", label: "Domain", sort: "domain" },
  { id: "skills", label: "Skills" },
  { id: "country", label: "Country", sort: "country" },
  { id: "years", label: "Years", sort: "years" },
  { id: "status", label: "Status", sort: "status" },
  { id: "availability", label: "Availability" },
  { id: "consent", label: "CV consent", header: "Consent" },
  { id: "source", label: "Source" },
  { id: "email", label: "Email" },
  { id: "university", label: "University" },
  { id: "degree", label: "Degree" },
  { id: "hours", label: "Hours / week" },
  { id: "updated", label: "Updated", sort: "updated" },
  { id: "added", label: "Added", sort: "created" },
] as const;
export type ColumnId = (typeof EXPERT_COLUMNS)[number]["id"];
const COLUMN_IDS = EXPERT_COLUMNS.map((c) => c.id) as readonly string[];

/** Name is always shown; these are on until someone changes the columns (they fit a 1280px screen). */
export const DEFAULT_COLUMNS: ColumnId[] = ["domain", "skills", "country", "years", "status", "availability", "consent"];

export const FILTER_KEYS = ["q", "domain", "skills", "country", "status", "availability", "consent", "source", "tag", "minYears"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export const LAYOUTS = ["table", "board"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export type ViewConfig = {
  filters: Partial<Record<FilterKey, string>>;
  sort: { by: string; dir: "asc" | "desc" } | null;
  columns: ColumnId[];
  layout: Layout;
};

/** URL keys that belong to a view (everything else, like page or the open panel, doesn't). */
export const VIEW_PARAM_KEYS = [...FILTER_KEYS, "sort", "dir", "cols", "layout"] as const;

/** "domain,skills" -> known columns in table order; "-" means none; missing means the defaults. */
export function parseColumns(raw: string | undefined | null): ColumnId[] {
  if (raw == null || raw.trim() === "") return [...DEFAULT_COLUMNS];
  if (raw.trim() === "-") return [];
  const wanted = new Set(raw.split(",").map((s) => s.trim()));
  return EXPERT_COLUMNS.map((c) => c.id).filter((id) => wanted.has(id));
}

export function serializeColumns(cols: readonly string[]): string {
  const clean = EXPERT_COLUMNS.map((c) => c.id).filter((id) => cols.includes(id));
  return clean.length ? clean.join(",") : "-";
}

const isDefaultColumns = (cols: readonly string[]) => serializeColumns(cols) === serializeColumns(DEFAULT_COLUMNS);

export function parseLayout(raw: string | undefined | null): Layout {
  return raw === "board" ? "board" : "table";
}

export function parsePageSize(raw: string | undefined | null): number {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

export function configFromParams(sp: SearchParams): ViewConfig {
  const filters: ViewConfig["filters"] = {};
  for (const k of FILTER_KEYS) {
    const v = one(sp[k]).slice(0, 200);
    if (v) filters[k] = v;
  }
  const by = one(sp.sort);
  const dir = one(sp.dir);
  return {
    filters,
    sort: by ? { by, dir: dir === "asc" ? "asc" : "desc" } : null,
    columns: parseColumns(sp.cols === undefined ? undefined : one(sp.cols)),
    layout: parseLayout(one(sp.layout)),
  };
}

/** Cleans whatever is stored in the jsonb column, so an old or hand-edited view can't break the page. */
export function normalizeConfig(raw: unknown): ViewConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (r.filters && typeof r.filters === "object" ? r.filters : {}) as Record<string, unknown>;
  const filters: ViewConfig["filters"] = {};
  for (const k of FILTER_KEYS) if (typeof f[k] === "string" && (f[k] as string).trim()) filters[k] = (f[k] as string).trim().slice(0, 200);
  const s = (r.sort && typeof r.sort === "object" ? r.sort : null) as { by?: unknown; dir?: unknown } | null;
  const sort = s && typeof s.by === "string" && s.by ? { by: s.by, dir: s.dir === "asc" ? ("asc" as const) : ("desc" as const) } : null;
  const columns = Array.isArray(r.columns) ? EXPERT_COLUMNS.map((c) => c.id).filter((id) => (r.columns as unknown[]).includes(id)) : [...DEFAULT_COLUMNS];
  return { filters, sort, columns, layout: parseLayout(typeof r.layout === "string" ? r.layout : null) };
}

export function paramsFromConfig(c: ViewConfig): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = c.filters[k];
    if (v) p.set(k, v);
  }
  if (c.sort) {
    p.set("sort", c.sort.by);
    p.set("dir", c.sort.dir);
  }
  if (!isDefaultColumns(c.columns)) p.set("cols", serializeColumns(c.columns));
  if (c.layout !== "table") p.set("layout", c.layout);
  return p;
}

export function sameConfig(a: ViewConfig, b: ViewConfig): boolean {
  const s = (c: ViewConfig) => {
    const p = paramsFromConfig(c);
    p.sort();
    return p.toString();
  };
  return s(a) === s(b);
}

/** True when the URL says nothing about filters, sort, columns or layout. */
export function hasViewParams(sp: SearchParams): boolean {
  return VIEW_PARAM_KEYS.some((k) => one(sp[k]) !== "" || (k === "cols" && sp.cols !== undefined));
}

/** The link for a saved view (or the built-in "All experts" when id is null). */
export function viewHref(id: string | null, c: ViewConfig, extra?: Record<string, string>): string {
  const p = paramsFromConfig(c);
  if (id) p.set("v", id);
  for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/experts?${s}` : "/experts";
}

export const EMPTY_CONFIG: ViewConfig = { filters: {}, sort: null, columns: [...DEFAULT_COLUMNS], layout: "table" };
