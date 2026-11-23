// The FynoLabs tables that map one row to one hub row with the same id (sql.ts copySimple):
// which hub columns come from which FynoLabs columns, and how links are translated.
import { qi, ref, refArray, stableId, who, type SimpleSpec } from "./sql";

const s = (c: string) => `s.${qi(c)}`;
/** Columns copied as they are. */
const same = (...cols: string[]) => Object.fromEntries(cols.map((c) => [c, s(c)]));
const expert = (col = "profile_id") => ref("talent_profiles", "experts", s(col));
const company = (col = "account_id") => ref("accounts", "partners", s(col));
const project = (col = "project_id") => ref("projects", "projects", s(col));
const job = (col = "job_id") => ref("posted_jobs", "jobs", s(col));
const jobApp = (col = "application_id") => ref("job_applications", "applications", s(col));
const platform = (col: string) => `(select p.id from hub.platforms p where p.id = ${s(col)})`;
const teamMember = (col: string) => ref("team_members", "team_members", s(col));

/** True unless the address belongs to someone deleted on request (hub) or erased in FynoLabs. */
export const notErased = (expr: string) =>
  `(${expr} is null or (encode(sha256(convert_to(lower(btrim(${expr})), 'UTF8')), 'hex') not in (select email_sha256 from hub.erasures where email_sha256 is not null)
    and md5(lower(btrim(${expr}))) not in (select email_md5 from hub.erasures where email_md5 is not null)))`;
/** A row that belonged to a FynoLabs profile the hub doesn't have (deleted on request): left out. */
const profileKnown = (col = "profile_id") => `(${s(col)} is null or ${expert(col)} is not null)`;

const replySource = `(case s.source_type when 'contact' then ${ref("contact_submissions", "messages", "s.source_id")} when 'talent' then ${ref("talent_applications", "applications", "s.source_id")}
  when 'job' then ${ref("job_applications", "applications", "s.source_id")} when 'expert' then ${ref("talent_profiles", "experts", "s.source_id")} end)`;

export const PRIVACY: SimpleSpec = {
  source: "privacy_log",
  target: "erasures",
  select: { id: s("id"), email_md5: s("email_hash"), reason: s("reason"), actor_email: `coalesce(${who(s("done_by"))}, 'fynolabs')`, created_at: s("done_at") },
  tracked: false,
};

export const PLATFORMS: SimpleSpec = {
  source: "org_logos",
  target: "platforms",
  select: same("id", "name", "kind", "domain", "logo_url", "website_url", "referral_url", "jobs_url", "status", "notes", "reference_links", "last_opened_at", "created_at", "updated_at"),
};

export const CRM: SimpleSpec[] = [
  {
    source: "leads",
    target: "contacts",
    select: { ...same("id", "name", "company", "role", "kind", "stage", "source", "source_url", "profile_url", "next_follow_up", "notes", "created_at", "updated_at"), email: `lower(btrim(${s("email")}))`, company_id: company(), created_by: who(s("created_by")) },
  },
  {
    source: "account_activities",
    target: "company_activities",
    select: { ...same("id", "kind", "summary", "detail", "happened_at", "created_at"), company_id: company(), contact_id: ref("leads", "contacts", s("lead_id")), created_by: who(s("created_by")) },
    required: ["company_id"],
  },
  {
    source: "calendar_events",
    target: "calendar_events",
    select: {
      ...same("id", "title", "kind", "status", "event_date", "start_time", "end_time", "meeting_url", "notes", "created_at", "updated_at"),
      company_id: company(),
      contact_id: ref("leads", "contacts", s("lead_id")),
      contact_ids: refArray("leads", "contacts", s("lead_ids")),
      team_member_ids: refArray("team_members", "team_members", s("team_ids")),
      created_by: who(s("created_by")),
    },
  },
];

export const PROJECTS: SimpleSpec[] = [
  {
    source: "projects",
    target: "projects",
    select: {
      ...same("id", "code", "name", "kind", "status", "referral_url", "target_count", "starts_on", "ends_on", "countries", "rules", "discord", "external_ref", "description", "notes", "created_at", "updated_at"),
      company_id: company(),
      platform_id: platform("platform_id"),
      owner_team_member_id: teamMember("owner_id"),
      created_by: who(s("created_by")),
    },
  },
  { source: "project_tracks", target: "project_tracks", select: { ...same("id", "name", "target_count", "position", "created_at"), project_id: project() }, required: ["project_id"] },
  { source: "project_members", target: "project_members", select: { ...same("id", "role", "active", "capacity", "created_at"), project_id: project(), team_member_id: teamMember("user_id") }, required: ["project_id", "team_member_id"] },
  { source: "project_documents", target: "project_documents", select: { ...same("id", "kind", "title", "required_stage", "expires_after_days", "position", "created_at"), project_id: project() }, required: ["project_id"] },
  {
    source: "project_fee_rules",
    target: "project_fee_rules",
    select: { ...same("id", "amount", "currency", "earned_at_stage", "payment_terms_days", "active", "notes", "created_at", "updated_at"), project_id: project(), track_id: ref("project_tracks", "project_tracks", s("track_id")), created_by: who(s("created_by")) },
    required: ["project_id"],
  },
  {
    source: "partner_reports",
    target: "partner_reports",
    select: { ...same("id", "label", "period_start", "period_end", "signups", "qualified", "active", "rows_total", "matched", "updated", "created_submissions", "unmatched_count", "unmatched", "notes", "created_at"), project_id: project(), company_id: company(), created_by: who(s("created_by")) },
  },
];

export const RADAR: SimpleSpec = {
  source: "job_listings",
  target: "radar_listings",
  select: { ...same("id", "platform", "external_id", "title", "company", "location", "url", "pay_min", "pay_max", "pay_period", "posted_at", "status", "matched_keywords", "created_at", "updated_at"), platform_id: platform("org_id") },
};

export const IMPORT_BATCHES: SimpleSpec = {
  source: "import_batches",
  target: "import_batches",
  select: { ...same("id", "kind", "label", "options", "total", "created", "updated", "unchanged", "skipped", "failed", "errors", "created_at"), project_id: project(), job_id: job(), created_by: who(s("created_by")) },
  tracked: false,
};

/** After experts and pipelines. */
export const PEOPLE_WORK: SimpleSpec[] = [
  {
    source: "expert_activities",
    target: "expert_activities",
    select: { ...same("id", "kind", "summary", "detail", "happened_at", "created_at"), expert_id: expert(), application_id: jobApp(), created_by: who(s("created_by")) },
    required: ["expert_id"],
  },
  {
    source: "expert_documents",
    target: "expert_documents",
    select: {
      ...same("id", "kind", "title", "status", "sent_to", "sent_at", "signed_at", "expires_at", "notes", "created_at", "updated_at"),
      expert_id: expert(),
      application_id: jobApp(),
      project_document_id: ref("project_documents", "project_documents", s("requirement_id")),
      file_id: `(select f.id from hub.expert_files f where f.expert_id = ${expert()} and f.external_ref = 'fynolabs:expert-documents/' || ${s("file_path")} limit 1)`,
      signed_file_id: `(select f.id from hub.expert_files f where f.expert_id = ${expert()} and f.external_ref = 'fynolabs:expert-documents/' || ${s("signed_path")} limit 1)`,
      created_by: who(s("created_by")),
    },
    required: ["expert_id"],
  },
  {
    source: "expert_invites",
    target: "job_invites",
    select: { ...same("id", "created_at", "expires_at", "opened_at", "accepted_at"), job_id: job(), expert_id: expert(), application_id: jobApp(), created_by: who(s("created_by")) },
    required: ["job_id", "expert_id"],
    tracked: false,
  },
  {
    source: "talent_engagements",
    target: "engagements",
    select: { ...same("id", "platform", "agency", "project", "status", "commission_percent", "started_on", "ended_on", "notes", "created_at", "updated_at"), expert_id: expert() },
    required: ["expert_id"],
  },
  {
    source: "talent_monthly_earnings",
    target: "monthly_earnings",
    select: { ...same("id", "month", "gross_inr", "commission_inr", "commission_percent", "notes", "created_at", "updated_at"), engagement_id: ref("talent_engagements", "engagements", s("engagement_id")), expert_id: expert() },
    required: ["engagement_id", "expert_id"],
  },
  {
    source: "talent_referrals",
    target: "referrals",
    select: {
      ...same("id", "platform", "referral_url", "recipient_email", "recipient_name", "personal_note", "status", "method", "outcome", "outcome_at", "sent_at", "responded_at", "tracking_token", "first_opened_at", "last_opened_at", "open_count", "first_clicked_at", "last_clicked_at", "click_count", "external_ref", "created_at", "updated_at"),
      expert_id: expert(),
      platform_id: platform("org_id"),
      company_id: company(),
      project_id: project(),
      application_id: jobApp(),
      engagement_id: ref("talent_engagements", "engagements", s("engagement_id")),
      submitted_by: who(s("submitted_by")),
    },
    where: `${profileKnown()} and ${notErased(s("recipient_email"))}`,
  },
  {
    source: "referral_fees",
    target: "referral_fees",
    select: {
      ...same("id", "person_name", "amount", "currency", "status", "earned_on", "invoice_number", "invoiced_on", "due_on", "paid_on", "paid_amount", "void_reason", "notes", "created_at", "updated_at"),
      project_id: project(),
      company_id: company(),
      rule_id: ref("project_fee_rules", "project_fee_rules", s("rule_id")),
      application_id: jobApp(),
      expert_id: expert(),
      job_id: job(),
      created_by: who(s("created_by")),
    },
    where: profileKnown(),
  },
  { source: "referral_groups", target: "referral_groups", select: same("id", "name", "status", "created_at") },
  {
    source: "referral_group_members",
    target: "referral_group_members",
    select: { ...same("id", "name", "created_at"), email: `lower(btrim(${s("email")}))`, group_id: ref("referral_groups", "referral_groups", s("group_id")), expert_id: `(select e.id from hub.experts e where e.email = lower(btrim(${s("email")})))` },
    required: ["group_id"],
    where: notErased(s("email")),
  },
  {
    source: "tracked_links",
    target: "tracked_links",
    select: { ...same("id", "code", "label", "target_url", "channel", "status", "clicks", "last_clicked_at", "created_at", "updated_at"), project_id: project(), job_id: job(), platform_id: platform("org_id"), company_id: company(), created_by: who(s("created_by")) },
  },
  { source: "tracked_link_clicks", target: "tracked_link_clicks", select: { link_id: ref("tracked_links", "tracked_links", s("link_id")), day: s("day"), clicks: s("clicks") }, key: ["link_id", "day"], legacyId: null, required: ["link_id"], plain: true, tracked: false },
];

export const EMAIL: SimpleSpec[] = [
  { source: "email_templates", target: "email_templates", select: { ...same("id", "name", "kind", "subject", "body", "created_at", "updated_at"), project_id: project(), created_by: who(s("created_by")) } },
  {
    source: "email_campaigns",
    target: "email_campaigns",
    select: {
      ...same("id", "name", "kind", "subject", "body", "follow_up_subject", "follow_up_body", "follow_up_after_days", "status", "recipient_count", "approved_at", "created_at", "updated_at"),
      template_id: ref("email_templates", "email_templates", s("template_id")),
      job_id: job(),
      project_id: project(),
      created_by: who(s("created_by")),
      approved_by: who(s("approved_by")),
    },
  },
  {
    source: "email_campaign_recipients",
    target: "email_campaign_recipients",
    select: { ...same("id", "email", "status", "reason", "token", "sent_at", "followed_up_at"), campaign_id: ref("email_campaigns", "email_campaigns", s("campaign_id")), expert_id: expert() },
    required: ["campaign_id", "expert_id"],
  },
  { source: "email_send_log", target: "email_send_log", select: same("id", "message_id", "template_name", "recipient_email", "status", "error_message", "metadata", "created_at"), tracked: false, where: notErased(s("recipient_email")) },
  { source: "suppressed_emails", target: "suppressed_emails", select: { ...same("id", "reason", "metadata", "created_at"), email: `lower(btrim(${s("email")}))` } },
  { source: "email_unsubscribe_tokens", target: "unsubscribe_tokens", select: same("id", "token", "email", "created_at", "used_at") },
];

export const MESSAGES: SimpleSpec[] = [
  { source: "contact_submissions", target: "messages", select: { ...same("id", "name", "email", "message", "created_at", "handled_at"), handled_by: who(s("handled_by")) }, where: notErased(s("email")) },
  { source: "admin_replies", target: "message_replies", select: { ...same("id", "source_type", "recipient_email", "subject", "body", "status", "error_message", "created_at"), source_id: replySource, sent_by: who(s("sent_by")) }, required: ["source_id"], tracked: false },
  { source: "reply_drafts", target: "reply_drafts", select: { ...same("source_type", "subject", "body", "updated_at"), source_id: replySource }, key: ["source_type", "source_id"], legacyId: null, required: ["source_id"] },
];

export const ADMIN: SimpleSpec[] = [
  {
    source: "saved_views",
    target: "saved_views",
    select: {
      ...same("id", "name", "shared", "created_at", "updated_at"),
      owner_email: `coalesce(${who(s("owner_id"))}, 'fynolabs')`,
      collection: `'fynolabs_' || ${s("kind")}`,
      config: `jsonb_build_object('fynolabs', jsonb_build_object('filters', ${s("filters")}, 'sort', ${s("sort")}))`,
    },
    tracked: false,
  },
  { source: "admin_settings", target: "settings", select: { key: s("key"), value: `to_jsonb(${s("value")})`, updated_at: s("updated_at") }, key: ["key"], legacyId: null },
  { source: "job_scan_settings", target: "settings", select: { key: `'job_radar'`, value: `jsonb_build_object('keywords', ${s("keywords")}, 'min_pay', ${s("min_pay")})`, updated_at: s("updated_at") }, key: ["key"], legacyId: null },
  { source: "email_send_state", target: "settings", select: { key: `'email_send_state'`, value: `to_jsonb(s) - 'id' - 'updated_at'`, updated_at: s("updated_at") }, key: ["key"], legacyId: null },
  {
    source: "audit_log",
    target: "activity",
    select: {
      id: stableId("audit_log", s("id")),
      entity_type: `(case s.table_name when 'talent_profiles' then 'expert' when 'job_applications' then 'application' when 'talent_applications' then 'application' when 'accounts' then 'partner' when 'posted_jobs' then 'job' else 'fynolabs.' || s.table_name end)`,
      entity_id: `coalesce((case s.table_name when 'talent_profiles' then ${ref("talent_profiles", "experts", "s.row_id")} when 'job_applications' then ${ref("job_applications", "applications", "s.row_id")}
        when 'talent_applications' then ${ref("talent_applications", "applications", "s.row_id")} when 'accounts' then ${ref("accounts", "partners", "s.row_id")} when 'posted_jobs' then ${ref("posted_jobs", "jobs", "s.row_id")} end)::text, s.row_id::text, '')`,
      actor_email: `coalesce(${who(s("actor"))}, 'fynolabs')`,
      action: `'fynolabs_' || ${s("action")}`,
      // Which fields changed, never the values (the hub's rule for the activity log).
      detail: `jsonb_build_object('source', 'fynolabs', 'table', s.table_name, 'fields', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(case when jsonb_typeof(s.changes) = 'object' then s.changes else '{}'::jsonb end) as k), '[]'::jsonb))`,
      created_at: s("happened_at"),
    },
    legacyId: "s.id",
    tracked: false,
    // People deleted on request: their history goes with them.
    where: `(s.table_name not in ('talent_profiles', 'job_applications', 'talent_applications') or s.row_id is null or coalesce(${ref("talent_profiles", "experts", "s.row_id")}, ${ref("job_applications", "applications", "s.row_id")}, ${ref("talent_applications", "applications", "s.row_id")}) is not null)`,
  },
];

export const ANALYTICS: SimpleSpec[] = [
  { source: "visitor_pageviews", target: "visitor_pageviews", select: same("id", "session_id", "source", "referrer_host", "landing_path", "page_path", "created_at"), legacyId: null, plain: true, tracked: false },
  { source: "visitor_source_daily", target: "visitor_source_daily", select: same("visit_date", "source", "visitors", "page_views"), key: ["visit_date", "source"], legacyId: null, plain: true, tracked: false },
  { source: "visitor_source_sessions", target: "visitor_source_sessions", select: same("visit_date", "source", "session_id"), key: ["visit_date", "source", "session_id"], legacyId: null, plain: true, tracked: false },
];
