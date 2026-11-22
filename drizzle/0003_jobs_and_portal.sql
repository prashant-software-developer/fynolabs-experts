CREATE TABLE "hub"."applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"expert_id" uuid NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"answers" jsonb NOT NULL,
	"source" jsonb,
	"ip_hash" text,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_job_expert_key" UNIQUE("job_id","expert_id"),
	CONSTRAINT "applications_status_check" CHECK (status in ('new', 'reviewing', 'shortlisted', 'submitted_to_partner', 'rejected', 'hired', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "hub"."auth_verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub"."data_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid,
	"kind" text DEFAULT 'delete' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"handled_by" text,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_requests_kind_check" CHECK (kind in ('delete', 'export')),
	CONSTRAINT "data_requests_status_check" CHECK (status in ('open', 'done'))
);
--> statement-breakpoint
CREATE TABLE "hub"."form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"fields" jsonb NOT NULL,
	"created_by" text,
	"shared" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub"."job_form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"maps_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_form_fields_type_check" CHECK (type in ('short_text', 'long_text', 'email', 'phone', 'url', 'number', 'single_select', 'multi_select', 'checkboxes', 'yes_no', 'date', 'country', 'years', 'skills', 'file', 'consent', 'section'))
);
--> statement-breakpoint
CREATE TABLE "hub"."job_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"expert_id" uuid NOT NULL,
	"emailed" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_invites_job_expert_key" UNIQUE("job_id","expert_id")
);
--> statement-breakpoint
CREATE TABLE "hub"."jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"public_company_label" text DEFAULT 'AI data partner (via FynoLabs)' NOT NULL,
	"partner_id" uuid,
	"requirement_id" uuid,
	"summary" text,
	"description" text,
	"location" text,
	"employment_type" text DEFAULT 'contract' NOT NULL,
	"domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"countries_allowed" text[] DEFAULT '{}'::text[] NOT NULL,
	"countries_blocked" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_years" integer,
	"openings" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"closes_on" date,
	"internal_rate_note" text,
	"published_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_status_check" CHECK (status in ('draft', 'open', 'paused', 'closed')),
	CONSTRAINT "jobs_visibility_check" CHECK (visibility in ('public', 'unlisted', 'internal')),
	CONSTRAINT "jobs_employment_type_check" CHECK (employment_type in ('contract', 'part_time', 'full_time', 'freelance')),
	CONSTRAINT "jobs_openings_check" CHECK ("hub"."jobs"."openings" between 1 and 1000),
	CONSTRAINT "jobs_slug_format" CHECK ("hub"."jobs"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "hub"."submit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hub"."expert_files" DROP CONSTRAINT "expert_files_kind_check";--> statement-breakpoint
ALTER TABLE "hub"."expert_sources" DROP CONSTRAINT "expert_sources_source_check";--> statement-breakpoint
ALTER TABLE "hub"."experts" DROP CONSTRAINT "experts_primary_source_check";--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "portal_joined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD COLUMN "onboarding_done" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "hub"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD CONSTRAINT "applications_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."data_requests" ADD CONSTRAINT "data_requests_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."job_form_fields" ADD CONSTRAINT "job_form_fields_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "hub"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."job_invites" ADD CONSTRAINT "job_invites_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "hub"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."job_invites" ADD CONSTRAINT "job_invites_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD CONSTRAINT "jobs_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "hub"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."jobs" ADD CONSTRAINT "jobs_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "hub"."requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_job_idx" ON "hub"."applications" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "applications_expert_idx" ON "hub"."applications" USING btree ("expert_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_verification_tokens_key" ON "hub"."auth_verification_tokens" USING btree ("identifier","token");--> statement-breakpoint
CREATE INDEX "data_requests_status_idx" ON "hub"."data_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "form_templates_name_idx" ON "hub"."form_templates" USING btree ("name");--> statement-breakpoint
CREATE INDEX "job_form_fields_job_idx" ON "hub"."job_form_fields" USING btree ("job_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_slug_key" ON "hub"."jobs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "hub"."jobs" USING btree ("status","visibility");--> statement-breakpoint
CREATE INDEX "jobs_partner_idx" ON "hub"."jobs" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "jobs_requirement_idx" ON "hub"."jobs" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "submit_attempts_key_idx" ON "hub"."submit_attempts" USING btree ("kind","key_hash","created_at");--> statement-breakpoint
ALTER TABLE "hub"."expert_files" ADD CONSTRAINT "expert_files_kind_check" CHECK (kind in ('cv', 'attachment'));--> statement-breakpoint
ALTER TABLE "hub"."expert_sources" ADD CONSTRAINT "expert_sources_source_check" CHECK (source in ('jobs_site', 'admin_crm', 'register', 'partner', 'manual', 'job_form', 'portal'));--> statement-breakpoint
ALTER TABLE "hub"."experts" ADD CONSTRAINT "experts_primary_source_check" CHECK (primary_source in ('jobs_site', 'admin_crm', 'register', 'partner', 'manual', 'job_form', 'portal'));