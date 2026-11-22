# Data: what's stored, what's read, and the rules

## Where it lives

Production uses the shared Neon database **Engine**. Expert Hub's own tables are all in the Postgres schema **`hub`**. It reads (never writes) a few of the jobs site's tables in the `public` schema. Migrations only create or change objects in `hub`; a check in `npm run db:migrate` and in the tests refuses anything else.

## Tables in `hub` (written by this app)

| Table | What's in it |
|---|---|
| `experts` | One row per person: name, email (lower case, unique), phone, country, state/region, city, LinkedIn URL, headline, domain, skills, languages, years of experience, highest degree, field of study, university, hours per week, availability, rate expectation (internal), status, CV consent (+ when recorded), pointer to the current CV, internal notes, tags, where they first came from, dates. Plus a search index built from name, skills, headline, domain, field of study and university. |
| `expert_sources` | Where each person came from (jobs site user id, register key, CRM id). Stops duplicates on re-import. |
| `expert_files` | CVs. For jobs-site CVs only a pointer (the bytes stay on the jobs site). For CVs uploaded here, the file itself (`data`, up to 10 MB). |
| `partners` | Companies that send requirements. |
| `requirements` | What a partner asked for: skills, domains, degree, countries allowed / blocked (US states as `US-CA`), minimum years, slots, deadline, internal rate note, status. |
| `submissions` | One row per person per requirement: status, match score when shortlisted, when submitted, note for the partner, internal note. |
| `placements` | Who works for which partner on what: dates, hourly or per task, rate to expert, rate from partner, hours / tasks, earned, revenue, status. |
| `activity` | Every change: who (email **and role** at the time), when, what kind of change, which fields. **Not** the values. |
| `team_members` | The team's roles: email (lower case, unique), name, role (`admin`, `recruiter`, `pod_lead`, `finance`, `viewer`), active, partner scope (`partner_ids`, pod leads only), who added them, dates. No passwords: sign-in stays Google. |
| `saved_views` | Saved Experts views: owner email, name, collection (`experts`), config (filters, sort, columns, layout as JSON), shared or personal, dates. No personal data about experts. |
| `erasures` | People deleted on request: only a SHA-256 hash of their email and their source ids, so imports skip them. |
| `__drizzle_migrations` | Which migrations have run. |

## Read from the jobs site (`public`, read only)

| Table | Columns read | Why |
|---|---|---|
| `xdl_jobs_users` | id, email, name, country, city, state, linkedin_url, headline, domain, years_experience, highest_degree, field_of_study, university, hours_per_week, phone, skills, languages, is_admin (to skip staff) | Create / fill in experts. |
| `xdl_jobs_files` | id, user_id, kind, filename, mime, size, created_at; `data` only when someone downloads that CV or exports a CV ZIP | Link and stream CVs. |
| `xdl_jobs_applications` | user_id, job_id, status, rate_expectation, created_at | Starting status, rate expectation, applications shown on the profile. |
| `xdl_jobs_jobs` | id, title | Job titles on the profile. |
| `xdl_jobs_screenings` | not read in v1 | (Allowed later.) |

Never read: passwords, login data, phone verification codes, address lines, postal codes, payout methods and handles, tax forms, identity checks, earnings, commissions, payouts, referral codes, interview transcripts. Never written: anything in `public`.

The recommended database user for production (see DEPLOY.md) has only `SELECT` on those five tables, so the database itself blocks writes.

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
| Placements CSV export | yes | no | no | yes | no |
| Imports | jobs sync + CSV | CSV (with preview) | no | no | no |
| Partners: add, edit | yes | no | no | no | no |
| Team & access | yes | no | no | no | no |
| Saved views | save, share, change anyone's | save, share | save, share | save, share | save personal |

### Settings

| Variable | What it does |
|---|---|
| `ADMIN_EMAILS` | Comma-separated addresses that are always admins (the first admin, and a way back in). They can't be demoted or turned off from the app. |
| `DEFAULT_ROLE` | Role for `@ALLOWED_DOMAIN` people who aren't on the team list yet. Default `viewer` (they see a "view-only access" bar). Outside addresses from `ALLOWED_EMAILS` always start as viewer. |
| `DEV_ROLE` | Local development only (auto sign-in without Google keys): the role you start as. Default `admin`. The top bar's **Preview as** menu switches it with a cookie. Ignored in production builds. |

A team member whose access is turned off can still pass Google sign-in but gets only a "your access is turned off" page. Admins can't demote or turn off themselves, and the last admin can't be removed. Every team change is in the activity log.

## Rules for personal data

1. **Never store** government ID numbers (passport, Aadhaar, PAN, SSN...), dates of birth, bank or payout details, or home addresses. Not in fields, not in notes, not in tags. If someone pastes one, delete it.
2. **CVs and details go to a partner only with consent.** Record the expert's answer on their profile (CV consent: yes / no). The app blocks moving a submission to *Submitted* (or later) without consent = yes, and the roster CSV and CV ZIP include only people with consent = yes.
3. **Rates are internal.** Rate expectations, rate notes and placement money never appear in partner exports, public job posts or messages to other experts.
4. **Partner names stay internal.** Don't put them in public material.
5. **Need to know.** Only the core team can sign in (`@xocket.sh` + `ALLOWED_EMAILS`), and each person's role limits what they see (table above): viewers get masked contact details, only admins and finance see money, pod leads only their partners' submissions and placements. Exports (Experts → Export CSV) contain contact details: keep them in the team's drive, delete copies you no longer need, never forward them.
6. **The activity log** records who changed what and when, without the values, so it can be kept.

## Delete on request

When someone asks us to remove their data:

1. An admin opens their profile → **Edit** → *Delete on request* → types `DELETE` → **Delete permanently**.
   This removes their profile, sources, uploaded CVs, submissions and their activity history. Placement money rows stay (for accounting) without the person. Only a one-way hash of their email (and their jobs-site / register ids) is kept, so future imports skip them.
2. Remove them from the other places too: the jobs site (jobs.fynolabs.si admin), the admin CRM (fynolabs.si/admin), the Talent register spreadsheet, the ops sheet, local CV folders and any exported CSVs.
3. Reply to the person confirming it's done (within 30 days of the request).

If they later come back and want to work with us, add them again by hand (the hash only stops automatic imports).

## Backups

Neon keeps point-in-time history for the Engine project (see the project's settings for how far back). Before risky changes, make a Neon branch.
