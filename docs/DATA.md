# Data: what's stored, what's read, and the rules

## Where it lives

Production uses Expert Hub's **own Neon project** ("expert-hub", `DATABASE_URL`; its main branch is the one real environment). The app's tables are in the Postgres schema **`hub`**; migrations only create or change objects there (a check in `npm run db:migrate` and in the tests refuses anything else).

The same database also holds **`engine_copy`**: an exact replica of the old jobs site's expert tables, written only by `npm run copy:engine` (see below). The app never shows it; it is there so nothing from the jobs site is lost, and so the copy can be re-run.

And **`fynolabs_copy`**: a copy of every table of the FynoLabs admin (fynolabs.si/admin, Lovable / Supabase), plus its team's auth users (id, email, name, dates only) and the stored CVs and documents (`storage_objects`, the bytes stored once). Written only by the `hub-sync` edge function during `npm run sync:fynolabs` (see [below](#the-copy-of-the-fynolabs-admin-npm-run-syncfynolabs)); the app reads it only to serve FynoLabs files.

The old jobs site's own tables (`public.xdl_jobs_*`) stay in the shared **Engine** project, which jobs.fynolabs.si keeps writing to until it moves over. The hub only ever **reads** them: `npm run copy:engine` (every expert record) and the older `npm run import:jobs` (people and CVs).

## Tables in `hub` (written by this app)

| Table | What's in it |
|---|---|
| `experts` | One row per person: name, email (lower case, unique), phone, country, state/region, city, LinkedIn URL, headline, domain, skills, languages, years of experience, highest degree, field of study, university, hours per week, availability, rate expectation (internal), status, CV consent (+ when recorded), pointer to the current CV, internal notes, tags, where they first came from, dates. From the FynoLabs admin: location, timezone, seniority, links, owner (a team member), outreach status, next action (+ due, automatic or not), last activity, how they reached FynoLabs (`source_channel`: talent call, job, referral, sourced, import, agency, partner) and the detail, the company that sent them, the import batch, where consent came from, the do-not-contact reason and date, bulk-email opt-out (+ date), extra attributes (JSON). Plus a search index built from name, skills, headline, domain, field of study and university. |
| `expert_sources` | Where each person came from (jobs site user id, register key, CRM id). Stops duplicates on re-import. |
| `expert_files` | CVs (`kind = cv`), other files from job forms (`kind = attachment`), tax forms from the jobs site (`kind = tax`, **money-only**: listed and downloadable only for admins and finance, never in a roster or CV ZIP) and agreements / NDAs (`kind = document`). Uploaded here, through a job form or the portal, or copied from the jobs site: the file itself (`data`, up to 4 MB; `external_ref = jobs:<id>` for copies). Jobs-site CVs read from the same database: only a pointer (the bytes stay on the jobs site). From the FynoLabs admin (`storage = fynolabs`): only a pointer, `external_ref = fynolabs:<bucket>/<path>`; the bytes are in `fynolabs_copy.storage_objects`, stored once. |
| `expert_details` | Copied from the jobs site: experience and education (as lists), "no experience yet", address lines and postal code (contact details: masked roles never get them), work authorisation, referral code, who referred them, last sign-in on the jobs site. `updated_by = 'jobs-site import'` while only the copy has written the row: the copy then keeps it in step with the jobs site. From the portal's Profile (26 Nov 2026): projects, certifications, where they work from, how soon they could start, working hours by day, fields of interest, private minimum pay (full-time per year, part-time per hour, US$), looking for work, communication choices, the weekly check-in date and the profile picture. Once the expert edits it (`updated_by = 'expert-portal'`) the copies from Engine leave the row alone. |
| `document_templates` | Agreements experts sign in the portal: title, kind, a text body with `{{placeholders}}` or a PDF (up to 4 MB), "for every expert", active, order. Loaded with `Load default documents.bat` (NDA and profile sharing consent, read from Company/Legal at run time) or made on `/admin/documents`. |
| `courses`, `course_lessons`, `lesson_progress` | Learn: courses, booklets and quiz sets (published or not), their lessons (video, PDF, reading, quiz with answers, link) and each expert's finished lessons with the best quiz score. |
| `payouts` | **Money-only.** What we pay each expert: project (placement), label, amount, currency, status (upcoming, processing, paid, failed, cancelled), period, expected and paid dates, method, reference. Experts see only their own on `/me/payments`; the team records them on `/admin/payouts`. Kept after an expert is deleted on request (expert id cleared). |
| `expert_payout` | **Money-only** (admins and finance): payout method and handle, tax form type and date, as the expert entered them on the jobs site; the FynoLabs admin's default commission for the expert. A separate table, so no list, search or export of experts can include it. |
| `legacy_map` | What each copied row became: jobs-site rows (users → experts, files → expert_files, jobs → jobs, applications → applications) and FynoLabs rows (`source_table` `fynolabs.<table>`, e.g. `fynolabs.talent_profiles` → experts), with the values the copy last wrote to fields the team can change. Makes re-runs idempotent. |
| `partners` | **Companies**, one record per organisation: the partners that send requirements and every account of the FynoLabs CRM. Name, kind (AI data partner, frontier lab, expert platform, agency, staffing firm, talent source, trainer gig, client, other), website, notes, business line (AI training, product, both), stage (researching, researched, drafted, contacted, talking, pilot, active, on hold, dropped) and when it changed, priority, owner (a team member, or a name such as "Common (team)"), next step and due date, best route, domain, location, platform, tags, last activity, who created and last updated it. Kept under its first name so requirements, jobs, placements and pod-lead scopes keep pointing at it. |
| `company_activities` | What happened with a company: note, email, call, meeting, LinkedIn, stage change, task; summary, detail, when, who; the contact it was with. |
| `contacts` | People at companies (FynoLabs leads): name, company, role, kind (client, partner, talent), stage (new, contacted, replied, call, proposal, won, lost), source, links, email, next follow-up, notes. |
| `calendar_events` | Calls, meetings, follow-ups, deadlines, tasks and posts: date, start and end time (**India time**, `timezone = Asia/Kolkata`), status (planned, waiting, done, cancelled), company, contact(s), team members, meeting link, notes. |
| `platforms` | Expert platforms and other organisations with a referral link (FynoLabs "Platforms"): name, kind, domain, logo, website, referral link, jobs page, status, notes, reference links. |
| `projects`, `project_tracks`, `project_members`, `project_documents` | Projects (P### codes): kind, status, company, platform, referral link, owner, target, dates, countries, rules (JSON), Discord, description; their tracks with targets, the team on each project with a role (lead, recruiter, screener, viewer) and capacity, and the documents each expert needs by a pipeline stage. |
| `project_fee_rules` | **Money-only**: what a partner pays per person reaching a stage (amount, currency, stage, payment terms). |
| `partner_reports` | A partner's report for a period (sign-ups, qualified, active) matched against our referrals; unmatched rows as JSON. |
| `expert_activities` | Each expert's **timeline**: notes, emails, stage changes, applications, documents, referrals, outreach, consent, system events; summary, detail, when, who, and the pipeline it belongs to. Job forms, the portal, status changes and the FynoLabs sync write it. |
| `expert_documents` | NDAs, agreements and compliance documents: status (draft, sent, signed, withdrawn), sent to and when, signed when, expiry, the project document it fulfils; the file and the signed file are `expert_files`. |
| `engagements` | Where an expert works through a platform or agency: platform, agency, project, status, dates, notes; the commission percent is **money**. |
| `monthly_earnings` | **Money-only**: gross earned per month on an engagement, our commission (INR). |
| `referrals` | Sent referrals and submissions to partners (FynoLabs talent_referrals): expert, platform, company, project, pipeline, method (email, link, agency form, profile share, intro, other), outcome (sent ... active, rejected, already a member, churned), recipient, note, opens and clicks, who sent it. The tracking token of emails already sent is kept but never shown. |
| `referral_fees` | **Money-only**: fees partners owe us (expected, invoiced, paid, void), invoice number, dates, amounts. |
| `referral_groups`, `referral_group_members` | Lists of people a referral email goes to in one go (email, name, the expert with that email). |
| `tracked_links`, `tracked_link_clicks` | Short links for posts and partners (code, target, channel, project, job, platform, company) and clicks per day. |
| `radar_listings` | Job radar: roles found on other platforms (platform, title, company, location, link, posted date, status, matched keywords); pay is **money**. |
| `email_templates`, `email_campaigns`, `email_campaign_recipients` | Email templates, bulk emails to experts (approved before sending, with a follow-up) and who each went to (status, reason, when). Recipient link tokens are kept, never shown. |
| `email_send_log`, `suppressed_emails`, `unsubscribe_tokens` | Every email sent and its status; addresses we must not email (unsubscribed, bounced, complained); unsubscribe links already sent (tokens kept, never shown). |
| `messages`, `message_replies`, `reply_drafts` | Messages from the website's contact form (handled when, by whom); replies the team sent (to a message, an application or an expert) and saved drafts. |
| `import_batches` | Bulk imports run in the FynoLabs admin: kind, label, options, counts, errors. |
| `settings` | Settings as key and JSON value: the FynoLabs admin's settings (same keys), `job_radar` (keywords, minimum pay) and `email_send_state`. |
| `visitor_pageviews`, `visitor_source_daily`, `visitor_source_sessions` | Visitor analytics of fynolabs.si: page views (session, source, referrer host, landing and page path, time), visitors and page views per source per day, sessions per source per day. No IP addresses or names. |
| `requirements` | What a partner asked for: skills, domains, degree, countries allowed / blocked (US states as `US-CA`), minimum years, slots, deadline, internal rate note, status. |
| `submissions` | One row per person per requirement: status, match score when shortlisted, when submitted, note for the partner, internal note. |
| `placements` | Who works for which partner on what: dates, hourly or per task, rate to expert, rate from partner, hours / tasks, earned, revenue, status. |
| `activity` | Every change: who (email **and role** at the time), when, what kind of change, which fields. **Not** the values. |
| `team_members` | The team's roles: email (lower case, unique), name, role (`admin`, `recruiter`, `pod_lead`, `finance`, `viewer`), active, partner scope (`partner_ids`, pod leads only), the FynoLabs admin's module access (`sections`), who invited and added them, dates. Their login is in `accounts`. |
| `accounts` | One row per login (team member or expert), whatever the method (email + password, Google, LinkedIn): email (lower case, unique), name, account type (`team` / `expert`), **the password's scrypt hash only** (a random 16-byte salt per password, versioned; never the password), when it was set, must change password (temporary passwords), when the email was verified, failed attempts and locked until (15 minutes after 5 wrong passwords), turned off at, last sign-in, `token_version` (goes up when the password changes, is reset or the account is turned off: every other session ends), the link to `team_members` (team) or to `experts` (experts, only once the email is verified), when the sign-up consent box was ticked (until it is copied to the expert record), who created it, dates. |
| `account_tokens` | One-time email verification codes and password reset links: the account, the kind, a SHA-256 of the link's token, a keyed hash of the 6-digit code (never the code or the link), tries, expiry (30 minutes), when it was used (single use). |
| `saved_views` | Saved Experts views: owner email, name, collection (`experts`; `fynolabs_experts` / `fynolabs_submissions` for views copied from the FynoLabs admin, kept apart from the hub's tabs with their FynoLabs filters until those screens exist here), config (filters, sort, columns, layout as JSON), shared or personal, dates. No personal data about experts. |
| `erasures` | People deleted on request: only a SHA-256 hash of their email and their source ids, so imports, job forms and portal sign-ups skip them. Erasures done in the FynoLabs admin come with an MD5 of the email only (`email_md5`, with the reason): checked everywhere too. |
| `jobs` | Job openings. **Public:** slug, title, company label (default "AI data partner (via FynoLabs)"), summary, description, location, type, fields, skills, countries, minimum years, openings, closing date, posted date. **Internal:** partner, requirement, internal rate note and pay unit (**money**), status/visibility history, who created it; from the FynoLabs admin's posted jobs: the company the post named (`company_name`, never on the public page), project and track, the job-radar listing it came from, external apply link, "GitHub required", badge, and the visibility it had on fynolabs.si (`source_visibility`). |
| `job_form_fields` | Each job's application form: position, type, question, help text, required, choices, and which profile field it fills (`maps_to`). |
| `form_templates` | Reusable forms (the questions only, no answers). |
| `applications` | One row per person per job: the **pipeline**. Its stage, with the FynoLabs admin's stages: Applied (`new`), Shortlisted, Proposed to client (`referred`), Selected, Documents sent, Signed, Active, Ended, Rejected; when it changed; status (the hub's applicant wording; a database trigger keeps status and stage in step whichever one changes); every answer (keyed by question); where they came from (utm tags, invite, the jobs site or the FynoLabs admin with its id) and how (`channel`: applied, sourced, import, referral, agency, partner, manual); owner, track, screening (JSON), eligible, next action (+ due), reject reason, consent version and time, handled (talent-call applications), who created it; a keyed hash of the IP address (never the address); the team's internal note; and (jobs-site applications) the rate they asked for, **money-only** (`rate_expectation_usd`, never in the applicant list or CSV). Applying again updates the same row. Public applications and portal sign-ups start at Applied and write the timeline. |
| `job_invites` | Who the team invited to a job from its Matches tab (or the FynoLabs admin's invites), whether an email went out, when it expires, was opened and accepted, and the application it led to. |
| `submit_attempts` | Rate limits for the public form, sign-in, sign-up, codes and password resets: keyed hashes of IP addresses and emails with a time, kept about a day. |
| `data_requests` | "Delete my data" requests from the expert portal, for an admin to act on. |
| `__drizzle_migrations` | Which migrations have run. |

## Public vs internal

Public pages (job board, job pages, Google Jobs data, share links) only ever get a `PublicJob` (`src/lib/jobs-public.ts`): no partner, requirement, rate note, applicants or creator. Saving a job and opening it both check every public text (title, summary, description, company label, location, every question and choice) for pay or a pay basis (amounts, "per hour", "per task", "salary"...) and for the partner's name, and refuse with the reason. Unlisted jobs are `noindex` and left out of the board and sitemap; draft and internal jobs are a 404 for anyone but the team (who see a preview banner). Tests: `tests/jobs.test.ts`, `tests/forms.test.ts`.

## Job forms and the expert record

- Applying needs no account. Every answer is stored on the application. Questions that fill a profile field (`maps_to`) also update the central expert record: found by email (lower case), else by LinkedIn URL if that record has no email; otherwise a new expert (`primary_source = job_form`). Same LinkedIn but a different email on file: a new record tagged `possible-duplicate` (and logged) for the team to merge.
- **Merge rule:** answers only fill empty fields; lists (skills, languages) gain new items; name, availability and anything the team typed are never overwritten. The newest uploaded CV always becomes the current CV.
- **Consent:** the standard form's consent box ("I agree that FynoLabs may store my details and share my profile and CV with partners for roles I apply to. I can ask for deletion at any time.") is required; ticking it records CV consent = yes with the time. A form without it leaves consent as it was.
- People marked do not contact, or deleted on request, get a polite "we can't accept this application online" with no reason given, and nothing is stored.
- Spam and abuse: a hidden honeypot field (filled = nothing stored), at most 10 submissions per IP and 5 per email per hour, server-side checks of every answer (type, choices, file type and size).

## Sign-in and accounts

- **What's stored:** for each login, the email, name and the password's **scrypt hash** (`hub.accounts`), plus one-time codes and reset links as hashes only (`hub.account_tokens`). Plain passwords, codes and links are never stored, logged or shown again: a temporary password made on Team & access or by `npm run admin:create` is shown once, to the admin, and only its hash is kept.
- **Team logins** are created only by an admin (Team & access) or with `npm run admin:create`; the person must change the temporary password at their first sign-in. Turning access off turns the login off and ends their sessions.
- **Expert logins** come from sign-up (`/join`, or Google / LinkedIn). An unconfirmed sign-up stores the email, name and password hash, and nothing else is linked until the emailed code proves the address; an unconfirmed sign-up for the same email is replaced by the next one. Signing up with a team email is refused; people deleted on request can't sign up again by themselves.
- Every session is re-checked against `accounts` on every request (turned off, or a different `token_version`: signed out).

## Expert accounts (the portal)

Anyone who signs in and isn't team is an expert. Their account is linked to the `experts` row with the same email **only after the email is verified** (people copied from the jobs site keep every field the hub has; otherwise a new record is created, unless that email was deleted on request). Every portal page, action and download takes the expert id from the signed-in account, never from the request, so experts only ever see or change their own record (tests: `tests/jobs.test.ts`, `tests/portal.test.ts`, `tests/session.test.ts`). They see and edit their own profile fields, CV and consent, their applications with an expert-facing status, and can download their data (JSON) or ask for deletion. Since 26 Nov 2026 the portal also shows their projects (placements: their own rate and status, never the partner's name or rate), their payouts, the documents they must sign (and the signed copies) and their Learn progress (tests: `tests/portal-profile.test.ts`, `tests/portal-documents.test.ts`, `tests/payouts.test.ts`, `tests/learn.test.ts`). They never see internal notes, tags, status, rates, sources, partners or the team's application notes. `/admin` and every admin API answer 403 to experts.

## The copy from Engine (`npm run copy:engine`)

How to run it: [DEPLOY.md, step 3](DEPLOY.md#3-copy-everything-from-engine). Engine is only read (one read-only snapshot, SELECT statements only); everything is written to expert-hub.

### `engine_copy` (the replica)

One table per jobs-site table, named without the `xdl_jobs_` prefix, created from Engine's catalog with the same column names, types, NOT NULLs and primary key: `users`, `applications`, `screenings`, `jobs`, `saved`, `files`, `interviews`, `assessments`, `assessment_attempts`, `notifications`, `projects`, `project_members`, `timesheets`, `earnings`, `payouts`, `commissions`. New columns in Engine are added automatically. Rows are upserted on the key: changed rows are updated, rows that disappear from Engine are **kept** (and counted in the report), nothing is deleted except the rows of people deleted on request.

Left out: on `users`, the login secrets (`password_hash`, `pw_version`, `failed_logins`, `locked_until`, `otp_sent_at`, `reset_sent_at`, `phone_code_hash`, `phone_code_exp`, `phone_code_tries`, `phone_sends_day`, `phone_sends_count`, `phone_sent_at`: experts sign up again on the hub with the same email and land on their copied profile); on `files`, the bytes (`data`): they are stored once, in `hub.expert_files`, and `engine_copy.files.hub_file_id` says which. Never read at all: `neon_auth.*`, `xdl_jobs_settings`, `xdl_jobs_admin_invites`, `xdl_jobs_bundle*`, `xdl_crm_*` and Engine's non-expert tables.

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

## The copy of the FynoLabs admin (`npm run sync:fynolabs`)

How to run it: [DEPLOY.md, step 3b](DEPLOY.md#3b-copy-the-fynolabs-admin). FynoLabs is only read (by the `hub-sync` edge function, SELECT statements only); the hub is written.

### `fynolabs_copy` (the copy)

One table per FynoLabs table (every table in `public`, found at run time, so tables FynoLabs adds later come along), created from FynoLabs' catalog: the same column names and types (enums and domains become `text`, enum arrays `text[]`, types from extensions `text`; uuid, jsonb, timestamptz, numeric and arrays stay as they are), NOT NULLs and primary key (a unique key, or a hash of the row, when a table has none). New columns are added on the next run. Rows are upserted on the key in batches (at most 500 rows or about 2 MB per request); rows that disappear from FynoLabs are **kept** and counted. Plus:

- `auth_users`: id, email, name, created and last sign-in dates of the FynoLabs logins. Never passwords, tokens, phone numbers or codes.
- `storage_objects`: every file of the buckets `job-resumes`, `talent-resumes` and `expert-documents` (bucket, path, type, size, bytes, dates). Skipped when already copied unchanged.
- `_sync_log`: one row per call of the edge function (run, table, rows, start, end, error code). No values.

People deleted on request in the hub are left out of every copy table (their profile, every row with their profile id, email or recipient email, and their files) and removed from it if an earlier run had them.

### Into `hub`

| FynoLabs table | Hub table | How |
|---|---|---|
| `team_members` (+ `user_roles`, `auth_users`) | `team_members` | By email. People already on the hub's team keep their role and access; their FynoLabs sections are filled in. New people are added with **access turned off** (admin if they are a FynoLabs admin, else viewer): an admin turns them on in Team & access. FynoLabs user ids become emails in every "created by" and "owner". |
| `org_logos` | `platforms` | Same ids. |
| `accounts` | `partners` (companies) | One company per organisation: an account joins the hub partner with the same name (any capitals), else a new company. Kinds: partner → AI data partner, marketplace → expert platform, the rest as they are. Owner → the team member; "Common (team)" and other names stay in `owner_name`. |
| `account_activities`, `leads`, `calendar_events` | `company_activities`, `contacts`, `calendar_events` | Same ids, links translated (company, contact, team members). Calendar times stay India time. |
| `talent_profiles` | `experts` (+ `expert_details` referred by, `expert_payout` default commission, `expert_sources` 'admin_crm', `expert_files` CV) | **One expert per person**, see the merge rules below. |
| `job_applications`, `talent_applications` | `applications` (pipelines) | One pipeline per person per job, at FynoLabs' stage. Talent-call applications go on one internal job, "Talent call (FynoLabs)" (closed, never public). Applicants without a FynoLabs profile are found by email, then LinkedIn, or added. Their CV becomes a file of the expert. |
| `posted_jobs` | `jobs` | Always **internal** in the hub (never on the public board until the team opens it on Share); FynoLabs' visibility kept in `source_visibility`; pay in the internal rate note (money); a form with FynoLabs' questions so answers show on the Applicants tab. |
| `expert_activities`, `expert_documents`, `expert_invites` | `expert_activities`, `expert_documents`, `job_invites` | Same ids. Document files become `expert_files` (storage `fynolabs`). |
| `projects`, `project_tracks`, `project_members`, `project_documents`, `project_fee_rules`, `partner_reports` | the same names | Same ids; project members by team member. Fee rules are money. |
| `talent_engagements`, `talent_monthly_earnings`, `talent_referrals`, `referral_fees`, `referral_groups`, `referral_group_members` | `engagements`, `monthly_earnings`, `referrals`, `referral_fees`, `referral_groups`, `referral_group_members` | Same ids; group members linked to the expert with that email. Earnings, fees and commissions are money. |
| `tracked_links`, `tracked_link_clicks`, `job_listings` | `tracked_links`, `tracked_link_clicks`, `radar_listings` | Same ids. Radar pay is money. |
| `email_templates`, `email_campaigns`, `email_campaign_recipients`, `email_send_log`, `suppressed_emails`, `email_unsubscribe_tokens` | `email_templates`, `email_campaigns`, `email_campaign_recipients`, `email_send_log`, `suppressed_emails`, `unsubscribe_tokens` | Same ids. Tokens are copied as they are (links already in people's inboxes keep working later) and never shown in the app. |
| `contact_submissions`, `admin_replies`, `reply_drafts` | `messages`, `message_replies`, `reply_drafts` | Replies point at the hub's message, application or expert. |
| `saved_views` | `saved_views` | As `fynolabs_experts` / `fynolabs_submissions`, with FynoLabs' filters (not shown as hub tabs). |
| `admin_settings`, `job_scan_settings`, `email_send_state` | `settings` | Same keys; `job_radar`; `email_send_state`. |
| `audit_log` | `activity` | Who, when, what kind and **which fields**: never the values (the hub's rule for the activity log). Expert, pipeline, company and job entries show on those records. |
| `privacy_log` | `erasures` | The MD5 of the erased email: those people are never imported, and can't apply or sign up again by themselves. |
| `visitor_pageviews`, `visitor_source_daily`, `visitor_source_sessions` | the same names | As they are. |

`hub.legacy_map` remembers what every FynoLabs row became (`source_table` = `fynolabs.<table>`). Records keep their FynoLabs id wherever the hub table is new; experts, companies, team members, jobs and pipelines get hub ids (they merge with records the hub already had).

### Merge rules

- **One person = one expert** across FynoLabs, Engine and the hub's own forms: an earlier sync, the FynoLabs id (`expert_sources` 'admin_crm', the same key as the CRM-export import), the email in lower case, then the LinkedIn URL. Same LinkedIn but two different emails: a separate record tagged `possible-duplicate`, for the team to merge.
- **FynoLabs is the curated record**, so for each field: FynoLabs has no value → the hub's stays (the sync never blanks a field); the hub field is empty → filled; the hub has the value the Engine copy brought → FynoLabs' value wins (Engine's note is kept after FynoLabs' one); anything else (a team edit, an expert's own answer) → kept.
- **Edits made in the hub are never overwritten.** The sync remembers what it last wrote to each field (`legacy_map.written`) and updates a field only while the hub still holds that value. For the new tables (contacts, calendar, projects, referrals...) it updates a row only while `updated_by` is still `fynolabs sync`; the hub's screens set `updated_by` to the person, and the sync leaves that row alone from then on ("kept" in the report). Lists (skills, languages, tags) gain FynoLabs' new items.
- **Status:** prospect and new → applicant, bench → bench, active → placed, inactive → inactive; **do not contact always wins**. Consent recorded in FynoLabs → CV consent yes (with its time), unless the hub already recorded an answer.
- **Pipelines:** the stage follows FynoLabs until someone moves it in the hub; the status follows the stage.
- **Deleted on request** (in the hub or in FynoLabs) → never imported, from either source.
- Nothing is deleted from the hub because it disappeared from FynoLabs. A record deleted in the hub after a sync isn't brought back ("deleted in the hub" in the report).

### What's money-only

`expert_payout` (with the default commission), `project_fee_rules`, `referral_fees` and `monthly_earnings` in full; `engagements.commission_percent`; `radar_listings` pay; `jobs.internal_rate_note` and `jobs.pay_unit`; plus the hub's own money columns. The list lives in `src/lib/auth/permissions.ts` (`MONEY_COLUMNS`, `withoutMoney`): only admins and finance get them, on the server. Rates never appear on public pages.

## Roles: who sees what

Set in **Settings → Team & access** (admins), enforced on the server for every page, action and download (`src/lib/auth/permissions.ts`). On top of the role, a team member's `sections` (copied from the FynoLabs admin) limit which modules they open when the list is filled in (`src/lib/auth/sections.ts`; empty = the role decides; admins open everything).

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
| Money (rate expectation, placement rates, earned, revenue, totals; FynoLabs fees, fee rules, commissions, monthly earnings, radar pay, a job's pay unit) | yes | no | no | yes | no |
| Payout method and handle, tax forms (from the jobs site) | yes | no | no | yes | no |
| Address lines (from the jobs site) | yes | yes | yes | yes | no |
| Placements CSV export | yes | no | no | yes | no |
| Imports | jobs sync + CSV | CSV (with preview) | no | no | no |
| Partners: add, edit (the old Partners form) | yes | no | no | no | no |
| Accounts, leads, calendar: add, edit, stages, log activity | yes | yes | no | no | no |
| Platforms, projects (tracks, team, documents): add, edit | yes | yes | no | no | no |
| Project fee rules (money) | yes, edit | no | no | yes, edit | no |
| Messages: handled, reply drafts, replies | yes | yes | no | no | no (sender email masked) |
| Leads' email addresses | yes | yes | yes | yes | masked |
| Delete accounts, leads, events, platforms, projects, messages | yes | no | no | no | no |
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
| `ADMIN_EMAILS` | Comma-separated addresses that are always admins (`prashant@xocket.sh`: a way back in). They can't be demoted or turned off from the app. Their login comes from `npm run admin:create`. |
| `DEFAULT_ROLE` | Role for `@ALLOWED_DOMAIN` people who sign in with Google but aren't on the team list yet. Default `viewer` (they see a "view-only access" bar). Outside addresses from `ALLOWED_EMAILS` always start as viewer. |

A team member whose access is turned off is signed out at once and can't sign in (with a password or Google) until it's turned back on. Admins can't demote, turn off or reset the password of themselves on Team & access (they use Change password), and the last admin can't be removed. Every team change is in the activity log, without any password.

## Rules for personal data

1. **Never store** government ID numbers (passport, Aadhaar, PAN, SSN...), dates of birth or bank account numbers. Not in fields, not in notes, not in tags. If someone pastes one, delete it. The only payout details and addresses in the hub are the ones experts entered on the old jobs site, copied as they are (23 Nov 2026 decision: every expert record moves over): payout method and handle and tax forms are money-only (admins and finance); address lines are hidden from roles with masked contact details. Never type new ones in by hand.
2. **CVs and details go to a partner only with consent.** Record the expert's answer on their profile (CV consent: yes / no). The app blocks moving a submission to *Submitted* (or later) without consent = yes, and the roster CSV and CV ZIP include only people with consent = yes.
3. **Rates are internal.** Rate expectations, rate notes and placement money never appear in partner exports, public job posts or messages to other experts.
4. **Partner names stay internal.** Don't put them in public material.
5. **Need to know.** Only team logins (created by an admin) can open the admin; experts who sign in only get their own portal, and only after confirming their email. Each team member's role limits what they see (table above): viewers get masked contact details, only admins and finance see money, pod leads only their partners' submissions and placements. Exports (Experts → Export CSV) contain contact details: keep them in the team's drive, delete copies you no longer need, never forward them.
6. **The activity log** records who changed what and when, without the values, so it can be kept.

## Delete on request

When someone asks us to remove their data (by email, or with **Delete my data** in the portal, which records a request: the dashboard and their profile then show a notice):

1. An admin opens their profile → **Edit** → *Delete on request* → types `DELETE` → **Delete permanently**.
   This removes their profile, their expert login (`accounts`), sources, uploaded CVs and tax forms, details, payout details, job applications and answers, invites, submissions, timeline, documents, engagements, earnings, referrals, campaign recipients and their activity history, the rows that only hold their email (referral group members, messages, replies, the email log), their rows in `engine_copy` (the copy of the jobs site) and `fynolabs_copy` (the copy of the FynoLabs admin, files included) and `legacy_map`. Placement and referral-fee money rows stay (for accounting) without the person. Only a one-way hash of their email (and their jobs-site / register ids) is kept, so future imports and copies skip them.
2. Remove them from the other places too: the jobs site (jobs.fynolabs.si admin), the admin CRM (fynolabs.si/admin), the Talent register spreadsheet, the ops sheet, local CV folders and any exported CSVs.
3. Reply to the person confirming it's done (within 30 days of the request).

If they later come back and want to work with us, add them again by hand (the hash only stops automatic imports).

## Backups

Neon keeps point-in-time history for the expert-hub project (see the project's settings for how far back). Before risky changes, make a Neon branch.
