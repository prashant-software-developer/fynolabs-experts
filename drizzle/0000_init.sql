CREATE SCHEMA IF NOT EXISTS "hub";
--> statement-breakpoint
CREATE TABLE "hub"."activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub"."erasures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_sha256" text,
	"source" text,
	"external_id" text,
	"actor_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub"."expert_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"kind" text DEFAULT 'cv' NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"storage" text NOT NULL,
	"external_ref" text,
	"data" "bytea",
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expert_files_storage_check" CHECK (storage in ('jobs_db', 'upload')),
	CONSTRAINT "expert_files_kind_check" CHECK (kind in ('cv'))
);
--> statement-breakpoint
CREATE TABLE "hub"."expert_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expert_sources_source_external_key" UNIQUE("source","external_id"),
	CONSTRAINT "expert_sources_source_check" CHECK (source in ('jobs_site', 'admin_crm', 'register', 'partner', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "hub"."experts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"country" text,
	"region" text,
	"city" text,
	"linkedin_url" text,
	"headline" text,
	"domain" text,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"years_experience" integer,
	"highest_degree" text,
	"field_of_study" text,
	"university" text,
	"hours_per_week" integer,
	"availability" text DEFAULT 'available' NOT NULL,
	"rate_expectation_usd" integer,
	"status" text DEFAULT 'applicant' NOT NULL,
	"cv_consent" text DEFAULT 'unknown' NOT NULL,
	"cv_consent_at" timestamp with time zone,
	"cv_ref" text,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"primary_source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_contacted_at" timestamp with time zone,
	"search" "tsvector",
	CONSTRAINT "experts_email_lower" CHECK ("hub"."experts"."email" is null or "hub"."experts"."email" = lower("hub"."experts"."email")),
	CONSTRAINT "experts_status_check" CHECK (status in ('applicant', 'screening', 'bench', 'submitted', 'placed', 'inactive', 'do_not_contact')),
	CONSTRAINT "experts_availability_check" CHECK (availability in ('available', 'limited', 'busy', 'unavailable')),
	CONSTRAINT "experts_cv_consent_check" CHECK (cv_consent in ('unknown', 'yes', 'no')),
	CONSTRAINT "experts_primary_source_check" CHECK (primary_source in ('jobs_site', 'admin_crm', 'register', 'partner', 'manual')),
	CONSTRAINT "experts_years_check" CHECK ("hub"."experts"."years_experience" is null or "hub"."experts"."years_experience" between 0 and 70)
);
--> statement-breakpoint
CREATE TABLE "hub"."partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'data_partner' NOT NULL,
	"website" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_kind_check" CHECK (kind in ('data_partner', 'frontier_lab', 'expert_platform', 'agency', 'other'))
);
--> statement-breakpoint
CREATE TABLE "hub"."placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid,
	"partner_id" uuid NOT NULL,
	"submission_id" uuid,
	"project_name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"basis" text DEFAULT 'hourly' NOT NULL,
	"rate_to_expert" numeric(12, 2),
	"rate_from_partner" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"hours_approved" numeric(10, 2),
	"tasks_accepted" integer,
	"earned_by_expert" numeric(12, 2),
	"revenue" numeric(12, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placements_status_check" CHECK (status in ('active', 'paused', 'ended')),
	CONSTRAINT "placements_basis_check" CHECK (basis in ('hourly', 'per_task'))
);
--> statement-breakpoint
CREATE TABLE "hub"."requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"external_ref" text,
	"description" text,
	"must_skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"nice_skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"degrees" text[] DEFAULT '{}'::text[] NOT NULL,
	"countries_allowed" text[] DEFAULT '{}'::text[] NOT NULL,
	"countries_blocked" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_years" integer,
	"slots" integer DEFAULT 1 NOT NULL,
	"rate_note" text,
	"deadline" date,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirements_status_check" CHECK (status in ('open', 'filling', 'filled', 'closed')),
	CONSTRAINT "requirements_slots_check" CHECK ("hub"."requirements"."slots" between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "hub"."submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"expert_id" uuid NOT NULL,
	"status" text DEFAULT 'shortlisted' NOT NULL,
	"score" integer,
	"submitted_at" timestamp with time zone,
	"partner_note" text,
	"internal_note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_requirement_expert_key" UNIQUE("requirement_id","expert_id"),
	CONSTRAINT "submissions_status_check" CHECK (status in ('shortlisted', 'consent_requested', 'submitted', 'partner_review', 'approved', 'rejected', 'active', 'ended', 'withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "hub"."expert_files" ADD CONSTRAINT "expert_files_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_sources" ADD CONSTRAINT "expert_sources_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."placements" ADD CONSTRAINT "placements_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."placements" ADD CONSTRAINT "placements_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "hub"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."placements" ADD CONSTRAINT "placements_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "hub"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."requirements" ADD CONSTRAINT "requirements_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "hub"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."submissions" ADD CONSTRAINT "submissions_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "hub"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."submissions" ADD CONSTRAINT "submissions_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_entity_idx" ON "hub"."activity" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "hub"."activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "erasures_email_idx" ON "hub"."erasures" USING btree ("email_sha256");--> statement-breakpoint
CREATE INDEX "erasures_source_idx" ON "hub"."erasures" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "expert_files_expert_idx" ON "hub"."expert_files" USING btree ("expert_id","created_at");--> statement-breakpoint
CREATE INDEX "expert_sources_expert_idx" ON "hub"."expert_sources" USING btree ("expert_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experts_email_key" ON "hub"."experts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "experts_linkedin_idx" ON "hub"."experts" USING btree ("linkedin_url");--> statement-breakpoint
CREATE INDEX "experts_status_idx" ON "hub"."experts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "experts_domain_idx" ON "hub"."experts" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "experts_country_idx" ON "hub"."experts" USING btree ("country");--> statement-breakpoint
CREATE INDEX "experts_skills_idx" ON "hub"."experts" USING gin ("skills");--> statement-breakpoint
CREATE INDEX "experts_search_idx" ON "hub"."experts" USING gin ("search");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_name_key" ON "hub"."partners" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "placements_expert_idx" ON "hub"."placements" USING btree ("expert_id");--> statement-breakpoint
CREATE INDEX "placements_partner_idx" ON "hub"."placements" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "placements_status_idx" ON "hub"."placements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requirements_partner_idx" ON "hub"."requirements" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "requirements_status_idx" ON "hub"."requirements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "submissions_expert_idx" ON "hub"."submissions" USING btree ("expert_id");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "hub"."submissions" USING btree ("status");