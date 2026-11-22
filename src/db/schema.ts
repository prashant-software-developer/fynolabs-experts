// Expert Hub tables. Everything lives in the Postgres schema "hub" so this app can share the
// "Engine" database with other apps without touching their tables.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
 * CV files. storage = 'jobs_db': the bytes stay in the jobs site's table (public.xdl_jobs_files,
 * read only) and external_ref holds that file id. storage = 'upload': the bytes are in `data`.
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
    check("expert_files_storage_check", inList("storage", ["jobs_db", "upload"])),
    check("expert_files_kind_check", inList("kind", ["cv", "attachment"])),
  ],
);

export const partners = hub.table(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("data_partner"),
    website: text("website"),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("partners_name_key").on(sql`lower(${t.name})`),
    check("partners_kind_check", inList("kind", ["data_partner", "frontier_lab", "expert_platform", "agency", "other"])),
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
    source: text("source"),
    externalId: text("external_id"),
    actorEmail: text("actor_email").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("erasures_email_idx").on(t.emailSha256), index("erasures_source_idx").on(t.source, t.externalId)],
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
    check("saved_views_collection_check", inList("collection", ["experts"])),
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
    source: jsonb("source").$type<{ utm?: Record<string, string>; ref?: string; invited?: boolean }>(),
    ipHash: text("ip_hash"),
    internalNote: text("internal_note"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("applications_job_expert_key").on(t.jobId, t.expertId),
    index("applications_job_idx").on(t.jobId, t.status),
    index("applications_expert_idx").on(t.expertId),
    check("applications_status_check", inList("status", ["new", "reviewing", "shortlisted", "submitted_to_partner", "rejected", "hired", "withdrawn"])),
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
 * Auth.js email sign-in links (only used when the email provider is configured). Auth.js stores
 * a hash of the token, never the link itself. Users are identified by email; there is no user table.
 */
export const authVerificationTokens = hub.table(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: ts("expires").notNull(),
  },
  (t) => [uniqueIndex("auth_verification_tokens_key").on(t.identifier, t.token)],
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
export type SavedView = typeof savedViews.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobFormField = typeof jobFormFields.$inferSelect;
export type FormTemplate = typeof formTemplates.$inferSelect;
export type Application = typeof applications.$inferSelect;
