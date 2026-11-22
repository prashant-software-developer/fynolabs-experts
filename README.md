# Expert Hub

One place for every expert we work with (engineers, scientists, domain experts), so that when a partner sends a requirement such as *"3 Scientific Coding Experts – Mathematics"*, the team can find the right people, shortlist them and submit them in minutes, then track what happened and what it earned.

Three parts, one database:

- **Public job board** (`/`, `/jobs/<slug>`): the team turns a requirement into a job with its own application form (built like a Google Form) and a shareable link. Anyone can apply without an account; every answer is saved and merged into one central expert record. Never shows pay or a client's name.
- **Expert portal** (`/join`, `/me`): experts sign up (Google; email links and LinkedIn when configured), complete their profile step by step, upload their CV, and follow their applications.
- **Admin** (`/admin`): the core team's hub. Team = `@xocket.sh` accounts, `ADMIN_EMAILS`, `ALLOWED_EMAILS` and anyone on Team & access; everyone else who signs in is an expert and can never open the admin (403). What each team member can see and do depends on their **role** (admin, recruiter, pod lead, finance, viewer), checked on the server for every page, action and download. See [Roles and access](#roles-and-access).

## Public site and expert portal

| Page | What happens there |
|---|---|
| **Job board** `/` | Open public jobs, featured first. Search by role or skill, filter by field. "Sign up" / "Sign in" for experts. |
| **Job page** `/jobs/<slug>` | The job (description, skills, where it's open, closing date) and its application form. No account needed; signed-in experts get their profile filled in and their CV reused. Closed jobs say they no longer take applications; paused jobs show the page without the form; unlisted jobs open only by link; drafts and internal jobs are a 404 (the team sees a preview). SEO title, Open Graph and Google Jobs data (never a salary). |
| **Thank you** `/jobs/<slug>/applied` | Confirmation, and an invitation to create an expert account or complete the profile. |
| **Join** `/join` | Sign in or sign up (Google; email link with Resend; LinkedIn with its keys). Team members who sign in here go to the admin. |
| **Profile** `/me` | Completeness score, every section with Edit, CV upload/replace, sharing consent, **Download my data** (JSON) and **Delete my data** (a request for the team). |
| **Complete profile** `/me/onboarding` | Six steps: basics, expertise & skills, experience & education, CV, availability & hours, consent. Each step saves on its own. |
| **Applications** `/me/applications` | Their applications with an expert-facing status (internal notes never shown). |

## Admin

| Page | What you do there |
|---|---|
| **Dashboard** `/admin` | Jobs taking applications (new applicants), deletion requests, experts by status, open requirements and their free slots, people waiting on a partner's answer, active placements, recent changes. |
| **Experts** `/admin/experts` | Search everyone (name, skills, headline, university, email). Filter by domain, skills, country, status, availability, CV consent, source, years. Sort columns, pick columns, 25 / 50 / 100 per page. **Table or Board** (one column per status; change a status from the card). **Saved views** as tabs (filters, sort, columns and layout; personal or shared with the team), and every view is a link. Tick people and **Add to requirement**. **Export CSV** of what you see. Click a name for a quick view; open the full profile to edit, upload a CV, change CV consent, add notes, see sources, submissions, placements and the change history. |
| **Requirements** `/admin/requirements` | **New requirement**: paste what the partner sent, press *Read requirement*, check the fields, save. The requirement page then shows the **best matches** with a score and the reasons, and one-click **Shortlist**. **Create job from requirement** starts a job with its title, skills, fields, countries, minimum years and openings. |
| **Jobs** `/admin/jobs` | Every job with status, visibility and applicants (views: open, drafts, closed, featured; search, visibility, partner). A job has five tabs: **Details** (public text, plus the internal partner, requirement and rate note), **Form** (the builder: add a question of any of 17 types, edit wording, help, required, choices and which profile field it fills, move, duplicate, delete, templates, live preview), **Applicants** (status filters, key answers as columns, side panel with every answer, status and bulk status, internal note, CSV export, CV download), **Matches** (experts already in the hub ranked for the job, with reasons; copy an invite link, mark invited, shortlist to the requirement) and **Share** (public link, open / pause / close, public / unlisted / internal, featured, closing date, tagged links for LinkedIn, WhatsApp, Slack and email). |
| **Submissions** `/admin/submissions` | Everyone put forward, across partners. Change status (each change is logged). You **can't mark someone Submitted without their CV consent**: the app says why. |
| **Placements** `/admin/placements` | Who is working where, hours or tasks, what the expert earned and what the partner paid, with totals per partner and per month. Start one from an approved submission. |
| **Partners** `/admin/partners` | The companies that send requirements. |
| **Import** `/admin/import` | Pull people in from the old jobs site, or from a spreadsheet (Talent register, old admin CRM export) with a preview before anything changes. |
| **Team & access** `/admin/settings/team` | Admins only: add team members, set their role (and a pod lead's partners), turn access off and on. Every change is logged. |

## Run it on your computer (3 commands)

You need [Node.js 22](https://nodejs.org) (the LTS installer is fine).

```bash
npm install
npm run dev
# open http://localhost:3000 (job board) or http://localhost:3000/admin
```

The old team addresses (`/experts`, `/requirements`, ...) redirect to `/admin/...`.

That's it. Without any settings the app:

- uses a **built-in demo database** (PGlite, a real Postgres that runs inside Node) stored in `.data/`, created and filled with **made-up demo data** the first time (experts, requirements, five jobs with forms and a few applications);
- **signs you in automatically** as `dev@xocket.sh` (a yellow bar says so). This only happens with `npm run dev` and no Google keys. It can't happen on the live site.
- makes you an **admin** (set `DEV_ROLE=recruiter`, `pod_lead`, `finance` or `viewer` in `.env.local` to start as another role). A **Preview as** menu in the top bar switches roles on the fly, so you can check what each role sees. It also has **Expert (portal)**, which signs you in as the demo expert `demo.expert@example.com`, and **Signed out (guest)**, to see the public site as a visitor. All of this exists only in local development, never in a production build.

To start the demo data over: stop the app, run `npm run db:seed -- --reset`, start it again.

## Roles and access

Everyone signs in the same way (Google, plus email links and LinkedIn when configured). First the **account type**: team if the email is in `ADMIN_EMAILS`, ends with `@ALLOWED_DOMAIN`, is in `ALLOWED_EMAILS`, or has a row in Team & access; otherwise **expert** (the portal, never the admin). Team members land on `/admin`, experts on `/me` or back on the job they came from. For the team, the role decides what they can see and do. Both are worked out again on every request:

1. Email in **`ADMIN_EMAILS`** → admin (this is how the first admin gets in; these people can't be demoted from the app).
2. Otherwise their row in **Settings → Team & access** (`hub.team_members`) → that role. A member whose access is turned off gets a "your access is turned off" page and nothing else.
3. Otherwise **`DEFAULT_ROLE`** (default `viewer`) for `@ALLOWED_DOMAIN` accounts, with a bar saying "You have view-only access. Ask an admin to change your role." Outside addresses from `ALLOWED_EMAILS` get viewer until an admin gives them a role.

| Role | Can |
|---|---|
| **Admin** | Everything, plus Team & access, imports (jobs-site sync and CSV), delete on request, partners, settings. |
| **Recruiter** | Add and edit experts, notes, CV upload (no delete), requirements, matching, shortlist, submissions, roster export, CSV import with preview (not the jobs-site sync). **No money.** |
| **Pod lead** | Reads experts and requirements. Submissions and placements **only for the partners in their scope**; may change submission status and a placement's hours, tasks and status. **No money.** |
| **Finance** | Reads experts, requirements and submissions. Placements in full, money included; creates and edits placements; placements CSV export. No imports, no team page. |
| **Viewer** | Read only. Money hidden, expert email and phone masked (LinkedIn visible), no exports. |

Jobs: admins and recruiters create, edit, build forms, publish, invite and manage applicants (status, notes, CSV export). Pod leads, finance and viewers read jobs and applicants (viewers with masked contact details). A job's internal rate note is money: admins and finance only.

"Money" means an expert's rate expectation, placement rates, earned, revenue, margin and the totals. Hidden fields are removed on the server before the page is built, not just hidden in the browser.

The rules live in one file, `src/lib/auth/permissions.ts` (`can(role, action)`, the field helpers and the masking), with tests in `tests/permissions.test.ts`. Every server action and API route goes through the guard in `src/lib/auth/guard.ts` / `api.ts`, and the activity log records each change's actor email and role. Admins can't demote or turn off themselves, and the last admin can't be removed.

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
- Field types: short text, long text, email, phone, URL, number, single choice, multiple choice, checkboxes, yes/no, date, country, years of experience, skills (tags), file upload (PDF/Word, up to 10 MB), consent checkbox, section heading.
- A question can **fill a profile field** (name, email, phone, country, city, LinkedIn, headline, years, degree, field of study, university, skills, languages, hours, availability, CV, CV consent). On submit the app finds the expert by email (or LinkedIn URL), fills only empty fields, adds new skills, makes the new CV the current one, records consent with the time, and keeps one application per person per job (applying again updates it).
- Every answer is checked on the server; the form has a honeypot and per-IP / per-email rate limits; do-not-contact and deleted people are refused politely. Rules in `src/lib/forms/job-fields.ts` and `src/lib/server/applications.ts`, tests in `tests/forms.test.ts` and `tests/apply.test.ts`.
- Public text (title, summary, description, questions) is checked for pay, a pay basis and the partner's name when you save and when you open the job (`src/lib/public-copy.ts`).

## How imports work

- **Jobs site** (button on `/admin/import`, or `npm run import:jobs`): reads the old jobs site's tables (**read only**), from `JOBS_DATABASE_URL` when set (the shared Engine project; CVs are then copied into the hub) or else from the same database. New people are added. For people already in the hub (same jobs-site user, same email, or same LinkedIn URL) it **only fills fields that are empty**, so anything the team typed is never overwritten. The newest jobs-site CV becomes the current CV unless someone uploaded one here; the file itself stays on the jobs site and is streamed when you download it.
- **Spreadsheets** (Talent register, admin CRM export): save as CSV, upload, look at the preview (new / fill in / no change / **review** for possible duplicates / skip), then import. Same "fill empty fields only" rule. The register has no email column, so a name that matches an existing expert is held back for review, unless you tick "treat an exact name match as the same person".
- Running an import twice never creates duplicates: `expert_sources` remembers where everyone came from.

## Personal data rules (short version)

Full rules in [docs/DATA.md](docs/DATA.md).

- Never store government ID numbers, dates of birth or bank details.
- A CV (or someone's details) goes to a partner **only if they said yes**. The roster export and the CV ZIP include only people with CV consent = yes.
- Rates are internal. They never appear in exports to partners.
- Someone asks to be removed (by email, or **Delete my data** in the portal): profile → Edit → *Delete on request* (admins only).
- Experts only ever see their own record, and never internal notes, status, rates or partners.
- Viewers see masked email and phone; only admins and finance see money.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally on http://localhost:3000 (demo database unless `DATABASE_URL` is set). |
| `npm run build` / `npm start` | Production build / run it. |
| `npm test` | All tests (matching, paste reader, roster CSV, import mapping, and a full database run on PGlite). |
| `npm run typecheck` | TypeScript check. |
| `npm run db:generate` | After changing `src/db/schema.ts`: writes a new migration into `drizzle/`. |
| `npm run db:migrate` | Applies migrations to `DATABASE_URL` (the app's own Neon project). Refuses unless `CONFIRM_DB=yes` is also set, prints which database it targets, and refuses anything outside the `hub` schema. |
| `npm run db:seed` | Local demo data only (refuses if `DATABASE_URL` is set). `-- --reset` starts over. |
| `npm run import:jobs` | Jobs-site sync from the command line (`-- --dry-run` to preview). Reads `JOBS_DATABASE_URL` when set. Needs `CONFIRM_DB=yes` against a real database. |

Going live: [docs/DEPLOY.md](docs/DEPLOY.md). Settings: [.env.example](.env.example).

## How it's built

- **Next.js 15** (App Router, server components and server actions), **Tailwind CSS 4**, a few small hand-made components (`src/components/ui`), `lucide-react` icons. Look: the FynoLabs design system from the website admin (light mode only; colour tokens as CSS variables in `src/app/globals.css`, mapped to Tailwind names such as `bg-primary`, `text-muted-foreground`, `border-border`, `bg-sidebar`; 4px radius; Inter, bundled, SIL Open Font License). Blue (`primary`) is kept for the main action and links; statuses use soft tints. Screenshots: `docs/screenshots/`.
- **Postgres** through **Drizzle ORM**. Production: the app's own Neon project (`@neondatabase/serverless`, HTTP driver). Local and tests: PGlite.
- All of this app's tables live in the Postgres schema **`hub`** (it began on the shared "Engine" database; the guard stays). The old jobs site's tables are only ever read, by the import.
- **Auth.js v5** (next-auth): Google for everyone, plus email links (Resend) and LinkedIn when configured. The middleware is the first gate (public / signed-in / team); every page, action and download checks the account and role again on the server (`src/lib/auth/`).
- **Vitest** for tests.

```
src/app/            (site)/ public board, job pages, /join, /me portal · admin/ team app · api/ (apply, exports, downloads)
src/components/     forms, tables, jobs/ (form fields, apply form, public job), portal/, site/, small UI pieces (components/ui)
src/db/             schema.ts (hub tables), client.ts, local/ (PGlite, demo data, demo jobs, jobs-site stub)
src/lib/forms/      job-fields (field types, validation, template, profile mapping), job, expert, requirement forms
src/lib/match/      dictionary, paste reader, scorer
src/lib/import/     register / CRM / jobs-site mapping and the import planner
src/lib/auth/       accounts (team / expert / guest, access rules), roles, permissions (can / masking), the guard
src/lib/server/     database work (experts, requirements, jobs, applications, portal, submissions, placements, CVs, imports, team, saved views)
drizzle/            SQL migrations (hub schema only)
scripts/            migrate, seed, import-jobs
tests/              unit tests + PGlite integration test
docs/               DEPLOY.md, DATA.md, LOCAL_TESTING.md, PRODUCT_PLAN.md, screenshots/
```

## Roadmap

Done in Phase 2: jobs with a form builder, public applications, expert sign-up, onboarding and profile, the job board.

1. Screening per field (short assessments kept on the profile), interviews, and a job pipeline with more stages (onboarding, active).
2. Uploads in object storage (Vercel Blob or R2): needed for CVs over 4.5 MB on Vercel.
3. Automations: emails on status changes, Slack posts for new applicants.
4. Monthly hours / tasks per placement (so "per month" totals use real work months, not start months), and payout tracking.
5. Merge two expert records into one (job forms tag possible duplicates; today: fix by hand).
6. A "notify me" when new people match an open requirement or job.
7. Import straight from `.xlsx` and from partner portals' exports.
8. Read-only access for partners' coordinators.
9. Smarter matching: synonyms learned from accepted submissions, CV text search.
