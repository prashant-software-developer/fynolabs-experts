CREATE TABLE "hub"."expert_details" (
	"expert_id" uuid PRIMARY KEY NOT NULL,
	"experience" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"education" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"no_experience" boolean,
	"address_line1" text,
	"address_line2" text,
	"postal_code" text,
	"work_authorized" boolean,
	"work_authorized_at" timestamp with time zone,
	"referral_code" text,
	"referred_by_expert_id" uuid,
	"last_login_at" timestamp with time zone,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub"."expert_payout" (
	"expert_id" uuid PRIMARY KEY NOT NULL,
	"payout_method" text,
	"payout_handle" text,
	"tax_form_type" text,
	"tax_form_at" timestamp with time zone,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub"."legacy_map" (
	"source_table" text NOT NULL,
	"source_id" text NOT NULL,
	"hub_table" text NOT NULL,
	"hub_id" uuid NOT NULL,
	"written" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_map_source_table_source_id_pk" PRIMARY KEY("source_table","source_id")
);
--> statement-breakpoint
ALTER TABLE "hub"."expert_files" DROP CONSTRAINT "expert_files_kind_check";--> statement-breakpoint
ALTER TABLE "hub"."applications" ADD COLUMN "rate_expectation_usd" integer;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD CONSTRAINT "expert_details_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_details" ADD CONSTRAINT "expert_details_referred_by_expert_id_experts_id_fk" FOREIGN KEY ("referred_by_expert_id") REFERENCES "hub"."experts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."expert_payout" ADD CONSTRAINT "expert_payout_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_map_hub_idx" ON "hub"."legacy_map" USING btree ("hub_table","hub_id");--> statement-breakpoint
ALTER TABLE "hub"."expert_files" ADD CONSTRAINT "expert_files_kind_check" CHECK (kind in ('cv', 'attachment', 'tax'));