# Going live

Plain steps, in order. Expert Hub has its **own Neon project** ("expert-hub"; its main branch is the one real environment), separate from the shared "Engine". The old jobs site's tables in Engine are only ever read, by the copy in step 3.

You need access to: **Neon** (to create the project), **Vercel**, the GitHub repo, and a way to send email (the hello@fynolabs.si mailbox on Hostinger over SMTP, or a **Resend** account). Optional: **Google Cloud Console** and a **LinkedIn** developer app, for "Continue with Google / LinkedIn".

## 1. Create the database (Neon project "expert-hub")

**Done 23 Nov 2026.** Created from Vercel → project `fynolabs-experts` → Storage → Create Database → Neon:
- Settings: Singapore, Free plan, Neon Auth off.
- The Neon project id is `hidden-wind-69338805`, in Prashant's Personal Neon org.
- It's connected to the project for all environments with the prefix `DATABASE`, so Vercel already has `DATABASE_URL`.
- The local `.env.local` has the direct connection string.

The steps below are for re-creating it from scratch.

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

There is no demo data and nothing to seed: `npm run dev` and `Start Expert Hub.bat` use this database too (the one environment), and without `DATABASE_URL` the app only shows a "Database not set up" page.

You can skip this step: the copy in step 3, the admin account in step 4 and `Start Expert Hub.bat` all migrate the database themselves before they write anything.

**How the scripts connect (23 Nov 2026).** They first ask Neon over HTTPS whether any migration is pending; when nothing is, they open no other connection. To write, they use a direct Postgres connection (port 5432, node-postgres), and if that's blocked, Neon's WebSocket (port 443). If both fail, the error names what each one answered, with the password removed. The web app itself uses Neon's HTTPS driver. The first real run on 23 Nov failed on the WebSocket path alone, which is why the direct connection comes first.

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

- **Login secrets**: passwords, password versions, failed logins and lockouts, one-time and phone codes and their timers. Copying them would only add risk: experts from the jobs site sign up on the hub with the same email (or use Google), confirm it with the emailed code, and land on their copied profile.
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

## 3b. Copy the FynoLabs admin

Everything the FynoLabs admin (fynolabs.si/admin, the Lovable project with its Supabase database) holds comes into expert-hub too, with the same structure: experts and their pipelines, companies (accounts), contacts (leads), the calendar, platforms and referral links, referral groups and sent referrals, projects with tracks, team, documents and fee rules, engagements and monthly earnings, campaigns and templates, messages, the job radar, saved views, settings, the audit log and visitor analytics. Like the Engine copy it is **re-runnable**: run it whenever you like until the Lovable admin is retired.

**How it works.** Two halves, so no password to FynoLabs' database ever leaves Supabase:

1. **`hub-sync`**, a small edge function in the main site (`Main Website - FyonLabs/supabase/functions/hub-sync`). It reads FynoLabs (SELECT only, every table in `public`, so new tables come along; from `auth.users` only id, email, name and dates; the CVs and documents of the three storage buckets) and writes them into expert-hub, schema **`fynolabs_copy`**: one table per FynoLabs table with the same columns, types and keys. It answers with counts and cursors only, never row data, and only to a request carrying the right token.
2. **`npm run sync:fynolabs`** (the launcher **`Copy FynoLabs data.bat`**) on your PC: asks hub-sync for the counts, has it copy every table and the files (it carries on from a cursor, about 100 s per call), then folds `fynolabs_copy` into the hub's own tables ([DATA.md](DATA.md#the-copy-of-the-fynolabs-admin-npm-run-syncfynolabs)) and checks the numbers.

**One-time setup** (about 5 minutes):

1. Double-click **`Copy FynoLabs data.bat`**. The first time it adds a random `FYNOLABS_SYNC_TOKEN=...` line to `.env.local` (the token is never shown on screen) and stops with these steps.
2. In **Lovable**, open the FynoLabs project → **Cloud** → **Secrets** and add two secrets:
   - `HUB_SYNC_TOKEN`: the value after `FYNOLABS_SYNC_TOKEN=` in `.env.local` (open it in Notepad and copy everything after the `=`);
   - `HUB_DATABASE_URL`: the value after `DATABASE_URL=` in the same file (the expert-hub connection string).
3. **Push the main site** (`git push` in `Main Website - FyonLabs`), so Lovable deploys the function `hub-sync` (its `config.toml` entry turns off Supabase's JWT check: the token is the check).
4. Double-click **`Copy FynoLabs data.bat`** again.

Both values are passwords: never paste them in Slack, a doc or a chat. To change the token: delete the `FYNOLABS_SYNC_TOKEN` line, run `npm run token:new`, and put the new value in Lovable.

**Each run:** the launcher checks Node, `DATABASE_URL` and the token, does a **dry run** (FynoLabs' counts next to what `fynolabs_copy` and the hub hold now: nothing copied or changed), asks *Type YES*, then copies and folds. The first run takes a few minutes (about 35,000 analytics rows and 17 MB of files); later runs are quicker. The table at the end shows, for every FynoLabs table: rows in FynoLabs, in `fynolabs_copy`, in the hub, and why any differ (left out because the person was deleted on request, edited in the hub so kept, merged into one record). **CHECK OK** means everything is accounted for; anything else ends with a non-zero exit and says what. Everything printed is in `logs\copy-fynolabs-latest.log`, the report (counts only) in `logs\sync-fynolabs-<date>-<time>.txt`.

The same from a terminal: `npm run sync:fynolabs -- --dry-run`, then `CONFIRM_DB=yes npm run sync:fynolabs`. Settings: `FYNOLABS_SYNC_TOKEN`, `FYNOLABS_SYNC_URL` (default `https://kmnlyniplnkwfkbhehei.supabase.co/functions/v1/hub-sync`), `DATABASE_URL`.

**Safety.**

- FynoLabs is only read: hub-sync runs SELECT statements on it and writes only to `fynolabs_copy` in expert-hub; the mapping writes only to `hub`.
- Nothing is ever deleted because it disappeared from FynoLabs (it is kept and counted), except the rows of people deleted on request in the hub, which hub-sync leaves out and removes from the copy.
- The token is compared in constant time; a wrong or missing token gets 401, and the function refuses to run without the secret.
- The runner never prints or saves the token or the database address.
- Records edited in the hub keep those edits ([DATA.md](DATA.md#merge-rules)).

**Errors.** "refused the token (401)": the two token values differ. "isn't there yet (404)": the main site hasn't been pushed (or Lovable hasn't deployed it yet). Any other stop: run it again (it carries on), and if it repeats, send Claude `logs\copy-fynolabs-latest.log` (it has no passwords).

## 4. Create your admin account

Double-click **`Create my admin account.bat`** in this folder (or `CONFIRM_DB=yes npm run admin:create -- --email prashant@xocket.sh --name Prashant`). It uses the same `DATABASE_URL` as the copy, so it creates your login in production:

1. It prints which database it writes to (`user@host/db`, never the password), runs the migrations, and asks for your email (Enter keeps `prashant@xocket.sh`) and name.
2. **Password:** type one twice (at least 10 characters, not your email, not a common password; nothing shows while you type), or press Enter to get a strong 20-character one, printed **once** and never saved anywhere: you then choose your own at your first sign-in.
3. You're an admin (Team & access row with role admin, team account, email marked verified). Sign in at `/signin`.

Run it again whenever you need to: it asks "Reset the password? (yes/no)" for an existing account (yes also unlocks it and signs you out everywhere else). Keep `ADMIN_EMAILS=prashant@xocket.sh` set: that email is always an admin, whatever Team & access says.

Everyone else on the team: add them on **Settings → Team & access** (step 7's checks). They get a temporary password shown once, to give them privately.

## 5. Email (Resend or SMTP)

Email sends the 6-digit code that confirms an expert's email at sign-up, password reset links, and invites from a job's Matches tab. Set `EMAIL_FROM` plus **one** of these (Resend wins if both are set). Without email, expert sign-up with a password is switched off (the job forms still work without an account), "Forgot password?" tells team members to ask an admin, and nothing is ever emailed.

**SMTP (the hello@fynolabs.si mailbox on Hostinger):**

| Name | Value |
|---|---|
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` (SSL). For port 587 also set `SMTP_SECURE=false` (STARTTLS). |
| `SMTP_USER` | `hello@fynolabs.si` |
| `SMTP_PASS` | that mailbox's password |
| `EMAIL_FROM` | `FynoLabs <hello@fynolabs.si>` |

**Resend:** [resend.com](https://resend.com) → add and verify the domain (DNS records) → create an API key. Set `RESEND_API_KEY` and `EMAIL_FROM` (an address on that domain).

Also set `PUBLIC_SITE_URL` (e.g. `https://jobs.fynolabs.si`): the links in these emails always use it in production.

## 6. Optional: Google and LinkedIn

Email and password work on their own. "Continue with Google" and "Continue with LinkedIn" appear on `/signin` and `/join` only when their keys are set. Either way the same email lands on the same account. A Google sign-in with an `@ALLOWED_DOMAIN` address (or one on Team & access) is a team login (role from Team & access, else `DEFAULT_ROLE`); everyone else is an expert.

**Google:**

1. [Google Cloud Console](https://console.cloud.google.com) → pick or create a project ("Expert Hub").
2. **APIs & Services → OAuth consent screen**: user type **External** (experts use any Google account). App name "FynoLabs", support email, the site address, a link to `/privacy`. Scopes: `openid`, `email`, `profile` only. Then **Publish app** (status "In production"), so anyone can sign in.
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorised JavaScript origins: `https://<your-domain>` (and `http://localhost:3000` for local tests)
   - Authorised redirect URIs: `https://<your-domain>/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google`)
4. Copy the **Client ID** and **Client secret** into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

**LinkedIn:** [LinkedIn Developers](https://www.linkedin.com/developers/apps) → Create app (company page: FynoLabs) → **Products**: add *Sign In with LinkedIn using OpenID Connect* → **Auth**: redirect URL `https://<your-domain>/api/auth/callback/linkedin`. Copy the Client ID and secret into `AUTH_LINKEDIN_ID` / `AUTH_LINKEDIN_SECRET`.

## 7. Vercel

1. Vercel → **Add New → Project** → import the GitHub repo. Framework: Next.js (detected).
2. **Settings → Environment Variables** (Production and Preview):

| Name | Value |
|---|---|
| `DATABASE_URL` | the expert-hub connection string (step 1) |
| `AUTH_SECRET` | a long random string: `npx auth secret` or `openssl rand -base64 32` (changing it signs everyone out) |
| `PUBLIC_SITE_URL` | the public address, e.g. `https://jobs.fynolabs.si` (used in emailed links) |
| `EMAIL_FROM` + `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | step 5 (or `RESEND_API_KEY` instead of the SMTP ones) |
| `ADMIN_EMAILS` | `prashant@xocket.sh` (always admin; add more comma-separated) |
| `ALLOWED_DOMAIN` | `xocket.sh` |
| `DEFAULT_ROLE` | `viewer` |
| `ALLOWED_EMAILS` | optional: outside addresses that are team when they sign in with Google (viewer until given a role) |
| `PUBLIC_SITE_NAME` | `FynoLabs` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | optional (step 6) |
| `AUTH_LINKEDIN_ID` / `AUTH_LINKEDIN_SECRET` | optional (step 6) |

`JOBS_DATABASE_URL` and `ENGINE_DATABASE_URL` are not needed on Vercel: the copy (step 3) and `npm run admin:create` (step 4) run from your computer against the same database.

3. **Settings → Functions → Region**: the one next to the database: Mumbai → `bom1`, Singapore → `sin1`.
4. Deploy, then check:
   - `/` shows the job board (empty until you open a job);
   - sign in at `/signin` with your admin account (step 4) → you land on `/admin`;
   - Settings → Team & access: add each team member with their role and give them their temporary password privately; they choose their own at their first sign-in;
   - in a private window, sign up at `/join` with a personal email → the 6-digit code arrives → you land on `/me`; opening `/admin` shows "This part is for the team" (403); "Forgot password?" emails a working link;
   - Admin → Requirements → open one → **Create job from requirement** → Form tab → Share tab → **Open**; open the public link in a private window and apply with a test CV; the applicant shows on the Applicants tab and as an expert.

**Upload limit:** Vercel accepts request bodies up to 4.5 MB (its standard limit), so CVs and other files stop at **4 MB** everywhere (set 26 Nov 2026 in `src/lib/upload-limit.ts`): the upload boxes refuse a bigger file as soon as it's picked, with the reason, and the server checks again. Job forms made before then say 4 MB too (migration 0007). Bigger files would need object storage (Vercel Blob or R2), still on the roadmap.

## 8. Later changes to the tables

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` → read the new file in `drizzle/` (it must only mention `"hub"`).
3. `npm test` (includes a check that every migration stays inside `hub`).
4. Neon → expert-hub → **Branches → Create branch** (a full copy you can throw away). Run `CONFIRM_DB=yes npm run db:migrate` against the branch's connection string, deploy a Vercel preview pointed at it, check.
5. Migrate the main branch (`CONFIRM_DB=yes npm run db:migrate`), then deploy.

Never edit or delete a migration that has already been applied to the main branch.

## Backups

Neon keeps point-in-time history for the project (see the project's settings for how far back). Before risky changes, make a branch.

## Removing the app completely

Everything is in three schemas: `hub` (the app), `engine_copy` (the replica of Engine) and `fynolabs_copy` (the copy of the FynoLabs admin). As the database owner: `DROP SCHEMA fynolabs_copy CASCADE; DROP SCHEMA engine_copy CASCADE; DROP SCHEMA hub CASCADE;` (or delete the Neon project). Take a branch or backup first. Engine and FynoLabs themselves are never touched. Also remove the `HUB_SYNC_TOKEN` and `HUB_DATABASE_URL` secrets in Lovable.
