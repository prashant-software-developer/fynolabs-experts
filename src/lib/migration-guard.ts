// Safety net for the shared "Engine" database: every migration statement must stay inside the
// `hub` schema. Used by `npm run db:migrate` (refuses to run otherwise) and by the test suite.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type GuardProblem = { file: string; statement: string; reason: string };

const ALLOWED_STARTS = [
  /^create schema if not exists "hub"$/,
  /^create table (if not exists )?"hub"\./,
  /^alter table (if exists )?"hub"\./,
  /^drop table (if exists )?"hub"\./,
  /^create (unique )?index (concurrently )?(if not exists )?"[\w]+" on "hub"\./,
  /^drop index (if exists )?"hub"\./,
  /^create (or replace )?function "hub"\./,
  /^drop trigger (if exists )?"[\w]+" on "hub"\./,
  /^create (or replace )?trigger "[\w]+" (before|after) /,
  /^comment on (table|column) "hub"\./,
];

const FORBIDDEN = [
  { re: /\bdrop\s+schema\b/, reason: "drops a schema" },
  { re: /\btruncate\b/, reason: "truncates a table" },
  { re: /\bdrop\s+database\b/, reason: "drops a database" },
  { re: /\b(grant|revoke)\b/, reason: "changes permissions (do that by hand, see docs/DEPLOY.md)" },
  { re: /\bcreate\s+extension\b/, reason: "creates an extension (database-wide)" },
  { re: /\bxdl_/, reason: "mentions the jobs-site tables" },
  { re: /"?public"?\./, reason: "touches the public schema" },
];

/** Removes comments and $$ function bodies so only the statement's own structure is checked. */
export function stripForCheck(stmt: string): string {
  return stmt
    .replace(/\$\$[\s\S]*?\$\$/g, "$$body$$")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "")
    .trim();
}

export function checkStatement(stmt: string): string | null {
  const s = stripForCheck(stmt).toLowerCase();
  if (!s) return null;
  for (const f of FORBIDDEN) if (f.re.test(s)) return f.reason;
  if (!ALLOWED_STARTS.some((re) => re.test(s))) return "is not a recognised hub-only statement";
  // Every schema-qualified name ("x"."y") must be in hub.
  for (const m of s.matchAll(/"([\w]+)"\s*\.\s*"/g)) {
    if (m[1] !== "hub") return `references schema "${m[1]}"`;
  }
  if (/^create (or replace )?trigger/.test(s) && !/ on "hub"\./.test(s)) return "trigger is not on a hub table";
  if (/\breferences\s+(?!"hub"\.)/.test(s)) return "foreign key points outside hub";
  return null;
}

export function checkMigrationsFolder(folder = path.join(process.cwd(), "drizzle")): GuardProblem[] {
  const problems: GuardProblem[] = [];
  const files = readdirSync(folder)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const text = readFileSync(path.join(folder, file), "utf8");
    for (const statement of text.split("--> statement-breakpoint")) {
      const reason = checkStatement(statement);
      if (reason) problems.push({ file, statement: stripForCheck(statement).slice(0, 160), reason });
    }
  }
  return problems;
}
