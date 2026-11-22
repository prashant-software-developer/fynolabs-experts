# Going live

Plain steps, in order. Nothing here touches other apps' data: Expert Hub only creates and changes tables in the Postgres schema `hub`, and only reads the jobs site's tables.

You need access to: **Neon** (project "Engine"), **Vercel**, **Google Cloud Console** (for the sign-in app), and the GitHub repo (`fynolabs/fynolabs-experts` once it's created).

## 1. Make a test copy of the database (Neon branch)

Always try changes on a branch first. A branch is a full copy of Engine that you can throw away.

1. Neon console → project **Engine** → **Branches** → **Create branch**. Name it `expert-hub-test`, from `main`, with current data.
2. Open the branch → **Connect** → copy the connection string (starts with `postgresql://`). Keep it private.

### Recommended: a dedicated database user that *cannot* write the jobs site's tables

On the branch (and later on `main`), open the **SQL Editor** as the owner and run, choosing a long random password:

```sql
CREATE ROLE expert_hub WITH LOGIN PASSWORD 'choose-a-long-random-password';
CREATE SCHEMA IF NOT EXISTS hub AUTHORIZATION expert_hub;
GRANT USAGE ON SCHEMA public TO expert_hub;
GRANT SELECT ON public.xdl_jobs_users, public.xdl_jobs_files, public.xdl_jobs_jobs,
                public.xdl_jobs_applications, public.xdl_jobs_screenings TO expert_hub;

-- Check: both should say false.
SELECT has_table_privilege('expert_hub', 'public.xdl_jobs_users', 'INSERT') AS can_insert_users,
       has_table_privilege('expert_hub', 'public.xdl_jobs_files', 'UPDATE') AS can_update_files;
```

Then build the connection string with this user (`postgresql://expert_hub:<password>@<host>/<database>?sslmode=require`) and use it everywhere below. Now the database itself enforces "read only" on the jobs site, on top of the app's own rules.

(Create the role with SQL as above, not in the console's Roles page: console roles get extra privileges.)

## 2. Create the tables on the branch

On your computer, in this folder:

```bash
DATABASE_URL="postgresql://...branch..." CONFIRM_DB=yes npm run db:migrate
```

(Windows PowerShell: `$env:DATABASE_URL="postgresql://..."; $env:CONFIRM_DB="yes"; npm run db:migrate`.)

It prints the host and database it's about to change and refuses without `CONFIRM_DB=yes`. It also refuses if a migration would touch anything outside `hub`.

Optional, to see the jobs-site import work on the copy:

```bash
DATABASE_URL="postgresql://...branch..." npm run import:jobs -- --dry-run
DATABASE_URL="postgresql://...branch..." CONFIRM_DB=yes npm run import:jobs
```

## 3. Google sign-in

1. [Google Cloud Console](https://console.cloud.google.com) → pick or create a project (e.g. "Expert Hub").
2. **APIs & Services → OAuth consent screen**: user type **Internal** (only people in the xocket.sh Google Workspace can sign in; if you also need outside addresses in `ALLOWED_EMAILS`, choose External and keep it in testing with those people as test users). App name "Expert Hub", support email, save.
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorised JavaScript origins: `https://<your-vercel-domain>` (and `http://localhost:3000` for local tests)
   - Authorised redirect URIs: `https://<your-vercel-domain>/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google`)
4. Copy the **Client ID** and **Client secret**.

If you add a custom domain later (e.g. `hub.xocket.sh`), add it to both lists.

## 4. Vercel

1. Vercel → **Add New → Project** → import the GitHub repo. Framework: Next.js (detected). Leave build settings as they are.
2. **Settings → Environment Variables** (Production and Preview):

| Name | Value |
|---|---|
| `DATABASE_URL` | the **branch** connection string for now |
| `AUTH_SECRET` | a long random string: run `npx auth secret` or `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | Client ID from step 3 |
| `AUTH_GOOGLE_SECRET` | Client secret from step 3 |
| `ALLOWED_DOMAIN` | `xocket.sh` |
| `ALLOWED_EMAILS` | optional, comma-separated exact addresses allowed in addition |

3. **Settings → Functions → Region**: pick the region closest to the Neon database (Neon shows it, e.g. AWS eu-central-1 → Vercel `fra1`).
4. Deploy. Open the site:
   - sign in with an `@xocket.sh` account → you get in;
   - try a personal Gmail → "That account can't use Expert Hub";
   - open `/import`, preview the jobs-site sync, run it, check `/experts`.

## 5. Switch to the real database

When the branch test looks right:

1. Create the `expert_hub` role on **main** (step 1 SQL), then migrate main:
   ```bash
   DATABASE_URL="postgresql://...main..." CONFIRM_DB=yes npm run db:migrate
   ```
2. Vercel → Environment Variables → change `DATABASE_URL` (Production) to the main connection string → **Redeploy**.
3. Run the first jobs-site import from `/import` (preview first).
4. Delete the test branch in Neon when you no longer need it.

## Later changes to the tables

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` → read the new file in `drizzle/` (it must only mention `"hub"`).
3. `npm test` (includes a check that every migration stays inside `hub`).
4. Apply to a fresh Neon branch, deploy a preview pointed at it, check.
5. Apply to main (`CONFIRM_DB=yes npm run db:migrate`), then deploy.

Never edit or delete a migration that has already been applied to main.

## Removing the app completely

Everything is in one schema. As the database owner: `DROP SCHEMA hub CASCADE;` removes all Expert Hub data and nothing else. (Do this only on purpose; take a Neon backup or branch first.)
