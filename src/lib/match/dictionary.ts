// Word lists used by the requirement parser, the scorer and the import mapping.
// To teach the app a new skill, add a line to SKILLS: canonical name first, then other spellings.
import type { Domain } from "@/lib/constants";

type SkillEntry = { name: string; aliases: string[]; exact?: string[] };

// `aliases` match case-insensitively as whole words. `exact` match only with this exact casing
// (for short words like "Go" or "R" that are also ordinary English).
export const SKILLS: SkillEntry[] = [
  // languages
  { name: "python", aliases: ["python", "python3", "python 3"] },
  { name: "javascript", aliases: ["javascript", "ecmascript"], exact: ["JS"] },
  { name: "typescript", aliases: ["typescript"], exact: ["TS"] },
  { name: "java", aliases: ["java"] },
  { name: "c", aliases: [], exact: ["C"] },
  { name: "c++", aliases: ["c++", "cpp"] },
  { name: "c#", aliases: ["c#", "csharp"] },
  { name: "go", aliases: ["golang"], exact: ["Go"] },
  { name: "rust", aliases: ["rust", "rustlang"] },
  { name: "ruby", aliases: ["ruby"] },
  { name: "php", aliases: ["php"] },
  { name: "swift", aliases: ["swift"] },
  { name: "kotlin", aliases: ["kotlin"] },
  { name: "scala", aliases: ["scala"] },
  { name: "r", aliases: [], exact: ["R"] },
  { name: "matlab", aliases: ["matlab"] },
  { name: "julia", aliases: ["julia"] },
  { name: "sql", aliases: ["sql"] },
  { name: "bash", aliases: ["bash", "shell scripting", "shell", "zsh"] },
  { name: "haskell", aliases: ["haskell"] },
  { name: "elixir", aliases: ["elixir"] },
  { name: "solidity", aliases: ["solidity"] },
  { name: "fortran", aliases: ["fortran"] },
  { name: "verilog", aliases: ["verilog", "vhdl"] },
  // web, data and infrastructure
  { name: "react", aliases: ["react", "react.js", "reactjs"] },
  { name: "node.js", aliases: ["node.js", "nodejs", "node"] },
  { name: "next.js", aliases: ["next.js", "nextjs"] },
  { name: "django", aliases: ["django"] },
  { name: "flask", aliases: ["flask"] },
  { name: "fastapi", aliases: ["fastapi"] },
  { name: "html/css", aliases: ["html", "css", "html/css"] },
  { name: "graphql", aliases: ["graphql"] },
  { name: "rest apis", aliases: ["rest api", "rest apis", "restful", "restful apis"] },
  { name: "docker", aliases: ["docker", "containers"] },
  { name: "kubernetes", aliases: ["kubernetes", "k8s"] },
  { name: "terraform", aliases: ["terraform"] },
  { name: "aws", aliases: ["aws", "amazon web services"] },
  { name: "gcp", aliases: ["gcp", "google cloud"] },
  { name: "azure", aliases: ["azure"] },
  { name: "linux", aliases: ["linux", "unix"] },
  { name: "git", aliases: ["git", "github", "gitlab"] },
  { name: "ci/cd", aliases: ["ci/cd", "cicd", "continuous integration"] },
  { name: "command line", aliases: ["command line", "command-line", "cli", "terminal"] },
  { name: "postgresql", aliases: ["postgresql", "postgres"] },
  { name: "mongodb", aliases: ["mongodb", "mongo"] },
  { name: "spark", aliases: ["spark", "pyspark", "apache spark"] },
  { name: "kafka", aliases: ["kafka"] },
  { name: "airflow", aliases: ["airflow"] },
  { name: "excel", aliases: ["excel", "spreadsheets"] },
  { name: "tableau", aliases: ["tableau"] },
  { name: "power bi", aliases: ["power bi", "powerbi"] },
  // AI and data science
  { name: "machine learning", aliases: ["machine learning"], exact: ["ML"] },
  { name: "deep learning", aliases: ["deep learning", "neural networks"] },
  { name: "pytorch", aliases: ["pytorch", "torch"] },
  { name: "tensorflow", aliases: ["tensorflow", "keras"] },
  { name: "jax", aliases: ["jax"] },
  { name: "scikit-learn", aliases: ["scikit-learn", "sklearn"] },
  { name: "pandas", aliases: ["pandas"] },
  { name: "numpy", aliases: ["numpy"] },
  { name: "scipy", aliases: ["scipy"] },
  { name: "nlp", aliases: ["nlp", "natural language processing"] },
  { name: "computer vision", aliases: ["computer vision"] },
  { name: "llms", aliases: ["llm", "llms", "large language model", "large language models"] },
  { name: "rag", aliases: ["rag", "retrieval augmented generation", "retrieval-augmented generation"] },
  { name: "reinforcement learning", aliases: ["reinforcement learning"] },
  { name: "rlhf", aliases: ["rlhf"] },
  { name: "prompt engineering", aliases: ["prompt engineering", "prompting"] },
  { name: "model evaluation", aliases: ["model evaluation", "llm evaluation", "ai evaluation", "evals"] },
  { name: "data annotation", aliases: ["data annotation", "data labeling", "data labelling", "annotation"] },
  { name: "statistics", aliases: ["statistics", "statistical analysis", "stats"] },
  { name: "data analysis", aliases: ["data analysis", "data analytics"] },
  { name: "data visualization", aliases: ["data visualization", "data visualisation"] },
  { name: "code review", aliases: ["code review", "code reviews", "reviewing code"] },
  { name: "benchmark authoring", aliases: ["benchmark authoring", "benchmark design", "benchmarks", "benchmark"] },
  { name: "competitive programming", aliases: ["competitive programming", "leetcode", "codeforces"] },
  // maths and science
  { name: "numerical methods", aliases: ["numerical methods", "numerical analysis", "numerical computing", "numerics"] },
  { name: "scientific computing", aliases: ["scientific computing", "scientific programming", "hpc"] },
  { name: "linear algebra", aliases: ["linear algebra"] },
  { name: "calculus", aliases: ["calculus"] },
  { name: "probability", aliases: ["probability", "probability theory"] },
  { name: "optimization", aliases: ["optimization", "optimisation", "convex optimization"] },
  { name: "differential equations", aliases: ["differential equations", "pdes", "odes", "pde", "ode"] },
  { name: "real analysis", aliases: ["real analysis", "analysis (math)"] },
  { name: "abstract algebra", aliases: ["abstract algebra", "group theory"] },
  { name: "number theory", aliases: ["number theory"] },
  { name: "combinatorics", aliases: ["combinatorics", "graph theory"] },
  { name: "topology", aliases: ["topology"] },
  { name: "mathematical proofs", aliases: ["mathematical proofs", "proof writing", "proofs"] },
  { name: "lean", aliases: ["lean 4", "lean4", "lean prover"], exact: ["Lean"] },
  { name: "latex", aliases: ["latex"] },
  { name: "quantum mechanics", aliases: ["quantum mechanics", "quantum physics"] },
  { name: "thermodynamics", aliases: ["thermodynamics"] },
  { name: "electromagnetism", aliases: ["electromagnetism"] },
  { name: "molecular biology", aliases: ["molecular biology"] },
  { name: "genomics", aliases: ["genomics", "genetics"] },
  { name: "bioinformatics", aliases: ["bioinformatics", "computational biology"] },
  { name: "biochemistry", aliases: ["biochemistry"] },
  { name: "organic chemistry", aliases: ["organic chemistry"] },
  { name: "computational chemistry", aliases: ["computational chemistry"] },
  { name: "pharmacology", aliases: ["pharmacology"] },
  { name: "clinical research", aliases: ["clinical research", "clinical trials"] },
  { name: "epidemiology", aliases: ["epidemiology"] },
  // security
  { name: "penetration testing", aliases: ["penetration testing", "pentesting", "pentest", "pen testing"] },
  { name: "network security", aliases: ["network security", "networking"] },
  { name: "cryptography", aliases: ["cryptography"] },
  { name: "reverse engineering", aliases: ["reverse engineering"] },
  { name: "application security", aliases: ["application security", "appsec"] },
  { name: "cloud security", aliases: ["cloud security"] },
  // finance and law
  { name: "financial modeling", aliases: ["financial modeling", "financial modelling"] },
  { name: "accounting", aliases: ["accounting", "bookkeeping"] },
  { name: "valuation", aliases: ["valuation", "dcf"] },
  { name: "quantitative finance", aliases: ["quantitative finance", "quant finance"] },
  { name: "risk management", aliases: ["risk management"] },
  { name: "contract law", aliases: ["contract law", "contracts"] },
  { name: "litigation", aliases: ["litigation"] },
  { name: "compliance", aliases: ["compliance", "regulatory compliance"] },
  { name: "legal research", aliases: ["legal research"] },
  // language work
  { name: "translation", aliases: ["translation", "translating"] },
  { name: "transcription", aliases: ["transcription", "transcribing"] },
  { name: "technical writing", aliases: ["technical writing", "documentation writing"] },
  { name: "copywriting", aliases: ["copywriting"] },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Whole-word regex for one spelling ("c++" and "node.js" work too). */
function wordRe(alias: string, flags: string): RegExp {
  const singleLetter = alias.length === 1;
  const after = singleLetter ? "(?![\\p{L}\\p{N}+#&\\-/.'’])" : "(?![\\p{L}\\p{N}+#])";
  return new RegExp(`(?<![\\p{L}\\p{N}&./])${escapeRe(alias)}${after}`, flags);
}

type CompiledSkill = { name: string; patterns: RegExp[] };
const COMPILED: CompiledSkill[] = SKILLS.map((s) => ({
  name: s.name,
  patterns: [
    ...s.aliases.map((a) => wordRe(a, "iu")),
    ...(s.exact ?? []).map((a) => wordRe(a, "u")),
  ],
}));

const ALIAS_TO_NAME = new Map<string, string>();
for (const s of SKILLS) {
  ALIAS_TO_NAME.set(s.name, s.name);
  for (const a of [...s.aliases, ...(s.exact ?? [])]) ALIAS_TO_NAME.set(a.toLowerCase(), s.name);
}

/** One spelling per skill: "Python3" -> "python", "K8s" -> "kubernetes", unknown -> lower case. */
export function normalizeSkill(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ").replace(/^[-•*·]\s*/, "").toLowerCase();
  if (!s) return "";
  return ALIAS_TO_NAME.get(s) ?? s;
}

export function normalizeSkills(list: Iterable<string>): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const n = normalizeSkill(raw);
    if (n && n.length <= 60 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Splits "Python, SQL; numerical methods" into a clean, de-duplicated skill list. */
export function splitSkills(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return normalizeSkills(raw.split(/[,;\n|]+/));
}

/** Canonical skills mentioned anywhere in a piece of text, in order of first appearance. */
export function findSkills(text: string): string[] {
  const hits: { name: string; at: number }[] = [];
  for (const s of COMPILED) {
    let best = -1;
    for (const re of s.patterns) {
      const m = re.exec(text);
      if (m && (best < 0 || m.index < best)) best = m.index;
    }
    if (best >= 0) hits.push({ name: s.name, at: best });
  }
  // Drop a skill that only matched inside a longer one ("c" inside "c++" can't happen, but
  // "shell" inside "shell scripting" maps to the same name anyway).
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}

/** Does this text mention the skill (any spelling)? Used for partial credit from a headline. */
export function textMentionsSkill(text: string, skill: string): boolean {
  const name = normalizeSkill(skill);
  const c = COMPILED.find((s) => s.name === name);
  if (c) return c.patterns.some((re) => re.test(text));
  return wordRe(name, "iu").test(text);
}

// ---------------------------------------------------------------- domains

export const DOMAIN_WORDS: { domain: Domain; words: string[]; exact?: string[]; weight?: number }[] = [
  { domain: "Mathematics", words: ["mathematics", "maths", "math", "mathematician", "applied mathematics", "mathematical"] },
  { domain: "Physics", words: ["physics", "physicist", "astrophysics", "quantum"] },
  { domain: "Biology", words: ["biology", "biologist", "life sciences", "life-sciences", "molecular biology", "genomics", "bioinformatics", "biochemistry", "neuroscience"] },
  { domain: "Chemistry", words: ["chemistry", "chemist", "chemical engineering"] },
  { domain: "Medicine", words: ["medicine", "medical", "clinical", "physician", "nurse", "nursing", "healthcare", "pharmacy", "pharmacist"], exact: ["MD", "MBBS"] },
  { domain: "Finance", words: ["finance", "financial", "accounting", "accountant", "banking", "investment", "economics", "economist"], exact: ["CFA", "CPA"] },
  { domain: "Law", words: ["law", "legal", "lawyer", "attorney", "paralegal"], exact: ["JD", "LLM"] },
  { domain: "Languages", words: ["linguistics", "linguist", "translation", "translator", "native speaker", "bilingual", "language expert", "transcription"] },
  { domain: "Security", words: ["security", "cybersecurity", "cyber security", "infosec", "penetration testing", "red team"] },
  { domain: "Data science", words: ["data science", "data scientist", "machine learning", "data analyst", "analytics", "ml engineer"] },
  { domain: "Software", words: ["software engineering", "software engineer", "software developer", "software", "coding", "programming", "programmer", "developer", "full-stack", "full stack", "backend", "frontend", "swe", "computer science", "engineer", "engineers", "engineering"], weight: 0.5 },
];

const COMPILED_DOMAINS = DOMAIN_WORDS.map((d) => ({
  domain: d.domain,
  weight: d.weight ?? 1,
  patterns: [...d.words.map((w) => wordRe(w, "iu")), ...(d.exact ?? []).map((w) => wordRe(w, "u"))],
}));

/** Domain mentioned in a short text ("Applied Mathematics" -> Mathematics), or null. */
export function domainOf(text: string | null | undefined): Domain | null {
  if (!text) return null;
  for (const d of COMPILED_DOMAINS) if (d.patterns.some((re) => re.test(text))) return d.domain;
  return null;
}

/** Score each domain by how often (and how strongly) the text mentions it. */
export function domainScores(text: string): Map<Domain, number> {
  const out = new Map<Domain, number>();
  for (const d of COMPILED_DOMAINS) {
    let n = 0;
    for (const re of d.patterns) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      n += [...text.matchAll(g)].length;
    }
    if (n) out.set(d.domain, n * d.weight);
  }
  return out;
}

/** Map free text ("CS", "Maths", "Software Engineering") to one of the fixed domains. */
export function normalizeDomain(raw: string | null | undefined): Domain | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const direct = DOMAIN_WORDS.find((d) => d.domain.toLowerCase() === s.toLowerCase());
  if (direct) return direct.domain;
  if (/^(cs|it|engineering|tech)$/i.test(s)) return "Software";
  if (/^other$/i.test(s)) return "Other";
  return domainOf(s) ?? "Other";
}

// ---------------------------------------------------------------- degrees

export function degreeLevel(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/ph\.?\s?d|doctor(ate|al)|\bdphil\b|\bmd\b|\bjd\b/.test(s)) return 3;
  if (/master|\bm\.?\s?sc\b|\bm\.?s\.?\b|\bm\.?tech\b|\bm\.?eng\b|\bmba\b|\bm\.?a\.?\b|\bllm\b|\bmphil\b|post-?graduate|graduate degree/.test(s)) return 2;
  if (/bachelor|\bb\.?\s?sc\b|\bb\.?s\.?\b|\bb\.?tech\b|\bb\.?e\.?\b|\bb\.?a\.?\b|\bbeng\b|\bllb\b|undergraduate|\bbca\b/.test(s)) return 1;
  if (/diploma|high school|secondary|associate/.test(s)) return 0;
  return null;
}

export const DEGREE_BY_LEVEL: Record<number, "bachelors" | "masters" | "phd"> = { 1: "bachelors", 2: "masters", 3: "phd" };

// ---------------------------------------------------------------- countries and US states

export const COUNTRIES: { name: string; aliases: string[]; codes?: string[] }[] = [
  { name: "United States", aliases: ["united states", "united states of america", "usa", "u.s.a.", "u.s.", "america"], codes: ["US", "USA"] },
  { name: "United Kingdom", aliases: ["united kingdom", "great britain", "britain", "england", "scotland", "wales", "northern ireland", "u.k."], codes: ["UK", "GB"] },
  { name: "Canada", aliases: ["canada"] },
  { name: "India", aliases: ["india", "bharat"], codes: ["IN"] },
  { name: "Germany", aliases: ["germany", "deutschland"], codes: ["DE"] },
  { name: "France", aliases: ["france"], codes: ["FR"] },
  { name: "Spain", aliases: ["spain", "españa"], codes: ["ES"] },
  { name: "Italy", aliases: ["italy", "italia"], codes: ["IT"] },
  { name: "Netherlands", aliases: ["netherlands", "the netherlands", "holland"], codes: ["NL"] },
  { name: "Belgium", aliases: ["belgium"], codes: ["BE"] },
  { name: "Switzerland", aliases: ["switzerland"], codes: ["CH"] },
  { name: "Austria", aliases: ["austria"], codes: ["AT"] },
  { name: "Ireland", aliases: ["ireland", "republic of ireland"], codes: ["IE"] },
  { name: "Portugal", aliases: ["portugal"], codes: ["PT"] },
  { name: "Poland", aliases: ["poland"], codes: ["PL"] },
  { name: "Czechia", aliases: ["czechia", "czech republic"], codes: ["CZ"] },
  { name: "Slovenia", aliases: ["slovenia"], codes: ["SI"] },
  { name: "Croatia", aliases: ["croatia"], codes: ["HR"] },
  { name: "Serbia", aliases: ["serbia"], codes: ["RS"] },
  { name: "Romania", aliases: ["romania"], codes: ["RO"] },
  { name: "Bulgaria", aliases: ["bulgaria"], codes: ["BG"] },
  { name: "Hungary", aliases: ["hungary"], codes: ["HU"] },
  { name: "Greece", aliases: ["greece"], codes: ["GR"] },
  { name: "Sweden", aliases: ["sweden"], codes: ["SE"] },
  { name: "Norway", aliases: ["norway"], codes: ["NO"] },
  { name: "Denmark", aliases: ["denmark"], codes: ["DK"] },
  { name: "Finland", aliases: ["finland"], codes: ["FI"] },
  { name: "Estonia", aliases: ["estonia"], codes: ["EE"] },
  { name: "Latvia", aliases: ["latvia"], codes: ["LV"] },
  { name: "Lithuania", aliases: ["lithuania"], codes: ["LT"] },
  { name: "Ukraine", aliases: ["ukraine"], codes: ["UA"] },
  { name: "Russia", aliases: ["russia", "russian federation"], codes: ["RU"] },
  { name: "Belarus", aliases: ["belarus"], codes: ["BY"] },
  { name: "Turkey", aliases: ["turkey", "türkiye", "turkiye"], codes: ["TR"] },
  { name: "Israel", aliases: ["israel"], codes: ["IL"] },
  { name: "United Arab Emirates", aliases: ["united arab emirates", "uae", "dubai"], codes: ["AE", "UAE"] },
  { name: "Saudi Arabia", aliases: ["saudi arabia", "ksa"], codes: ["SA"] },
  { name: "Egypt", aliases: ["egypt"], codes: ["EG"] },
  { name: "Morocco", aliases: ["morocco"], codes: ["MA"] },
  { name: "Nigeria", aliases: ["nigeria"], codes: ["NG"] },
  { name: "Kenya", aliases: ["kenya"], codes: ["KE"] },
  { name: "Ghana", aliases: ["ghana"], codes: ["GH"] },
  { name: "South Africa", aliases: ["south africa"], codes: ["ZA"] },
  { name: "Pakistan", aliases: ["pakistan"], codes: ["PK"] },
  { name: "Bangladesh", aliases: ["bangladesh"], codes: ["BD"] },
  { name: "Sri Lanka", aliases: ["sri lanka"], codes: ["LK"] },
  { name: "Nepal", aliases: ["nepal"], codes: ["NP"] },
  { name: "China", aliases: ["china", "mainland china", "prc"], codes: ["CN"] },
  { name: "Hong Kong", aliases: ["hong kong"], codes: ["HK"] },
  { name: "Taiwan", aliases: ["taiwan"], codes: ["TW"] },
  { name: "Japan", aliases: ["japan"], codes: ["JP"] },
  { name: "South Korea", aliases: ["south korea", "korea", "republic of korea"], codes: ["KR"] },
  { name: "North Korea", aliases: ["north korea"], codes: ["KP"] },
  { name: "Iran", aliases: ["iran"], codes: ["IR"] },
  { name: "Cuba", aliases: ["cuba"], codes: ["CU"] },
  { name: "Syria", aliases: ["syria"], codes: ["SY"] },
  { name: "Singapore", aliases: ["singapore"], codes: ["SG"] },
  { name: "Malaysia", aliases: ["malaysia"], codes: ["MY"] },
  { name: "Indonesia", aliases: ["indonesia"], codes: ["ID"] },
  { name: "Philippines", aliases: ["philippines", "the philippines"], codes: ["PH"] },
  { name: "Vietnam", aliases: ["vietnam", "viet nam"], codes: ["VN"] },
  { name: "Thailand", aliases: ["thailand"], codes: ["TH"] },
  { name: "Australia", aliases: ["australia"], codes: ["AU"] },
  { name: "New Zealand", aliases: ["new zealand"], codes: ["NZ"] },
  { name: "Mexico", aliases: ["mexico", "méxico"], codes: ["MX"] },
  { name: "Brazil", aliases: ["brazil", "brasil"], codes: ["BR"] },
  { name: "Argentina", aliases: ["argentina"], codes: ["AR"] },
  { name: "Chile", aliases: ["chile"], codes: ["CL"] },
  { name: "Colombia", aliases: ["colombia"], codes: ["CO"] },
  { name: "Peru", aliases: ["peru"], codes: ["PE"] },
];

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

const COUNTRY_BY_KEY = new Map<string, string>();
const COUNTRY_BY_CODE = new Map<string, string>();
for (const c of COUNTRIES) {
  COUNTRY_BY_KEY.set(c.name.toLowerCase(), c.name);
  for (const a of c.aliases) COUNTRY_BY_KEY.set(a.toLowerCase(), c.name);
  for (const code of c.codes ?? []) COUNTRY_BY_CODE.set(code, c.name);
}
const STATE_BY_NAME = new Map(Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]));

const cleanPlace = (s: string) => s.trim().replace(/^the\s+/i, "").replace(/[.\s]+$/g, "").replace(/\s+/g, " ");

/** Country spelling -> standard English name ("USA" -> "United States"); unknown -> null. */
export function lookupCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = cleanPlace(raw);
  if (!s) return null;
  if (COUNTRY_BY_CODE.has(s.toUpperCase()) && s.length <= 3 && s === s.toUpperCase()) return COUNTRY_BY_CODE.get(s.toUpperCase())!;
  return COUNTRY_BY_KEY.get(s.toLowerCase()) ?? COUNTRY_BY_KEY.get(s.toLowerCase().replace(/\./g, "")) ?? null;
}

/** Like lookupCountry, but keeps unknown countries as typed (title case). */
export function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const known = lookupCountry(raw) ?? (raw.trim().length <= 3 ? COUNTRY_BY_CODE.get(raw.trim().toUpperCase()) : undefined);
  if (known) return known;
  return cleanPlace(raw).replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
}

/** US state spelling -> two-letter code ("California" / "ca" -> "CA"); unknown -> null. */
export function lookupUsState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = cleanPlace(raw);
  if (/^[A-Za-z]{2}$/.test(s) && US_STATES[s.toUpperCase()]) return s.toUpperCase();
  return STATE_BY_NAME.get(s.toLowerCase()) ?? null;
}

/** "US-CA" -> "California, US". Plain country names are returned as they are. */
export function placeLabel(entry: string): string {
  const m = /^US-([A-Z]{2})$/.exec(entry);
  if (m) return `${US_STATES[m[1]] ?? m[1]} (US)`;
  return entry;
}

/** Splits "Bengaluru, India" or "Austin, TX, USA" into city / region / country. */
export function splitLocation(raw: string | null | undefined): { city: string | null; region: string | null; country: string | null } {
  const parts = (raw ?? "")
    .split(/[,/|]/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(remote|anywhere|n\/a|-|–|—)$/i.test(p));
  let country: string | null = null;
  const last = parts[parts.length - 1];
  if (last && lookupCountry(last)) {
    country = lookupCountry(last);
    parts.pop();
  } else if (parts.length > 1 && lookupUsState(last)) {
    country = "United States";
  }
  let city: string | null = null;
  let region: string | null = null;
  if (parts.length >= 2) {
    city = parts[0];
    region = parts[parts.length - 1];
  } else if (parts.length === 1) {
    if (country === "United States" && lookupUsState(parts[0])) region = parts[0];
    else city = parts[0];
  }
  return { city, region, country };
}
