# Going live

Plain steps, in order. Expert Hub has its **own Neon project** ("expert-hub"; its main branch is the one real environment), separate from the shared "Engine". The old jobs site's tables in Engine are only ever read, by the copy in step 3.

You need access to: **Neon** (to create the project), **Vercel**, **Google Cloud Console** (for sign-in), and the GitHub repo. Optional: a **LinkedIn** developer app and a **Resend** account (email).

## 1. Create the database (Neon project "expert-hub")

1. Go to [neon.tech](https://neon.tech) and sign up (Google sign-in is fine). Use the FynoLabs admin account so the company owns it.
2. **Create project**:
   - Project name: `expert-hub`
   - Postgres version: leave the default
   - Region: the one closest to India. Pick **AWS Asia Pacific (Mumbai)** if it's in the list, otherwise **AWS Asia Pacific (Singapore)**.
   - Database name: leave `neondb` (or type `expert_hub`).
3. On the project dashboard press **Connect**. Copy the connection string (it starts with `postgresql://` and ends with `?sslmode=require`). It contains a password: keep it private, never paste it in Slack or a doc.

## 2. Create the tables

On your computer, in this folder, create a file called `.env.local` (it is never committed) with one line:

```
DATABASE_URL=postgresql://...the string you copied...
```

Then run:

```bash
CONFIRM_DB=yes npm run db:migrate
```

Windows PowerShell: `$env:CONFIRM_DB="yes"; npm run db:migrate`

It prints which database it's about to change, refuses without `CONFIRM_DB=yes`, and refuses any migration that reaches outside the `hub` schema. All of Expert Hub's tables go into the schema `hub`.

**Seed nothing in production.** The demo data only goes into the local database (`npm run db:seed` refuses when `DATABASE_URL` is set). With `DATABASE_URL` in `.env.local`, `npm run dev` and `Start Expert Hub.bat` use this real database too, with a red "Real database (production)" bar; the automatic dev sign-in only answers on this computer (localhost). Remove or comment out the line to go back to the demo database.

You can skip this step: the copy in step 3 migrates the database itself before it writes anything.

## 3. Copy everything from Engine

One environment (decided 23 Nov 2026): the main branch of the Neon project **expert-hub** is production, and the hub uses only it from now on. Every expert record from Engine (the old jobs site's database) is copied into it. jobs.fynolabs.si keeps writing to Engine until it moves over, so the copy is built to be **run again whenever you like**: new and changed records come across, nothing is copied twice, nothing is deleted.

**What's copied**

| From Engine (`public.xdl_jobs_*`) | Into expert-hub |
|---|---|
| users, applications, screenings, jobs, saved, files, interviews, assessments, assessment_attempts, notifications, projects, project_members, timesheets, earnings, payouts, commissions | An exact replica in the schema **`engine_copy`**: same columns, types, NOT NULLs and keys, every row (file bytes excepted, see below). Tables with no rows yet are created too, so their future rows come across. |
| every person (not staff accounts) | `hub.experts`, with every profile field; experience, education, address, work authorisation, referral and last sign-in in `hub.expert_details`; payout method and handle and the tax form in `hub.expert_payout` (money: admins and finance only). |
| every resume and tax form (about 217 MB) | `hub.expert_files`: the bytes are stored **once**, here (the replica keeps each file's details and `hub_file_id`). The newest resume becomes the current CV unless someone uploaded one in the hub. Tax forms are money-only. |
| the 52 jobs | `hub.jobs`, **internal** (the team sees them; the public board never lists them, since jobs.fynolabs.si still serves the public jobs). Pay is only in the internal rate note. |
| the 1,579 applications and their screening answers | `hub.applications` (one per job and expert; every answer, both screening stages, the CV; the rate asked is money-only; the admin note becomes the internal note). |

**What's left out, and why**

- **Login secrets**: passwords, password versions, failed logins and lockouts, one-time and phone codes and their timers. The hub signs people in with Google, email links or LinkedIn, so they are never needed, and copying them would only add risk.
- **The jobs site's own code and settings**: `neon_auth.*` (its logins and sessions), `xdl_jobs_settings`, `xdl_jobs_admin_invites`, `xdl_jobs_bundle*`.
- **Everything that isn't about experts**: `xdl_crm_*`, leads, people, Upwork, company finder, LinkedIn and the other tables in Engine.
- **People deleted on request** in the hub: not copied, and removed from `engine_copy` if an earlier run had them.

**Run it** (Windows): double-click **`Copy experts from Engine.bat`** in this folder.

1. It checks Node.js, installs packages the first time, checks that `.env.local` has `DATABASE_URL` (the expert-hub string from step 1; if not, it shows the 4 steps to add it) and that `..\Jobs - FynoLabs\.env` exists (Engine's address, `JOBS_DATABASE_URL`).
2. **Dry run**: it reads Engine and the new database and prints, table by table, what a copy would do. Nothing is written.
3. It asks: *Type YES to copy into the new database*. Then it migrates the database (schema `hub`, with the usual guard) and copies. The first run takes about 10 to 20 minutes (most of it is uploading the CVs); later runs about a minute.
4. At the end it prints a table: rows in Engine, in `engine_copy` and in the hub, and why any differ (staff accounts, people held for review because they share a LinkedIn URL with someone else, two accounts with the same email merged, people deleted on request). **CHECK OK** means everything is accounted for; anything else stops with a non-zero exit and says what.

Everything printed is also in `logs\copy-engine-latest.log`, and the report (counts only, no names or emails) in `logs\copy-engine-<date>-<time>.txt`. The `logs` folder is never committed.

The same from a terminal:

```bash
npm run copy:engine -- --dry-run --source-env "../Jobs - FynoLabs/.env" --source-key JOBS_DATABASE_URL
CONFIRM_DB=yes npm run copy:engine -- --source-env "../Jobs - FynoLabs/.env" --source-key JOBS_DATABASE_URL
```

(or set `ENGINE_DATABASE_URL` instead of the two `--source-…` options).

**Safety.** Engine is only ever read: the copy sets `default_transaction_read_only`, reads everything inside one `REPEATABLE READ READ ONLY` transaction (one consistent snapshot), uses Engine's direct host rather than the pooler for that long read, and refuses any statement that isn't a single `SELECT`. Before writing anything it refuses when `CONFIRM_DB=yes` is missing, when `DATABASE_URL` is empty, when Engine and `DATABASE_URL` are the same Neon endpoint (pooler or not) or the same host and database, and when `DATABASE_URL` has the jobs site's own tables (`public.xdl_jobs_users`: that is Engine or a copy of it). Connection strings are only ever shown as `user@host/db`.

**Team edits are kept.** For experts, the copy only fills fields that are empty in the hub. For jobs and applications it updates a field (title, status, internal note...) only while it still holds the value the copy wrote last time; once someone changes it in the hub, the hub's value stays. `hub.legacy_map` remembers what every Engine row became.

**Run it again** whenever the jobs site has new applicants, until jobs.fynolabs.si moves to the hub (Phase 4). After that move, stop running it.

Optional: instead of the jobs site's owner login, a read-only database user for the copy. In Engine's SQL Editor (as the owner):

```sql
CREATE ROLE expert_hub_reader WITH LOGIN PASSWORD 'choose-a-long-random-password';
GRANT USAGE ON SCHEMA public TO expert_hub_reader;
GRANT SELECT ON public.xdl_jobs_users, public.xdl_jobs_applications, public.xdl_jobs_screenings, public.xdl_jobs_jobs,
  public.xdl_jobs_saved, public.xdl_jobs_files, public.xdl_jobs_interviews, public.xdl_jobs_assessments,
  public.xdl_jobs_assessment_attempts, public.xdl_jobs_notifications, public.xdl_jobs_projects,
  public.xdl_jobs_project_members, public.xdl_jobs_timesheets, public.xdl_jobs_earnings, public.xdl_jobs_payouts,
  public.xdl_jobs_commissions TO expert_hub_reader;
```

Then set `ENGINE_DATABASE_URL=postgresql://expert_hub_reader:...@<Engine's host>/neondb?sslmode=require` in `.env.local` (it wins over `--source-env`).

The older `npm run import:jobs` (people and CVs only, `JOBS_DATABASE_URL`) still works and shares the same rules; files it copied are recognised and not copied again.

## 4. Google sign-in (team and experts)

Both the team and experts sign in with Google. The app decides who is who: team = `@ALLOWED_DOMAIN`, `ADMIN_EMAILS`, `ALLOWED_EMAILS` or anyone on Settings → Team & access; everyone else becomes an expert and gets the expert portal, never the admin.

1. [Google Cloud Console](https://console.cloud.google.com) → pick or create a project ("Expert Hub").
2. **APIs & Services → OAuth consent screen**: user type **External** (experts use any Google account). App name "FynoLabs", support email, the site address, a link to `/privacy`. Scopes: `openid`, `email`, `profile` only. Then **Publish app** (status "In production"), so anyone can sign in.
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorised JavaScript origins: `https://<your-domain>` (and `http://localhost:3000` for local tests)
   - Authorised redirect URIs: `https://<your-domain>/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google`)
4. Copy the **Client ID** and **Client secret**.

### Optional: LinkedIn

[LinkedIn Developers](https://www.linkedin.com/developers/apps) → Create app (company page: FynoLabs) → **Products**: add *Sign In with LinkedIn using OpenID Connect* → **Auth**: redirect URL `https://<your-domain>/api/auth/callback/linkedin`. Copy the Client ID and secret into `AUTH_LINKEDIN_ID` / `AUTH_LINKEDIN_SECRET`. The button appears on `/join` only when both are set.

### Optional: email (Resend)

[Resend](https://resend.com) → add and verify the domain (DNS records) → create an API key. Set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `FynoLabs <hello@fynolabs.si>`). This turns on email sign-in links for experts and real invite emails from a job's Matches tab. Without them nothing is ever emailed; "Mark invited" only records the invite.

## 5. Vercel

1. Vercel → **Add New → Project** → import the GitHub repo. Framework: Next.js (detected).
2. **Settings → Environment Variables** (Production and Preview):

| Name | Value |
|---|---|
| `DATABASE_URL` | the expert-hub connection string (step 1) |
| `AUTH_SECRET` | a long random string: `npx auth secret` or `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | from step 4 |
| `ALLOWED_DOMAIN` | `xocket.sh` |
| `ADMIN_EMAILS` | `prashant@xocket.sh` (always admin; add more comma-separated) |
| `DEFAULT_ROLE` | `viewer` |
| `ALLOWED_EMAILS` | optional: outside addresses that are team (viewer until given a role) |
| `PUBLIC_SITE_NAME` | `FynoLabs` |
| `PUBLIC_SITE_URL` | the public address, e.g. `https://jobs.fynolabs.si` |
| `AUTH_LINKEDIN_ID` / `AUTH_LINKEDIN_SECRET` | optional |
| `RESEND_API_KEY` / `EMAIL_FROM` | optional |

`JOBS_DATABASE_URL` and `ENGINE_DATABASE_URL` are not needed on Vercel: the copy (step 3) runs from your computer. Never set `DEV_ROLE` on Vercel (it's ignored there anyway).

3. **Settings → Functions → Region**: the one next to the database: Mumbai → `bom1`, Singapore → `sin1`.
4. Deploy, then check:
   - `/` shows the job board (empty until you open a job);
   - sign in at `/signin` with an `@xocket.sh` account → you land on `/admin`;
   - sign in at `/join` with a personal Gmail → you land on `/me`; opening `/admin` shows "This part is for the team" (403);
   - Admin → Requirements → open one → **Create job from requirement** → Form tab → Share tab → **Open**; open the public link in a private window and apply with a test CV; the applicant shows on the Applicants tab and as an expert;
   - Settings → Team & access: give each team member their role.

**Known limit:** Vercel accepts request bodies up to 4.5 MB, so CVs larger than that can't be uploaded on Vercel even though the app allows 10 MB. Moving uploads to object storage (Vercel Blob or R2) is on the roadmap.

## 6. Later changes to the tables

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` → read the new file in `drizzle/` (it must only mention `"hub"`).
3. `npm test` (includes a check that every migration stays inside `hub`).
4. Neon → expert-hub → **Branches → Create branch** (a full copy you can throw away). Run `CONFIRM_DB=yes npm run db:migrate` against the branch's connection string, deploy a Vercel preview pointed at it, check.
5. Migrate the main branch (`CONFIRM_DB=yes npm run db:migrate`), then deploy.

Never edit or delete a migration that has already been applied to the main branch.

## Backups

Neon keeps point-in-time history for the project (see the project's settings for how far back). Before risky changes, make a branch.

## Removing the app completely

Everything is in two schemas: `hub` (the app) and `engine_copy` (the replica of Engine). As the database owner: `DROP SCHEMA engine_copy CASCADE; DROP SCHEMA hub CASCADE;` (or delete the Neon project). Take a branch or backup first. Engine itself is never touched.
