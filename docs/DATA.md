# Data: what's stored, what's read, and the rules

## Where it lives

Production uses Expert Hub's **own Neon project** ("expert-hub", `DATABASE_URL`; its main branch is the one real environment). The app's tables are in the Postgres schema **`hub`**; migrations only create or change objects there (a check in `npm run db:migrate` and in the tests refuses anything else).

The same database also holds **`engine_copy`**: an exact replica of the old jobs site's expert tables, written only by `npm run copy:engine` (see below). The app never shows it; it is there so nothing from the jobs site is lost, and so the copy can be re-run.

The old jobs site's own tables (`public.xdl_jobs_*`) stay in the shared **Engine** project, which jobs.fynolabs.si keeps writing to until it moves over. The hub only ever **reads** them: `npm run copy:engine` (every expert record) and the older `npm run import:jobs` (people and CVs).

## Tables in `hub` (written by this app)

| Table | What's in it |
|---|---|
| `experts` | One row per person: name, email (lower case, unique), phone, country, state/region, city, LinkedIn URL, headline, domain, skills, languages, years of experience, highest degree, field of study, university, hours per week, availability, rate expectation (internal), status, CV consent (+ when recorded), pointer to the current CV, internal notes, tags, where they first came from, dates. Plus a search index built from name, skills, headline, domain, field of study and university. |
| `expert_sources` | Where each person came from (jobs site user id, register key, CRM id). Stops duplicates on re-import. |
| `expert_files` | CVs (`kind = cv`), other files from job forms (`kind = attachment`) and tax forms from the jobs site (`kind = tax`, **money-only**: listed and downloadable only for admins and finance, never in a roster or CV ZIP). Uploaded here, through a job form or the portal, or copied from the jobs site: the file itself (`data`, up to 10 MB; `external_ref = jobs:<id>` for copies). Jobs-site CVs read from the same database: only a pointer (the bytes stay on the jobs site). |
| `expert_details` | Copied from the jobs site: experience and education (as lists), "no experience yet", address lines and postal code (contact details: masked roles never get them), work authorisation, referral code, who referred them, last sign-in on the jobs site. `updated_by = 'jobs-site import'` while only the copy has written the row: the copy then keeps it in step with the jobs site. |
| `expert_payout` | **Money-only** (admins and finance): payout method and handle, tax form type and date, as the expert entered them on the jobs site. A separate table, so no list, search or export of experts can include it. |
| `legacy_map` | What each copied jobs-site row became (users → experts, files → expert_files, jobs → jobs, applications → applications), and the values the copy last wrote to fields the team can change. Makes re-runs idempotent. |
| `partners` | Companies that send requirements. |
| `requirements` | What a partner asked for: skills, domains, degree, countries allowed / blocked (US states as `US-CA`), minimum years, slots, deadline, internal rate note, status. |
| `submissions` | One row per person per requirement: status, match score when shortlisted, when submitted, note for the partner, internal note. |
| `placements` | Who works for which partner on what: dates, hourly or per task, rate to expert, rate from partner, hours / tasks, earned, revenue, status. |
| `activity` | Every change: who (email **and role** at the time), when, what kind of change, which fields. **Not** the values. |
| `team_members` | The team's roles: email (lower case, unique), name, role (`admin`, `recruiter`, `pod_lead`, `finance`, `viewer`), active, partner scope (`partner_ids`, pod leads only), who added them, dates. No passwords: sign-in stays Google. |
| `saved_views` | Saved Experts views: owner email, name, collection (`experts`), config (filters, sort, columns, layout as JSON), shared or personal, dates. No personal data about experts. |
| `erasures` | People deleted on request: only a SHA-256 hash of their email and their source ids, so imports, job forms and portal sign-ups skip them. |
| `jobs` | Job openings. **Public:** slug, title, company label (default "AI data partner (via FynoLabs)"), summary, description, location, type, fields, skills, countries, minimum years, openings, closing date, posted date. **Internal:** partner, requirement, internal rate note, status/visibility history, who created it. |
| `job_form_fields` | Each job's application form: position, type, question, help text, required, choices, and which profile field it fills (`maps_to`). |
| `form_templates` | Reusable forms (the questions only, no answers). |
| `applications` | One row per person per job: status, every answer (keyed by question), where they came from (utm tags, invite, or the jobs site with its application id and status there), a keyed hash of the IP address (never the address), the team's internal note, and (jobs-site applications) the rate they asked for, **money-only** (`rate_expectation_usd`, never in the applicant list or CSV). Applying again updates the same row. |
| `job_invites` | Who the team invited to a job from its Matches tab, and whether an email went out. |
| `submit_attempts` | Rate limits for the public form: keyed hashes of IP addresses and emails with a time, kept about a day. |
| `data_requests` | "Delete my data" requests from the expert portal, for an admin to act on. |
| `auth_verification_tokens` | Email sign-in links (only when Resend is set up): Auth.js stores a hash of the one-time token and its expiry. |
| `__drizzle_migrations` | Which migrations have run. |

## Public vs internal

Public pages (job board, job pages, Google Jobs data, share links) only ever get a `PublicJob` (`src/lib/jobs-public.ts`): no partner, requirement, rate note, applicants or creator. Saving a job and opening it both check every public text (title, summary, description, company label, location, every question and choice) for pay or a pay basis (amounts, "per hour", "per task", "salary"...) and for the partner's name, and refuse with the reason. Unlisted jobs are `noindex` and left out of the board and sitemap; draft and internal jobs are a 404 for anyone but the team (who see a preview banner). Tests: `tests/jobs.test.ts`, `tests/forms.test.ts`.

## Job forms and the expert record

- Applying needs no account. Every answer is stored on the application. Questions that fill a profile field (`maps_to`) also update the central expert record: found by email (lower case), else by LinkedIn URL if that record has no email; otherwise a new expert (`primary_source = job_form`). Same LinkedIn but a different email on file: a new record tagged `possible-duplicate` (and logged) for the team to merge.
- **Merge rule:** answers only fill empty fields; lists (skills, languages) gain new items; name, availability and anything the team typed are never overwritten. The newest uploaded CV always becomes the current CV.
- **Consent:** the standard form's consent box ("I agree that FynoLabs may store my details and share my profile and CV with partners for roles I apply to. I can ask for deletion at any time.") is required; ticking it records CV consent = yes with the time. A form without it leaves consent as it was.
- People marked do not contact, or deleted on request, get a polite "we can't accept this application online" with no reason given, and nothing is stored.
- Spam and abuse: a hidden honeypot field (filled = nothing stored), at most 10 submissions per IP and 5 per email per hour, server-side checks of every answer (type, choices, file type and size).

## Expert accounts (the portal)

Anyone who signs in and isn't team is an expert. Their account is linked to the `experts` row with the same email (created on first sign-in, unless that email was deleted on request). Every portal page, action and download takes the expert id from the signed-in session, never from the request, so experts only ever see or change their own record (tests: `tests/jobs.test.ts`, `tests/portal.test.ts`). They see and edit their own profile fields, CV and consent, their applications with an expert-facing status, and can download their data (JSON) or ask for deletion. They never see internal notes, tags, status, rates, sources, partners or the team's application notes. `/admin` and every admin API answer 403 to experts.

## The copy from Engine (`npm run copy:engine`)

How to run it: [DEPLOY.md, step 3](DEPLOY.md#3-copy-everything-from-engine). Engine is only read (one read-only snapshot, SELECT statements only); everything is written to expert-hub.

### `engine_copy` (the replica)

One table per jobs-site table, named without the `xdl_jobs_` prefix, created from Engine's catalog with the same column names, types, NOT NULLs and primary key: `users`, `applications`, `screenings`, `jobs`, `saved`, `files`, `interviews`, `assessments`, `assessment_attempts`, `notifications`, `projects`, `project_members`, `timesheets`, `earnings`, `payouts`, `commissions`. New columns in Engine are added automatically. Rows are upserted on the key: changed rows are updated, rows that disappear from Engine are **kept** (and counted in the report), nothing is deleted except the rows of people deleted on request.

Left out: on `users`, the login secrets (`password_hash`, `pw_version`, `failed_logins`, `locked_until`, `otp_sent_at`, `reset_sent_at`, `phone_code_hash`, `phone_code_exp`, `phone_code_tries`, `phone_sends_day`, `phone_sends_count`, `phone_sent_at`); on `files`, the bytes (`data`): they are stored once, in `hub.expert_files`, and `engine_copy.files.hub_file_id` says which. Never read at all: `neon_auth.*`, `xdl_jobs_settings`, `xdl_jobs_admin_invites`, `xdl_jobs_bundle*`, `xdl_crm_*` and Engine's non-expert tables.

### Into `hub`

| Jobs site | Hub | Notes |
|---|---|---|
| `users` (not staff: `is_admin`) | `experts` | Found by earlier copy (source id), lower-case email, then LinkedIn URL. **Only empty fields are filled**; team edits are never overwritten. Name, email, phone, country, state (region), city, LinkedIn, headline, domain, skills, languages, years, degree, field of study, university, hours; rate expectation from the newest application (money). Status from the CRM stage (contacted → screening, vetted / shortlisted → bench, placed → placed, not a fit → inactive, do not contact → do not contact) or the furthest application, whichever is further. CRM tags → tags (plus `jobs-site`); CRM note → notes ("Jobs site note: ..."). Added date = jobs-site sign-up. CV consent stays as the import rules say (unknown until they say yes). Same LinkedIn but another email: held for review, not imported. Same email in different capitals: one expert. People deleted on request: skipped. |
| `users` | `expert_details` | experience, education, no_experience, address_line1/2, postal_code, work_authorized(_at), ref_code → referral code, referred_by → referred-by expert, last_login_at. |
| `users` | `expert_payout` | payout_method, payout_handle, tax_form_type, tax_form_at. Money-only. |
| `files` (resume / tax) | `expert_files` (cv / tax) | Bytes copied in batches (25 files or 20 MB at most), skipped when already copied, so a stopped run carries on. The newest resume becomes the current CV unless someone uploaded one in the hub. |
| `jobs` | `jobs` | Visibility **internal** (never on the public board, no public page), status kept (open / paused / closed), slug kept (`-2`, `-3`... if the hub already uses it), employment type, field, location and regions; requirements and hours appended to the description; pay only in the internal rate note (money). Each gets the old site's application form (why, hours, start, CV, both screenings) so answers show on the Applicants tab. |
| `applications` + `screenings` | `applications` | One per job and expert. Status: submitted → new, reviewing → reviewing, client interview / selected / assessment → submitted to partner, accepted → hired, rejected, withdrawn. Answers: name, email, why, hours per week, start, CV (the copied file), screening 1 and 2 (question and answer). admin_note → internal note; rate_expectation → money-only. Status and note follow the jobs site only until the team changes them in the hub. |
| `saved`, `notifications`, `interviews`, `assessments`, `assessment_attempts`, `projects`, `project_members`, `timesheets`, `earnings`, `payouts`, `commissions` | (replica only) | Kept in `engine_copy`; most are empty today. |

The report (`logs/copy-engine-*.txt`) holds counts only: no names, no emails.

## Roles: who sees what

Set in **Settings → Team & access** (admins), enforced on the server for every page, action and download (`src/lib/auth/permissions.ts`).

| | Admin | Recruiter | Pod lead | Finance | Viewer |
|---|---|---|---|---|---|
| Experts: read | yes | yes | yes | yes | yes |
| Experts: add, edit, notes, CV upload | yes | yes | no | no | no |
| Experts: delete on request | yes | no | no | no | no |
| Expert email and phone | yes | yes | yes | yes | masked (`a•••@example.com`, last 4 digits) |
| CV download | yes | yes | yes | no | no |
| Experts CSV export | yes | yes (no rate column) | no | no | no |
| Requirements: read | yes | yes | yes | yes | yes |
| Requirements: add, edit, matching, shortlist | yes | yes | no | no | no |
| Submissions | all | all | their partners only (read + status) | read | read |
| Roster export (CSV + CV ZIP) | yes | yes | no | no | no |
| Placements | all, edit | read | their partners only (hours, tasks, status) | all, create and edit | read |
| Money (rate expectation, placement rates, earned, revenue, totals) | yes | no | no | yes | no |
| Payout method and handle, tax forms (from the jobs site) | yes | no | no | yes | no |
| Address lines (from the jobs site) | yes | yes | yes | yes | no |
| Placements CSV export | yes | no | no | yes | no |
| Imports | jobs sync + CSV | CSV (with preview) | no | no | no |
| Partners: add, edit | yes | no | no | no | no |
| Team & access | yes | no | no | no | no |
| Saved views | save, share, change anyone's | save, share | save, share | save, share | save personal |
| Jobs: read, applicants, matches | yes | yes | yes | yes | yes (email and phone masked) |
| Jobs: create, edit, form builder, publish, invite | yes | yes | no | no | no |
| Applicants: status, notes | yes | yes | no | no | no |
| Applicants CSV export | yes | yes | no | no | no |
| A job's internal rate note | yes | no | no | yes | no |

### Settings

| Variable | What it does |
|---|---|
| `ADMIN_EMAILS` | Comma-separated addresses that are always admins (the first admin, and a way back in). They can't be demoted or turned off from the app. |
| `DEFAULT_ROLE` | Role for `@ALLOWED_DOMAIN` people who aren't on the team list yet. Default `viewer` (they see a "view-only access" bar). Outside addresses from `ALLOWED_EMAILS` always start as viewer. |
| `DEV_ROLE` | Local development only (auto sign-in without Google keys): the role you start as. Default `admin`. The top bar's **Preview as** menu switches it with a cookie. Ignored in production builds. |

A team member whose access is turned off can still pass Google sign-in but gets only a "your access is turned off" page. Admins can't demote or turn off themselves, and the last admin can't be removed. Every team change is in the activity log.

## Rules for personal data

1. **Never store** government ID numbers (passport, Aadhaar, PAN, SSN...), dates of birth or bank account numbers. Not in fields, not in notes, not in tags. If someone pastes one, delete it. The only payout details and addresses in the hub are the ones experts entered on the old jobs site, copied as they are (23 Nov 2026 decision: every expert record moves over): payout method and handle and tax forms are money-only (admins and finance); address lines are hidden from roles with masked contact details. Never type new ones in by hand.
2. **CVs and details go to a partner only with consent.** Record the expert's answer on their profile (CV consent: yes / no). The app blocks moving a submission to *Submitted* (or later) without consent = yes, and the roster CSV and CV ZIP include only people with consent = yes.
3. **Rates are internal.** Rate expectations, rate notes and placement money never appear in partner exports, public job posts or messages to other experts.
4. **Partner names stay internal.** Don't put them in public material.
5. **Need to know.** Only the core team can open the admin (`@xocket.sh`, `ADMIN_EMAILS`, `ALLOWED_EMAILS` and Team & access); experts who sign in only get their own portal. Each team member's role limits what they see (table above): viewers get masked contact details, only admins and finance see money, pod leads only their partners' submissions and placements. Exports (Experts → Export CSV) contain contact details: keep them in the team's drive, delete copies you no longer need, never forward them.
6. **The activity log** records who changed what and when, without the values, so it can be kept.

## Delete on request

When someone asks us to remove their data (by email, or with **Delete my data** in the portal, which records a request: the dashboard and their profile then show a notice):

1. An admin opens their profile → **Edit** → *Delete on request* → types `DELETE` → **Delete permanently**.
   This removes their profile, sources, uploaded CVs and tax forms, details, payout details, job applications and answers, invites, submissions and their activity history, and their rows in `engine_copy` (the copy of the jobs site) and `legacy_map`. Placement money rows stay (for accounting) without the person. Only a one-way hash of their email (and their jobs-site / register ids) is kept, so future imports and copies skip them.
2. Remove them from the other places too: the jobs site (jobs.fynolabs.si admin), the admin CRM (fynolabs.si/admin), the Talent register spreadsheet, the ops sheet, local CV folders and any exported CSVs.
3. Reply to the person confirming it's done (within 30 days of the request).

If they later come back and want to work with us, add them again by hand (the hash only stops automatic imports).

## Backups

Neon keeps point-in-time history for the expert-hub project (see the project's settings for how far back). Before risky changes, make a Neon branch.
