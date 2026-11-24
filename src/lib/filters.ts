// Reading list filters from the URL (?q=...&domain=...) and writing them back.
import { AVAILABILITY, CV_CONSENT, EXPERT_STATUSES, OUTREACH_STATUSES, PIPELINE_STAGES, SOURCE_CHANNELS, SOURCES, isOneOf } from "@/lib/constants";
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
  // The FynoLabs admin's workflow filters (owner, outreach, pipelines, next action, how they came in).
  /** "me", "none" or a team member id (the expert's owner). */
  owner?: string;
  outreach?: string;
  /** Has a pipeline on this job / a job of this project / this track / at this stage. */
  job?: string;
  project?: string;
  track?: string;
  stage?: string;
  /** Next action due: overdue, today, week (the next 7 days). */
  due?: string;
  /** How they first reached FynoLabs (source_channel). */
  channel?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOr = (v: string) => (UUID_RE.test(v) ? v.toLowerCase() : "");
export const DUE_FILTERS = ["overdue", "today", "week"] as const;

export const EXPERT_SORTS = ["name", "domain", "country", "years", "status", "updated", "created", "rank", "next", "activity"] as const;

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
    owner: one(sp.owner) === "me" || one(sp.owner) === "none" ? one(sp.owner) : uuidOr(one(sp.owner)),
    outreach: isOneOf(OUTREACH_STATUSES, one(sp.outreach)) ? one(sp.outreach) : "",
    job: uuidOr(one(sp.job)),
    project: uuidOr(one(sp.project)),
    track: uuidOr(one(sp.track)),
    stage: isOneOf(PIPELINE_STAGES, one(sp.stage)) ? one(sp.stage) : "",
    due: isOneOf(DUE_FILTERS, one(sp.due)) ? one(sp.due) : "",
    channel: isOneOf(SOURCE_CHANNELS, one(sp.channel)) ? one(sp.channel) : "",
  };
}

/** True when any filter (not sort or page) is set. */
export function hasExpertFilters(f: ExpertFilters): boolean {
  return Boolean(f.q || f.domain || f.skills.length || f.country || f.status || f.availability || f.consent || f.source || f.tag || f.minYears != null || f.owner || f.outreach || f.job || f.project || f.track || f.stage || f.due || f.channel);
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
  for (const k of ["owner", "outreach", "job", "project", "track", "stage", "due", "channel"] as const) if (f[k]) p.set(k, f[k] as string);
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
