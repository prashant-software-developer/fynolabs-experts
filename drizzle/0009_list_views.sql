-- Saved views (tabs) on the Accounts and Leads lists, as on Experts (27 Nov 2026): two more collections.
ALTER TABLE "hub"."saved_views" DROP CONSTRAINT "saved_views_collection_check";--> statement-breakpoint
ALTER TABLE "hub"."saved_views" ADD CONSTRAINT "saved_views_collection_check" CHECK (collection in ('experts', 'fynolabs_experts', 'fynolabs_submissions', 'accounts', 'leads'));