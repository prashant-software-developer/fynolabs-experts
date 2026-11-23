// Where every FynoLabs admin table lands in the hub. The copy (fynolabs_copy.<table>) is made by
// the hub-sync edge function; the mapping (map.ts) folds it into the hub's own tables.
// A FynoLabs table that isn't listed here (added later) is still copied and reported as
// "copied only": nothing is lost, and it can be mapped when the hub gets a screen for it.

export const COPY_SCHEMA = "fynolabs_copy";
/** updated_by / created_by on rows the sync wrote. Once someone else writes a row, the sync leaves it alone. */
export const SYNC_BY = "fynolabs sync";
/** hub.legacy_map.source_table for a FynoLabs table. */
export const legacyName = (table: string) => `fynolabs.${table}`;

export type Landing = { hub: string; how: "mapped" | "merged" | "folded" | "lookup" | "analytics"; note: string };

export const FYNOLABS_MAP: Record<string, Landing> = {
  team_members: { hub: "team_members", how: "merged", note: "by email; new people are added with access turned off (an admin turns them on)" },
  user_roles: { hub: "team_members", how: "folded", note: "the admin role of new team rows" },
  auth_users: { hub: "(lookup)", how: "lookup", note: "who created or owns a record (email); never passwords" },
  org_logos: { hub: "platforms", how: "mapped", note: "platforms and referral links" },
  accounts: { hub: "partners", how: "merged", note: "companies: one record per organisation (same name = same company)" },
  account_activities: { hub: "company_activities", how: "mapped", note: "" },
  leads: { hub: "contacts", how: "mapped", note: "people at companies" },
  calendar_events: { hub: "calendar_events", how: "mapped", note: "India time" },
  import_batches: { hub: "import_batches", how: "mapped", note: "" },
  talent_profiles: { hub: "experts", how: "merged", note: "one expert per person: email, then LinkedIn; FynoLabs wins over Engine, never over hub edits" },
  expert_activities: { hub: "expert_activities", how: "mapped", note: "the expert's timeline" },
  expert_documents: { hub: "expert_documents", how: "mapped", note: "files in expert_files (storage fynolabs)" },
  expert_invites: { hub: "job_invites", how: "mapped", note: "" },
  posted_jobs: { hub: "jobs", how: "mapped", note: "internal: never on the public board" },
  job_applications: { hub: "applications", how: "merged", note: "one pipeline per person per job" },
  talent_applications: { hub: "applications", how: "merged", note: "on the internal job \"Talent call (FynoLabs)\"" },
  job_listings: { hub: "radar_listings", how: "mapped", note: "job radar; pay is money-only" },
  job_scan_settings: { hub: "settings", how: "folded", note: "key job_radar" },
  projects: { hub: "projects", how: "mapped", note: "" },
  project_tracks: { hub: "project_tracks", how: "mapped", note: "" },
  project_members: { hub: "project_members", how: "mapped", note: "" },
  project_documents: { hub: "project_documents", how: "mapped", note: "" },
  project_fee_rules: { hub: "project_fee_rules", how: "mapped", note: "money-only" },
  partner_reports: { hub: "partner_reports", how: "mapped", note: "" },
  talent_engagements: { hub: "engagements", how: "mapped", note: "commission is money-only" },
  talent_monthly_earnings: { hub: "monthly_earnings", how: "mapped", note: "money-only" },
  talent_referrals: { hub: "referrals", how: "mapped", note: "sent referrals and submissions" },
  referral_fees: { hub: "referral_fees", how: "mapped", note: "money-only" },
  referral_groups: { hub: "referral_groups", how: "mapped", note: "" },
  referral_group_members: { hub: "referral_group_members", how: "mapped", note: "linked to the expert by email" },
  tracked_links: { hub: "tracked_links", how: "mapped", note: "" },
  tracked_link_clicks: { hub: "tracked_link_clicks", how: "mapped", note: "" },
  email_templates: { hub: "email_templates", how: "mapped", note: "" },
  email_campaigns: { hub: "email_campaigns", how: "mapped", note: "" },
  email_campaign_recipients: { hub: "email_campaign_recipients", how: "mapped", note: "tokens kept, never shown" },
  email_send_log: { hub: "email_send_log", how: "mapped", note: "" },
  email_send_state: { hub: "settings", how: "folded", note: "key email_send_state" },
  suppressed_emails: { hub: "suppressed_emails", how: "mapped", note: "" },
  email_unsubscribe_tokens: { hub: "unsubscribe_tokens", how: "mapped", note: "tokens kept, never shown" },
  contact_submissions: { hub: "messages", how: "mapped", note: "" },
  admin_replies: { hub: "message_replies", how: "mapped", note: "" },
  reply_drafts: { hub: "reply_drafts", how: "mapped", note: "" },
  saved_views: { hub: "saved_views", how: "mapped", note: "as fynolabs_experts / fynolabs_submissions (not hub tabs yet)" },
  admin_settings: { hub: "settings", how: "folded", note: "same keys" },
  audit_log: { hub: "activity", how: "mapped", note: "who, when, which fields (no values)" },
  privacy_log: { hub: "erasures", how: "mapped", note: "MD5 of the email: those people are never imported" },
  visitor_pageviews: { hub: "visitor_pageviews", how: "analytics", note: "" },
  visitor_source_daily: { hub: "visitor_source_daily", how: "analytics", note: "" },
  visitor_source_sessions: { hub: "visitor_source_sessions", how: "analytics", note: "" },
  storage_objects: { hub: "expert_files", how: "lookup", note: "CVs and documents: bytes stored once, in fynolabs_copy" },
};
