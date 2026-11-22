# Expert Hub: product plan

Written 22 Nov 2026 from Prashant's brief; updated 23 Nov 2026 (Phase 2 built). One platform and one central database of experts, in the app's own Neon project ("expert-hub", the one real environment; every expert record in the shared "Engine" is copied in by `npm run copy:engine`, re-run until the jobs site moves over). It runs the public job board, the expert portal and the admin CRM, so that a new partner requirement can be turned into a job and filled in minutes.

## The flow we are building

1. **A requirement arrives** (Slack Connect channel, email, partner portal). Example: a partner asks for "Scientific Coding Expert, Mathematics, up to 3 people".
2. **An admin creates a job** from it: paste the requirement and the parser fills the form, or start from a job template, or ship it in code for recurring programmes. A job belongs to a partner and, optionally, a project.
3. **Auto-match.** The job page immediately shows the ranked experts already in the database, with the reasons for each (skills, domain, years, country, availability, consent, past results).
4. **Act on the matches.** For each expert: invite them to the job (email now, WhatsApp/Slack later), shortlist, put them forward to the partner, or skip.
5. **Publish to the job board** when the matches aren't enough: one switch makes the job public (or internal-only), with an optional "featured" highlight. New applicants land in the same pipeline.
6. **Pipeline per job:** applied, screening, shortlisted, submitted to partner, partner review, approved, onboarding, active, ended. Every move is logged and can trigger an action (email, Slack post, task).
7. **Placement and pay:** hours or accepted tasks, what the expert earned, what we bill, payouts.

## Who uses it

| Who | Signs in with | Sees |
|---|---|---|
| Experts | Google, LinkedIn or email code | Job board, their profile, applications, projects, earnings, referrals |
| Core team (admin, recruiter, pod lead, finance, viewer) | Google, @xocket.sh only | Everything their role allows |
| Partners (later) | Invite link | Only their jobs and the people put forward to them |

## Expert portal (what AI-training platforms do today)

The pattern on Mercor, Outlier, micro1 and Handshake AI: a light sign-up, a profile that holds the CV and preferences, domain screening, and an onboarding checklist once a person is selected for a project.

- **Sign-up:** Google, LinkedIn, or email with a one-time code.
- **Onboarding steps:** basics, then expertise and skills, then experience and education, then CV upload (parsed to pre-fill), then availability and hours, then rate expectation (private), then consent to share the profile with partners.
- **Profile:** a completeness score, sections they can edit at any time, a public-safe summary for partners, and an optional LinkedIn import.
- **Screening:** short domain assessments per field, with results kept on the profile for reuse.
- **Jobs:** a feed with their best matches first, saved jobs, one-click apply using the profile, and the status of each application.
- **After selection:** a project onboarding checklist (agreement, platform account, guidelines, identity check through the partner flow), then hours or tasks and earnings.
- **Extras:** referrals with tracked links, notifications, and data export or deletion on request.

## Admin CRM: same modules as today, then better

**Parity first.** Everything in the current Lovable admin and the current jobs site works the same way:

- **Lovable admin:** Accounts, Leads and contacts, Calendar, Campaigns and email templates, Experts and expert import, Talent profiles, Jobs (posted), Projects, Platforms and referral links, Referral groups and send referrals, Fees and earnings, My work, Visitor analytics, Settings.
- **Jobs site:** public board with role pages and Google Jobs data, sign-up, onboarding, applications with Screening 1 and 2, interviews, the identity step after selection, referrals, hours, earnings and payouts.

**Scalable patterns** (borrowed from Notion, Zoho CRM and GoHighLevel):

- **Every module is a collection of records with fields.** Standard fields live in columns. Custom fields come from a field registry and are stored in JSONB, so a new field never needs a code change.
- **Many views per collection,** each with its own filters, sorts and grouping:
  - Table
  - Board (grouped by stage or any select field)
  - Calendar (by any date field)
  - Cards or gallery (for expert profiles)
- **Saved views** (Zoho "custom views", GoHighLevel "smart lists") can be personal or shared and stay live as data changes.
- **Pipelines with stages** per job and per account, with drag-and-drop on boards.
- **Relations** link expert, job, partner, project, placement and payout records. Each record page shows the related lists and an activity timeline.
- **Record layouts:** sections per record type, configurable later.
- **Automations:** a stage change or a new record triggers actions (email, Slack message, task, field update).
- **Bulk actions, import with a dry-run preview, and export** (CSV, and a roster with CVs in each partner's format).

## Architecture

- **App:** Next.js (App Router), TypeScript, Drizzle ORM, Tailwind with the FynoLabs design system.
- **Database:** the app's own Neon project ("expert-hub"), with its tables in the `hub` schema. The old `public.xdl_jobs_*` tables in Engine are read by the import (`JOBS_DATABASE_URL`, read-only user) and never written; CVs are copied over. Development and tests use PGlite; changes are tried on a Neon branch before production.
- **Auth:** Auth.js. Experts use Google, LinkedIn or an email code. The team uses Google limited to @xocket.sh. Roles and permissions are checked on every action.
- **Files:** CVs in the database now; object storage (Neon or R2) when volume grows.
- **Email:** Resend. Slack messages go through the Slack API, for internal channels only.

## Design system

The FynoLabs design system, from the website (`Main Website - FyonLabs/src/index.css`) and `Company/Brand/BRAND.md`:

| Element | Value |
|---|---|
| Mode | Light only |
| Font | Inter |
| Text | `hsl(225 19% 12%)`; muted `hsl(225 8% 48%)` |
| Primary | `hsl(222 90% 54%)` (FynoLabs blue, #205FF3 in documents) |
| Borders | `hsl(225 12% 89%)` |
| Soft surfaces | `hsl(60 8% 95%)`; sidebar `hsl(0 0% 98%)` |
| Radius | 4 px |

Generous white space, short labels, and tables over side-by-side columns.

## Phases

| Phase | What ships | Status |
|---|---|---|
| 1 | Internal hub: expert database, requirement matching, partner submissions, placements and pay | Built 22 Nov (v1), with roles, saved views and the FynoLabs design system |
| 2 | Requirement to job to auto-match to invite, plus public job board and expert portal (sign-up, onboarding, profile, apply) | Built 23 Nov: jobs with a form builder (17 field types, templates), public applications merged into the expert record, Matches and invites, job board with Google Jobs data, expert sign-up, onboarding, profile, data export and deletion requests; team app moved to `/admin`. Screening assessments and the longer job pipeline move to Phase 3 |
| 3 | Admin parity with the Lovable admin (accounts, leads, calendar, campaigns, platforms and referrals, projects, fees and earnings, analytics), plus views, saved views, custom fields and automations | After 2 |
| 4 | Cut-over: migrate data from the Lovable admin and the jobs site, move the jobs.fynolabs.si domain, retire the old admin | Started 23 Nov: one environment (expert-hub's main branch); `npm run copy:engine` copies every expert record from Engine (replica in `engine_copy`, everything mapped into `hub`) and is re-run until jobs.fynolabs.si moves over. Lovable admin data, the domain move and retiring the old admin still to do |

## Decisions needed

1. **Expert-facing brand and domain:** FynoLabs (jobs.fynolabs.si stays the public address) or Xocket Data Labs.
2. **Admin address:** for example, hub.fynolabs.si.
3. **ops.xocket.sh:** keep delivery operations (pods, the 4-level review, timesheets) in the existing ops app and connect to it, or bring it into this platform in a later phase.
4. **Engine ownership:** Prashant needs owner access to the Neon project before production.

## Sources

- Notion: [Views, filters, sorts & groups](https://notion.com/help/views-filters-and-sorts); [When to use each type of database view](https://www.notion.com/en-gb/help/guides/when-to-use-each-type-of-database-view)
- Zoho CRM: [Managing module views](https://help.zoho.com/portal/en/kb/crm/customize-crm-account/managing-module-views/articles/module-views); [Creating Kanban views](https://help.zoho.com/portal/en/kb/crm-v2-1/customize-crm-account/managing-module-views/articles/crm-v2-kanban-views)
- GoHighLevel: [Smart Lists in Opportunities](https://help.gohighlevel.com/support/solutions/articles/155000007734)
- Mercor: [Talent docs glossary](https://talent.docs.mercor.com/support/glossary); [AI interview](https://talent.docs.mercor.com/support/ai-interview)
