// Turns a partner's requirement text (pasted from an email, Slack or a portal) into form fields.
// It only pre-fills: the team always checks and edits the result before saving.
import type { DegreeLevel, Domain } from "@/lib/constants";
import { domainOf, domainScores, findSkills, lookupCountry, lookupUsState, placeLabel } from "./dictionary";

export type ParsedRequirement = {
  title: string;
  externalRef: string | null;
  description: string;
  mustSkills: string[];
  niceSkills: string[];
  domains: Domain[];
  degrees: DegreeLevel[];
  countriesAllowed: string[];
  countriesBlocked: string[];
  minYears: number | null;
  slots: number | null;
  rateNote: string | null;
  deadline: string | null;
  /** Plain-English notes on what was picked up, shown under the form. */
  found: string[];
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100,
};
const NUM = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join("|")})`;
const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s.toLowerCase()] ?? NaN);

const PEOPLE =
  "(?:people|persons|person|experts?|contributors?|candidates?|annotators?|engineers?|reviewers?|trainers?|specialists?|developers?|writers?|profiles?|hires?|seats?|slots?|positions?|openings?|freelancers?|contractors?|evaluators?|raters?|scientists?|mathematicians?|physicists?|doctors?|lawyers?|linguists?|tutors?)";

export function parseSlots(text: string): number | null {
  const patterns = [
    new RegExp(`\\bup to ${NUM}\\s+(?:[\\w'-]+\\s+){0,3}?${PEOPLE}\\b`, "i"),
    new RegExp(`\\bup to ${NUM}\\b`, "i"),
    new RegExp(`\\b(?:headcount|slots|seats|positions|openings|quantity|qty|number of (?:people|experts))\\s*[:=-]?\\s*${NUM}\\b`, "i"),
    new RegExp(`\\b(?:need|needs|needed|hiring|looking for|seeking|require|requires|requesting|staff)\\s+${NUM}\\s+(?:[\\w'-]+\\s+){0,4}?${PEOPLE}\\b`, "i"),
    new RegExp(`(?:^|[\\s(:])${NUM}\\s*x?\\s+(?:[A-Z][\\w'&-]*\\s+){0,5}?${PEOPLE}\\b`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const n = toNum(m[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 500) return n;
    }
  }
  return null;
}

export function parseMinYears(text: string): number | null {
  const Y = "(?:years?|yrs?|yoe)";
  const patterns = [
    new RegExp(`(\\d{1,2})\\s*\\+\\s*${Y}`, "i"),
    new RegExp(`(?:at least|minimum(?: of)?|min\\.?|over|more than|no less than)\\s*(\\d{1,2})\\s*${Y}`, "i"),
    new RegExp(`(\\d{1,2})\\s*(?:or more|plus)\\s*${Y}`, "i"),
    new RegExp(`(\\d{1,2})\\s*(?:-|–|to)\\s*\\d{1,2}\\s*${Y}`, "i"),
    new RegExp(`(\\d{1,2})\\s*${Y}(?:['’]s?)?\\s+(?:of\\s+)?(?:\\w+\\s+){0,3}?(?:experience|exp\\b)`, "i"),
    new RegExp(`experience\\s*[:-]?\\s*(\\d{1,2})\\s*\\+?\\s*${Y}`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const n = Number(m[1]);
      if (n >= 0 && n <= 40) return n;
    }
  }
  return null;
}

export function parseDegrees(text: string): DegreeLevel[] {
  const out: DegreeLevel[] = [];
  if (/\bbachelor'?s|\bb\.?\s?sc\b|\bb\.s\.|\bbs degree\b|\bb\.?tech\b|\bundergraduate degree\b/i.test(text)) out.push("bachelors");
  if (/\bmaster'?s|\bmasters\b|\bm\.?\s?sc\b|\bm\.s\.|\bms degree\b|\bm\.?tech\b|\bgraduate degree\b/i.test(text)) out.push("masters");
  if (/\bph\.?\s?d\.?|\bdoctorate\b|\bdoctoral\b/i.test(text)) out.push("phd");
  return out;
}

export function parseExternalRef(text: string): string | null {
  const m = /\b(SOW|PO|RFP|REQ|Req|Job ID|Requisition)\s*(?:no\.?|number|#)?\s*[#:-]?\s*([A-Z0-9][A-Z0-9-]{2,})\b/.exec(text);
  if (!m) return null;
  return `${m[1].toUpperCase() === "REQ" ? "REQ" : m[1]} ${m[2]}`;
}

export function parseRate(text: string): string | null {
  const m =
    /(?:USD|US\$|\$|€|£|EUR|GBP)\s?\d+(?:[.,]\d+)?(?:\s*(?:-|–|to)\s*(?:USD|US\$|\$|€|£)?\s?\d+(?:[.,]\d+)?)?\s*(?:\/|per\s+|an?\s+)(?:hr|hour|h|task|item|week|month)\b/i.exec(
      text,
    );
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseDeadline(text: string, today = new Date()): string | null {
  const iso = /\b(?:by|deadline|due|before|closes?|until|submit(?:ted)? by|start(?:s|ing)?(?: on| by)?)\b[^.\n]{0,20}?\b(20\d{2})-(\d{2})-(\d{2})\b/i.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const kw = "(?:by|deadline|due|before|closes?|until|submit(?:ted)? by)\\s*[:-]?\\s*(?:\\w+day,?\\s+)?";
  const mon = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
  const a = new RegExp(`${kw}(\\d{1,2})(?:st|nd|rd|th)?\\s+${mon},?\\s*(20\\d{2})?`, "i").exec(text);
  const b = new RegExp(`${kw}${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(20\\d{2})?`, "i").exec(text);
  let day: number, month: number, year: number | null;
  if (a) {
    day = Number(a[1]);
    month = MONTHS.indexOf(a[2].slice(0, 3).toLowerCase());
    year = a[3] ? Number(a[3]) : null;
  } else if (b) {
    month = MONTHS.indexOf(b[1].slice(0, 3).toLowerCase());
    day = Number(b[2]);
    year = b[3] ? Number(b[3]) : null;
  } else return null;
  if (month < 0 || day < 1 || day > 31) return null;
  if (year == null) {
    year = today.getUTCFullYear();
    const candidate = Date.UTC(year, month, day);
    if (candidate < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) year += 1;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const US_ONLY =
  /\b(?:US|U\.S\.|USA|United States)[- ](?:based|only|residents?|located|citizens?)\b|\b(?:based|located|residing|reside|living)\s+in\s+the\s+(?:US|U\.S\.|USA|United States)\b|\b(?:must|need to|should)\s+be\s+(?:in|located in|based in)\s+the\s+(?:US|U\.S\.|USA|United States)\b|\bUS\s*\/\s*remote\b/i;

/** Splits a list like "CA, CT, IL and NY" or "India/Pakistan" into items. */
function splitPlaces(list: string): string[] {
  return list
    .split(/\s*(?:,|;|\/|\band\b|\bor\b|&|\+)\s*/i)
    .map((s) => s.replace(/[()[\]"]/g, "").trim())
    .filter(Boolean);
}

export function parseLocations(text: string): { allowed: string[]; blocked: string[]; notes: string[] } {
  const allowed: string[] = [];
  const blocked: string[] = [];
  const notes: string[] = [];
  const add = (list: string[], v: string) => {
    if (!list.includes(v)) list.push(v);
  };

  const usOnly = US_ONLY.test(text);
  if (usOnly) add(allowed, "United States");

  // "Location: US, UK, Canada" / "Countries: ..." / "Open to: ..." / "Remote (US, UK)"
  const listRe = /\b(?:locations?|countries|country|regions?|open to|eligible(?: countries)?|remote)\s*(?:\(|:|-)\s*([^.\n)]+)/gi;
  for (const m of text.matchAll(listRe)) {
    const items = splitPlaces(m[1].replace(/\b(?:only|based|remote)\b/gi, ""));
    const countries = items.map((i) => lookupCountry(i)).filter((c): c is string => !!c);
    if (countries.length && countries.length >= Math.ceil(items.length / 2)) for (const c of countries) add(allowed, c);
  }

  // Exclusions: "not CA, CT", "excluding India", "except California", "not open to candidates in X".
  // Keywords match in any case; the places themselves must start with a capital letter.
  const ci = (w: string) => w.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
  const KW = [
    `${ci("not")}(?:[ \\t]+${ci("open")}[ \\t]+${ci("to")}(?:[ \\t]+${ci("candidates")})?|[ \\t]+${ci("available")})?(?:[ \\t]+(?:${ci("in")}|${ci("from")}))?`,
    ci("excluding"),
    ci("excludes"),
    ci("exclude"),
    `${ci("except")}(?:[ \\t]+${ci("for")})?`,
    `${ci("no")}[ \\t]+(?:${ci("candidates")}|${ci("applicants")}|${ci("residents")})[ \\t]+(?:${ci("from")}|${ci("in")})`,
  ].join("|");
  const TOKEN = "(?:(?:[A-Z]\\.){2,}|[A-Z][\\w'-]*)";
  const NAME = `${TOKEN}(?:[ \\t]+${TOKEN})*\\.?`;
  const JOIN = "[ \\t]*(?:,|\\/|;|\\band\\b|\\bor\\b|&)[ \\t]*";
  const exclRe = new RegExp(`\\b(?:${KW})[ \\t]*:?[ \\t]*(${NAME}(?:${JOIN}${NAME})*)`, "g");
  for (const m of text.matchAll(exclRe)) {
    const items = splitPlaces(m[1]);
    const usContext = allowed.includes("United States") || usOnly;
    const resolved: string[] = [];
    for (const raw of items) {
      const item = raw.replace(/\.+$/, "");
      const state = lookupUsState(item);
      const country = lookupCountry(item);
      // After "US-based", "not CA" means California. Otherwise a code is a country ("not IN" = India),
      // and a full state name ("except California") is still a state.
      if (state && usContext) resolved.push(`US-${state}`);
      else if (country) resolved.push(country);
      else if (state && item.length > 2) resolved.push(`US-${state}`);
    }
    if (resolved.length && resolved.length >= Math.ceil(items.length / 2)) {
      for (const r of resolved) {
        if (r.startsWith("US-") && !allowed.includes("United States")) add(allowed, "United States");
        add(blocked, r);
      }
    }
  }
  for (const b of blocked) {
    const i = allowed.indexOf(b);
    if (i >= 0) allowed.splice(i, 1);
  }
  if (allowed.length) notes.push(`Location: ${allowed.join(", ")}`);
  if (blocked.length) notes.push(`Not from: ${blocked.map(placeLabel).join(", ")}`);
  return { allowed, blocked, notes };
}

const NICE_HEADER = /\b(nice[- ]to[- ]haves?|preferred|bonus|plus(?:es)?|desirable|ideally|good to have|optional|a plus|is a plus|would be great)\b/i;
const MUST_HEADER = /\b(must[- ]haves?|requirements?|required|qualifications|what you(?:'|’)ll need|you have|minimum)\b\s*:?\s*$/i;

export function parseSkills(text: string): { must: string[]; nice: string[] } {
  const must: string[] = [];
  const nice: string[] = [];
  let mode: "must" | "nice" = "must";
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const isHeader = line.length < 60 && /:\s*$/.test(line);
    if (isHeader && NICE_HEADER.test(line)) {
      mode = "nice";
      continue;
    }
    if (isHeader && MUST_HEADER.test(line)) {
      mode = "must";
      continue;
    }
    // Within a line, a sentence that says "nice to have" / "is a plus" counts as nice.
    for (const sentence of line.split(/(?<=[.;])\s+/)) {
      const target = mode === "nice" || NICE_HEADER.test(sentence) ? nice : must;
      for (const s of findSkills(sentence)) if (!must.includes(s) && !nice.includes(s)) target.push(s);
    }
  }
  return { must, nice };
}

export function parseTitle(text: string): string {
  const firstLine = text.split(/\n/).map((l) => l.trim()).find(Boolean) ?? "";
  let title = firstLine.replace(/^(?:role|title|position|job|requirement|re|fw|fwd)\s*:\s*/i, "");
  const sentence = title.split(/\.(?:\s+|$)(?=[A-Z]|$)/)[0];
  if (sentence) title = sentence;
  title = title.replace(/[.\s]+$/, "").trim();
  return title.length > 120 ? `${title.slice(0, 117).trimEnd()}...` : title;
}

export function parseDomains(title: string, text: string): Domain[] {
  // "Scientific Coding Expert - Mathematics": the part after the dash names the field.
  const segments = title.split(/\s+[-–—|:]\s+|\(|\)/).map((s) => s.trim()).filter(Boolean);
  for (let i = segments.length - 1; i >= 1; i--) {
    const d = domainOf(segments[i]);
    if (d) return [d];
  }
  const scores = new Map<Domain, number>();
  for (const [d, n] of domainScores(title)) scores.set(d, (scores.get(d) ?? 0) + n * 3);
  for (const [d, n] of domainScores(text)) scores.set(d, (scores.get(d) ?? 0) + n);
  if (!scores.size) return [];
  const best = Math.max(...scores.values());
  return [...scores.entries()].filter(([, n]) => n === best).map(([d]) => d);
}

export function parseRequirement(text: string, opts: { today?: Date } = {}): ParsedRequirement {
  const clean = (text ?? "").replace(/\r\n?/g, "\n").replace(/[‘’]/g, "'").trim();
  const title = parseTitle(clean);
  const skills = parseSkills(clean);
  const domains = parseDomains(title, clean);
  const degrees = parseDegrees(clean);
  const loc = parseLocations(clean);
  const minYears = parseMinYears(clean);
  const slots = parseSlots(clean);
  const rateNote = parseRate(clean);
  const deadline = parseDeadline(clean, opts.today);
  const externalRef = parseExternalRef(clean);

  const found: string[] = [];
  if (slots) found.push(`${slots} ${slots === 1 ? "slot" : "slots"}`);
  if (domains.length) found.push(`Domain: ${domains.join(", ")}`);
  if (skills.must.length) found.push(`Must-have skills: ${skills.must.join(", ")}`);
  if (skills.nice.length) found.push(`Nice-to-have: ${skills.nice.join(", ")}`);
  if (minYears != null) found.push(`${minYears}+ years`);
  if (degrees.length) found.push(`Degree: ${degrees.join(" or ")}`);
  found.push(...loc.notes);
  if (externalRef) found.push(`Reference: ${externalRef}`);
  if (deadline) found.push(`Deadline: ${deadline}`);
  if (rateNote) found.push(`Rate mentioned: ${rateNote} (kept internal)`);

  return {
    title,
    externalRef,
    description: clean,
    mustSkills: skills.must,
    niceSkills: skills.nice,
    domains,
    degrees,
    countriesAllowed: loc.allowed,
    countriesBlocked: loc.blocked,
    minYears,
    slots,
    rateNote,
    deadline,
    found,
  };
}
