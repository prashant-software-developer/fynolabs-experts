CREATE TABLE "hub"."course_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'reading' NOT NULL,
	"url" text,
	"body" text,
	"quiz" jsonb,
	"minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "course_lessons_kind_check" CHECK (kind in ('video', 'pdf', 'reading', 'quiz', 'link'))
);
--> statement-breakpoint
CREATE TABLE "hub"."courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"kind" text DEFAULT 'course' NOT NULL,
	"level" text DEFAULT 'beginner' NOT NULL,
	"minutes" integer,
	"art" text,
	"published" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug"),
	CONSTRAINT "courses_kind_check" CHECK (kind in ('course', 'guide', 'quiz')),
	CONSTRAINT "courses_level_check" CHECK (level in ('beginner', 'intermediate', 'advanced'))
);
--> statement-breakpoint
CREATE TABLE "hub"."document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'agreement' NOT NULL,
	"description" text,
	"body" text,
	"filename" text,
	"mime" text,
	"size" integer,
	"data" "bytea",
	"required_for_all" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "document_templates_kind_check" CHECK (kind in ('nda', 'agreement', 'compliance', 'other'))
);
--> statement-breakpoint
CREATE TABLE "hub"."lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score" smallint,
	"attempts" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "lesson_progress_expert_lesson_key" UNIQUE("expert_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "hub"."payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid,
	"placement_id" uuid,
	"label" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"period_start" date,
	"period_end" date,
	"expected_on" date,
	"paid_on" date,
	"method" text,
	"reference" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "payouts_status_check" CHECK (status in ('upcoming', 'processing', 'paid', 'failed', 'void'))
);
--> statement-breakpoint
ALTER TABLE "hub"."expert_files" DROP CONSTRAINT "expert_files_kind_check";--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "projects" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "certifications" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "work_same_as_residence" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "work_country" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "work_region" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "work_city" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "work_postal_code" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "start_availability" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "weekly_hours" jsonb;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "domain_interests" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "min_full_time_usd" integer;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "min_part_time_usd" integer;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "looking_for_work" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "comm_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "availability_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD COLUMN "avatar_file_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD COLUMN "viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD COLUMN "sign_method" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD COLUMN "signed_name" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD COLUMN "signed_ip" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD COLUMN "signed_user_agent" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD COLUMN "signed_hash" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD COLUMN "signed_body" text;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD COLUMN "signed_fields" jsonb;--> statement-breakpoint
ALTER TABLE "hub"."course_lessons" ADD CONSTRAINT "course_lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "hub"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."lesson_progress" ADD CONSTRAINT "lesson_progress_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_course_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "hub"."course_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."lesson_progress" ADD CONSTRAINT "lesson_progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "hub"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."payouts" ADD CONSTRAINT "payouts_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."payouts" ADD CONSTRAINT "payouts_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "hub"."placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_lessons_course_idx" ON "hub"."course_lessons" USING btree ("course_id","position");--> statement-breakpoint
CREATE INDEX "lesson_progress_expert_idx" ON "hub"."lesson_progress" USING btree ("expert_id","course_id");--> statement-breakpoint
CREATE INDEX "payouts_expert_idx" ON "hub"."payouts" USING btree ("expert_id","status");--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD CONSTRAINT "expert_details_avatar_file_id_expert_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "hub"."expert_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD CONSTRAINT "expert_documents_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "hub"."document_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD CONSTRAINT "expert_details_start_check" CHECK ("hub"."expert_details"."start_availability" is null or start_availability in ('immediately', '1_week', '2_weeks', '1_month', 'later'));--> statement-breakpoint
ALTER TABLE "hub"."expert_documents" ADD CONSTRAINT "expert_documents_sign_method_check" CHECK ("hub"."expert_documents"."sign_method" is null or sign_method in ('typed', 'upload'));--> statement-breakpoint
ALTER TABLE "hub"."expert_files" ADD CONSTRAINT "expert_files_kind_check" CHECK (kind in ('cv', 'attachment', 'tax', 'document', 'avatar'));