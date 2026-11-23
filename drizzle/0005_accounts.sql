CREATE TABLE "hub"."account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"code_hash" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_tokens_kind_check" CHECK (kind in ('verify_email', 'reset_password'))
);
--> statement-breakpoint
CREATE TABLE "hub"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"account_type" text NOT NULL,
	"password_hash" text,
	"password_set_at" timestamp with time zone,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"email_verified_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"token_version" integer DEFAULT 0 NOT NULL,
	"team_member_id" uuid,
	"expert_id" uuid,
	"consent_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_lower" CHECK ("hub"."accounts"."email" = lower("hub"."accounts"."email")),
	CONSTRAINT "accounts_type_check" CHECK (account_type in ('team', 'expert'))
);
--> statement-breakpoint
ALTER TABLE "hub"."account_tokens" ADD CONSTRAINT "account_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "hub"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."accounts" ADD CONSTRAINT "accounts_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "hub"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub"."accounts" ADD CONSTRAINT "accounts_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "hub"."experts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_tokens_token_key" ON "hub"."account_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_tokens_account_idx" ON "hub"."account_tokens" USING btree ("account_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_key" ON "hub"."accounts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_expert_key" ON "hub"."accounts" USING btree ("expert_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_team_member_key" ON "hub"."accounts" USING btree ("team_member_id");--> statement-breakpoint
DROP TABLE "hub"."auth_verification_tokens" CASCADE;
