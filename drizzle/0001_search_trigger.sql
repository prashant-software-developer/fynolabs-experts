-- Keeps hub.experts.search (full-text index) up to date on every insert and update.
-- 'simple' dictionary: no stemming, so names and skills match as typed.
CREATE OR REPLACE FUNCTION "hub"."experts_search_refresh"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('simple', coalesce(NEW.full_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(NEW.skills, ' '), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.headline, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.domain, '') || ' ' || coalesce(NEW.field_of_study, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.university, '')), 'C');
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "experts_search_refresh" ON "hub"."experts";
--> statement-breakpoint
CREATE TRIGGER "experts_search_refresh" BEFORE INSERT OR UPDATE ON "hub"."experts"
FOR EACH ROW EXECUTE FUNCTION "hub"."experts_search_refresh"();
