# Running and checking Expert Hub on your PC

There is one environment: the database in the Neon project **expert-hub**. Everything you do in the app on your PC is live (the same data the team sees). There is no demo mode and no automatic sign-in.

## Set it up (once)

1. **Set up the database.** Open [neon.tech](https://neon.tech) with the FynoLabs admin account, open the project **expert-hub**, press **Connect**, keep the main branch and copy the connection string (it starts with `postgresql://`). In this folder, open `.env.local` in Notepad (or create it) and add one line: `DATABASE_URL=the string you copied`. Save it. Keep that string private: it contains a password.
2. **Double-click `Copy experts from Engine.bat`.** It creates the tables and brings every expert record across from the old jobs site (dry run first, then type YES). Details: [DEPLOY.md, step 3](DEPLOY.md#3-copy-everything-from-engine).
2b. **Double-click `Copy FynoLabs data.bat`** to bring the FynoLabs admin across (experts and their pipelines, companies, contacts, calendar, referrals, projects, emails, messages, analytics). The first time it explains a one-time setup: two secrets in Lovable and a push of the main site ([DEPLOY.md, step 3b](DEPLOY.md#3b-copy-the-fynolabs-admin)). Then dry run, type YES, copy.
3. **Double-click `Create my admin account.bat`.** Press Enter to keep `prashant@xocket.sh` and the name Prashant. Then type a password (at least 10 characters) twice: nothing shows on screen while you type, that's normal. Or just press Enter and a strong password is made for you and shown once: copy it, you'll choose your own when you first sign in. Run it again any time: it asks "Reset the password? (yes/no)", so it's also how you get back in if you forget your password.
4. **Double-click `Start Expert Hub.bat`** and sign in at http://localhost:3000/signin with that email and password. Keep the black window open while you use the app; close it to stop.

The launchers install packages the first time (and again after an update), which takes a few minutes. `.env.local` is git-ignored, so it's never committed. Without `DATABASE_URL` every page shows **Database not set up** with the same four Neon steps.

## What to check (about 20 minutes)

### Signing in

| Step | Try this |
|---|---|
| Sign in | http://localhost:3000/signin: your email and password. You land on the admin. Type a wrong password first: it says "Email or password is incorrect" (the same for an email that has no account). |
| Generated password | If you pressed Enter for a generated password, you're sent to **Choose your own password** first; nothing else opens until you do. |
| Change password | Click your email in the admin's top bar: current password, then the new one twice. You stay signed in here and are signed out everywhere else. |
| Add a team member | Admin → **Team & access** → Add a team member: an email, name and role (try Recruiter). A box shows their **temporary password** once, with Copy. Reload the page: it's gone for good. |
| Sign in as them | Sign out (top right), sign in with that email and temporary password: you must choose a new password, then you see what a recruiter sees (no Team & access, no money). Sign out. |
| Reset and turn off | As admin, on Team & access: **Reset password** for that member (a new temporary password, shown once; the old one stops working), then **Turn off**: they're signed out and can't sign in until you turn them back on. The **Last sign-in** column shows who has signed in. |
| Locked after 5 tries | Five wrong passwords for one account lock it for 15 minutes ("Too many attempts"). |

### Experts

Sign-up with a password needs email to be set up (Resend or SMTP, see [DEPLOY.md step 5](DEPLOY.md#5-email-resend-or-smtp)). Without it `/join` says sign-up opens soon (or offers Google when that's set up), and the job forms still work without an account.

**A test expert login (works without email).** Double-click `Create a test expert account.bat`: press Enter to keep `test.expert@example.com` and the name Test Expert (no real mailbox is needed: the email is marked confirmed), then choose a password as for your admin login, or press Enter for one shown once. Sign in with it in a **private window** (your admin sign-in stays in the normal one): you land on **My profile** (`/me`) and can try onboarding, CV upload, consent, applying to a job (your profile fills the form) and **Applications**. The record shows in Admin → Experts as "Test Expert", tagged `test`, and its applications appear on the jobs like anyone's. Run the launcher again to reset the password. It refuses team emails, a real expert's email and anyone else's login. To remove it: Admin → Experts → search its email → **Delete on request** (that email can't be used again afterwards; pick a new one, e.g. `test.expert2@example.com`).

| Step | Try this |
|---|---|
| Sign up | In a private window: http://localhost:3000/join with your own personal email: name, email, password twice, tick the consent box, **Create account**. |
| Confirm the email | You get an email with a 6-digit code (and a link). Enter the code on **Check your email**. Until then the account sees no profile at all. A wrong code says so; after 5 tries, or 30 minutes, send a new code. |
| Your profile | You land on **My profile** (`/me`). If the hub already had you (copied from the jobs site, same email), it's your existing profile with everything in it. Complete a step or two. |
| Forgot password | Sign out, **Forgot password?** on the sign-in page, enter the email: the link in the email lets you choose a new password once, within 30 minutes. |
| The admin wall | As the expert, open http://localhost:3000/admin: "This part is for the team" (403). |
| Team emails | Try to sign up with an @xocket.sh address: refused ("Team accounts are set up by an admin"). |

### The rest of the admin

| Page | Try this |
|---|---|
| Dashboard `/admin` | Jobs taking applications, counts by status, open requirements and slots, recent activity |
| Experts `/admin/experts` | Search by a skill; filter by domain, country and status; tick a few, then "Add to requirement"; "Export CSV" |
| One expert | Edit a field and save; job applications with their **pipeline stage** and next action; **Pipeline and outreach** (owner, outreach, next action, where they came from) for people from the FynoLabs admin; the **Activity** tab's timeline; submissions and placements; download the CV (also a CV that came from FynoLabs) |
| After the FynoLabs copy | Pick someone you know is in both the jobs site and the FynoLabs admin: one profile, sources "Admin CRM" and "Jobs site", FynoLabs' headline and status. Edit their headline, run `Copy FynoLabs data.bat` again: your edit stays. Partners lists the FynoLabs accounts (one per company). |
| Requirements and jobs | Paste a partner requirement, check the pre-filled fields, open the matches; **Create job from requirement**, build the form, publish it, open the public link in a private window and apply |
| Roles | Sign in as the recruiter you added: no money, no Team & access; jobs yes |
| Phone width | Shrink the window on the sign-in page, a job page and the admin: everything stacks; the menu button opens the admin navigation |

### CRM and operations (Phase 3b)

| Page | Try this |
|---|---|
| Dashboard `/admin` | The tiles (accounts in pipeline, next steps due, open messages, visitors), **Coming up** (the next 7 days), **Overdue next steps**, accounts and applications by stage, new messages, recent account activity |
| My work `/admin/my-work` | Your follow-ups due today or late, today's calendar, applicants to screen, prospects (press **Contacted**: a follow-up 3 days out appears on the expert). As admin, pick a teammate or Everyone |
| Accounts `/admin/accounts` | Pipeline / Due now / Parked / All; filter by owner (Mine, a teammate, "Common (team)"), type, line, tag; click a row: the side panel, change the stage there; **Board**; **New account**. On an account: edit the next step and change the stage (Activity shows "Talking → Pilot"), **Log activity**, **Add person** (new or a lead you have), Calendar, Jobs & projects. `/admin/partners` opens Accounts |
| Leads `/admin/leads` | Open / Won / Lost; filters (stage, type, source, account, follow-up due); click a row: edit, link to an account (its name becomes the company), set a follow-up date (it shows on the calendar and My work) |
| Calendar `/admin/calendar` | Agenda, Week, Month (India time); **New event** with a time, an account, their side (or someone new: they join Leads at Call booked) and ours; **Mark done** on a call with an account: it's logged on the account's Activity; an event with no date shows under Unscheduled; next steps, follow-ups and job closing dates show read only |
| Platforms `/admin/platforms` | Tabs; open one: referral link (Copy), jobs page, logo, reference links, the accounts and projects linked, referrals by outcome |
| Projects `/admin/projects` | **New project** (code, partner, target, countries); on a project: Pipeline, People, Roles (link a job), Team, Tracks, Documents, Partner reports, Details (status, owner, rules). **Fee rules** only for admins and finance |
| Messages `/admin/messages` | Open / Handled; open one: **Mark as handled**, write a reply and **Save draft** (it's there when you come back), **Open in email app** or **Copy reply**, then **I sent it** (recorded under Previous replies). With email set up, **Send** sends it |
| Analytics `/admin/analytics` | 7 / 30 / 90 days and a date range: visitors by source per day, applications and messages, sources, top landing pages, pages and referrers |
| Settings `/admin/settings` | Email replies: change the sign-off and save; a new reply on Messages starts with it |
| Roles | As a viewer: everything reads, no New / Edit buttons, emails masked (`a•••@example.com`), no fee rules, no Settings. As an expert: every one of these pages is "This part is for the team" |

### Smoke test on your computer without the real database

For Claude or a developer: a throwaway PGlite folder with the fictional test data (never `DATABASE_URL`):

```
HUB_TEST_DB_DIR=.data/smoke SMOKE_PASSWORD=<10+ characters> npx tsx tests/smoke/seed-local.ts
HUB_TEST_DB=pglite HUB_TEST_DB_DIR=.data/smoke AUTH_SECRET=<anything long> npm run dev
```

Sign in as `smoke.admin@example.com`, `smoke.viewer@example.com` or `smoke.expert@example.com` with that password. The seed fills both the CRM and the talent fixtures. The screenshots in `docs/screenshots/` come from this data at 1280 px (26 Nov 2026, Expert Hub's own design): dashboard, experts, expert-detail, accounts, account-detail, leads, calendar, projects, jobs, messages, analytics, my-work, fees, settings-team, search, account-menu, mobile-menu, signin and job-board.

The look to check: Expert Hub's own design (as on 23 Nov), with the FynoLabs admin's features in it. A compact sidebar with "Expert Hub" under the mark and small group labels; a top bar with where you are, the search field (Ctrl K) and your email and role (its menu: Settings, Change password, Public job board, Refresh, Sign out); light page titles with a subtitle; content in bordered cards; soft coloured status labels; light only. Running a second copy while `Start Expert Hub.bat` is open: set `HUB_DIST_DIR=.next-check` (and another `--port`) so it builds into its own folder.

Write down anything that looks off (a screenshot and the page name is enough) and send it to Claude.

### Talent and outreach screens

| Page | Try this |
|---|---|
| Experts → Pipelines | Switch the layout to **Pipelines**; change a card's stage; pick Rejected: it asks why first. The person's Timeline tab shows the change. |
| One expert | **Pipelines** tab: add them to a job, set owner, track, next action; **Timeline**: add a note (the first line is the title); **Profile**: change outreach (writes the timeline) or tick Do not contact. |
| Applications | Talent call tab, New: open one (side panel), Mark as handled; it moves to Handled. |
| Send emails | New campaign → a group → Check who gets it (skipped people and why) → write it → Prepare draft → Approve → Send: "Email isn't set up yet". |
| Send referrals | Pick a platform (the link fills in), Profile shared, tick someone without consent: refused unless "They agreed" is ticked. Then Sent referrals: change the outcome. |
| Groups, Fees, Job radar | Add people by pasting emails; as admin or finance mark a fee invoiced (needs the number); publish a radar role: a draft, internal job opens. |
| Roles | As a viewer everything is read-only with masked emails and no Fees; a member whose Team & access sections don't include a module sees "You don't have access to …". |

To look at these screens without the real database, use the smoke test above (`HUB_TEST_DB=pglite`, never in production).

## The automated tests

`npm test` runs everything on PGlite (a real Postgres inside Node), nothing on the network. The FynoLabs part: `tests/hub-sync-edge.test.ts` runs the edge function's logic (`tests/edge/hub-sync-logic.ts`, checked to be the same file as the main site's `supabase/functions/hub-sync/logic.ts`) against a copy of the FynoLabs schema (`tests/fixtures/fynolabs-schema.ts`, the live column lists of 23 Nov 2026) with fictional data; `tests/fynolabs-sync.test.ts` folds it into the hub after an Engine copy (one person in both, FynoLabs wins over Engine, hub edits kept, pipelines, companies, everything else, money, a second and third run, delete on request); `tests/fynolabs-runner.test.ts` runs `npm run sync:fynolabs`'s runner against a fake edge function over HTTP (dry run, real run, cursors, errors, the token never printed); `tests/pipeline.test.ts` checks that new public applications and sign-ups get a pipeline and a timeline. The CRM screens: `tests/crm-logic.test.ts` (India-time dates, due dates, stage order and lanes, filters, the project funnel, analytics series, per-section access) and `tests/crm-actions.test.ts` (every server action as each role on the fixtures in `tests/fixtures/crm-data.ts`: stage changes logged, contacts, calendar and mark done, platforms, projects and money-only fee rules, messages and drafts, my work, settings, viewer masking). The talent and outreach screens: `tests/talent.test.ts` (stage changes and the timeline, reject reasons, inbound, campaign recipients, referrals and consent, groups, fees, radar), `tests/talent-actions.test.ts` (the server actions as each role: viewers read-only, money, per-section access) and `tests/talent-rules.test.ts` (the pure rules).

## If something goes wrong

- **"Database not set up"**: `.env.local` has no `DATABASE_URL` (or the line is misspelled). Do step 1, then start the app again.
- **Forgot your password**: double-click `Create my admin account.bat` again and answer **yes** to "Reset the password?".
- **"Node.js is not installed"**: install the LTS version from https://nodejs.org, then run the .bat again.
- **Port 3000 is busy**: close the other app, or run `npm run dev -- -p 3001` in this folder.
- **A strange error after an update**: delete the `node_modules` and `.next` folders, then start again.
- **`Copy FynoLabs data.bat` says the token was refused (401)**: `FYNOLABS_SYNC_TOKEN` in `.env.local` and `HUB_SYNC_TOKEN` in Lovable (Cloud → Secrets) must be exactly the same. **"isn't there yet (404)"**: push the main site so Lovable deploys `hub-sync`.
- **The `.data` folder** is left over from the old demo mode and isn't used any more: you can delete it.
