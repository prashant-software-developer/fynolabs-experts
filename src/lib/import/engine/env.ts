// Connection strings for `npm run copy:engine`: where they come from, how they are shown (never
// with the password), and the guards that run before anything is written. Pure functions.
import { readFileSync } from "node:fs";
import path from "node:path";

/** KEY=value lines (optional `export `, optional single or double quotes, # comments). */
export function parseEnvText(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v.length >= 2) {
      const end = v.indexOf(q, 1);
      v = end > 0 ? v.slice(1, end) : v.slice(1);
      if (q === '"') v = v.replace(/\\n/g, "\n");
    } else {
      v = v.replace(/\s+#.*$/, "").trim();
    }
    out.set(m[1], v);
  }
  return out;
}

export type CopyArgs = { dryRun: boolean; localTest: boolean; sourceEnv: string | null; sourceKey: string | null; logFile: string | null; help: boolean; unknown: string[] };

export function parseArgs(argv: readonly string[]): CopyArgs {
  const a: CopyArgs = { dryRun: false, localTest: false, sourceEnv: null, sourceKey: null, logFile: null, help: false, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const [flag, inline] = x.includes("=") && x.startsWith("--") ? [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)] : [x, null];
    const value = () => inline ?? argv[++i] ?? null;
    if (flag === "--dry-run") a.dryRun = true;
    else if (flag === "--local-test") a.localTest = true;
    else if (flag === "--source-env") a.sourceEnv = value();
    else if (flag === "--source-key") a.sourceKey = value();
    else if (flag === "--log-file") a.logFile = value();
    else if (flag === "--help" || flag === "-h") a.help = true;
    else a.unknown.push(x);
  }
  return a;
}

export type ResolvedUrl = { ok: true; url: string; from: string } | { ok: false; message: string };

/** Engine's connection string: ENGINE_DATABASE_URL, else KEY from the file given with --source-env. */
export function resolveSourceUrl(env: Record<string, string | undefined>, args: Pick<CopyArgs, "sourceEnv" | "sourceKey">, read: (p: string) => string = (p) => readFileSync(p, "utf8")): ResolvedUrl {
  const direct = (env.ENGINE_DATABASE_URL ?? "").trim();
  if (direct) return { ok: true, url: direct, from: "ENGINE_DATABASE_URL" };
  if (!args.sourceEnv) return { ok: false, message: "Engine's connection string is missing: set ENGINE_DATABASE_URL, or pass --source-env <file> --source-key <KEY>." };
  const key = args.sourceKey || "JOBS_DATABASE_URL";
  let text: string;
  try {
    text = read(args.sourceEnv);
  } catch {
    return { ok: false, message: `Can't read ${args.sourceEnv} (the jobs site's settings file).` };
  }
  const v = (parseEnvText(text).get(key) ?? "").trim();
  if (!v) return { ok: false, message: `${args.sourceEnv} has no ${key}.` };
  return { ok: true, url: v, from: `${key} in ${path.basename(args.sourceEnv)}` };
}

export type DbRef =
  | { kind: "postgres"; url: string; user: string; host: string; db: string; endpoint: string | null }
  | { kind: "pglite"; url: string; dir: string };

/** postgresql://... (Neon) or, for --local-test only, pglite:<folder>. */
export function parseDbUrl(url: string): DbRef | null {
  const s = url.trim();
  if (/^pglite:/i.test(s)) {
    const dir = s.replace(/^pglite:(\/\/)?/i, "");
    return dir ? { kind: "pglite", url: s, dir: path.resolve(dir) } : null;
  }
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!/^postgres(ql)?:$/.test(u.protocol) || !u.hostname) return null;
  const opt = u.searchParams.get("options") ?? "";
  const fromOpt = /endpoint=([a-z0-9-]+)/i.exec(decodeURIComponent(opt))?.[1] ?? null;
  const label = u.hostname.split(".")[0].replace(/-pooler$/i, "");
  const endpoint = (fromOpt ?? (/^ep-[a-z0-9-]+$/i.test(label) ? label : null))?.toLowerCase().replace(/-pooler$/, "") ?? null;
  return { kind: "postgres", url: s, user: decodeURIComponent(u.username || ""), host: u.hostname.toLowerCase(), db: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres", endpoint };
}

/** "user@host/db" (no password, ever). */
export function describeDb(url: string): string {
  const r = parseDbUrl(url);
  if (!r) return "(not a database address)";
  if (r.kind === "pglite") return `pglite:${r.dir}`;
  return `${r.user || "(no user)"}@${r.host}/${r.db}`;
}

/** Neon's direct host for the long read: "ep-x-pooler.region.aws.neon.tech" -> "ep-x.region.aws.neon.tech". */
export function directUrl(url: string): string {
  const r = parseDbUrl(url);
  if (!r || r.kind !== "postgres") return url;
  const u = new URL(url);
  const [first, ...rest] = u.hostname.split(".");
  if (!/-pooler$/i.test(first)) return url;
  u.hostname = [first.replace(/-pooler$/i, ""), ...rest].join(".");
  return u.toString();
}

const hostKey = (h: string) => h.split(".").map((p, i) => (i === 0 ? p.replace(/-pooler$/i, "") : p)).join(".");

/** Same Neon endpoint (ep-… id, pooler or not), or the same host and database, or the same local folder. */
export function sameDatabase(a: string, b: string): boolean {
  const x = parseDbUrl(a);
  const y = parseDbUrl(b);
  if (!x || !y) return false;
  if (x.kind === "pglite" || y.kind === "pglite") return x.kind === y.kind && (x as { dir: string }).dir === (y as { dir: string }).dir;
  if (x.endpoint && y.endpoint && x.endpoint === y.endpoint) return true;
  return hostKey(x.host) === hostKey(y.host) && x.db === y.db;
}

export type GuardInput = { sourceUrl: string; targetUrl: string; confirm: string | undefined; dryRun: boolean; localTest: boolean };

/**
 * Checks that need no connection. Returns the reasons to refuse (empty = go on). Run before
 * connecting to anything; the "target is Engine" check runs right after connecting, still before any write.
 */
export function preflight(g: GuardInput): string[] {
  const out: string[] = [];
  const target = g.targetUrl.trim();
  if (!target && !g.localTest) out.push("DATABASE_URL is empty. Put the expert-hub connection string in .env.local (see docs/DEPLOY.md), or pass --local-test for a local trial.");
  const src = parseDbUrl(g.sourceUrl);
  if (!src) out.push("Engine's connection string isn't a postgresql:// address.");
  else if (src.kind === "pglite" && !g.localTest) out.push("pglite: addresses are only for --local-test.");
  if (target) {
    const t = parseDbUrl(target);
    if (!t) out.push("DATABASE_URL isn't a postgresql:// address.");
    else if (t.kind === "pglite" && !g.localTest) out.push("pglite: addresses are only for --local-test.");
    else if (src && sameDatabase(g.sourceUrl, target)) out.push("Engine and DATABASE_URL are the same database. DATABASE_URL must be the new expert-hub project.");
  }
  if (!g.dryRun && g.confirm !== "yes") out.push("Set CONFIRM_DB=yes to confirm DATABASE_URL is the database you mean (the launcher asks you first).");
  return out;
}
