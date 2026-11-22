# Running and checking Expert Hub on your PC

## Start it

1. Double-click **`Start Expert Hub.bat`** in this folder. The first run installs packages, which takes a few minutes.
2. Your browser opens http://localhost:3000/admin. You're signed in as **dev@xocket.sh**, with a yellow banner saying so. This only happens on this PC, never in production. The public job board is http://localhost:3000.
3. Keep the black window open while you use the app. Close it to stop.

The app uses its own demo database in `.data/`, filled with fictional people (example.com emails), five demo jobs and a few applications. Nothing touches the real database. To start the demo data over, stop the app and double-click **`Reset demo data.bat`**.

### One environment: the real database

There is one real environment: the Neon project **expert-hub** (its main branch). Once `.env.local` has its `DATABASE_URL` (see [DEPLOY.md](DEPLOY.md), steps 1 and 3), `Start Expert Hub.bat` and `npm run dev` use **that real database**, not the demo one:

- a **red bar** at the top says "Real database (production)": every change is live;
- the automatic sign-in as dev@xocket.sh still works, but only on this computer (the app listens on 127.0.0.1, and anything else gets "Local development only");
- **Preview as → Expert (portal)** isn't offered (the demo expert is fictional and would be added to the real data);
- `Reset demo data.bat` (`npm run db:seed`) refuses to run.

Bring the experts across first with **`Copy experts from Engine.bat`** (it also creates the tables), and run it again whenever you want the jobs site's newest applicants. To go back to the demo data, remove the `DATABASE_URL` line from `.env.local` and start the app again.

**Preview as** (top bar in the admin, yellow bar on the public site) switches between the team roles, **Expert (portal)** (the demo expert, demo.expert@example.com) and **Signed out (guest)**.

Your local settings are in `.env.local`. It's git-ignored, so it's never committed.

## What to check (about 25 minutes)

### Jobs, forms and applications

| Step | Try this |
|---|---|
| Create a job from a requirement | Admin → Requirements → open *Rust Systems Engineer* → **Create job from requirement**. Title, skills, fields, countries, minimum years and openings are filled in; the company label says "AI data partner (via FynoLabs)". Change the title, press **Create job**. |
| Build the form | You land on the **Form** tab with the standard questions. Add a question (e.g. *Yes / no*: "Have you shipped Rust to production?"), open **Edit question** on another one and change its wording, move one up, duplicate one, delete the copy. Try deleting the Email question: it's protected. Press **Preview** to see the form as applicants do. Save it as a template. |
| Check the public-text rules | On **Details**, type "$40 per hour" in the summary and save: it's refused with the reason. Same for the partner's name. |
| Share the link | **Share** tab → **Open (publish)**. Copy the public link; look at the tagged links for LinkedIn, WhatsApp, Slack and email; try Unlisted and Featured. |
| Apply as a guest | Preview as → **Signed out (guest)** (or open the link in a private window). Open the job page, fill in the form with a made-up name and email, attach any small PDF, tick the consent box, submit. Try a wrong email first: the form says what to fix. You land on the thank-you page. |
| See the applicant and the merged expert | Preview as → **Admin**. The job's **Applicants** tab lists them (with "via linkedin" if you used that link). Click the name: every answer, the CV, status, an internal note. **Open full profile**: the expert was created with the answers, the CV is current, CV consent is Yes. Apply again with the same email in another case: still one application, team edits kept. |
| Matches | **Matches** tab: experts already in the hub ranked for the job, with reasons. **Copy link** gives a personal invite link; **Mark invited** records it (no email is sent locally). |
| Job board | Open http://localhost:3000: only open, public jobs (featured first); search "finance" or pick a field. The unlisted Rust job and the closed Biology job aren't listed; open `/jobs/biology-reviewer`: "no longer accepting applications". `/jobs/physics-problem-writer` (a draft) is a 404 when signed out and a preview for the team. |

### Expert sign-up and portal

| Step | Try this |
|---|---|
| Sign up as an expert | Preview as → **Expert (portal)**. You land on **My profile** (`/me`) for the demo expert: 58% complete. |
| Complete onboarding | **Complete profile**: the steps basics → expertise & skills → experience & education → CV → availability & hours → consent. Save each one (a wrong LinkedIn link or no skills shows an error); the percentage goes up. |
| Profile | Edit a section, upload or replace the CV, change sharing consent, **Download my data** (a JSON file of only your own data), **Delete my data** (records a request; the admin dashboard and the expert's admin profile then show it). |
| Applications | **Applications**: the demo expert's application with an expert-facing status. |
| The admin wall | Still as the expert, open http://localhost:3000/admin: "This part is for the team" (403). |

### The rest of the admin

| Page | Try this |
|---|---|
| Dashboard `/admin` | Jobs taking applications, counts by status, open requirements and slots, recent activity |
| Experts `/admin/experts` | Search by a skill; filter by domain, country and status; tick a few, then "Add to requirement"; "Export CSV" |
| One expert | Edit a field and save; Job applications; open the Submissions and Placements tab; download the CV |
| New requirement | Paste a partner requirement, e.g. *"Scientific Coding Expert - Mathematics. Pilot: up to 3 people. Strong Python, numerical methods, PhD or Master's in Mathematics, 3+ years."*, and check the pre-filled fields |
| Requirement page | Matches, shortlist two people; Submissions: move one to "submitted" (blocked without CV consent); "Export roster" |
| Roles | **Preview as** Viewer (contact details masked, no money, no exports, jobs read only), Recruiter (jobs yes, rate note no), Pod lead, Finance; then back to Admin. **Settings → Team & access** |
| Old links | http://localhost:3000/experts goes to /admin/experts |
| Phone width | Shrink the window on the job page and the admin: everything stacks; the menu button opens the admin navigation |

Write down anything that looks off (a screenshot and the page name is enough) and send it to Claude.

## If something goes wrong

- **"Node.js is not installed":** install the LTS version from https://nodejs.org, then run the .bat again.
- **Port 3000 is busy:** close the other app, or run `npm run dev -- -p 3001` in this folder.
- **The demo jobs are missing:** they are added to an older demo database the next time the app starts. To start everything over, stop the app and double-click `Reset demo data.bat`.
- **A strange error after an update:** delete the `node_modules` and `.next` folders, then start again.
