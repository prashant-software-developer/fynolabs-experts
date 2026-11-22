# Expert Hub

One place for every expert we work with (engineers, scientists, domain experts), so that when a partner sends a requirement such as *"3 Scientific Coding Experts – Mathematics"*, the team can find the right people, shortlist them and submit them in minutes, then track what happened and what it earned.

Internal tool for the core team. Sign-in is Google, limited to `@xocket.sh` accounts (plus any addresses listed in `ALLOWED_EMAILS`).

## What it does

| Page | What you do there |
|---|---|
| **Dashboard** `/` | Experts by status, open requirements and their free slots, people waiting on a partner's answer, active placements, recent changes. |
| **Experts** `/experts` | Search everyone (name, skills, headline, university, email). Filter by domain, skills, country, status, availability, CV consent, source, years. Sort columns. Tick people and **Add to requirement**. **Export CSV** of what you see. Click a name for a quick view; open the full profile to edit, upload a CV, record CV consent, add notes, see sources, submissions, placements and the change history. |
| **Requirements** `/requirements` | **New requirement**: paste what the partner sent, press *Read requirement*, check the fields, save. The requirement page then shows the **best matches** with a score and the reasons, and one-click **Shortlist**. |
| **Submissions** `/submissions` | Everyone put forward, across partners. Change status (each change is logged). You **can't mark someone Submitted without their CV consent**: the app says why. |
| **Placements** `/placements` | Who is working where, hours or tasks, what the expert earned and what the partner paid, with totals per partner and per month. Start one from an approved submission. |
| **Partners** `/partners` | The companies that send requirements. |
| **Import** `/import` | Pull people in from the jobs site, or from a spreadsheet (Talent register, old admin CRM export) with a preview before anything changes. |

## Run it on your computer (3 commands)

You need [Node.js 22](https://nodejs.org) (the LTS installer is fine).

```bash
npm install
npm run dev
# open http://localhost:3000
```

That's it. Without any settings the app:

- uses a **built-in demo database** (PGlite, a real Postgres that runs inside Node) stored in `.data/`, created and filled with **made-up demo data** the first time;
- **signs you in automatically** as `dev@xocket.sh` (a yellow bar says so). This only happens with `npm run dev` and no Google keys. It can't happen on the live site.

To start the demo data over: stop the app, run `npm run db:seed -- --reset`, start it again.

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

## How imports work

- **Jobs site** (button on `/import`, or `npm run import:jobs`): reads the jobs site's tables in the shared database (**read only**). New people are added. For people already in the hub (same jobs-site user, same email, or same LinkedIn URL) it **only fills fields that are empty**, so anything the team typed is never overwritten. The newest jobs-site CV becomes the current CV unless someone uploaded one here; the file itself stays on the jobs site and is streamed when you download it.
- **Spreadsheets** (Talent register, admin CRM export): save as CSV, upload, look at the preview (new / fill in / no change / **review** for possible duplicates / skip), then import. Same "fill empty fields only" rule. The register has no email column, so a name that matches an existing expert is held back for review, unless you tick "treat an exact name match as the same person".
- Running an import twice never creates duplicates: `expert_sources` remembers where everyone came from.

## Personal data rules (short version)

Full rules in [docs/DATA.md](docs/DATA.md).

- Never store government ID numbers, dates of birth or bank details.
- A CV (or someone's details) goes to a partner **only if they said yes**. The roster export and the CV ZIP include only people with CV consent = yes.
- Rates are internal. They never appear in exports to partners.
- Someone asks to be removed: profile → Edit → *Delete on request*.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally on http://localhost:3000 (demo database unless `DATABASE_URL` is set). |
| `npm run build` / `npm start` | Production build / run it. |
| `npm test` | All tests (matching, paste reader, roster CSV, import mapping, and a full database run on PGlite). |
| `npm run typecheck` | TypeScript check. |
| `npm run db:generate` | After changing `src/db/schema.ts`: writes a new migration into `drizzle/`. |
| `npm run db:migrate` | Applies migrations to `DATABASE_URL`. Refuses unless `CONFIRM_DB=yes` is also set, prints which database it targets, and refuses anything outside the `hub` schema. |
| `npm run db:seed` | Local demo data only (refuses if `DATABASE_URL` is set). `-- --reset` starts over. |
| `npm run import:jobs` | Jobs-site sync from the command line (`-- --dry-run` to preview). Needs `CONFIRM_DB=yes` against a real database. |

Going live: [docs/DEPLOY.md](docs/DEPLOY.md). Settings: [.env.example](.env.example).

## How it's built

- **Next.js 15** (App Router, server components and server actions), **Tailwind CSS 4**, a few small hand-made components (`src/components/ui`), `lucide-react` icons. Look: the FynoLabs design system from the website admin (light mode only; colour tokens as CSS variables in `src/app/globals.css`, mapped to Tailwind names such as `bg-primary`, `text-muted-foreground`, `border-border`, `bg-sidebar`; 4px radius; Inter, bundled, SIL Open Font License). Blue (`primary`) is kept for the main action and links; statuses use soft tints. Screenshots: `docs/screenshots/`.
- **Postgres** through **Drizzle ORM**. Production: Neon (`@neondatabase/serverless`, HTTP driver). Local and tests: PGlite.
- All of this app's tables live in their own Postgres schema, **`hub`**, because production shares the "Engine" database with other apps. The jobs site's tables in `public` are only ever read.
- **Auth.js v5** (next-auth) with Google. Every page, action and download checks the signed-in user.
- **Vitest** for tests.

```
src/app/            pages (app)/..., API routes for downloads, sign-in
src/components/     forms, tables, small UI pieces (components/ui)
src/db/             schema.ts (hub tables), client.ts, local/ (PGlite, demo data, jobs-site stub)
src/lib/match/      dictionary, paste reader, scorer
src/lib/import/     register / CRM / jobs-site mapping and the import planner
src/lib/server/     database work (experts, requirements, submissions, placements, CVs, imports)
drizzle/            SQL migrations (hub schema only)
scripts/            migrate, seed, import-jobs
tests/              unit tests + PGlite integration test
docs/               DEPLOY.md, DATA.md
```

## Roadmap

1. Monthly hours / tasks per placement (so "per month" totals use real work months, not start months), and payout tracking.
2. Merge two expert records into one (today: fix by hand, delete the extra one).
3. Email templates for consent requests and "you've been submitted" notes, sent from the hub.
4. Saved searches and a "notify me" when new people match an open requirement.
5. Import straight from `.xlsx` and from partner portals' exports; a nightly jobs-site sync.
6. Uploaded CVs in object storage (S3/R2/Vercel Blob) instead of the database, once there are many.
7. Roles (read-only access for partners' coordinators, finance-only view of pay).
8. Smarter matching: synonyms learned from accepted submissions, CV text search.
