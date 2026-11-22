# Going live

Plain steps, in order. Expert Hub now has its **own Neon project** (its own database), separate from the shared "Engine". The old jobs site's tables in Engine are only ever read, once, by the optional import.

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

**Seed nothing in production.** The demo data only goes into the local database (`npm run db:seed` refuses when `DATABASE_URL` is set). Remove or comment out the `DATABASE_URL` line in `.env.local` afterwards if you want `npm run dev` to go back to the demo database.

## 3. Optional: bring in people from the old jobs site (Engine)

Skip this if you don't need the jobs site's applicants yet. It only **reads** Engine and writes into the new database. CVs are copied into the new database, so the app never needs Engine afterwards.

1. In Neon, open the **Engine** project → **SQL Editor** (as the owner) and create a read-only user, choosing a long random password:

   ```sql
   CREATE ROLE expert_hub_reader WITH LOGIN PASSWORD 'choose-a-long-random-password';
   GRANT USAGE ON SCHEMA public TO expert_hub_reader;
   GRANT SELECT ON public.xdl_jobs_users, public.xdl_jobs_files, public.xdl_jobs_jobs,
                   public.xdl_jobs_applications TO expert_hub_reader;
   ```

   (Create it with SQL as above, not in the console's Roles page: console roles get extra privileges.)
2. Build its connection string from Engine's **Connect** dialog, replacing the user and password with `expert_hub_reader` and the password you chose.
3. Add it to `.env.local` as a second line: `JOBS_DATABASE_URL=postgresql://expert_hub_reader:...@.../...`
4. Preview, then import:

   ```bash
   npm run import:jobs -- --dry-run
   CONFIRM_DB=yes npm run import:jobs
   ```

   It prints both databases (read from / write to), then how many people were added, filled in or held for review. Running it again never adds anyone twice. People deleted on request are skipped.

Without `JOBS_DATABASE_URL` the import reads the jobs-site tables from `DATABASE_URL` itself (the old shared setup).

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

`JOBS_DATABASE_URL` is only needed if you want the **Import** page's "jobs site" button to work on the live site; the command-line import (step 3) is enough. Never set `DEV_ROLE` on Vercel (it's ignored there anyway).

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

Everything is in one schema. As the database owner: `DROP SCHEMA hub CASCADE;` (or delete the Neon project). Take a branch or backup first.
