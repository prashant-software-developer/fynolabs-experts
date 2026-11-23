// `npm run sync:fynolabs`, the second half: fynolabs_copy (written by the hub-sync edge function)
// folded into the hub's own tables. Idempotent: run it as often as you like; every row remembers
// what it became (hub.legacy_map, source_table 'fynolabs.<table>'), nothing is deleted, and records
// edited in the hub keep those edits. Counts only come back (no names, no emails).
import type { SqlRunner } from "@/lib/import/engine/source";
import { loadErasures, mapExperts, mapTeam, type Ctx } from "./people";
import { ADMIN, ANALYTICS, CRM, EMAIL, IMPORT_BATCHES, MESSAGES, PEOPLE_WORK, PLATFORMS, PRIVACY, PROJECTS, RADAR } from "./simple";
import { copySimple, emptyCounts, one, rows, tableExists, type TableCounts } from "./sql";
import { COPY_SCHEMA, FYNOLABS_MAP } from "./tables";
import { documentFiles, mapApplications, mapCompanies, mapJobs } from "./work";

export type MapResult = {
  tables: TableCounts[];
  /** Tables in fynolabs_copy the hub has no place for yet (copied, not mapped). */
  copiedOnly: { table: string; rows: number }[];
  files: { linked: number; documents: number };
  ms: number;
};

export async function syncFynolabsIntoHub(raw: SqlRunner, opts: { actorEmail: string; log?: (line: string) => void }): Promise<MapResult> {
  const started = Date.now();
  const log = opts.log ?? (() => {});
  if (!(await tableExists(raw, `${COPY_SCHEMA}.talent_profiles`))) throw new Error("fynolabs_copy is empty: run the copy first (the edge function hub-sync).");
  // Dates and times compare the same way on both sides.
  await raw.query(`set time zone 'UTC'`);
  const tables: TableCounts[] = [];
  const step = async (label: string, run: () => Promise<TableCounts | TableCounts[]>) => {
    log(`  ${label}...`);
    const r = await run();
    tables.push(...(Array.isArray(r) ? r : [r]));
  };
  const simple = (specs: Parameters<typeof copySimple>[1][]) => async () => {
    const out: TableCounts[] = [];
    for (const s of specs) out.push(await copySimple(raw, s));
    return out;
  };

  await step("Erasures from the FynoLabs admin", simple([PRIVACY]));
  const ctx: Ctx = { raw, actorEmail: opts.actorEmail, teamByUser: new Map(), emailByUser: new Map(), companyByAccount: new Map(), expertByProfile: new Map(), erased: await loadErasures(raw) };
  await step("Team", async () => {
    const t = await mapTeam(raw);
    ctx.teamByUser = t.teamByUser;
    ctx.emailByUser = t.emailByUser;
    const roles = emptyCounts("user_roles", "team_members");
    roles.copyRows = (await tableExists(raw, `${COPY_SCHEMA}.user_roles`)) ? await one(raw, `select count(*)::int as n from fynolabs_copy.user_roles`) : 0;
    roles.hubRows = roles.copyRows;
    roles.note = "folded into team members (admin role)";
    const users = emptyCounts("auth_users", "(lookup)");
    users.copyRows = ctx.emailByUser.size;
    users.hubRows = users.copyRows;
    users.note = "emails for owners and created_by";
    return [t.counts, roles, users];
  });
  await step("Platforms", simple([PLATFORMS]));
  await step("Companies", () => mapCompanies(ctx));
  await step("Contacts, company activity, calendar", simple(CRM));
  await step("Projects", simple(PROJECTS));
  await step("Job radar", simple([RADAR]));
  const jobs = await (async () => {
    log("  Jobs...");
    const j = await mapJobs(ctx);
    tables.push(j.counts);
    return j;
  })();
  await step("Import batches", simple([IMPORT_BATCHES]));
  await step("Experts", () => mapExperts(ctx));
  await step("Pipelines (job and talent-call applications)", async () => {
    const a = await mapApplications(ctx, jobs);
    return [a.job, a.talent];
  });
  log("  Documents...");
  const documents = await documentFiles(ctx);
  await step("Timeline, documents, invites, engagements, referrals, links", simple(PEOPLE_WORK));
  await step("Email", simple(EMAIL));
  await step("Messages", simple(MESSAGES));
  await step("Saved views, settings, audit log", simple(ADMIN));
  await step("Visitor analytics", simple(ANALYTICS));

  const linked = await one(raw, `select count(*)::int as n from hub.expert_files where storage = 'fynolabs'`);
  const storage = emptyCounts("storage_objects", "expert_files");
  if (await tableExists(raw, `${COPY_SCHEMA}.storage_objects`)) {
    storage.copyRows = await one(raw, `select count(*)::int as n from fynolabs_copy.storage_objects`);
    storage.hubRows = await one(raw, `select count(distinct o.bucket || '/' || o.name)::int as n from fynolabs_copy.storage_objects o join hub.expert_files f on f.external_ref = 'fynolabs:' || o.bucket || '/' || o.name`);
    storage.note = "files of experts in the hub; bytes stored once, in fynolabs_copy";
  }
  tables.push(storage);
  // Settings and folded tables: one row each.
  const present = await rows<{ t: string }>(raw, `select table_name::text as t from information_schema.tables where table_schema = '${COPY_SCHEMA}' and table_name not like '\\_%' order by 1`);
  const copiedOnly: MapResult["copiedOnly"] = [];
  for (const { t } of present) {
    if (FYNOLABS_MAP[t]) continue;
    copiedOnly.push({ table: t, rows: await one(raw, `select count(*)::int as n from fynolabs_copy."${t}"`) });
  }
  return { tables, copiedOnly, files: { linked, documents }, ms: Date.now() - started };
}

/** Rows each hub table has from FynoLabs now (for the dry run and the report). Read only. */
export async function hubCountsBySource(raw: SqlRunner): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!(await tableExists(raw, "hub.legacy_map"))) return out;
  for (const r of await rows<{ t: string; n: number }>(raw, `select source_table as t, count(*)::int as n from hub.legacy_map where source_table like 'fynolabs.%' group by 1`)) out.set(r.t.replace(/^fynolabs\./, ""), Number(r.n));
  return out;
}
