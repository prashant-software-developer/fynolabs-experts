CREATE TABLE "hub"."saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"name" text NOT NULL,
	"collection" text DEFAULT 'experts' NOT NULL,
	"config" jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_views_collection_check" CHECK (collection in ('experts'))
);
--> statement-breakpoint
CREATE TABLE "hub"."team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"partner_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_email_lower" CHECK ("hub"."team_members"."email" = lower("hub"."team_members"."email")),
	CONSTRAINT "team_members_role_check" CHECK (role in ('admin', 'recruiter', 'pod_lead', 'finance', 'viewer'))
);
--> statement-breakpoint
ALTER TABLE "hub"."activity" ADD COLUMN "actor_role" text;--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "hub"."saved_views" USING btree ("collection","owner_email");--> statement-breakpoint
CREATE INDEX "saved_views_shared_idx" ON "hub"."saved_views" USING btree ("collection","shared");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_email_key" ON "hub"."team_members" USING btree ("email");