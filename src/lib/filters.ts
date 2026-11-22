// Reading list filters from the URL (?q=...&domain=...) and writing them back.
import { AVAILABILITY, CV_CONSENT, EXPERT_STATUSES, SOURCES, isOneOf } from "@/lib/constants";
import { splitSkills } from "@/lib/match/dictionary";

export type SearchParams = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "").trim();

export type ExpertFilters = {
  q: string;
  domain: string;
  skills: string[];
  country: string;
  status: string;
  availability: string;
  consent: string;
  source: string;
  tag: string;
  minYears: number | null;
  sort: string;
  dir: "asc" | "desc";
  page: number;
};

export const EXPERT_SORTS = ["name", "domain", "country", "years", "status", "updated", "created", "rank"] as const;

export function parseExpertFilters(sp: SearchParams): ExpertFilters {
  const minYears = Number(one(sp.minYears));
  const sort = one(sp.sort);
  const q = one(sp.q).slice(0, 200);
  return {
    q,
    domain: one(sp.domain),
    skills: splitSkills(one(sp.skills)),
    country: one(sp.country),
    status: isOneOf(EXPERT_STATUSES, one(sp.status)) ? one(sp.status) : "",
    availability: isOneOf(AVAILABILITY, one(sp.availability)) ? one(sp.availability) : "",
    consent: isOneOf(CV_CONSENT, one(sp.consent)) ? one(sp.consent) : "",
    source: isOneOf(SOURCES, one(sp.source)) ? one(sp.source) : "",
    tag: one(sp.tag).toLowerCase(),
    minYears: one(sp.minYears) !== "" && Number.isFinite(minYears) && minYears >= 0 ? Math.floor(minYears) : null,
    sort: (EXPERT_SORTS as readonly string[]).includes(sort) ? sort : q ? "rank" : "updated",
    dir: one(sp.dir) === "asc" ? "asc" : one(sp.dir) === "desc" ? "desc" : sort === "name" ? "asc" : "desc",
    page: Math.max(1, Math.floor(Number(one(sp.page)) || 1)),
  };
}

export function expertFiltersToParams(f: Partial<ExpertFilters>): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.domain) p.set("domain", f.domain);
  if (f.skills?.length) p.set("skills", f.skills.join(", "));
  if (f.country) p.set("country", f.country);
  if (f.status) p.set("status", f.status);
  if (f.availability) p.set("availability", f.availability);
  if (f.consent) p.set("consent", f.consent);
  if (f.source) p.set("source", f.source);
  if (f.tag) p.set("tag", f.tag);
  if (f.minYears != null) p.set("minYears", String(f.minYears));
  if (f.sort) p.set("sort", f.sort);
  if (f.dir) p.set("dir", f.dir);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  return p;
}

/** Same URL with some params changed (null removes one). */
export function hrefWith(path: string, sp: SearchParams, changes: Record<string, string | number | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = one(v);
    if (val) p.set(k, val);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v == null || v === "") p.delete(k);
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}
