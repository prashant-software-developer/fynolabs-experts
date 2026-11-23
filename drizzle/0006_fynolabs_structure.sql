CREATE TABLE "hub"."calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'call' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"event_date" date,
	"start_time" time,
	"end_time" time,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"company_id" uuid,
	"contact_id" uuid,
	"contact_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"team_member_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"meeting_url" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "calendar_events_kind_check" CHECK (kind in ('call', 'meeting', 'follow_up', 'deadline', 'task', 'post')),
	CONSTRAINT "calendar_events_status_check" CHECK (status in ('planned', 'waiting', 'done', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "hub"."company_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid,
	"kind" text DEFAULT 'note' NOT NULL,
	"summary" text NOT NULL,
	"detail" text,
	"happened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "company_activities_kind_check" CHECK (kind in ('note', 'email', 'call', 'meeting', 'linkedin', 'stage', 'task'))
);
--> statement-breakpoint
CREATE TABLE "hub"."contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"company" text,
	"role" text,
	"kind" text DEFAULT 'client' NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'linkedin' NOT NULL,
	"source_url" text,
	"profile_url" text,
	"email" text,
	"next_follow_up" date,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "contacts_kind_check" CHECK (kind in ('client', 'partner', 'talent')),
	CONSTRAINT "contacts_stage_check" CHECK (stage in ('new', 'contacted', 'replied', 'call', 'proposal', 'won', 'lost')),
	CONSTRAINT "contacts_source_check" CHECK (source in ('linkedin', 'referral', 'website', 'email', 'event', 'other'))
);
--> statement-breakpoint
CREATE TABLE "hub"."email_campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"expert_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"token" uuid,
	"sent_at" timestamp with time zone,
	"followed_up_at" timestamp with time zone,
	"updated_by" text,
	CONSTRAINT "email_campaign_recipients_campaign_expert_key" UNIQUE("campaign_id","expert_id"),
	CONSTRAINT "email_campaign_recipients_status_check" CHECK (status in ('pending', 'sent', 'followed_up', 'skipped', 'failed', 'stopped'))
);
--> statement-breakpoint
CREATE TABLE "hub"."email_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'update' NOT NULL,
	"template_id" uuid,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"job_id" uuid,
	"project_id" uuid,
	"follow_up_subject" text,
	"follow_up_body" text,
	"follow_up_after_days" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "email_campaigns_status_check" CHECK (status in ('draft', 'approved', 'sending', 'done', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "hub"."email_send_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text,
	"template_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub"."email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'update' NOT NULL,
	"project_id" uuid,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "email_templates_kind_check" CHECK (kind in ('outreach', 'follow_up', 'invite', 'referral', 'rejection', 'documents', 'onboarding', 'update', 'other'))
);
--> statement-breakpoint
CREATE TABLE "hub"."engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"agency" text,
	"project" text,
	"status" text DEFAULT 'active' NOT NULL,
	"commission_percent" numeric(5, 2),
	"started_on" date,
	"ended_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "hub"."expert_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"application_id" uuid,
	"kind" text DEFAULT 'note' NOT NULL,
	"summary" text NOT NULL,
	"detail" text,
	"happened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "expert_activities_kind_check" CHECK (kind in ('note', 'email', 'stage', 'application', 'document', 'referral', 'history', 'outreach', 'consent', 'system'))
);
--> statement-breakpoint
CREATE TABLE "hub"."expert_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"application_id" uuid,
	"project_document_id" uuid,
	"kind" text DEFAULT 'agreement' NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"file_id" uuid,
	"signed_file_id" uuid,
	"sent_to" text,
	"sent_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "expert_documents_kind_check" CHECK (kind in ('nda', 'agreement', 'compliance', 'other')),
	CONSTRAINT "expert_documents_status_check" CHECK (status in ('draft', 'sent', 'signed', 'void'))
);
--> statement-breakpoint
CREATE TABLE "hub"."import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'experts' NOT NULL,
	"label" text,
	"project_id" uuid,
	"job_id" uuid,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"unchanged" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub"."message_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error_message" text,
	"sent_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone,
	"handled_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "hub"."monthly_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"expert_id" uuid NOT NULL,
	"month" date NOT NULL,
	"gross_inr" numeric(12, 2) DEFAULT 0 NOT NULL,
	"commission_inr" numeric DEFAULT 0 NOT NULL,
	"commission_percent" numeric,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "monthly_earnings_engagement_month_key" UNIQUE("engagement_id","month")
);
--> statement-breakpoint
CREATE TABLE "hub"."partner_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"company_id" uuid,
	"label" text,
	"period_start" date,
	"period_end" date,
	"signups" integer,
	"qualified" integer,
	"active" integer,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"matched" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"created_submissions" integer DEFAULT 0 NOT NULL,
	"unmatched_count" integer DEFAULT 0 NOT NULL,
	"unmatched" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "hub"."platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'both' NOT NULL,
	"domain" text,
	"logo_url" text,
	"website_url" text,
	"referral_url" text,
	"jobs_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"reference_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "hub"."project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text DEFAULT 'agreement' NOT NULL,
	"title" text NOT NULL,
	"required_stage" text DEFAULT 'selected' NOT NULL,
	"expires_after_days" integer,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "project_documents_kind_check" CHECK (kind in ('nda', 'agreement', 'compliance', 'other')),
	CONSTRAINT "project_documents_stage_check" CHECK (required_stage in ('referred', 'selected', 'documents', 'signed', 'active'))
);
--> statement-breakpoint
CREATE TABLE "hub"."project_fee_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"track_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"earned_at_stage" text DEFAULT 'active' NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "hub"."project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"role" text DEFAULT 'recruiter' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "project_members_project_member_key" UNIQUE("project_id","team_member_id"),
	CONSTRAINT "project_members_role_check" CHECK (role in ('lead', 'recruiter', 'screener', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "hub"."project_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_count" integer,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "hub"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'referral' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"company_id" uuid,
	"platform_id" uuid,
	"referral_url" text,
	"owner_team_member_id" uuid,
	"target_count" integer,
	"starts_on" date,
	"ends_on" date,
	"countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"discord" text,
	"external_ref" text,
	"description" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "projects_kind_check" CHECK (kind in ('referral', 'managed', 'agency', 'bench', 'internal')),
	CONSTRAINT "projects_status_check" CHECK (status in ('planned', 'active', 'paused', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "hub"."radar_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"platform_id" uuid,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"company" text,
	"location" text,
	"url" text NOT NULL,
	"pay_min" numeric,
	"pay_max" numeric,
	"pay_period" text,
	"posted_at" timestamp with time zone,
	"status" text DEFAULT 'new' NOT NULL,
	"matched_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "radar_listings_platform_external_key" UNIQUE("platform","external_id")
);
--> statement-breakpoint
CREATE TABLE "hub"."referral_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"company_id" uuid,
	"rule_id" uuid,
	"application_id" uuid,
	"expert_id" uuid,
	"job_id" uuid,
	"person_name" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'expected' NOT NULL,
	"earned_on" date NOT NULL,
	"invoice_number" text,
	"invoiced_on" date,
	"due_on" date,
	"paid_on" date,
	"paid_amount" numeric(12, 2),
	"void_reason" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "referral_fees_status_check" CHECK (status in ('expected', 'invoiced', 'paid', 'void'))
);
--> statement-breakpoint
CREATE TABLE "hub"."referral_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"expert_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "referral_group_members_group_email_key" UNIQUE("group_id","email")
);
--> statement-breakpoint
CREATE TABLE "hub"."referral_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "hub"."referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid,
	"platform_id" uuid,
	"platform" text NOT NULL,
	"company_id" uuid,
	"project_id" uuid,
	"application_id" uuid,
	"engagement_id" uuid,
	"referral_url" text,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"personal_note" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"method" text DEFAULT 'email' NOT NULL,
	"outcome" text DEFAULT 'sent' NOT NULL,
	"outcome_at" timestamp with time zone,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"tracking_token" uuid,
	"first_opened_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"first_clicked_at" timestamp with time zone,
	"last_clicked_at" timestamp with time zone,
	"click_count" integer DEFAULT 0 NOT NULL,
	"external_ref" text,
	"submitted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "referrals_method_check" CHECK (method in ('email', 'link', 'agency_form', 'profile_share', 'intro', 'other')),
	CONSTRAINT "referrals_outcome_check" CHECK (outcome in ('sent', 'needs_info', 'in_review', 'signed_up', 'qualified', 'active', 'rejected', 'already_member', 'churned'))
);
--> statement-breakpoint
CREATE TABLE "hub"."reply_drafts" (
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "reply_drafts_source_type_source_id_pk" PRIMARY KEY("source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "hub"."settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "hub"."suppressed_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "hub"."tracked_link_clicks" (
	"link_id" uuid NOT NULL,
	"day" date NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tracked_link_clicks_link_id_day_pk" PRIMARY KEY("link_id","day")
);
--> statement-breakpoint
CREATE TABLE "hub"."tracked_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text,
	"target_url" text NOT NULL,
	"channel" text DEFAULT 'other' NOT NULL,
	"project_id" uuid,
	"job_id" uuid,
	"platform_id" uuid,
	"company_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"last_clicked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "tracked_links_channel_check" CHECK (channel in ('linkedin', 'x', 'instagram', 'threads', 'reddit', 'youtube', 'whatsapp', 'discord', 'email', 'website', 'partner', 'other'))
);
--> statement-breakpoint
CREATE TABLE "hub"."unsubscribe_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "hub"."visitor_pageviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"source" text NOT NULL,
	"referrer_host" text,
	"landing_path" text NOT NULL,
	"page_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_pageviews_source_check" CHECK (source in ('linkedin', 'direct', 'google', 'other'))
);
--> statement-breakpoint
CREATE TABLE "hub"."visitor_source_daily" (
	"visit_date" date NOT NULL,
	"source" text NOT NULL,
	"visitors" bigint DEFAULT 0 NOT NULL,
	"page_views" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "visitor_source_daily_visit_date_source_pk" PRIMARY KEY("visit_date","source")
);
--> statement-breakpoint
CREATE TABLE "hub"."visitor_source_sessions" (
	"visit_date" date NOT NULL,
	"source" text NOT NULL,
	"session_id" uuid NOT NULL,
	CONSTRAINT "visitor_source_sessions_visit_date_source_session_id_pk" PRIMARY KEY("visit_date","source","session_id")
);
--> statement-breakpoint
ALTER TABLE "hub"."expert_files" DROP CONSTRAINT "expert_files_storage_check";--> statement-breakpoint
ALTER TABLE "hub"."expert_files" DROP CONSTRAINT "expert_files_kind_check";--> statement-breakpoint
ALTER TABLE "hub"."partners" DROP CONSTRAINT "partners_kind_check";--> statement-breakpoint
ALTER TABLE "hub"."saved_views" DROP CONSTRAINT "saved_views_collection_check";--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "stage" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "started_on" date;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "ended_on" date;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "owner_team_member_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "track_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "channel" text DEFAULT 'applied' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "screening" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "eligible" boolean;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "next_action" text;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "next_action_due" date;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "next_action_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "consent_version" text;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "handled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "handled_by" text;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "hub"."erasures" ADD COLUMN "email_md5" text;--> statement-breakpoint
ALTER TABLE "hub"."erasures" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_payout" ADD COLUMN "default_commission_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "seniority" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "links" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "owner_team_member_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "outreach_status" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "next_action" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "next_action_due" date;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "next_action_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "source_channel" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "source_detail" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "source_company_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "consent_source" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "consent_version" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "dnc_reason" text;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "dnc_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "email_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "email_opt_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."job_invites" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."job_invites" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."job_invites" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."job_invites" ADD COLUMN "application_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD COLUMN "track_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD COLUMN "radar_listing_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD COLUMN "apply_url" text;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD COLUMN "require_github" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD COLUMN "badge" text;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD COLUMN "pay_unit" text;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD COLUMN "source_visibility" text;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "business_line" text DEFAULT 'ai_training' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "stage" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "owner_team_member_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "next_step" text;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "next_step_due" date;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "best_route" text;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "platform_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "hub"."team_members" ADD COLUMN "sections" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."team_members" ADD COLUMN "invited_by" text;--> statement-breakpoint
ALTER TABLE "hub"."calendar_events" ADD CONSTRAINT "calendar_events_company_id_partners_id_fk" FOREIGN KEY ("company_id") REFERENCES "hub"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."calendar_events" ADD CONSTRAINT "calendar_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "hub"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."company_activities" ADD CONSTRAINT "company_activities_company_id_partners_id_fk" FOREIGN KEY ("company_id") REFERENCES "hub"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."company_activities" ADD CONSTRAINT "company_activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "hub"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."contacts" ADD CONSTRAINT "contacts_company_id_partners_id_fk" FOREIGN KEY ("company_id") REFERENCES "hub"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "hub"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."email_campaigns" ADD CONSTRAINT "email_campaigns_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "hub"."email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."email_campaigns" ADD CONSTRAINT "email_campaigns_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "hub"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."email_campaigns" ADD CONSTRAINT "email_campaigns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."email_templates" ADD CONSTRAINT "email_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."engagements" ADD CONSTRAINT "engagements_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_activities" ADD CONSTRAINT "expert_activities_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_activities" ADD CONSTRAINT "expert_activities_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "hub"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD CONSTRAINT "expert_documents_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD CONSTRAINT "expert_documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "hub"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD CONSTRAINT "expert_documents_project_document_id_project_documents_id_fk" FOREIGN KEY ("project_document_id") REFERENCES "hub"."project_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD CONSTRAINT "expert_documents_file_id_expert_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "hub"."expert_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD CONSTRAINT "expert_documents_signed_file_id_expert_files_id_fk" FOREIGN KEY ("signed_file_id") REFERENCES "hub"."expert_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."import_batches" ADD CONSTRAINT "import_batches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."import_batches" ADD CONSTRAINT "import_batches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "hub"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."monthly_earnings" ADD CONSTRAINT "monthly_earnings_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "hub"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."monthly_earnings" ADD CONSTRAINT "monthly_earnings_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."partner_reports" ADD CONSTRAINT "partner_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."partner_reports" ADD CONSTRAINT "partner_reports_company_id_partners_id_fk" FOREIGN KEY ("company_id") REFERENCES "hub"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."project_fee_rules" ADD CONSTRAINT "project_fee_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."project_fee_rules" ADD CONSTRAINT "project_fee_rules_track_id_project_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "hub"."project_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."project_members" ADD CONSTRAINT "project_members_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "hub"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."project_tracks" ADD CONSTRAINT "project_tracks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."projects" ADD CONSTRAINT "projects_company_id_partners_id_fk" FOREIGN KEY ("company_id") REFERENCES "hub"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."projects" ADD CONSTRAINT "projects_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "hub"."platforms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."projects" ADD CONSTRAINT "projects_owner_team_member_id_team_members_id_fk" FOREIGN KEY ("owner_team_member_id") REFERENCES "hub"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."radar_listings" ADD CONSTRAINT "radar_listings_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "hub"."platforms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referral_fees" ADD CONSTRAINT "referral_fees_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referral_fees" ADD CONSTRAINT "referral_fees_company_id_partners_id_fk" FOREIGN KEY ("company_id") REFERENCES "hub"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referral_fees" ADD CONSTRAINT "referral_fees_rule_id_project_fee_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "hub"."project_fee_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referral_fees" ADD CONSTRAINT "referral_fees_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "hub"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referral_fees" ADD CONSTRAINT "referral_fees_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referral_fees" ADD CONSTRAINT "referral_fees_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "hub"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referral_group_members" ADD CONSTRAINT "referral_group_members_group_id_referral_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "hub"."referral_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referral_group_members" ADD CONSTRAINT "referral_group_members_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referrals" ADD CONSTRAINT "referrals_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referrals" ADD CONSTRAINT "referrals_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "hub"."platforms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referrals" ADD CONSTRAINT "referrals_company_id_partners_id_fk" FOREIGN KEY ("company_id") REFERENCES "hub"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referrals" ADD CONSTRAINT "referrals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referrals" ADD CONSTRAINT "referrals_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "hub"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."referrals" ADD CONSTRAINT "referrals_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "hub"."engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."tracked_link_clicks" ADD CONSTRAINT "tracked_link_clicks_link_id_tracked_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "hub"."tracked_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."tracked_links" ADD CONSTRAINT "tracked_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."tracked_links" ADD CONSTRAINT "tracked_links_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "hub"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."tracked_links" ADD CONSTRAINT "tracked_links_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "hub"."platforms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."tracked_links" ADD CONSTRAINT "tracked_links_company_id_partners_id_fk" FOREIGN KEY ("company_id") REFERENCES "hub"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_date_idx" ON "hub"."calendar_events" USING btree ("event_date","start_time");--> statement-breakpoint
CREATE INDEX "calendar_events_company_idx" ON "hub"."calendar_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_activities_company_idx" ON "hub"."company_activities" USING btree ("company_id","happened_at");--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "hub"."contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "hub"."contacts" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "email_send_log_created_idx" ON "hub"."email_send_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "expert_activities_expert_idx" ON "hub"."expert_activities" USING btree ("expert_id","happened_at");--> statement-breakpoint
CREATE INDEX "expert_documents_expert_idx" ON "hub"."expert_documents" USING btree ("expert_id");--> statement-breakpoint
CREATE INDEX "message_replies_source_idx" ON "hub"."message_replies" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "messages_created_idx" ON "hub"."messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platforms_name_idx" ON "hub"."platforms" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "project_tracks_project_idx" ON "hub"."project_tracks" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_key" ON "hub"."projects" USING btree ("code");--> statement-breakpoint
CREATE INDEX "referrals_expert_idx" ON "hub"."referrals" USING btree ("expert_id","sent_at");--> statement-breakpoint
CREATE INDEX "referrals_project_idx" ON "hub"."referrals" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppressed_emails_email_key" ON "hub"."suppressed_emails" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_links_code_key" ON "hub"."tracked_links" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "unsubscribe_tokens_token_key" ON "hub"."unsubscribe_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "unsubscribe_tokens_email_key" ON "hub"."unsubscribe_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "visitor_pageviews_created_idx" ON "hub"."visitor_pageviews" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD CONSTRAINT "applications_owner_team_member_id_team_members_id_fk" FOREIGN KEY ("owner_team_member_id") REFERENCES "hub"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD CONSTRAINT "applications_track_id_project_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "hub"."project_tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD CONSTRAINT "experts_owner_team_member_id_team_members_id_fk" FOREIGN KEY ("owner_team_member_id") REFERENCES "hub"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD CONSTRAINT "experts_source_company_id_partners_id_fk" FOREIGN KEY ("source_company_id") REFERENCES "hub"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD CONSTRAINT "experts_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "hub"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."job_invites" ADD CONSTRAINT "job_invites_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "hub"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "hub"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD CONSTRAINT "jobs_track_id_project_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "hub"."project_tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD CONSTRAINT "jobs_radar_listing_id_radar_listings_id_fk" FOREIGN KEY ("radar_listing_id") REFERENCES "hub"."radar_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD CONSTRAINT "partners_owner_team_member_id_team_members_id_fk" FOREIGN KEY ("owner_team_member_id") REFERENCES "hub"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD CONSTRAINT "partners_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "hub"."platforms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_stage_idx" ON "hub"."applications" USING btree ("stage","next_action_due");--> statement-breakpoint
CREATE INDEX "erasures_md5_idx" ON "hub"."erasures" USING btree ("email_md5");--> statement-breakpoint
CREATE INDEX "experts_owner_idx" ON "hub"."experts" USING btree ("owner_team_member_id");--> statement-breakpoint
CREATE INDEX "experts_next_action_idx" ON "hub"."experts" USING btree ("next_action_due");--> statement-breakpoint
CREATE INDEX "partners_stage_idx" ON "hub"."partners" USING btree ("stage","next_step_due");--> statement-breakpoint
CREATE INDEX "partners_owner_idx" ON "hub"."partners" USING btree ("owner_team_member_id");--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD CONSTRAINT "applications_stage_check" CHECK (stage in ('new', 'shortlisted', 'referred', 'selected', 'documents', 'signed', 'active', 'ended', 'rejected'));--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD CONSTRAINT "applications_channel_check" CHECK (channel in ('applied', 'sourced', 'import', 'referral', 'agency', 'partner', 'manual'));--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD CONSTRAINT "applications_reject_reason_check" CHECK ("hub"."applications"."reject_reason" is null or reject_reason in ('not_eligible', 'skills', 'experience', 'location', 'availability', 'rate', 'no_response', 'not_interested', 'withdrew', 'client_rejected', 'already_on_platform', 'duplicate', 'other'));--> statement-breakpoint
ALTER TABLE "hub"."expert_files" ADD CONSTRAINT "expert_files_storage_check" CHECK (storage in ('jobs_db', 'upload', 'fynolabs'));--> statement-breakpoint
ALTER TABLE "hub"."expert_files" ADD CONSTRAINT "expert_files_kind_check" CHECK (kind in ('cv', 'attachment', 'tax', 'document'));--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD CONSTRAINT "experts_seniority_check" CHECK ("hub"."experts"."seniority" is null or seniority in ('junior', 'mid', 'senior', 'lead', 'executive'));--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD CONSTRAINT "experts_outreach_check" CHECK ("hub"."experts"."outreach_status" is null or outreach_status in ('not_contacted', 'contacted', 'replied', 'interested', 'not_interested', 'no_response', 'applied', 'unreachable'));--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD CONSTRAINT "partners_stage_check" CHECK (stage in ('researching', 'researched', 'drafted', 'contacted', 'talking', 'pilot', 'active', 'on_hold', 'dropped'));--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD CONSTRAINT "partners_priority_check" CHECK (priority in ('high', 'normal', 'low'));--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD CONSTRAINT "partners_business_line_check" CHECK (business_line in ('ai_training', 'product', 'both'));--> statement-breakpoint
ALTER TABLE "hub"."partners" ADD CONSTRAINT "partners_kind_check" CHECK (kind in ('data_partner', 'frontier_lab', 'expert_platform', 'agency', 'staffing', 'talent_source', 'trainer_gig', 'client', 'other'));--> statement-breakpoint
ALTER TABLE "hub"."saved_views" ADD CONSTRAINT "saved_views_collection_check" CHECK (collection in ('experts', 'fynolabs_experts', 'fynolabs_submissions'));--> statement-breakpoint
-- The pipeline stage of every existing application, from its status (before the trigger exists, so statuses stay as they are).
UPDATE "hub"."applications" SET "stage" = CASE "status" WHEN 'shortlisted' THEN 'shortlisted' WHEN 'submitted_to_partner' THEN 'referred' WHEN 'hired' THEN 'selected' WHEN 'rejected' THEN 'rejected' WHEN 'withdrawn' THEN 'rejected' ELSE 'new' END, "stage_changed_at" = "updated_at";
--> statement-breakpoint
-- Keeps status and stage in step: a change to one sets the other (Applied = new, Proposed to client = submitted to partner, Selected and later = hired, Rejected = rejected or withdrawn).
CREATE OR REPLACE FUNCTION "hub"."applications_stage_sync"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  from_status text;
  from_stage text;
BEGIN
  from_status := CASE NEW.status WHEN 'shortlisted' THEN 'shortlisted' WHEN 'submitted_to_partner' THEN 'referred' WHEN 'hired' THEN 'selected' WHEN 'rejected' THEN 'rejected' WHEN 'withdrawn' THEN 'rejected' ELSE 'new' END;
  from_stage := CASE NEW.stage WHEN 'new' THEN 'new' WHEN 'shortlisted' THEN 'shortlisted' WHEN 'referred' THEN 'submitted_to_partner' WHEN 'rejected' THEN 'rejected' ELSE 'hired' END;
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage = 'new' AND NEW.status <> 'new' THEN
      NEW.stage := from_status;
    ELSIF NEW.status = 'new' AND NEW.stage <> 'new' THEN
      NEW.status := from_stage;
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
      -- A stage that already means this status (Signed for hired, say) is kept; otherwise it follows.
      IF from_stage IS DISTINCT FROM NEW.status THEN
        NEW.stage := from_status;
      END IF;
    ELSIF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      NEW.status := from_stage;
    END IF;
    IF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage_changed_at IS NOT DISTINCT FROM OLD.stage_changed_at THEN
      NEW.stage_changed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "applications_stage_sync" ON "hub"."applications";
--> statement-breakpoint
CREATE TRIGGER "applications_stage_sync" BEFORE INSERT OR UPDATE ON "hub"."applications" FOR EACH ROW EXECUTE FUNCTION "hub"."applications_stage_sync"();
