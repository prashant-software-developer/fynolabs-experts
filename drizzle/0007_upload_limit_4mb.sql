-- Uploads stop at 4 MB (Vercel's standard request limit; src/lib/upload-limit.ts, 26 Nov 2026).
-- Job forms made before keep their own help text: say 4 MB there too. Data only; nothing else changes.
UPDATE "hub"."job_form_fields" SET help_text = replace(help_text, 'up to 10 MB', 'up to 4 MB') WHERE type = 'file' AND help_text LIKE '%up to 10 MB%';
