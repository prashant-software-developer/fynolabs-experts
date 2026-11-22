# Running and checking Expert Hub on your PC

## Start it

1. Double-click **`Start Expert Hub.bat`** in this folder. The first run installs packages, which takes a few minutes.
2. Your browser opens http://localhost:3000. You're signed in as **dev@xocket.sh**, with a yellow banner saying so. This only happens on this PC, never in production.
3. Keep the black window open while you use the app. Close it to stop.

The app uses its own demo database in `.data/`, filled with fictional people (example.com emails). Nothing touches the real database. To start the demo data over, stop the app and double-click **`Reset demo data.bat`**.

Your local settings are in `.env.local`. It's git-ignored, so it's never committed.

## What to check (about 15 minutes)

| Page | Try this |
|---|---|
| Dashboard `/` | Counts by status, open requirements and slots, recent activity |
| Experts `/experts` | Search by a skill; filter by domain, country and status; tick a few, then "Add to requirement"; "Export CSV" |
| One expert | Edit a field and save; open the Submissions and Placements tabs; download the CV |
| Add expert | Try a duplicate email: you should get a warning |
| New requirement `/requirements/new` | Paste a partner requirement, e.g. *"Scientific Coding Expert - Mathematics. Pilot: up to 3 people. Strong Python, numerical methods, PhD or Master's in Mathematics, 3+ years."*, and check the pre-filled fields |
| Requirement page | Matches tab: scores with reasons; shortlist two people; Submissions tab: move one to "submitted" (blocked without CV consent); "Export roster" (CSV plus a ZIP of CVs) |
| Submissions `/submissions` | Filter by partner and status |
| Placements `/placements` | Create one from an approved submission; check the totals |
| Import `/import` | Upload a small CSV in the Talent register format and look at the preview before applying |
| Phone width | Shrink the browser window: the menu button opens the same navigation |

Write down anything that looks off (a screenshot and the page name is enough) and send it to Claude.

## If something goes wrong

- **"Node.js is not installed":** install the LTS version from https://nodejs.org, then run the .bat again.
- **Port 3000 is busy:** close the other app, or run `npm run dev -- -p 3001` in this folder.
- **A strange error after an update:** delete the `node_modules` and `.next` folders, then start again.
