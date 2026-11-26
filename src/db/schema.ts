// Expert Hub tables. Everything lives in the Postgres schema "hub" so this app can share the
// "Engine" database with other apps without touching their tables.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  APPLICATION_CHANNELS,
  BUSINESS_LINES,
  CALENDAR_KINDS,
  CALENDAR_STATUSES,
  CAMPAIGN_STATUSES,
  COMPANY_ACTIVITY_KINDS,
  COMPANY_PRIORITIES,
  COMPANY_STAGES,
  CONTACT_KINDS,
  CONTACT_SOURCES,
  CONTACT_STAGES,
  COURSE_KINDS,
  COURSE_LEVELS,
  DOCUMENT_KINDS,
  DOCUMENT_STAGES,
  DOCUMENT_STATUSES,
  EXPERT_ACTIVITY_KINDS,
  FEE_STATUSES,
  LESSON_KINDS,
  LINK_CHANNELS,
  OUTREACH_STATUSES,
  PARTNER_KINDS,
  PAYOUT_STATUSES,
  PIPELINE_STAGES,
  PROJECT_KINDS,
  PROJECT_ROLES,
  PROJECT_STATUSES,
  RECIPIENT_STATUSES,
  REFERRAL_METHODS,
  REFERRAL_OUTCOMES,
  REJECT_REASONS,
  SENIORITY,
  SIGN_METHODS,
  START_AVAILABILITY,
  TEMPLATE_KINDS,
  VISIT_SOURCES,
} from "../lib/constants";

export const hub = pgSchema("hub");

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const bytea = customType<{ data: Uint8Array }>({
  dataType() {
    return "bytea";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const textArray = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`'{}'::text[]`);
const inList = (col: string, values: readonly string[]) =>
  sql.raw(`${col} in (${values.map((v) => `'${v}'`).join(", ")})`);

// Where an expert record came from. job_form = applied through a job's application form;
// portal = signed up on the expert portal.
const SOURCE_VALUES = ["jobs_site", "admin_crm", "register", "partner", "manual", "job_form", "portal"] as const;

export const experts = hub.table(
  "experts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    linkedinUrl: text("linkedin_url"),
    headline: text("headline"),
    domain: text("domain"),
    skills: textArray("skills"),
    languages: textArray("languages"),
    yearsExperience: integer("years_experience"),
    highestDegree: text("highest_degree"),
    fieldOfStudy: text("field_of_study"),
    university: text("university"),
    hoursPerWeek: integer("hours_per_week"),
    availability: text("availability").notNull().default("available"),
    rateExpectationUsd: integer("rate_expectation_usd"),
    status: text("status").notNull().default("applicant"),
    cvConsent: text("cv_consent").notNull().default("unknown"),
    cvConsentAt: ts("cv_consent_at"),
    cvRef: text("cv_ref"),
    notes: text("notes"),
    tags: textArray("tags"),
    primarySource: text("primary_source").notNull().default("manual"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    lastContactedAt: ts("last_contacted_at"),
    // Expert portal: first sign-in, and the onboarding steps they have saved.
    portalJoinedAt: ts("portal_joined_at"),
    onboardingDone: textArray("onboarding_done"),
    // From the FynoLabs admin (talent_profiles), 23 Nov 2026. Workflow fields the team uses day to day.
    location: text("location"),
    timezone: text("timezone"),
    seniority: text("seniority"),
    links: text("links"),
    ownerTeamMemberId: uuid("owner_team_member_id").references((): AnyPgColumn => teamMembers.id, { onDelete: "set null" }),
    ownerName: text("owner_name"),
    outreachStatus: text("outreach_status"),
    nextAction: text("next_action"),
    nextActionDue: date("next_action_due", { mode: "string" }),
    nextActionAuto: boolean("next_action_auto").notNull().default(false),
    lastActivityAt: ts("last_activity_at"),
    // How they first reached FynoLabs (talent_call, job, referral, sourced, ...), and the detail.
    sourceChannel: text("source_channel"),
    sourceDetail: text("source_detail"),
    sourceCompanyId: uuid("source_company_id").references((): AnyPgColumn => partners.id, { onDelete: "set null" }),
    importBatchId: uuid("import_batch_id").references((): AnyPgColumn => importBatches.id, { onDelete: "set null" }),
    consentSource: text("consent_source"),
    consentVersion: text("consent_version"),
    dncReason: text("dnc_reason"),
    dncAt: ts("dnc_at"),
    emailOptOut: boolean("email_opt_out").notNull().default(false),
    emailOptOutAt: ts("email_opt_out_at"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    // Kept up to date by the trigger hub.experts_search_refresh (see drizzle/0001_*.sql).
    search: tsvector("search"),
  },
  (t) => [
    uniqueIndex("experts_email_key").on(t.email),
    index("experts_linkedin_idx").on(t.linkedinUrl),
    index("experts_status_idx").on(t.status),
    index("experts_domain_idx").on(t.domain),
    index("experts_country_idx").on(t.country),
    index("experts_skills_idx").using("gin", t.skills),
    index("experts_search_idx").using("gin", t.search),
    check("experts_email_lower", sql`${t.email} is null or ${t.email} = lower(${t.email})`),
    check(
      "experts_status_check",
      inList("status", ["applicant", "screening", "bench", "submitted", "placed", "inactive", "do_not_contact"]),
    ),
    check("experts_availability_check", inList("availability", ["available", "limited", "busy", "unavailable"])),
    check("experts_cv_consent_check", inList("cv_consent", ["unknown", "yes", "no"])),
    check(
      "experts_primary_source_check",
      inList("primary_source", SOURCE_VALUES),
    ),
    check("experts_years_check", sql`${t.yearsExperience} is null or ${t.yearsExperience} between 0 and 70`),
    check("experts_seniority_check", sql`${t.seniority} is null or ${inList("seniority", SENIORITY)}`),
    check("experts_outreach_check", sql`${t.outreachStatus} is null or ${inList("outreach_status", OUTREACH_STATUSES)}`),
    index("experts_owner_idx").on(t.ownerTeamMemberId),
    index("experts_next_action_idx").on(t.nextActionDue),
  ],
);

/** Where each expert came from. unique(source, external_id) is what stops duplicates on re-import. */
export const expertSources = hub.table(
  "expert_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    lastSyncedAt: ts("last_synced_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("expert_sources_source_external_key").on(t.source, t.externalId),
    index("expert_sources_expert_idx").on(t.expertId),
    check("expert_sources_source_check", inList("source", SOURCE_VALUES)),
  ],
);

/**
 * Files. kind: cv, attachment (other job-form uploads) or tax (tax forms copied from the old jobs
 * site: money-only, admins and finance). storage = 'jobs_db': the bytes stay in the jobs site's
 * table (public.xdl_jobs_files, read only) and external_ref holds that file id. storage = 'upload':
 * the bytes are in `data` (external_ref "jobs:<id>" when copied from the jobs site). storage =
 * 'fynolabs': a CV or document from the FynoLabs admin; the bytes are stored once, in
 * fynolabs_copy.storage_objects, and external_ref is "fynolabs:<bucket>/<path>". kind 'document':
 * an agreement or NDA (hub.expert_documents points at it).
 */
export const expertFiles = hub.table(
  "expert_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("cv"),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    storage: text("storage").notNull(),
    externalRef: text("external_ref"),
    data: bytea("data"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("expert_files_expert_idx").on(t.expertId, t.createdAt),
    check("expert_files_storage_check", inList("storage", ["jobs_db", "upload", "fynolabs"])),
    check("expert_files_kind_check", inList("kind", ["cv", "attachment", "tax", "document", "avatar"])),
  ],
);

/**
 * Companies: one record per organisation. The partners that send requirements and every account of
 * the FynoLabs admin's CRM (accounts: AI data partners, expert platforms, agencies, staffing firms,
 * talent sources, trainer gigs, clients) with their owner, stage, next step, due date and route.
 * Kept under its first name (partners) so requirements, jobs, placements and pod-lead scopes keep
 * pointing at it. updated_by = 'fynolabs sync' while only the sync has written the row.
 */
export const partners = hub.table(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("data_partner"),
    website: text("website"),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
    businessLine: text("business_line").notNull().default("ai_training"),
    stage: text("stage").notNull().default("active"),
    priority: text("priority").notNull().default("normal"),
    ownerTeamMemberId: uuid("owner_team_member_id").references((): AnyPgColumn => teamMembers.id, { onDelete: "set null" }),
    ownerName: text("owner_name"),
    nextStep: text("next_step"),
    nextStepDue: date("next_step_due", { mode: "string" }),
    bestRoute: text("best_route"),
    domain: text("domain"),
    location: text("location"),
    platformId: uuid("platform_id").references((): AnyPgColumn => platforms.id, { onDelete: "set null" }),
    tags: textArray("tags"),
    stageChangedAt: ts("stage_changed_at").notNull().defaultNow(),
    lastActivityAt: ts("last_activity_at"),
    createdBy: text("created_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: text("updated_by"),
  },
  (t) => [
    uniqueIndex("partners_name_key").on(sql`lower(${t.name})`),
    check("partners_kind_check", inList("kind", PARTNER_KINDS)),
    check("partners_stage_check", inList("stage", COMPANY_STAGES)),
    check("partners_priority_check", inList("priority", COMPANY_PRIORITIES)),
    check("partners_business_line_check", inList("business_line", BUSINESS_LINES)),
    index("partners_stage_idx").on(t.stage, t.nextStepDue),
    index("partners_owner_idx").on(t.ownerTeamMemberId),
  ],
);

export const requirements = hub.table(
  "requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    externalRef: text("external_ref"),
    description: text("description"),
    mustSkills: textArray("must_skills"),
    niceSkills: textArray("nice_skills"),
    domains: textArray("domains"),
    degrees: textArray("degrees"),
    countriesAllowed: textArray("countries_allowed"),
    countriesBlocked: textArray("countries_blocked"),
    minYears: integer("min_years"),
    slots: integer("slots").notNull().default(1),
    rateNote: text("rate_note"),
    deadline: date("deadline", { mode: "string" }),
    status: text("status").notNull().default("open"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("requirements_partner_idx").on(t.partnerId),
    index("requirements_status_idx").on(t.status),
    check("requirements_status_check", inList("status", ["open", "filling", "filled", "closed"])),
    check("requirements_slots_check", sql`${t.slots} between 1 and 500`),
  ],
);

export const submissions = hub.table(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("shortlisted"),
    score: integer("score"),
    submittedAt: ts("submitted_at"),
    partnerNote: text("partner_note"),
    internalNote: text("internal_note"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("submissions_requirement_expert_key").on(t.requirementId, t.expertId),
    index("submissions_expert_idx").on(t.expertId),
    index("submissions_status_idx").on(t.status),
    check(
      "submissions_status_check",
      inList("status", [
        "shortlisted",
        "consent_requested",
        "submitted",
        "partner_review",
        "approved",
        "rejected",
        "active",
        "ended",
        "withdrawn",
      ]),
    ),
  ],
);

export const placements = hub.table(
  "placements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable so the money history survives if an expert is deleted on request.
    expertId: uuid("expert_id").references(() => experts.id, { onDelete: "set null" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "set null" }),
    projectName: text("project_name").notNull(),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    basis: text("basis").notNull().default("hourly"),
    rateToExpert: numeric("rate_to_expert", { precision: 12, scale: 2, mode: "number" }),
    rateFromPartner: numeric("rate_from_partner", { precision: 12, scale: 2, mode: "number" }),
    currency: text("currency").notNull().default("USD"),
    hoursApproved: numeric("hours_approved", { precision: 10, scale: 2, mode: "number" }),
    tasksAccepted: integer("tasks_accepted"),
    earnedByExpert: numeric("earned_by_expert", { precision: 12, scale: 2, mode: "number" }),
    revenue: numeric("revenue", { precision: 12, scale: 2, mode: "number" }),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("placements_expert_idx").on(t.expertId),
    index("placements_partner_idx").on(t.partnerId),
    index("placements_status_idx").on(t.status),
    check("placements_status_check", inList("status", ["active", "paused", "ended"])),
    check("placements_basis_check", inList("basis", ["hourly", "per_task"])),
  ],
);

/** Audit trail: every change anyone makes writes one row here. Never store personal data in detail. */
export const activity = hub.table(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    // The actor's role at the time (admin, recruiter, ...). Null on rows from before roles existed.
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("activity_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("activity_created_idx").on(t.createdAt),
  ],
);

/**
 * People deleted on request. Only a SHA-256 of their email (and the jobs-site user id) is kept,
 * so imports can skip them instead of bringing them back.
 */
export const erasures = hub.table(
  "erasures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailSha256: text("email_sha256"),
    // The FynoLabs admin's erasures (privacy_log) only kept an MD5 of the email; checked too.
    emailMd5: text("email_md5"),
    reason: text("reason"),
    source: text("source"),
    externalId: text("external_id"),
    actorEmail: text("actor_email").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("erasures_email_idx").on(t.emailSha256), index("erasures_md5_idx").on(t.emailMd5), index("erasures_source_idx").on(t.source, t.externalId)],
);

/**
 * The core team and their roles. Sign-in itself is still Google + ALLOWED_DOMAIN / ALLOWED_EMAILS;
 * this table only decides what a signed-in person may do. ADMIN_EMAILS always wins (bootstrap).
 */
export const teamMembers = hub.table(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role").notNull().default("viewer"),
    active: boolean("active").notNull().default(true),
    // Pod leads only see submissions and placements for these partners.
    partnerIds: uuid("partner_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    // The FynoLabs admin's module access for this person (contact, talent, profiles, platforms, ...).
    sections: textArray("sections"),
    invitedBy: text("invited_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    createdBy: text("created_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("team_members_email_key").on(t.email),
    check("team_members_email_lower", sql`${t.email} = lower(${t.email})`),
    check("team_members_role_check", inList("role", ["admin", "recruiter", "pod_lead", "finance", "viewer"])),
  ],
);

/** Saved list views (filters, sort, columns, layout). Personal, or shared with the whole team. */
export const savedViews = hub.table(
  "saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmail: text("owner_email").notNull(),
    name: text("name").notNull(),
    collection: text("collection").notNull().default("experts"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    shared: boolean("shared").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("saved_views_owner_idx").on(t.collection, t.ownerEmail),
    index("saved_views_shared_idx").on(t.collection, t.shared),
    // fynolabs_*: views copied from the FynoLabs admin (their filters as FynoLabs had them), kept
    // apart from the hub's own Experts tabs until those screens exist here.
    check("saved_views_collection_check", inList("collection", ["experts", "fynolabs_experts", "fynolabs_submissions"])),
  ],
);

/**
 * A job opportunity: what the public sees (title, summary, description, company label) plus the
 * internal link to a partner and requirement. Public pages never show partner_id, requirement_id
 * or internal_rate_note.
 */
export const jobs = hub.table(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    publicCompanyLabel: text("public_company_label").notNull().default("AI data partner (via FynoLabs)"),
    partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
    requirementId: uuid("requirement_id").references(() => requirements.id, { onDelete: "set null" }),
    summary: text("summary"),
    description: text("description"),
    location: text("location"),
    employmentType: text("employment_type").notNull().default("contract"),
    domains: textArray("domains"),
    skills: textArray("skills"),
    countriesAllowed: textArray("countries_allowed"),
    countriesBlocked: textArray("countries_blocked"),
    minYears: integer("min_years"),
    openings: integer("openings").notNull().default(1),
    status: text("status").notNull().default("draft"),
    visibility: text("visibility").notNull().default("public"),
    featured: boolean("featured").notNull().default(false),
    closesOn: date("closes_on", { mode: "string" }),
    internalRateNote: text("internal_rate_note"),
    publishedAt: ts("published_at"),
    // From the FynoLabs admin's posted jobs. company_name: the company the FynoLabs post named
    // (internal: the public page shows public_company_label). pay_unit is money (admins and finance).
    // source_visibility: public / internal as it was on fynolabs.si; the hub never publishes a copied job.
    companyName: text("company_name"),
    projectId: uuid("project_id").references((): AnyPgColumn => projects.id, { onDelete: "set null" }),
    trackId: uuid("track_id").references((): AnyPgColumn => projectTracks.id, { onDelete: "set null" }),
    radarListingId: uuid("radar_listing_id").references((): AnyPgColumn => radarListings.id, { onDelete: "set null" }),
    applyUrl: text("apply_url"),
    requireGithub: boolean("require_github").notNull().default(false),
    badge: text("badge"),
    payUnit: text("pay_unit"),
    sourceVisibility: text("source_visibility"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("jobs_slug_key").on(t.slug),
    index("jobs_status_idx").on(t.status, t.visibility),
    index("jobs_partner_idx").on(t.partnerId),
    index("jobs_requirement_idx").on(t.requirementId),
    check("jobs_status_check", inList("status", ["draft", "open", "paused", "closed"])),
    check("jobs_visibility_check", inList("visibility", ["public", "unlisted", "internal"])),
    check("jobs_employment_type_check", inList("employment_type", ["contract", "part_time", "full_time", "freelance"])),
    check("jobs_openings_check", sql`${t.openings} between 1 and 1000`),
    check("jobs_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

/** The application form of a job, one row per field, in `position` order. */
export const jobFormFields = hub.table(
  "job_form_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: text("type").notNull(),
    label: text("label").notNull(),
    helpText: text("help_text"),
    required: boolean("required").notNull().default(false),
    options: jsonb("options").$type<{ choices?: string[] }>(),
    mapsTo: text("maps_to"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("job_form_fields_job_idx").on(t.jobId, t.position),
    check(
      "job_form_fields_type_check",
      inList("type", ["short_text", "long_text", "email", "phone", "url", "number", "single_select", "multi_select", "checkboxes", "yes_no", "date", "country", "years", "skills", "file", "consent", "section"]),
    ),
  ],
);

/** Reusable application forms (a list of field definitions). */
export const formTemplates = hub.table(
  "form_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    fields: jsonb("fields").$type<Record<string, unknown>[]>().notNull(),
    createdBy: text("created_by"),
    shared: boolean("shared").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("form_templates_name_idx").on(t.name)],
);

/** One application per person per job. Applying again updates the answers on the same row. */
export const applications = hub.table(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("new"),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
    source: jsonb("source").$type<{ utm?: Record<string, string>; ref?: string; invited?: boolean; jobsSite?: { applicationId: number; status: string } }>(),
    // Money (admins and finance only): the rate the applicant asked for on the old jobs site.
    // Never selected for applicant lists; read with applicationMoney().
    rateExpectationUsd: integer("rate_expectation_usd"),
    ipHash: text("ip_hash"),
    internalNote: text("internal_note"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    // The pipeline (one per person per job), with the FynoLabs admin's stages: Applied, Shortlisted,
    // Proposed to client, Selected, Documents sent, Signed, Active, Ended, Rejected. A trigger keeps
    // `status` and `stage` in step whichever one a change sets (drizzle/0006_*.sql).
    stage: text("stage").notNull().default("new"),
    stageChangedAt: ts("stage_changed_at").notNull().defaultNow(),
    startedOn: date("started_on", { mode: "string" }),
    endedOn: date("ended_on", { mode: "string" }),
    ownerTeamMemberId: uuid("owner_team_member_id").references((): AnyPgColumn => teamMembers.id, { onDelete: "set null" }),
    ownerName: text("owner_name"),
    trackId: uuid("track_id").references((): AnyPgColumn => projectTracks.id, { onDelete: "set null" }),
    // How it came in (applied, sourced, import, referral, agency, partner, manual).
    channel: text("channel").notNull().default("applied"),
    screening: jsonb("screening").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    eligible: boolean("eligible"),
    nextAction: text("next_action"),
    nextActionDue: date("next_action_due", { mode: "string" }),
    nextActionAuto: boolean("next_action_auto").notNull().default(false),
    rejectReason: text("reject_reason"),
    consentVersion: text("consent_version"),
    consentAt: ts("consent_at"),
    // Talent-call applications (no job of their own): when the team handled it.
    handledAt: ts("handled_at"),
    handledBy: text("handled_by"),
    createdBy: text("created_by"),
  },
  (t) => [
    unique("applications_job_expert_key").on(t.jobId, t.expertId),
    index("applications_job_idx").on(t.jobId, t.status),
    index("applications_expert_idx").on(t.expertId),
    index("applications_stage_idx").on(t.stage, t.nextActionDue),
    check("applications_status_check", inList("status", ["new", "reviewing", "shortlisted", "submitted_to_partner", "rejected", "hired", "withdrawn"])),
    check("applications_stage_check", inList("stage", PIPELINE_STAGES)),
    check("applications_channel_check", inList("channel", APPLICATION_CHANNELS)),
    check("applications_reject_reason_check", sql`${t.rejectReason} is null or ${inList("reject_reason", REJECT_REASONS)}`),
  ],
);

/** Experts the team invited to a job from its Matches tab. */
export const jobInvites = hub.table(
  "job_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    emailed: boolean("emailed").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at"),
    openedAt: ts("opened_at"),
    acceptedAt: ts("accepted_at"),
    applicationId: uuid("application_id").references((): AnyPgColumn => applications.id, { onDelete: "set null" }),
  },
  (t) => [unique("job_invites_job_expert_key").on(t.jobId, t.expertId)],
);

/** Public form submissions, for rate limits. Only hashes of the IP or email, kept for a day. */
export const submitAttempts = hub.table(
  "submit_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    keyHash: text("key_hash").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("submit_attempts_key_idx").on(t.kind, t.keyHash, t.createdAt)],
);

/** "Delete my data" (and similar) requests from the expert portal, for the team to act on. */
export const dataRequests = hub.table(
  "data_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id").references(() => experts.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("delete"),
    status: text("status").notNull().default("open"),
    note: text("note"),
    handledBy: text("handled_by"),
    handledAt: ts("handled_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("data_requests_status_idx").on(t.status, t.createdAt),
    check("data_requests_kind_check", inList("kind", ["delete", "export"])),
    check("data_requests_status_check", inList("status", ["open", "done"])),
  ],
);

/**
 * One row per login (team member or expert), whatever the sign-in method: email + password,
 * Google or LinkedIn. Passwords are only ever stored as a salted scrypt hash (src/lib/auth/password.ts).
 * token_version goes up when the password changes, is reset or the account is turned off: every
 * session carries the version it was issued with, so all other sessions end at once.
 * Team accounts link to their hub.team_members row (the role); expert accounts link to their
 * hub.experts row, but only after the email has been verified.
 */
export const accounts = hub.table(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    accountType: text("account_type").notNull(),
    passwordHash: text("password_hash"),
    passwordSetAt: ts("password_set_at"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    emailVerifiedAt: ts("email_verified_at"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: ts("locked_until"),
    disabledAt: ts("disabled_at"),
    lastLoginAt: ts("last_login_at"),
    tokenVersion: integer("token_version").notNull().default(0),
    teamMemberId: uuid("team_member_id").references(() => teamMembers.id, { onDelete: "set null" }),
    expertId: uuid("expert_id").references(() => experts.id, { onDelete: "set null" }),
    // When they ticked the consent box at sign-up (copied to the expert record once verified).
    consentAt: ts("consent_at"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_email_key").on(t.email),
    uniqueIndex("accounts_expert_key").on(t.expertId),
    uniqueIndex("accounts_team_member_key").on(t.teamMemberId),
    check("accounts_email_lower", sql`${t.email} = lower(${t.email})`),
    check("accounts_type_check", inList("account_type", ["team", "expert"])),
  ],
);

/**
 * One-time codes and links: email verification (a 6-digit code and a link, 30 minutes, 5 tries)
 * and password resets (a link, 30 minutes, single use). Only keyed hashes are stored.
 */
export const accountTokens = hub.table(
  "account_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    codeHash: text("code_hash"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("account_tokens_token_key").on(t.tokenHash),
    index("account_tokens_account_idx").on(t.accountId, t.kind),
    check("account_tokens_kind_check", inList("kind", ["verify_email", "reset_password"])),
  ],
);

export type ExperienceItem = { title: string | null; company: string | null; location?: string | null; start?: string | null; end?: string | null; current?: boolean; description?: string | null };
export type EducationItem = { school: string | null; degree?: string | null; field?: string | null; start_year?: number | null; end_year?: number | null; grade?: string | null };
export type ProjectItem = { title: string; url?: string | null; year?: number | null; description?: string | null };
export type CertificationItem = { name: string; issuer?: string | null; year?: number | null; url?: string | null };
/** Weekly working hours per day as [from, to] pairs in 24-hour "HH:MM", in the expert's own time zone. */
export type WeeklyHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", [string, string][]>>;
/** What an expert wants to hear from us about (Profile → Communications). Missing keys mean yes. */
export type CommPrefs = { email?: boolean; whatsapp?: boolean; fullTime?: boolean; partTime?: boolean; referrals?: boolean; jobAlerts?: boolean; learning?: boolean };

/**
 * More profile details, as the old jobs site kept them (copied by npm run copy:engine). Experience
 * and education are visible to the team; the address lines are contact details (masked roles never
 * see them). updated_by = 'jobs-site import' while only the copy has written the row: the copy then
 * keeps it in step with the jobs site; once anyone else writes it, the copy only fills empty fields.
 */
export const expertDetails = hub.table("expert_details", {
  expertId: uuid("expert_id")
    .primaryKey()
    .references(() => experts.id, { onDelete: "cascade" }),
  experience: jsonb("experience").$type<ExperienceItem[]>().notNull().default(sql`'[]'::jsonb`),
  education: jsonb("education").$type<EducationItem[]>().notNull().default(sql`'[]'::jsonb`),
  noExperience: boolean("no_experience"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  postalCode: text("postal_code"),
  workAuthorized: boolean("work_authorized"),
  workAuthorizedAt: ts("work_authorized_at"),
  referralCode: text("referral_code"),
  referredByExpertId: uuid("referred_by_expert_id").references(() => experts.id, { onDelete: "set null" }),
  lastLoginAt: ts("last_login_at"),
  // Expert portal profile (26 Nov 2026): written by the expert on /me/profile.
  projects: jsonb("projects").$type<ProjectItem[]>().notNull().default(sql`'[]'::jsonb`),
  certifications: jsonb("certifications").$type<CertificationItem[]>().notNull().default(sql`'[]'::jsonb`),
  workSameAsResidence: boolean("work_same_as_residence").notNull().default(true),
  workCountry: text("work_country"),
  workRegion: text("work_region"),
  workCity: text("work_city"),
  workPostalCode: text("work_postal_code"),
  startAvailability: text("start_availability"),
  weeklyHours: jsonb("weekly_hours").$type<WeeklyHours>(),
  domainInterests: textArray("domain_interests"),
  minFullTimeUsd: integer("min_full_time_usd"),
  minPartTimeUsd: integer("min_part_time_usd"),
  lookingForWork: boolean("looking_for_work").notNull().default(true),
  commPrefs: jsonb("comm_prefs").$type<CommPrefs>().notNull().default(sql`'{}'::jsonb`),
  availabilityConfirmedAt: ts("availability_confirmed_at"),
  avatarFileId: uuid("avatar_file_id").references(() => expertFiles.id, { onDelete: "set null" }),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [check("expert_details_start_check", sql`${t.startAvailability} is null or ${inList("start_availability", START_AVAILABILITY)}`)]);

/**
 * Money-only (admins and finance): how an expert asked to be paid and their tax form, as entered on
 * the old jobs site. Kept out of the experts table so no list, export or search can include it.
 */
export const expertPayout = hub.table("expert_payout", {
  expertId: uuid("expert_id")
    .primaryKey()
    .references(() => experts.id, { onDelete: "cascade" }),
  payoutMethod: text("payout_method"),
  payoutHandle: text("payout_handle"),
  taxFormType: text("tax_form_type"),
  taxFormAt: ts("tax_form_at"),
  // The FynoLabs admin's default commission for this expert (talent_profiles.default_commission_percent).
  defaultCommissionPercent: numeric("default_commission_percent", { precision: 5, scale: 2, mode: "number" }),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/**
 * Which hub row each record copied from the old jobs site (Engine) became: users -> experts,
 * files -> expert_files, jobs -> jobs, applications -> applications. Makes the copy idempotent.
 * `written` holds the values the copy last wrote to fields the team can change, so a re-run only
 * updates a field nobody has changed in the hub since.
 */
export const legacyMap = hub.table(
  "legacy_map",
  {
    sourceTable: text("source_table").notNull(),
    sourceId: text("source_id").notNull(),
    hubTable: text("hub_table").notNull(),
    hubId: uuid("hub_id").notNull(),
    written: jsonb("written").$type<Record<string, unknown>>(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sourceTable, t.sourceId] }), index("legacy_map_hub_idx").on(t.hubTable, t.hubId)],
);

// =====================================================================================================
// The FynoLabs admin's structure (fynolabs.si/admin, Lovable / Supabase), 23 Nov 2026. Same fields, same
// meaning, snake_case. Rows copied by `npm run sync:fynolabs` keep their FynoLabs id (hub.legacy_map
// says so, with source_table 'fynolabs.<table>') and updated_by = 'fynolabs sync' until someone edits
// them in the hub; after that the sync leaves them alone. Money columns are marked: only admins and
// finance see them (src/lib/auth/permissions.ts, MONEY_COLUMNS).
// =====================================================================================================

const updatedBy = () => text("updated_by");

/** Expert platforms and other organisations with a referral link (FynoLabs org_logos: "Platforms"). */
export const platforms = hub.table(
  "platforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("both"),
    domain: text("domain"),
    logoUrl: text("logo_url"),
    websiteUrl: text("website_url"),
    referralUrl: text("referral_url"),
    jobsUrl: text("jobs_url"),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    referenceLinks: jsonb("reference_links").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    lastOpenedAt: ts("last_opened_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [index("platforms_name_idx").on(sql`lower(${t.name})`)],
);

/** What happened with a company: notes, emails, calls, meetings, stage changes (FynoLabs account_activities). */
export const companyActivities = hub.table(
  "company_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references((): AnyPgColumn => contacts.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("note"),
    summary: text("summary").notNull(),
    detail: text("detail"),
    happenedAt: ts("happened_at").notNull().defaultNow(),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [index("company_activities_company_idx").on(t.companyId, t.happenedAt), check("company_activities_kind_check", inList("kind", COMPANY_ACTIVITY_KINDS))],
);

/** People at companies (FynoLabs leads): role, stage, where we found them, next follow-up. */
export const contacts = hub.table(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => partners.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    company: text("company"),
    role: text("role"),
    kind: text("kind").notNull().default("client"),
    stage: text("stage").notNull().default("new"),
    source: text("source").notNull().default("linkedin"),
    sourceUrl: text("source_url"),
    profileUrl: text("profile_url"),
    email: text("email"),
    nextFollowUp: date("next_follow_up", { mode: "string" }),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [
    index("contacts_company_idx").on(t.companyId),
    index("contacts_email_idx").on(sql`lower(${t.email})`),
    check("contacts_kind_check", inList("kind", CONTACT_KINDS)),
    check("contacts_stage_check", inList("stage", CONTACT_STAGES)),
    check("contacts_source_check", inList("source", CONTACT_SOURCES)),
  ],
);

/** Calls, meetings, follow-ups, deadlines, tasks and posts. Dates and times are India time (timezone). */
export const calendarEvents = hub.table(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("call"),
    status: text("status").notNull().default("planned"),
    eventDate: date("event_date", { mode: "string" }),
    startTime: time("start_time"),
    endTime: time("end_time"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    companyId: uuid("company_id").references(() => partners.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    contactIds: uuid("contact_ids").array().notNull().default(sql`'{}'::uuid[]`),
    teamMemberIds: uuid("team_member_ids").array().notNull().default(sql`'{}'::uuid[]`),
    meetingUrl: text("meeting_url"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [
    index("calendar_events_date_idx").on(t.eventDate, t.startTime),
    index("calendar_events_company_idx").on(t.companyId),
    check("calendar_events_kind_check", inList("kind", CALENDAR_KINDS)),
    check("calendar_events_status_check", inList("status", CALENDAR_STATUSES)),
  ],
);

/** An expert's timeline: notes, emails, stage changes, applications, documents, referrals (FynoLabs expert_activities). */
export const expertActivities = hub.table(
  "expert_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("note"),
    summary: text("summary").notNull(),
    detail: text("detail"),
    happenedAt: ts("happened_at").notNull().defaultNow(),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [index("expert_activities_expert_idx").on(t.expertId, t.happenedAt), check("expert_activities_kind_check", inList("kind", EXPERT_ACTIVITY_KINDS))],
);

/** Projects (P### codes): what we staff or refer for, with targets, rules and Discord. */
export const projects = hub.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("referral"),
    status: text("status").notNull().default("planned"),
    companyId: uuid("company_id").references(() => partners.id, { onDelete: "set null" }),
    platformId: uuid("platform_id").references(() => platforms.id, { onDelete: "set null" }),
    referralUrl: text("referral_url"),
    ownerTeamMemberId: uuid("owner_team_member_id").references(() => teamMembers.id, { onDelete: "set null" }),
    targetCount: integer("target_count"),
    startsOn: date("starts_on", { mode: "string" }),
    endsOn: date("ends_on", { mode: "string" }),
    countries: textArray("countries"),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    discord: text("discord"),
    externalRef: text("external_ref"),
    description: text("description"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [uniqueIndex("projects_code_key").on(t.code), check("projects_kind_check", inList("kind", PROJECT_KINDS)), check("projects_status_check", inList("status", PROJECT_STATUSES))],
);

export const projectTracks = hub.table(
  "project_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetCount: integer("target_count"),
    position: smallint("position").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [index("project_tracks_project_idx").on(t.projectId, t.position)],
);

/** Who works on a project (the team), with their role there. */
export const projectMembers = hub.table(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    teamMemberId: uuid("team_member_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("recruiter"),
    active: boolean("active").notNull().default(true),
    capacity: integer("capacity"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [unique("project_members_project_member_key").on(t.projectId, t.teamMemberId), check("project_members_role_check", inList("role", PROJECT_ROLES))],
);

/** Documents a project needs from each expert, and by which pipeline stage. */
export const projectDocuments = hub.table(
  "project_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("agreement"),
    title: text("title").notNull(),
    requiredStage: text("required_stage").notNull().default("selected"),
    expiresAfterDays: integer("expires_after_days"),
    position: smallint("position").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [check("project_documents_kind_check", inList("kind", DOCUMENT_KINDS)), check("project_documents_stage_check", inList("required_stage", DOCUMENT_STAGES))],
);

/** Money-only: what a partner pays us per person reaching a stage. */
export const projectFeeRules = hub.table("project_fee_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  trackId: uuid("track_id").references(() => projectTracks.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
  currency: text("currency").notNull().default("USD"),
  earnedAtStage: text("earned_at_stage").notNull().default("active"),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: updatedBy(),
});

/** An expert's documents (NDA, agreement, compliance): status, who it went to, when it was signed; the files are in expert_files. */
export const expertDocuments = hub.table(
  "expert_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    projectDocumentId: uuid("project_document_id").references(() => projectDocuments.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("agreement"),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    fileId: uuid("file_id").references(() => expertFiles.id, { onDelete: "set null" }),
    signedFileId: uuid("signed_file_id").references(() => expertFiles.id, { onDelete: "set null" }),
    sentTo: text("sent_to"),
    sentAt: ts("sent_at"),
    signedAt: ts("signed_at"),
    expiresAt: ts("expires_at"),
    notes: text("notes"),
    // Expert portal (26 Nov 2026): which template it came from and the signing record.
    templateId: uuid("template_id").references((): AnyPgColumn => documentTemplates.id, { onDelete: "set null" }),
    dueOn: date("due_on", { mode: "string" }),
    viewedAt: ts("viewed_at"),
    signMethod: text("sign_method"),
    signedName: text("signed_name"),
    signedIp: text("signed_ip"),
    signedUserAgent: text("signed_user_agent"),
    signedHash: text("signed_hash"),
    // A text template as signed: the filled text (its SHA-256 is signed_hash) and the details typed when signing.
    signedBody: text("signed_body"),
    signedFields: jsonb("signed_fields").$type<Record<string, string>>(),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [
    index("expert_documents_expert_idx").on(t.expertId),
    check("expert_documents_kind_check", inList("kind", DOCUMENT_KINDS)),
    check("expert_documents_status_check", inList("status", DOCUMENT_STATUSES)),
    check("expert_documents_sign_method_check", sql`${t.signMethod} is null or ${inList("sign_method", SIGN_METHODS)}`),
  ],
);

/** A partner's monthly report (sign-ups, qualified, active) matched against our referrals. */
export const partnerReports = hub.table("partner_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  companyId: uuid("company_id").references(() => partners.id, { onDelete: "set null" }),
  label: text("label"),
  periodStart: date("period_start", { mode: "string" }),
  periodEnd: date("period_end", { mode: "string" }),
  signups: integer("signups"),
  qualified: integer("qualified"),
  active: integer("active"),
  rowsTotal: integer("rows_total").notNull().default(0),
  matched: integer("matched").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  createdSubmissions: integer("created_submissions").notNull().default(0),
  unmatchedCount: integer("unmatched_count").notNull().default(0),
  unmatched: jsonb("unmatched").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedBy: updatedBy(),
});

/** Where an expert works through a platform or agency (FynoLabs talent_engagements). commission_percent is money. */
export const engagements = hub.table("engagements", {
  id: uuid("id").primaryKey().defaultRandom(),
  expertId: uuid("expert_id")
    .notNull()
    .references(() => experts.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  agency: text("agency"),
  project: text("project"),
  status: text("status").notNull().default("active"),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2, mode: "number" }),
  startedOn: date("started_on", { mode: "string" }),
  endedOn: date("ended_on", { mode: "string" }),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: updatedBy(),
});

/** Money-only: what an expert earned in a month on an engagement, and our commission (INR). */
export const monthlyEarnings = hub.table(
  "monthly_earnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    month: date("month", { mode: "string" }).notNull(),
    grossInr: numeric("gross_inr", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    commissionInr: numeric("commission_inr", { mode: "number" }).notNull().default(0),
    commissionPercent: numeric("commission_percent", { mode: "number" }),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [unique("monthly_earnings_engagement_month_key").on(t.engagementId, t.month)],
);

/** Sent referrals and submissions to partners (FynoLabs talent_referrals): method, outcome, opens and clicks. */
export const referrals = hub.table(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id").references(() => experts.id, { onDelete: "cascade" }),
    platformId: uuid("platform_id").references(() => platforms.id, { onDelete: "set null" }),
    platform: text("platform").notNull(),
    companyId: uuid("company_id").references(() => partners.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "set null" }),
    referralUrl: text("referral_url"),
    recipientEmail: text("recipient_email").notNull(),
    recipientName: text("recipient_name"),
    personalNote: text("personal_note"),
    status: text("status").notNull().default("sent"),
    method: text("method").notNull().default("email"),
    outcome: text("outcome").notNull().default("sent"),
    outcomeAt: ts("outcome_at"),
    sentAt: ts("sent_at").notNull().defaultNow(),
    respondedAt: ts("responded_at"),
    // The open/click tracking token in emails already sent. Internal: never shown in the app.
    trackingToken: uuid("tracking_token"),
    firstOpenedAt: ts("first_opened_at"),
    lastOpenedAt: ts("last_opened_at"),
    openCount: integer("open_count").notNull().default(0),
    firstClickedAt: ts("first_clicked_at"),
    lastClickedAt: ts("last_clicked_at"),
    clickCount: integer("click_count").notNull().default(0),
    externalRef: text("external_ref"),
    submittedBy: text("submitted_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [
    index("referrals_expert_idx").on(t.expertId, t.sentAt),
    index("referrals_project_idx").on(t.projectId),
    check("referrals_method_check", inList("method", REFERRAL_METHODS)),
    check("referrals_outcome_check", inList("outcome", REFERRAL_OUTCOMES)),
  ],
);

/** Money-only: fees partners owe us for referrals (expected, invoiced, paid, void). */
export const referralFees = hub.table(
  "referral_fees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => partners.id, { onDelete: "set null" }),
    ruleId: uuid("rule_id").references(() => projectFeeRules.id, { onDelete: "set null" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    expertId: uuid("expert_id").references(() => experts.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    personName: text("person_name"),
    amount: numeric("amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("expected"),
    earnedOn: date("earned_on", { mode: "string" }).notNull(),
    invoiceNumber: text("invoice_number"),
    invoicedOn: date("invoiced_on", { mode: "string" }),
    dueOn: date("due_on", { mode: "string" }),
    paidOn: date("paid_on", { mode: "string" }),
    paidAmount: numeric("paid_amount", { precision: 12, scale: 2, mode: "number" }),
    voidReason: text("void_reason"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [check("referral_fees_status_check", inList("status", FEE_STATUSES))],
);

/** Lists of people a referral email goes to in one go (FynoLabs referral_groups and members). */
export const referralGroups = hub.table("referral_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedBy: updatedBy(),
});

export const referralGroupMembers = hub.table(
  "referral_group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => referralGroups.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    expertId: uuid("expert_id").references(() => experts.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [unique("referral_group_members_group_email_key").on(t.groupId, t.email)],
);

/** Short links for posts and partners (fynolabs.si/go/<code>), and clicks per day. */
export const trackedLinks = hub.table(
  "tracked_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    label: text("label"),
    targetUrl: text("target_url").notNull(),
    channel: text("channel").notNull().default("other"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    platformId: uuid("platform_id").references(() => platforms.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => partners.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    clicks: bigint("clicks", { mode: "number" }).notNull().default(0),
    lastClickedAt: ts("last_clicked_at"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [uniqueIndex("tracked_links_code_key").on(t.code), check("tracked_links_channel_check", inList("channel", LINK_CHANNELS))],
);

export const trackedLinkClicks = hub.table(
  "tracked_link_clicks",
  {
    linkId: uuid("link_id")
      .notNull()
      .references(() => trackedLinks.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    clicks: integer("clicks").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.linkId, t.day] })],
);

/** Job radar: roles found on other platforms (FynoLabs job_listings). Pay is money (admins and finance). */
export const radarListings = hub.table(
  "radar_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: text("platform").notNull(),
    platformId: uuid("platform_id").references(() => platforms.id, { onDelete: "set null" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    company: text("company"),
    location: text("location"),
    url: text("url").notNull(),
    payMin: numeric("pay_min", { mode: "number" }),
    payMax: numeric("pay_max", { mode: "number" }),
    payPeriod: text("pay_period"),
    postedAt: ts("posted_at"),
    status: text("status").notNull().default("new"),
    matchedKeywords: textArray("matched_keywords"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [unique("radar_listings_platform_external_key").on(t.platform, t.externalId)],
);

/** Settings as key / value (the FynoLabs admin's admin_settings, job radar settings, email sending state). */
export const settings = hub.table("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: updatedBy(),
});

export const emailTemplates = hub.table(
  "email_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("update"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [check("email_templates_kind_check", inList("kind", TEMPLATE_KINDS))],
);

/** Bulk emails to experts (approved before sending), with an optional follow-up. */
export const emailCampaigns = hub.table(
  "email_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("update"),
    templateId: uuid("template_id").references(() => emailTemplates.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    followUpSubject: text("follow_up_subject"),
    followUpBody: text("follow_up_body"),
    followUpAfterDays: integer("follow_up_after_days"),
    status: text("status").notNull().default("draft"),
    recipientCount: integer("recipient_count").notNull().default(0),
    createdBy: text("created_by"),
    approvedBy: text("approved_by"),
    approvedAt: ts("approved_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [check("email_campaigns_status_check", inList("status", CAMPAIGN_STATUSES))],
);

export const emailCampaignRecipients = hub.table(
  "email_campaign_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => emailCampaigns.id, { onDelete: "cascade" }),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    status: text("status").notNull().default("pending"),
    reason: text("reason"),
    // The token in the email's links (already sent). Internal: never shown.
    token: uuid("token"),
    sentAt: ts("sent_at"),
    followedUpAt: ts("followed_up_at"),
    updatedBy: updatedBy(),
  },
  (t) => [unique("email_campaign_recipients_campaign_expert_key").on(t.campaignId, t.expertId), check("email_campaign_recipients_status_check", inList("status", RECIPIENT_STATUSES))],
);

/** Every email sent (or not) and why: template, status, error. */
export const emailSendLog = hub.table(
  "email_send_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: text("message_id"),
    templateName: text("template_name").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("email_send_log_created_idx").on(t.createdAt)],
);

/** Addresses we must not email (unsubscribed, bounced, complained). */
export const suppressedEmails = hub.table(
  "suppressed_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [uniqueIndex("suppressed_emails_email_key").on(t.email)],
);

/** Unsubscribe links already sent. The token is internal: never shown in the app. */
export const unsubscribeTokens = hub.table(
  "unsubscribe_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),
    email: text("email").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    usedAt: ts("used_at"),
    updatedBy: updatedBy(),
  },
  (t) => [uniqueIndex("unsubscribe_tokens_token_key").on(t.token), uniqueIndex("unsubscribe_tokens_email_key").on(t.email)],
);

/** Messages from the website's contact form (FynoLabs contact_submissions). */
export const messages = hub.table(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    message: text("message").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    handledAt: ts("handled_at"),
    handledBy: text("handled_by"),
    updatedBy: updatedBy(),
  },
  (t) => [index("messages_created_idx").on(t.createdAt)],
);

/**
 * Replies the team sent: to a message (source_type 'contact', source_id = hub.messages id), a
 * talent-call or job application ('talent' / 'job', source_id = hub.applications id) or an expert
 * ('expert', hub.experts id).
 */
export const messageReplies = hub.table(
  "message_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("sent"),
    errorMessage: text("error_message"),
    sentBy: text("sent_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("message_replies_source_idx").on(t.sourceType, t.sourceId)],
);

export const replyDrafts = hub.table(
  "reply_drafts",
  {
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [primaryKey({ columns: [t.sourceType, t.sourceId] })],
);

/** Bulk imports run in the FynoLabs admin (experts, submissions, outcomes): counts and errors. */
export const importBatches = hub.table("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull().default("experts"),
  label: text("label"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  options: jsonb("options").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  total: integer("total").notNull().default(0),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  unchanged: integer("unchanged").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  errors: jsonb("errors").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Visitor analytics of fynolabs.si: page views, visitors per source per day, sessions per source. */
export const visitorPageviews = hub.table(
  "visitor_pageviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    source: text("source").notNull(),
    referrerHost: text("referrer_host"),
    landingPath: text("landing_path").notNull(),
    pagePath: text("page_path").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("visitor_pageviews_created_idx").on(t.createdAt), check("visitor_pageviews_source_check", inList("source", VISIT_SOURCES))],
);

export const visitorSourceDaily = hub.table(
  "visitor_source_daily",
  {
    visitDate: date("visit_date", { mode: "string" }).notNull(),
    source: text("source").notNull(),
    visitors: bigint("visitors", { mode: "number" }).notNull().default(0),
    pageViews: bigint("page_views", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.visitDate, t.source] })],
);

export const visitorSourceSessions = hub.table(
  "visitor_source_sessions",
  {
    visitDate: date("visit_date", { mode: "string" }).notNull(),
    source: text("source").notNull(),
    sessionId: uuid("session_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.visitDate, t.source, t.sessionId] })],
);

// ---------------------------------------------------------------- expert portal (26 Nov 2026)

/**
 * Documents the team sends experts to sign (NDA, contractor agreement, ...). The PDF is stored here
 * (4 MB limit). A template marked required_for_all is listed on every expert's Documents page until
 * they sign it; signing writes an expert_documents row with template_id and the signing record.
 */
export const documentTemplates = hub.table(
  "document_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("agreement"),
    description: text("description"),
    // Either a text body (with {{placeholders}} filled from the profile and the signing form) or a PDF.
    body: text("body"),
    filename: text("filename"),
    mime: text("mime"),
    size: integer("size"),
    data: bytea("data"),
    requiredForAll: boolean("required_for_all").notNull().default(false),
    active: boolean("active").notNull().default(true),
    position: smallint("position").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [check("document_templates_kind_check", inList("kind", DOCUMENT_KINDS))],
);

export type QuizQuestion = { q: string; options: string[]; answer: number; why?: string | null };

/** Learn: a course, booklet or quiz set shown to experts on /me/learn once published. */
export const courses = hub.table(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary"),
    kind: text("kind").notNull().default("course"),
    level: text("level").notNull().default("beginner"),
    minutes: integer("minutes"),
    art: text("art"),
    published: boolean("published").notNull().default(false),
    position: smallint("position").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [check("courses_kind_check", inList("kind", COURSE_KINDS)), check("courses_level_check", inList("level", COURSE_LEVELS))],
);

/** One step of a course: a video, a PDF booklet, a reading, a quiz or a link. */
export const courseLessons = hub.table(
  "course_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    position: smallint("position").notNull().default(0),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("reading"),
    url: text("url"),
    body: text("body"),
    quiz: jsonb("quiz").$type<QuizQuestion[]>(),
    minutes: integer("minutes"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [index("course_lessons_course_idx").on(t.courseId, t.position), check("course_lessons_kind_check", inList("kind", LESSON_KINDS))],
);

/** An expert finished a lesson (a quiz keeps its best score in percent). */
export const lessonProgress = hub.table(
  "lesson_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => courseLessons.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    completedAt: ts("completed_at").notNull().defaultNow(),
    score: smallint("score"),
    attempts: smallint("attempts").notNull().default(1),
  },
  (t) => [unique("lesson_progress_expert_lesson_key").on(t.expertId, t.lessonId), index("lesson_progress_expert_idx").on(t.expertId, t.courseId)],
);

/**
 * Money: what we pay an expert, per project and period. upcoming = earned, not paid yet. Experts see
 * their own payouts on /me/payments; the team records them on /admin/payouts (money roles). Like
 * placements, a payout outlives the person: deleting an expert on request clears expert_id and keeps
 * the amount for the books.
 */
export const payouts = hub.table(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id").references(() => experts.id, { onDelete: "set null" }),
    placementId: uuid("placement_id").references(() => placements.id, { onDelete: "set null" }),
    label: text("label"),
    amount: numeric("amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status").notNull().default("upcoming"),
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    expectedOn: date("expected_on", { mode: "string" }),
    paidOn: date("paid_on", { mode: "string" }),
    method: text("method"),
    reference: text("reference"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: updatedBy(),
  },
  (t) => [index("payouts_expert_idx").on(t.expertId, t.status), check("payouts_status_check", inList("status", PAYOUT_STATUSES))],
);

export type Expert = typeof experts.$inferSelect;
export type NewExpert = typeof experts.$inferInsert;
export type Partner = typeof partners.$inferSelect;
export type Requirement = typeof requirements.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Placement = typeof placements.$inferSelect;
export type ExpertFile = Omit<typeof expertFiles.$inferSelect, "data">;
export type Activity = typeof activity.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobFormField = typeof jobFormFields.$inferSelect;
export type FormTemplate = typeof formTemplates.$inferSelect;
export type Application = Omit<typeof applications.$inferSelect, "rateExpectationUsd">;
export type ExpertDetails = typeof expertDetails.$inferSelect;
export type ExpertPayout = typeof expertPayout.$inferSelect;
export type DocumentTemplate = Omit<typeof documentTemplates.$inferSelect, "data">;
export type Course = typeof courses.$inferSelect;
export type CourseLesson = typeof courseLessons.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type ExpertActivity = typeof expertActivities.$inferSelect;
export type Company = typeof partners.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
