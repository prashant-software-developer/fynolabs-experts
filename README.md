# Expert Hub

One place for every expert we work with (engineers, scientists, domain experts), so that when a partner sends a requirement such as *"3 Scientific Coding Experts – Mathematics"*, the team can find the right people, shortlist them and submit them in minutes, then track what happened and what it earned.

Three parts, one database:

- **Public job board** (`/`, `/jobs/<slug>`): the team turns a requirement into a job with its own application form (built like a Google Form) and a shareable link. Anyone can apply without an account; every answer is saved and merged into one central expert record. Never shows pay or a client's name.
- **Expert portal** (`/join`, `/me`): experts sign up with their email and a password (a 6-digit code confirms the email; Google and LinkedIn too when their keys are set), complete their profile step by step, upload their CV, and follow their applications.
- **Admin** (`/admin`): the core team's hub. Team logins are created by an admin on Team & access (a temporary password, changed at the first sign-in) or, for the owner, with `Create my admin account.bat`. Everyone else who signs in is an expert and can never open the admin (403). What each team member can see and do depends on their **role** (admin, recruiter, pod lead, finance, viewer), checked on the server for every page, action and download. See [Sign-in and accounts](#sign-in-and-accounts) and [Roles and access](#roles-and-access).

## Public site and expert portal

| Page | What happens there |
|---|---|
| **Job board** `/` | Open public jobs, featured first. Search by role or skill, filter by field. "Sign up" / "Sign in" for experts. |
| **Job page** `/jobs/<slug>` | The job (description, skills, where it's open, closing date) and its application form. No account needed; signed-in experts get their profile filled in and their CV reused. Closed jobs say they no longer take applications; paused jobs show the page without the form; unlisted jobs open only by link; drafts and internal jobs are a 404 (the team sees a preview). SEO title, Open Graph and Google Jobs data (never a salary). |
| **Thank you** `/jobs/<slug>/applied` | Confirmation, and an invitation to create an expert account or complete the profile. |
| **Sign in** `/signin` | One page for the team and experts: email and password, "Forgot password?", Google / LinkedIn buttons when set up. Team members land on the admin, experts on their profile (or back on the job they came from). |
| **Join** `/join` | Expert sign-up: full name, email, password twice, the consent box. Then **Confirm your email** (`/verify-email`): the 6-digit code (or the link) from the email, 30 minutes, 5 tries. Only then is the account linked to the expert record with that email (people copied from the jobs site keep all their data) or a new one. Needs email to be set up (Resend or SMTP); without it the page says "Sign up with Google for now" or "Sign-up opens soon" and the job forms keep working without an account. Team emails can't sign up. |
| **Forgot password** `/forgot-password` | Emails a link to `/reset-password` (single use, 30 minutes). Never says whether an email has an account. Without email set up it says to ask the FynoLabs admin (team) or use Google (experts). |
| **Change password** `/account/password` | Current password and the new one twice. Anyone with a temporary password is sent here after signing in and can't open anything else first. Changing it signs you out everywhere else. |
| **Profile** `/me` | Completeness score, every section with Edit, CV upload/replace, sharing consent, **Download my data** (JSON) and **Delete my data** (a request for the team). |
| **Complete profile** `/me/onboarding` | Six steps: basics, expertise & skills, experience & education, CV, availability & hours, consent. Each step saves on its own. |
| **Applications** `/me/applications` | Their applications with an expert-facing status (internal notes never shown). |

## Admin

| Page | What you do there |
|---|---|
| **Dashboard** `/admin` | Twelve tiles (experts, new to review, in a job pipeline, active experts, jobs taking applications, open slots, waiting on partners, active placements, platforms, open messages, referrals sent, visitors in 30 days), each linking to its page; deletion requests; jobs taking applications (new applicants), experts by status, open requirements and their free slots, people waiting on a partner's answer, active placements; applications, messages and referrals over the last 30 days; recent changes. |
| **Experts** `/admin/experts` | Search everyone (name, skills, headline, university, email). Filter by domain, skills, country, status, availability, CV consent, source, years. Sort columns, pick columns, 25 / 50 / 100 per page. **Table or Board** (one column per status; change a status from the card). **Saved views** as tabs (filters, sort, columns and layout; personal or shared with the team), and every view is a link. Tick people and **Add to requirement**. **Export CSV** of what you see. Click a name for a quick view; open the full profile to edit, upload a CV, change CV consent, add notes, see sources, job applications with their pipeline stage, owner / outreach / next action, submissions, placements, the timeline and the change history. |
| **Requirements** `/admin/requirements` | **New requirement**: paste what the partner sent, press *Read requirement*, check the fields, save. The requirement page then shows the **best matches** with a score and the reasons, and one-click **Shortlist**. **Create job from requirement** starts a job with its title, skills, fields, countries, minimum years and openings. |
| **Jobs** `/admin/jobs` | Every job with status, visibility and applicants (views: open, drafts, closed, featured; search, visibility, partner). A job has five tabs: **Details** (public text, plus the internal partner, requirement and rate note), **Form** (the builder: add a question of any of 17 types, edit wording, help, required, choices and which profile field it fills, move, duplicate, delete, templates, live preview), **Applicants** (status filters, key answers as columns, side panel with every answer, status and bulk status, internal note, CSV export, CV download), **Matches** (experts already in the hub ranked for the job, with reasons; copy an invite link, mark invited, shortlist to the requirement) and **Share** (public link, open / pause / close, public / unlisted / internal, featured, closing date, tagged links for LinkedIn, WhatsApp, Slack and email). |
| **Submissions** `/admin/submissions` | Everyone put forward, across partners. Change status (each change is logged). You **can't mark someone Submitted without their CV consent**: the app says why. |
| **Placements** `/admin/placements` | Who is working where, hours or tasks, what the expert earned and what the partner paid, with totals per partner and per month. Start one from an approved submission. |
| **My work** `/admin/my-work` | Each person's list for today (India time): follow-ups due on their accounts, leads, experts and pipelines; calendar; applicants to screen; prospects to contact; no reply; referral links; documents. Admins can open anyone's list or everyone's. |
| **Accounts** `/admin/accounts` | Companies (one per organisation: the partners that send requirements and every FynoLabs account): table by stage then due date, or a board; tabs Pipeline / Due now / Parked / All; filters by type, stage, owner, line and tag; a side panel, then the account page with the next step, details, people, the activity log (a stage change is logged), its calendar, jobs, projects, requirements and referrals. `/admin/partners` opens it. |
| **Leads** `/admin/leads` | The people at accounts: role, stage, source, email / profile, next follow-up; link to an account. |
| **Calendar** `/admin/calendar` | Calls, meetings, follow-ups, deadlines, tasks and posts in India time (agenda, week, month), with accounts' next steps, leads' follow-ups and job closing dates; mark done logs a call or meeting on its account. |
| **Platforms** `/admin/platforms` | Expert platforms and agencies: referral link, jobs page, logo, status, notes, reference links; linked accounts and projects; referrals by outcome. |
| **Projects** `/admin/projects` | P### projects: partner, platform, owner, target, countries, rules; the funnel of their jobs' pipelines; roles, team, tracks, required documents, partner reports; fee rules (admins and finance). |
| **Messages** `/admin/messages` | The website's contact form: mark handled, reply drafts, replies (copy or open in the email app until email is set up). |
| **Analytics** `/admin/analytics` | Visitors and page views of fynolabs.si by source per day, top pages and referrers, applications and messages. |
| **Settings** `/admin/settings` | Admins: how replies read (context, style, links, sign-off). |
| **Import** `/admin/import` | Pull people in from the old jobs site, or from a spreadsheet (Talent register, old admin CRM export) with a preview before anything changes. |
| **Team & access** `/admin/settings/team` | Admins only: **Add team member** (email, name, role) creates their login with a temporary password **shown once** in a copy box; per member: change role (and a pod lead's partners), **Reset password** (a new temporary password, shown once), turn access off (signs them out at once) and on, last sign-in. Every change is logged. |

## Run it on your computer

You need [Node.js 22](https://nodejs.org) (the LTS installer is fine) and the database's connection string (Neon project "expert-hub"). On Windows, double-click these in order (details in [docs/LOCAL_TESTING.md](docs/LOCAL_TESTING.md)):

1. Put `DATABASE_URL=...` in `.env.local` (the Neon steps are in [DEPLOY.md](docs/DEPLOY.md#1-create-the-database-neon-project-expert-hub); every launcher prints them too).
2. **`Copy experts from Engine.bat`**: brings every expert record across (and creates the tables).
3. **`Copy FynoLabs data.bat`**: brings the FynoLabs admin across (experts, pipelines, companies, contacts, calendar, referrals, projects, emails, messages, analytics). One-time setup the first time: two secrets in Lovable and a push of the main site ([DEPLOY.md step 3b](docs/DEPLOY.md#3b-copy-the-fynolabs-admin)).
4. **`Create my admin account.bat`**: your admin login (email `prashant@xocket.sh` by default). Type a password twice (nothing shows while you type), or press Enter to get a strong one printed once.
5. **`Start Expert Hub.bat`**, then sign in at http://localhost:3000/signin.
6. **`Load default documents.bat`**: puts the two documents every expert signs in the portal (the NDA and the profile sharing consent) into the database, read from `Company/Legal/Templates` at run time (run `Start Expert Hub.bat` once first, so the tables exist). The NDA names FynoLabs's GSTIN and business address, which experts then see when they sign.
7. Optional: **`Create a test expert account.bat`**: an expert login (default `test.expert@example.com`, email marked confirmed, record "Test Expert" tagged `test`) to try the portal before sign-up email is set up. Use it in a private window. Details in [LOCAL_TESTING.md](docs/LOCAL_TESTING.md#experts).

The same from a terminal: `npm ci`, `CONFIRM_DB=yes npm run admin:create -- --email you@xocket.sh`, `npm run dev`.

There is one environment: the app always uses `DATABASE_URL`, so every change is live. Without it, every page shows **Database not set up** with the four steps. The old team addresses (`/experts`, `/requirements`, ...) redirect to `/admin/...`.

## Sign-in and accounts

- **One account per person** (`hub.accounts`), whatever the method: email + password, or Google / LinkedIn when their keys are set (the same email lands on the same account).
- **Passwords** are hashed with scrypt (Node's built-in crypto: N=2^15, r=8, p=1, a random 16-byte salt, stored as a versioned string). Rules: at least 10 characters, not the email, not a common password; the forms show a strength hint. Plain passwords, codes and links are never stored or logged.
- **Sign-in** answers "Email or password is incorrect" for every failure, after the same work for unknown emails (a dummy hash), so neither the message nor the timing tells whether an email has an account. Five wrong passwords lock an account for 15 minutes; there are per-address and per-email limits too.
- **Sessions** are signed cookies (Auth.js, JWT) carrying the account id, type, role and `token_version`, re-checked against the database on every request: changing or resetting a password, or turning an account off, ends every other session at once.
- **Team logins** are only ever created by an admin (Team & access, or `npm run admin:create` for the owner) with a temporary password the person must change at their first sign-in. Nobody can sign up as team.
- **Experts** sign up themselves; the account sees no profile until the emailed code proves the email, and only then is it linked to their expert record.
- **Email** (sign-up codes, reset links, invites) goes through Resend or any SMTP server, e.g. hello@fynolabs.si on Hostinger ([DEPLOY.md step 5](docs/DEPLOY.md#5-email-resend-or-smtp)).

Rules in `src/lib/server/accounts.ts` (and `src/lib/auth/password.ts`, `src/auth.ts`), tests in `tests/auth-accounts.test.ts`, `tests/session.test.ts`, `tests/admin-script.test.ts` and `tests/setup-and-redirects.test.ts`.

## Roles and access

Everyone signs in on the same page (`/signin`). First the **account type**: team accounts are the ones an admin created (Team & access, `npm run admin:create`), plus Google sign-ins whose email is in `ADMIN_EMAILS`, ends with `@ALLOWED_DOMAIN`, is in `ALLOWED_EMAILS` or has a row in Team & access; everyone else is an **expert** (the portal, never the admin). Team members land on `/admin`, experts on `/me` or back on the job they came from. For the team, the role decides what they can see and do. Both are worked out again on every request:

1. Email in **`ADMIN_EMAILS`** → admin, always (set it to `prashant@xocket.sh`: a way back in; these people can't be demoted from the app). Their login itself still comes from `npm run admin:create` or Team & access.
2. Otherwise their row in **Settings → Team & access** (`hub.team_members`) → that role. A member whose access is turned off is signed out at once and can't sign in until it's turned back on.
3. Otherwise **`DEFAULT_ROLE`** (default `viewer`) for `@ALLOWED_DOMAIN` accounts that signed in with Google, with a bar saying "You have view-only access. Ask an admin to change your role." Outside addresses from `ALLOWED_EMAILS` get viewer until an admin gives them a role.

| Role | Can |
|---|---|
| **Admin** | Everything, plus Team & access, imports (jobs-site sync and CSV), delete on request, partners, settings, deleting accounts, leads, events, platforms, projects and messages. |
| **Recruiter** | Add and edit experts, notes, CV upload (no delete), requirements, matching, shortlist, submissions, roster export, CSV import with preview (not the jobs-site sync); accounts, leads, the calendar, platforms, projects and messages. **No money.** |
| **Pod lead** | Reads experts and requirements. Submissions and placements **only for the partners in their scope**; may change submission status and a placement's hours, tasks and status. **No money.** |
| **Finance** | Reads experts, requirements and submissions. Placements in full, money included; creates and edits placements; placements CSV export. No imports, no team page. |
| **Viewer** | Read only. Money hidden, expert email and phone masked (LinkedIn visible), no exports. |

Jobs: admins and recruiters create, edit, build forms, publish, invite and manage applicants (status, notes, CSV export). Pod leads, finance and viewers read jobs and applicants (viewers with masked contact details). A job's internal rate note is money: admins and finance only.

"Money" means an expert's rate expectation, placement rates, earned, revenue, margin and the totals. Hidden fields are removed on the server before the page is built, not just hidden in the browser.

The rules live in one file, `src/lib/auth/permissions.ts` (`can(role, action)`, the field helpers and the masking), with tests in `tests/permissions.test.ts`. Every server action and API route goes through the guard in `src/lib/auth/guard.ts` / `api.ts`, and the activity log records each change's actor email and role. Admins can't demote or turn off themselves (or reset their own password there: they use Change password), and the last admin can't be removed.

## How matching works

When you open a requirement, the app first narrows the field in the database (people who share a skill or the domain, or mention a skill in their headline; never "do not contact" or "inactive"; not already on this requirement). Then it scores each person out of 100 and shows why:

| Factor | Points | How |
|---|---|---|
| Must-have skills | 40 | Share of the must-haves they have. Half credit if a skill only appears in their headline. Spellings are unified (Python3 = python, numerical analysis = numerical methods). |
| Domain | 15 | Same domain = 15; field of study names it (e.g. "Applied Mathematics") = 10. |
| Years | 10 | At or above the minimum = 10; below = partial; unknown = 3. |
| Availability | 10 | Available 10, limited 6, busy 2, unavailable 0. |
| Status | 10 | Bench 10, placed 8, submitted 7, screening 5, applicant 3. |
| Degree | 5 | Meets the lowest accepted degree = 5; unknown = 2. |
| Nice-to-have skills | 5 | Share of the nice-to-haves. |
| CV consent | 5 | Yes 5, not asked 2, no 0. |

People are **left out** (with the reason shown) if their country is blocked, outside the allowed countries, or in a blocked US state ("US-based, not CA, CT" blocks California and Connecticut). If the country or US state is unknown they stay in, flagged "check".

The rules live in one small file, `src/lib/match/score.ts`, with tests in `tests/score.test.ts`. The paste reader is `src/lib/match/parse.ts`; to teach it a new skill or spelling, add it to `src/lib/match/dictionary.ts`.

## How job forms work

- Every new job starts with the standard form: full name, email, phone, country, city, LinkedIn URL, years of experience, highest degree, field of study, university, skills, hours per week, availability, CV upload, "Why are you a good fit?" and the consent box. Edit it freely in the Form tab; it needs a required name and email question before the job can open.
- Field types: short text, long text, email, phone, URL, number, single choice, multiple choice, checkboxes, yes/no, date, country, years of experience, skills (tags), file upload (PDF/Word, up to 4 MB: Vercel's standard request limit, set in `src/lib/upload-limit.ts`), consent checkbox, section heading.
- A question can **fill a profile field** (name, email, phone, country, city, LinkedIn, headline, years, degree, field of study, university, skills, languages, hours, availability, CV, CV consent). On submit the app finds the expert by email (or LinkedIn URL), fills only empty fields, adds new skills, makes the new CV the current one, records consent with the time, and keeps one application per person per job (applying again updates it).
- Every answer is checked on the server; the form has a honeypot and per-IP / per-email rate limits; do-not-contact and deleted people are refused politely. Rules in `src/lib/forms/job-fields.ts` and `src/lib/server/applications.ts`, tests in `tests/forms.test.ts` and `tests/apply.test.ts`.
- Public text (title, summary, description, questions) is checked for pay, a pay basis and the partner's name when you save and when you open the job (`src/lib/public-copy.ts`).

## How imports work

- **Everything from the FynoLabs admin** (`Copy FynoLabs data.bat`, or `npm run sync:fynolabs`): the `hub-sync` edge function (in the main site) copies every FynoLabs table, the team's auth users (no secrets) and the stored CVs and documents into the schema `fynolabs_copy`; the runner folds it into `hub` with the same structure: one expert per person (email, then LinkedIn; FynoLabs wins over Engine, never over hub edits), a pipeline per person per job with FynoLabs' stages, the timeline, documents, companies (merged with the hub's partners), contacts, calendar, platforms, referrals, projects, engagements and earnings, campaigns, messages, job radar, settings, audit log and visitor analytics. Dry run first; safe to run again until the Lovable admin is retired. Details: [DEPLOY.md step 3b](docs/DEPLOY.md#3b-copy-the-fynolabs-admin), [DATA.md](docs/DATA.md#the-copy-of-the-fynolabs-admin-npm-run-syncfynolabs).
- **Everything from Engine** (`Copy experts from Engine.bat`, or `npm run copy:engine`): every expert record from the old jobs site's database (Engine), **read only**, into the hub's database: an exact replica of the expert tables in the schema `engine_copy` (login secrets left out), plus every person, profile detail, CV and tax form, the old jobs (internal) and every application with its screening answers mapped into `hub`. Dry run first; safe to run again any time until jobs.fynolabs.si moves over. Details: [DEPLOY.md step 3](docs/DEPLOY.md#3-copy-everything-from-engine), [DATA.md](docs/DATA.md#the-copy-from-engine-npm-run-copyengine).
- **Jobs site, people only** (button on `/admin/import`, or `npm run import:jobs`): reads the old jobs site's tables (**read only**), from `JOBS_DATABASE_URL` when set (the shared Engine project; CVs are then copied into the hub) or else from the same database. New people are added. For people already in the hub (same jobs-site user, same email, or same LinkedIn URL) it **only fills fields that are empty**, so anything the team typed is never overwritten. The newest jobs-site CV becomes the current CV unless someone uploaded one here; the file itself stays on the jobs site and is streamed when you download it.
- **Spreadsheets** (Talent register, admin CRM export): save as CSV, upload, look at the preview (new / fill in / no change / **review** for possible duplicates / skip), then import. Same "fill empty fields only" rule. The register has no email column, so a name that matches an existing expert is held back for review, unless you tick "treat an exact name match as the same person".
- Running an import twice never creates duplicates: `expert_sources` remembers where everyone came from.

## Personal data rules (short version)

Full rules in [docs/DATA.md](docs/DATA.md).

- Never store government ID numbers, dates of birth or bank details.
- A CV (or someone's details) goes to a partner **only if they said yes**. The roster export and the CV ZIP include only people with CV consent = yes.
- Rates are internal. They never appear in exports to partners.
- Someone asks to be removed (by email, or **Delete my data** in the portal): profile → Edit → *Delete on request* (admins only).
- Experts only ever see their own record, and never internal notes, status, rates or partners.
- Viewers see masked email and phone; only admins and finance see money, including the payout details and tax forms copied from the jobs site.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally on http://localhost:3000 (needs `DATABASE_URL`). |
| `npm run build` / `npm start` | Production build / run it. |
| `npm test` | All tests (sign-in and accounts, matching, paste reader, roster CSV, import mapping, and full database runs on PGlite). |
| `npm run typecheck` | TypeScript check. |
| `npm run db:generate` | After changing `src/db/schema.ts`: writes a new migration into `drizzle/`. |
| `npm run db:migrate` | Applies migrations to `DATABASE_URL` (the app's own Neon project). Refuses unless `CONFIRM_DB=yes` is also set, prints which database it targets, and refuses anything outside the `hub` schema. |
| `npm run admin:create` | Creates or updates your admin login in `DATABASE_URL` (`-- --email you@xocket.sh [--name "Your Name"]`): runs the migrations, makes the team member an admin, marks the email verified, and asks for a password (hidden, twice) or makes one (printed once, to be changed at the first sign-in). Asks before resetting an existing password. Needs `CONFIRM_DB=yes`. On Windows: `Create my admin account.bat`. |
| `npm run expert:create` | A test expert login in `DATABASE_URL` (`-- --email test.expert@example.com [--name "Test Expert"]`): an expert account with the email marked verified, linked to an expert record tagged `test`; the password as in `admin:create`. Refuses team emails, a real expert's email, a login someone else made and people deleted on request. Needs `CONFIRM_DB=yes`. On Windows: `Create a test expert account.bat`. |
| `npm run import:jobs` | Jobs-site sync from the command line (`-- --dry-run` to preview). Reads `JOBS_DATABASE_URL` when set. Needs `CONFIRM_DB=yes`. |
| `npm run sync:fynolabs` | Copy everything from the FynoLabs admin into `DATABASE_URL` and fold it into the hub (`-- --dry-run` first: counts only). Needs `FYNOLABS_SYNC_TOKEN` (equal to Lovable's `HUB_SYNC_TOKEN` secret) and `CONFIRM_DB=yes`. On Windows: `Copy FynoLabs data.bat`. |
| `npm run token:new` | Adds a fresh random `FYNOLABS_SYNC_TOKEN` to `.env.local` if there is none (never prints it). |
| `npm run copy:engine` | Copy every expert record from Engine into `DATABASE_URL` (`-- --dry-run` first; `--source-env <file> --source-key <KEY>` or `ENGINE_DATABASE_URL` for Engine). Needs `CONFIRM_DB=yes`. On Windows: `Copy experts from Engine.bat`. |

Going live: [docs/DEPLOY.md](docs/DEPLOY.md). Settings: [.env.example](.env.example).

## How it's built

- **Next.js 15** (App Router, server components and server actions), **Tailwind CSS 4**, Expert Hub's own small components (`src/components/ui`: page header, sections, tiles, tables, tabs, badges, side panel), `lucide-react` icons, Recharts for the dashboard trends (`src/components/crm/trend.tsx`). Look: the FynoLabs design system from the website (light mode only; colour tokens as CSS variables in `src/app/globals.css`, mapped to Tailwind names such as `bg-primary`, `text-muted-foreground`, `border-border`, `bg-sidebar`; 4px radius; Inter, bundled, SIL Open Font License). Blue (`primary`) is kept for the main action and links; statuses use soft tints. The frame (`src/components/nav.tsx`): a compact sidebar with the groups, and a top bar with where you are, search (Ctrl K) and the account menu. The screens and features that came from the FynoLabs admin use this same look (26 Nov 2026: its copied design was taken out, its features kept). Screenshots: `docs/screenshots/`.
- **Postgres** through **Drizzle ORM**: the app's own Neon project, "expert-hub" (`@neondatabase/serverless`, HTTP driver), the one environment (`npm run dev` uses it too). The automated tests use PGlite (a real Postgres inside Node).
- All of this app's tables live in the Postgres schema **`hub`** (it began on the shared "Engine" database; the guard stays). The old jobs site's tables are only ever read, by the copy and the import; the copy keeps its replica in the schema **`engine_copy`**, outside `hub`. The FynoLabs admin's copy is in **`fynolabs_copy`**, written by the main site's `hub-sync` edge function.
- **Pipelines:** every application (public forms, the Engine copy, the FynoLabs admin) is one row per person per job with the FynoLabs admin's stages (Applied, Shortlisted, Proposed to client, Selected, Documents sent, Signed, Active, Ended, Rejected); a database trigger keeps the applicant status and the stage in step.
- **Auth.js v5** (next-auth): email + password (Credentials provider, scrypt hashes in `hub.accounts`), plus Google and LinkedIn when configured; email through Resend or SMTP (nodemailer). The middleware is the first gate (public / signed-in / team / temporary password); every page, action and download checks the account and role again on the server (`src/lib/auth/`).
- **Vitest** for tests.

```
src/app/            (site)/ public board, job pages, /me portal · (auth)/ sign-in, sign-up, verify, passwords · admin/ team app · api/
src/components/     forms, tables, auth/ (sign-in forms), jobs/ (form fields, apply form, public job), portal/, site/, small UI pieces (components/ui)
src/db/             schema.ts (hub tables), client.ts, env.ts, local/ (PGlite for tests, jobs-site stub)
src/lib/forms/      job-fields (field types, validation, template, profile mapping), job, expert, requirement forms
src/lib/match/      dictionary, paste reader, scorer
src/lib/import/     register / CRM / jobs-site mapping, the import planner, engine/ (the copy from Engine: read-only source, replica, hub mapping, report), fynolabs/ (the FynoLabs admin: runner, merge rules, mapping)
src/lib/auth/       access rules, passwords, the signed-in account, roles, permissions (can / masking), per-section access, the guard
src/lib/crm/        the CRM's lists and words (stages, lanes, due dates), India-time dates, the redirect-with-message helper
src/lib/server/     database work (accounts, experts, requirements, jobs, applications, portal, submissions, placements, CVs, imports, team, saved views, email)
drizzle/            SQL migrations (hub schema only)
scripts/            migrate, create-admin, import-jobs, copy-from-engine, sync-fynolabs, token-new
tests/              unit tests + PGlite integration tests (fixtures/: fictional test data, the jobs site's real schema for the copy)
docs/               DEPLOY.md, DATA.md, LOCAL_TESTING.md, PRODUCT_PLAN.md, screenshots/
```

## Roadmap

Done in Phase 2: jobs with a form builder, public applications, expert sign-up, onboarding and profile, the job board. Done in Phase 3a: the FynoLabs admin's structure and data (`npm run sync:fynolabs`). Phase 3b: the CRM and operations screens are built (dashboard, my work, accounts, leads, calendar, platforms, projects, messages, analytics, settings); pipelines, referrals, campaigns, job radar and fees next ([PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md#phase-3b-the-admin-screens)).

1. Screening per field (short assessments kept on the profile), interviews, and a job pipeline with more stages (onboarding, active).
2. Uploads in object storage (Vercel Blob or R2): needed for CVs over 4.5 MB on Vercel.
3. Automations: emails on status changes, Slack posts for new applicants.
4. Monthly hours / tasks per placement (so "per month" totals use real work months, not start months), and payout tracking.
5. Merge two expert records into one (job forms tag possible duplicates; today: fix by hand).
6. A "notify me" when new people match an open requirement or job.
7. Import straight from `.xlsx` and from partner portals' exports.
8. Read-only access for partners' coordinators.
9. Smarter matching: synonyms learned from accepted submissions, CV text search.
