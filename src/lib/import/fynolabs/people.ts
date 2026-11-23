// The FynoLabs team and experts in the hub: one team member per email, one expert per person.
//
// Experts: a talent_profiles row is matched to the hub's expert by an earlier sync (legacy_map),
// the FynoLabs id (expert_sources 'admin_crm', also used by the CRM-export import), the email
// (lower case), then the LinkedIn URL. FynoLabs is the curated record: its values win over values
// the Engine copy brought, but never over edits the team made in the hub (merge.ts).
import { readJobsSite, type Reader } from "@/lib/server/jobs-sync";
import { mapJobsUser, type JobsApplication } from "@/lib/import/jobs";
import { normalizeCountry, normalizeDomain, splitSkills } from "@/lib/match/dictionary";
import { cleanLongText, cleanText, emailHash, normalizeEmail, normalizeLinkedin, normalizePhone, normalizeTags, splitList, toInt } from "@/lib/normalize";
import { isOneOf, OUTREACH_STATUSES, SENIORITY, SOURCE_CHANNELS, type ExpertStatus } from "@/lib/constants";
import type { SqlRunner } from "@/lib/import/engine/source";
import { mergeFields, union, type Json } from "./merge";
import { copyTable, emptyCounts, lit, one, rows, tableExists, type TableCounts } from "./sql";
import { COPY_SCHEMA, legacyName, SYNC_BY } from "./tables";

export type Ctx = {
  raw: SqlRunner;
  actorEmail: string;
  /** FynoLabs user id -> hub team member id. */
  teamByUser: Map<string, string>;
  /** FynoLabs user id -> email. */
  emailByUser: Map<string, string>;
  /** FynoLabs account id -> hub partner (company) id. */
  companyByAccount: Map<string, string>;
  /** FynoLabs talent_profiles id -> hub expert id. */
  expertByProfile: Map<string, string>;
  erased: Erasures;
};

export type Erasures = { sha: Set<string>; md5: Set<string>; profileIds: Set<string> };

export async function loadErasures(raw: SqlRunner): Promise<Erasures> {
  const r = await rows<{ email_sha256: string | null; email_md5: string | null; source: string | null; external_id: string | null }>(raw, `select email_sha256, email_md5, source, external_id from hub.erasures`);
  return {
    sha: new Set(r.map((x) => x.email_sha256).filter((x): x is string => Boolean(x))),
    md5: new Set(r.map((x) => x.email_md5).filter((x): x is string => Boolean(x))),
    profileIds: new Set(r.filter((x) => x.source === "admin_crm" && x.external_id).map((x) => x.external_id!)),
  };
}

export async function md5Hex(s: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("md5").update(s).digest("hex");
}

/** Deleted on request in the hub, or erased in the FynoLabs admin (privacy_log keeps an MD5 of the email). */
export async function isErasedEmail(e: Erasures, email: string | null): Promise<boolean> {
  if (!email) return false;
  const norm = email.trim().toLowerCase();
  return e.sha.has(emailHash(norm)) || e.md5.has(await md5Hex(norm));
}

type Legacy = { hubId: string; written: Record<string, Json> | null; present: boolean };

export async function loadLegacy(raw: SqlRunner, source: string, hubTable: string): Promise<Map<string, Legacy>> {
  const r = await rows<{ source_id: string; hub_id: string; written: Record<string, Json> | null; present: boolean }>(
    raw,
    `select m.source_id, m.hub_id::text as hub_id, m.written, (h.id is not null) as present
     from hub.legacy_map m left join hub."${hubTable}" h on h.id = m.hub_id where m.source_table = $1`,
    [legacyName(source)],
  );
  return new Map(r.map((x) => [x.source_id, { hubId: x.hub_id, written: x.written, present: Boolean(x.present) }]));
}

export async function saveLegacy(raw: SqlRunner, source: string, sourceId: string, hubTable: string, hubId: string, written: Record<string, Json> | null) {
  await raw.query(
    `insert into hub.legacy_map (source_table, source_id, hub_table, hub_id, written, created_at, updated_at) values ($1, $2, $3, $4::uuid, $5::jsonb, now(), now())
     on conflict (source_table, source_id) do update set hub_id = excluded.hub_id, hub_table = excluded.hub_table, written = coalesce(excluded.written, hub.legacy_map.written), updated_at = now()`,
    [legacyName(source), sourceId, hubTable, hubId, written == null ? null : JSON.stringify(written)],
  );
}

export async function logChange(raw: SqlRunner, actor: string, entityType: string, entityId: string, action: string, detail: Record<string, Json>) {
  await raw.query(`insert into hub.activity (entity_type, entity_id, actor_email, actor_role, action, detail) values ($1, $2, $3, 'admin', $4, $5::jsonb)`, [entityType, entityId, actor, action, JSON.stringify(detail)]);
}

/** Writes the given columns (snake_case keys) through jsonb_populate_record, so every type is cast by Postgres. */
export async function insertRow(raw: SqlRunner, table: string, values: Record<string, Json>): Promise<string | null> {
  const cols = Object.keys(values).map((k) => `"${k}"`);
  const [r] = await rows<{ id: string }>(raw, `insert into hub."${table}" (${cols.join(", ")}) select ${cols.join(", ")} from jsonb_populate_record(null::hub."${table}", $1::jsonb) on conflict do nothing returning id::text as id`, [JSON.stringify(values)]);
  return r?.id ?? null;
}

export async function updateRow(raw: SqlRunner, table: string, id: string, values: Record<string, Json>, touch = true): Promise<void> {
  const cols = Object.keys(values);
  if (!cols.length) return;
  await raw.query(
    `update hub."${table}" t set ${cols.map((c) => `"${c}" = r."${c}"`).join(", ")}${touch ? ", updated_at = now()" : ""}
     from jsonb_populate_record(null::hub."${table}", $1::jsonb) r where t.id = $2::uuid`,
    [JSON.stringify(values), id],
  );
}

// ---------------------------------------------------------------- team

/**
 * FynoLabs team members -> hub.team_members, by email. People already on the hub's team keep their
 * role and access (only their FynoLabs sections are filled in). New people are added with access
 * turned OFF (role admin if they are a FynoLabs admin, else viewer): an admin turns them on in
 * Team & access. Owners and "created by" then point at the right person.
 */
export async function mapTeam(raw: SqlRunner): Promise<{ counts: TableCounts; teamByUser: Map<string, string>; emailByUser: Map<string, string> }> {
  const counts = emptyCounts("team_members", "team_members");
  const emailByUser = new Map<string, string>();
  const teamByUser = new Map<string, string>();
  if (await tableExists(raw, `${COPY_SCHEMA}.auth_users`)) {
    for (const u of await rows<{ id: string; email: string | null }>(raw, `select id::text as id, lower(email) as email from ${copyTable("auth_users")}`)) if (u.email) emailByUser.set(u.id, u.email);
  }
  if (!(await tableExists(raw, `${COPY_SCHEMA}.team_members`))) return { counts: { ...counts, note: "not copied yet" }, teamByUser, emailByUser };
  const admins = new Set<string>();
  if (await tableExists(raw, `${COPY_SCHEMA}.user_roles`)) for (const r of await rows<{ u: string }>(raw, `select user_id::text as u from ${copyTable("user_roles")} where role = 'admin'`)) admins.add(r.u);
  const team = await rows<{ user_id: string; email: string; name: string | null; invited_by: string | null; sections: string[]; created_at: string }>(
    raw,
    `select user_id::text as user_id, lower(btrim(email)) as email, name, invited_by::text as invited_by, sections, created_at::text as created_at from ${copyTable("team_members")} order by created_at`,
  );
  counts.copyRows = team.length;
  const legacy = await loadLegacy(raw, "team_members", "team_members");
  for (const m of team) {
    const email = normalizeEmail(m.email);
    if (!email) {
      counts.skipped++;
      continue;
    }
    emailByUser.set(m.user_id, email);
    const l = legacy.get(m.user_id);
    if (l && !l.present) {
      counts.removedInHub++;
      continue;
    }
    const [hub] = await rows<{ id: string; sections: string[]; name: string | null; invited_by: string | null }>(raw, `select id::text as id, sections, name, invited_by from hub.team_members where email = $1`, [email]);
    const invitedBy = m.invited_by ? (emailByUser.get(m.invited_by) ?? null) : null;
    if (!hub) {
      const [row] = await rows<{ id: string }>(
        raw,
        `insert into hub.team_members (email, name, role, active, sections, invited_by, created_by, created_at, updated_at)
         values ($1, $2, $3, false, $4::text[], $5, $6, coalesce($7::timestamptz, now()), now()) on conflict do nothing returning id::text as id`,
        [email, cleanText(m.name, 120), admins.has(m.user_id) ? "admin" : "viewer", `{${(m.sections ?? []).map((s) => `"${s.replace(/"/g, "")}"`).join(",")}}`, invitedBy, SYNC_BY, m.created_at],
      );
      if (!row) continue;
      teamByUser.set(m.user_id, row.id);
      await saveLegacy(raw, "team_members", m.user_id, "team_members", row.id, null);
      counts.inserted++;
      counts.hubRows++;
      continue;
    }
    teamByUser.set(m.user_id, hub.id);
    const patch: Record<string, Json> = {};
    if (!hub.sections?.length && m.sections?.length) patch.sections = m.sections;
    if (!hub.name && cleanText(m.name, 120)) patch.name = cleanText(m.name, 120);
    if (!hub.invited_by && invitedBy) patch.invited_by = invitedBy;
    if (Object.keys(patch).length) {
      await updateRow(raw, "team_members", hub.id, patch);
      counts.updated++;
    } else counts.unchanged++;
    await saveLegacy(raw, "team_members", m.user_id, "team_members", hub.id, null);
    counts.hubRows++;
  }
  return { counts, teamByUser, emailByUser };
}

// ---------------------------------------------------------------- experts

/** FynoLabs status -> hub status. do_not_contact always wins. */
export function statusFromFynolabs(status: string | null | undefined, dnc: boolean): ExpertStatus {
  if (dnc) return "do_not_contact";
  switch (status) {
    case "bench":
      return "bench";
    case "active":
      return "placed";
    case "inactive":
      return "inactive";
    default:
      return "applicant"; // prospect, new
  }
}

const EXPERT_BLANKS: Record<string, readonly Json[]> = { status: ["applicant"], cv_consent: ["unknown"], next_action_auto: [false], email_opt_out: [false] };
const LISTS = ["skills", "languages"] as const;

export type Profile = Record<string, Json> & { id: string; email: string | null; name: string };

/** One talent_profiles row (as JSON from the copy) -> hub expert columns. Dates and times pass through as Postgres wrote them. */
export function expertFromProfile(p: Profile, ctx: Pick<Ctx, "teamByUser" | "companyByAccount">, batches: Set<string>): Record<string, Json> {
  const s = (k: string) => (p[k] == null ? null : String(p[k]));
  const out: Record<string, Json> = {
    full_name: cleanText(p.name, 200),
    email: normalizeEmail(p.email),
    phone: normalizePhone(p.phone),
    country: s("country") ? normalizeCountry(s("country")) : null,
    region: cleanText(p.region, 80),
    city: cleanText(p.city, 80),
    linkedin_url: normalizeLinkedin(p.linkedin_url),
    headline: cleanText(p.headline, 200),
    domain: s("field") ? normalizeDomain(s("field")) : null,
    skills: splitSkills(s("skills")),
    languages: splitList(p.languages ?? [], 20),
    years_experience: toInt(p.years_experience, 0, 70),
    highest_degree: cleanText(p.education, 120),
    university: cleanText(p.university, 160),
    hours_per_week: toInt(p.hours_per_week, 0, 100),
    status: statusFromFynolabs(s("status"), Boolean(p.do_not_contact)),
    cv_consent: p.consented_at ? "yes" : null,
    location: cleanText(p.location, 200),
    timezone: cleanText(p.timezone, 60),
    seniority: isOneOf(SENIORITY, p.seniority) ? p.seniority : null,
    links: cleanLongText(p.links, 2000),
    owner_team_member_id: s("owner_id") ? (ctx.teamByUser.get(s("owner_id")!) ?? null) : null,
    outreach_status: isOneOf(OUTREACH_STATUSES, p.outreach_status) ? p.outreach_status : null,
    next_action: cleanText(p.next_action, 500),
    next_action_due: p.next_action_due ?? null,
    next_action_auto: Boolean(p.next_action_auto),
    last_activity_at: p.last_activity_at ?? null,
    last_contacted_at: p.last_contacted_at ?? null,
    source_channel: isOneOf(SOURCE_CHANNELS, p.source) ? p.source : null,
    source_detail: cleanText(p.source_detail, 500),
    source_company_id: s("source_account_id") ? (ctx.companyByAccount.get(s("source_account_id")!) ?? null) : null,
    import_batch_id: s("import_batch_id") && batches.has(s("import_batch_id")!) ? s("import_batch_id") : null,
    consent_source: cleanText(p.consent_source, 40),
    dnc_reason: cleanText(p.dnc_reason, 500),
    dnc_at: p.dnc_at ?? null,
    email_opt_out: Boolean(p.email_opt_out),
    email_opt_out_at: p.email_opt_out_at ?? null,
    attributes: p.attributes && typeof p.attributes === "object" ? p.attributes : {},
  };
  const note = cleanLongText(p.notes, 4000);
  out.notes = note ? `FynoLabs note: ${note}` : null;
  return out;
}

/** What the Engine copy would write on each field (from engine_copy), by hub expert id. */
export async function engineDrafts(raw: SqlRunner): Promise<Map<string, Record<string, Json>>> {
  const out = new Map<string, Record<string, Json>>();
  if (!(await tableExists(raw, "engine_copy.users")) || !(await tableExists(raw, "engine_copy.applications")) || !(await tableExists(raw, "engine_copy.jobs")) || !(await tableExists(raw, "engine_copy.files"))) return out;
  const read: Reader = async (text) => rows(raw, text);
  const data = await readJobsSite(read, { schema: "engine_copy", prefix: "" });
  const links = await rows<{ external_id: string; expert_id: string }>(raw, `select external_id, expert_id::text as expert_id from hub.expert_sources where source = 'jobs_site'`);
  const byUser = new Map(links.map((l) => [l.external_id, l.expert_id]));
  const apps = new Map<number, JobsApplication[]>();
  for (const a of data.apps) apps.set(Number(a.user_id), [...(apps.get(Number(a.user_id)) ?? []), a]);
  for (const u of data.users) {
    const expertId = byUser.get(String(u.id));
    if (!expertId) continue;
    const d = mapJobsUser({ ...u, id: Number(u.id) }, apps.get(Number(u.id)) ?? []).draft;
    out.set(expertId, {
      full_name: d.fullName, email: d.email, phone: d.phone, country: d.country, region: d.region, city: d.city, linkedin_url: d.linkedinUrl, headline: d.headline,
      domain: d.domain, skills: d.skills, languages: d.languages, years_experience: d.yearsExperience, highest_degree: d.highestDegree, university: d.university,
      hours_per_week: d.hoursPerWeek, status: d.status, notes: d.notes,
    });
  }
  return out;
}

export type ExpertCounts = TableCounts & { created: number; matchedByEmail: number; matchedByLinkedin: number; possibleDuplicates: number; erased: number };

type HubExpert = Record<string, Json> & { id: string; email: string | null; linkedin_url: string | null; tags: string[] };

async function hubExpert(raw: SqlRunner, id: string): Promise<HubExpert | null> {
  const [r] = await rows<{ j: HubExpert }>(raw, `select (to_jsonb(e) - 'search') as j from hub.experts e where e.id = $1::uuid`, [id]);
  return r?.j ?? null;
}

/** Every talent_profiles row -> one hub expert (created or merged). */
export async function mapExperts(ctx: Ctx): Promise<ExpertCounts> {
  const { raw } = ctx;
  const counts: ExpertCounts = { ...emptyCounts("talent_profiles", "experts"), created: 0, matchedByEmail: 0, matchedByLinkedin: 0, possibleDuplicates: 0, erased: 0 };
  if (!(await tableExists(raw, `${COPY_SCHEMA}.talent_profiles`))) return { ...counts, note: "not copied yet" };
  const profiles = (await rows<{ j: Profile }>(raw, `select to_jsonb(p) - 'search' as j from ${copyTable("talent_profiles")} p order by p.created_at, p.id`)).map((r) => r.j);
  counts.copyRows = profiles.length;
  const legacy = await loadLegacy(raw, "talent_profiles", "experts");
  const sources = new Map((await rows<{ external_id: string; expert_id: string }>(raw, `select external_id, expert_id::text as expert_id from hub.expert_sources where source = 'admin_crm'`)).map((r) => [r.external_id, r.expert_id]));
  const index = await rows<{ id: string; email: string | null; li: string | null }>(raw, `select id::text as id, email, lower(linkedin_url) as li from hub.experts`);
  const byEmail = new Map(index.filter((e) => e.email).map((e) => [e.email!, e.id]));
  const byLinkedin = new Map<string, { id: string; email: string | null }>();
  for (const e of index) if (e.li && !byLinkedin.has(e.li)) byLinkedin.set(e.li, { id: e.id, email: e.email });
  const batches = new Set((await tableExists(raw, "hub.import_batches")) ? (await rows<{ id: string }>(raw, `select id::text as id from hub.import_batches`)).map((r) => r.id) : []);
  const engine = await engineDrafts(raw);

  for (const p of profiles) {
    const email = normalizeEmail(p.email);
    if (ctx.erased.profileIds.has(p.id) || (await isErasedEmail(ctx.erased, email))) {
      counts.erased++;
      counts.skipped++;
      continue;
    }
    const incoming = expertFromProfile(p, ctx, batches);
    if (!incoming.full_name) {
      counts.skipped++;
      continue;
    }
    const l = legacy.get(p.id);
    if (l && !l.present) {
      counts.removedInHub++;
      continue;
    }
    let expertId: string | null = l?.hubId ?? sources.get(p.id) ?? null;
    let tag: string | null = null;
    if (!expertId && email && byEmail.has(email)) {
      expertId = byEmail.get(email)!;
      counts.matchedByEmail++;
    }
    const li = typeof incoming.linkedin_url === "string" ? incoming.linkedin_url.toLowerCase() : null;
    if (!expertId && li && byLinkedin.has(li)) {
      const m = byLinkedin.get(li)!;
      // Same LinkedIn, two different emails: probably the same person, but not certain. A separate
      // record tagged possible-duplicate, for the team to merge.
      if (!m.email || !email || m.email === email) {
        expertId = m.id;
        counts.matchedByLinkedin++;
      } else tag = "possible-duplicate";
    }
    const tags = union(normalizeTags(p.tags ?? []), ["fynolabs", ...(tag ? [tag] : [])]);
    const sourceRows = async (id: string) => {
      await raw.query(
        `insert into hub.expert_sources (expert_id, source, external_id, last_synced_at) values ($1::uuid, 'admin_crm', $2, now())
         on conflict (source, external_id) do update set last_synced_at = now()`,
        [id, p.id],
      );
    };

    if (!expertId) {
      const values: Record<string, Json> = { ...incoming, tags, primary_source: "admin_crm", created_at: p.created_at ?? null, updated_at: p.updated_at ?? p.created_at ?? null };
      for (const k of Object.keys(values)) if (values[k] == null) delete values[k];
      if (values.cv_consent === "yes") values.cv_consent_at = p.consented_at;
      if (values.email && byEmail.has(String(values.email))) delete values.email;
      const id = await insertRow(raw, "experts", values);
      if (!id) {
        counts.skipped++;
        continue;
      }
      ctx.expertByProfile.set(p.id, id);
      if (incoming.email) byEmail.set(String(incoming.email), id);
      if (li && !byLinkedin.has(li)) byLinkedin.set(li, { id, email: (incoming.email as string) ?? null });
      await sourceRows(id);
      const written = Object.fromEntries(Object.entries(incoming).filter(([, v]) => v != null));
      await saveLegacy(raw, "talent_profiles", p.id, "experts", id, written);
      await logChange(raw, ctx.actorEmail, "expert", id, "created", { source: "fynolabs", ...(tag ? { possibleDuplicate: true } : {}) });
      counts.inserted++;
      counts.created++;
      if (tag) counts.possibleDuplicates++;
      counts.hubRows++;
      continue;
    }

    const hub = await hubExpert(raw, expertId);
    if (!hub) {
      counts.removedInHub++;
      continue;
    }
    ctx.expertByProfile.set(p.id, expertId);
    const eng = engine.get(expertId);
    // Engine's note stays, after FynoLabs' one.
    if (incoming.notes && eng?.notes && !String(incoming.notes).includes(String(eng.notes))) incoming.notes = `${incoming.notes}\n\n${eng.notes}`;
    const { patch, written } = mergeFields(hub, incoming, l?.written ?? null, { engine: eng, blanks: EXPERT_BLANKS, lists: LISTS });
    if (patch.email && byEmail.has(String(patch.email)) && byEmail.get(String(patch.email)) !== expertId) delete patch.email; // that email is someone else's record
    if (patch.cv_consent === "yes") patch.cv_consent_at = p.consented_at;
    const newTags = union(hub.tags ?? [], tags);
    if (newTags.length !== (hub.tags ?? []).length) patch.tags = newTags;
    if (Object.keys(patch).length) {
      await updateRow(raw, "experts", expertId, patch);
      await logChange(raw, ctx.actorEmail, "expert", expertId, "updated_by_fynolabs", { fields: Object.keys(patch) });
      counts.updated++;
    } else counts.unchanged++;
    await sourceRows(expertId);
    await saveLegacy(raw, "talent_profiles", p.id, "experts", expertId, written);
    counts.hubRows++;
  }
  counts.merged = counts.hubRows - new Set(ctx.expertByProfile.values()).size;
  await expertExtras(ctx, profiles);
  return counts;
}

/** Referred by, the money-only default commission, "added" date, and the FynoLabs CV. */
async function expertExtras(ctx: Ctx, profiles: Profile[]) {
  const { raw } = ctx;
  for (const p of profiles) {
    const id = ctx.expertByProfile.get(p.id);
    if (!id) continue;
    const ref = p.referred_by_id ? ctx.expertByProfile.get(String(p.referred_by_id)) : undefined;
    if (ref && ref !== id) {
      await raw.query(
        `insert into hub.expert_details (expert_id, referred_by_expert_id, updated_by, updated_at) values ($1::uuid, $2::uuid, $3, now())
         on conflict (expert_id) do update set referred_by_expert_id = excluded.referred_by_expert_id, updated_at = now()
         where hub.expert_details.referred_by_expert_id is null`,
        [id, ref, SYNC_BY],
      );
    }
    const pct = p.default_commission_percent == null ? null : Number(p.default_commission_percent);
    if (pct != null && Number.isFinite(pct) && pct > 0) {
      await raw.query(
        `insert into hub.expert_payout (expert_id, default_commission_percent, updated_by, updated_at) values ($1::uuid, $2::numeric, $3, now())
         on conflict (expert_id) do update set default_commission_percent = excluded.default_commission_percent, updated_at = now()
         where hub.expert_payout.default_commission_percent is null or hub.expert_payout.updated_by = $3`,
        [id, pct, SYNC_BY],
      );
    }
    if (p.created_at) await raw.query(`update hub.experts set created_at = $2::timestamptz where id = $1::uuid and created_at > $2::timestamptz`, [id, p.created_at]);
    const path = typeof p.resume_path === "string" ? p.resume_path : null;
    if (path) {
      const [bucket, ...rest] = path.split("/");
      const fileId = await ensureFile(raw, id, bucket, rest.join("/"), "cv");
      if (fileId) await setCurrentCv(raw, id, fileId);
    }
  }
}

// ---------------------------------------------------------------- files

/** "talent-resumes/abc.pdf" (or bucket + name) -> a hub.expert_files row (storage fynolabs: the bytes stay in fynolabs_copy). */
export async function ensureFile(raw: SqlRunner, expertId: string, bucket: string, name: string, kind: "cv" | "document" | "attachment"): Promise<string | null> {
  if (!bucket || !name) return null;
  const ref = `fynolabs:${bucket}/${name}`;
  const [have] = await rows<{ id: string }>(raw, `select id::text as id from hub.expert_files where expert_id = $1::uuid and external_ref = $2 limit 1`, [expertId, ref]);
  if (have) return have.id;
  if (!(await tableExists(raw, `${COPY_SCHEMA}.storage_objects`))) return null;
  const [row] = await rows<{ id: string }>(
    raw,
    `insert into hub.expert_files (expert_id, kind, filename, mime, size, storage, external_ref, created_by, created_at)
     select $1::uuid, $2, left(regexp_replace(o.name, '^.*/', ''), 200), coalesce(o.mime, 'application/octet-stream'), coalesce(o.size, octet_length(o.data), 0)::int, 'fynolabs', $3, ${lit(SYNC_BY)}, coalesce(o.created_at, now())
     from ${copyTable("storage_objects")} o where o.bucket = $4 and o.name = $5
     returning id::text as id`,
    [expertId, kind, ref, bucket, name],
  );
  return row?.id ?? null;
}

/** The FynoLabs CV becomes the current one unless someone uploaded a CV in the hub (a job form, the portal or the team). */
export async function setCurrentCv(raw: SqlRunner, expertId: string, fileId: string) {
  await raw.query(
    `update hub.experts e set cv_ref = 'upload:' || $2 where e.id = $1::uuid and e.cv_ref is distinct from ('upload:' || $2)
       and (e.cv_ref is null or e.cv_ref like 'jobs:file:%' or e.cv_ref in (
         select 'upload:' || f.id from hub.expert_files f where f.expert_id = e.id and (f.external_ref like 'jobs:%' or f.storage in ('jobs_db', 'fynolabs'))))`,
    [expertId, fileId],
  );
}

/**
 * Applicants FynoLabs never made a profile for (a job form, the talent form): found by email, then
 * LinkedIn, or added (fill-empty only: these aren't curated records).
 */
export async function expertForApplicant(ctx: Ctx, a: { name: string | null; email: string | null; link?: string | null; location?: string | null; channel: string; createdAt: Json }): Promise<{ id: string | null; created: boolean; erased: boolean }> {
  const { raw } = ctx;
  const email = normalizeEmail(a.email);
  if (await isErasedEmail(ctx.erased, email)) return { id: null, created: false, erased: true };
  if (email) {
    const [e] = await rows<{ id: string }>(raw, `select id::text as id from hub.experts where email = $1`, [email]);
    if (e) return { id: e.id, created: false, erased: false };
  }
  const li = normalizeLinkedin(a.link);
  if (li && /linkedin\.com/i.test(li)) {
    const [e] = await rows<{ id: string; email: string | null }>(raw, `select id::text as id, email from hub.experts where lower(linkedin_url) = $1 limit 1`, [li.toLowerCase()]);
    if (e && (!e.email || !email)) {
      if (email && !e.email) await raw.query(`update hub.experts set email = $2, updated_at = now() where id = $1::uuid and email is null`, [e.id, email]);
      return { id: e.id, created: false, erased: false };
    }
  }
  const name = cleanText(a.name, 200) ?? (email ? email.split("@")[0] : null);
  if (!name) return { id: null, created: false, erased: false };
  const values: Record<string, Json> = { full_name: name, primary_source: "admin_crm", source_channel: a.channel, tags: ["fynolabs"], created_at: a.createdAt ?? null };
  if (email) values.email = email;
  if (li && /linkedin\.com/i.test(li)) values.linkedin_url = li;
  if (a.location) values.location = cleanText(a.location, 200);
  for (const k of Object.keys(values)) if (values[k] == null) delete values[k];
  const id = await insertRow(raw, "experts", values);
  if (!id) {
    const [again] = email ? await rows<{ id: string }>(raw, `select id::text as id from hub.experts where email = $1`, [email]) : [];
    return { id: again?.id ?? null, created: false, erased: false };
  }
  await logChange(raw, ctx.actorEmail, "expert", id, "created", { source: "fynolabs", via: a.channel });
  return { id, created: true, erased: false };
}

export { one };
