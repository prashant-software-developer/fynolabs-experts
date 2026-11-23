# Expert Hub: product plan

Written 22 Nov 2026 from Prashant's brief; updated 23 Nov 2026 (Phase 2 built; real sign-in and sign-up, no preview or demo mode). One platform and one central database of experts, in the app's own Neon project ("expert-hub", the one real environment; every expert record in the shared "Engine" is copied in by `npm run copy:engine`, re-run until the jobs site moves over). It runs the public job board, the expert portal and the admin CRM, so that a new partner requirement can be turned into a job and filled in minutes.

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
| Experts | Email + password (email confirmed with a code), or Google / LinkedIn when set up | Job board, their profile, applications, projects, earnings, referrals |
| Core team (admin, recruiter, pod lead, finance, viewer) | Email + password, accounts created by an admin (temporary password, changed at first sign-in); Google when set up | Everything their role allows |
| Partners (later) | Invite link | Only their jobs and the people put forward to them |

## Expert portal (what AI-training platforms do today)

The pattern on Mercor, Outlier, micro1 and Handshake AI: a light sign-up, a profile that holds the CV and preferences, domain screening, and an onboarding checklist once a person is selected for a project.

- **Sign-up:** email and password (a 6-digit code confirms the email before any profile is shown), or Google / LinkedIn.
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
- **Auth:** Auth.js with one accounts table (`hub.accounts`) for every method: email + password (scrypt hashes, lockout, rate limits, emailed codes and reset links), and Google / LinkedIn when their keys are set. Team accounts are created by an admin; experts sign up themselves. Roles and permissions are checked on every action.
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
| 2 | Requirement to job to auto-match to invite, plus public job board and expert portal (sign-up, onboarding, profile, apply) | Built 23 Nov: jobs with a form builder (17 field types, templates), public applications merged into the expert record, Matches and invites, job board with Google Jobs data, expert sign-up, onboarding, profile, data export and deletion requests; team app moved to `/admin`. Real sign-in and sign-up (23 Nov): email + password for the team and experts, email verification, password reset, Team & access with temporary passwords, `npm run admin:create` for the owner; the preview / demo mode is gone. Screening assessments and the longer job pipeline move to Phase 3 |
| 3a | The FynoLabs admin's structure and data in the hub | **Done 23 Nov**: the hub has the same tables as the Lovable admin (companies with owner, stage, next step, due date and activity; contacts; calendar; platforms and referral links; referral groups and sent referrals; projects with tracks, team, documents and fee rules; engagements and monthly earnings; campaigns, templates and the email log; messages and replies; job radar; settings; visitor analytics), one expert per person with every FynoLabs field, a pipeline per person per job with FynoLabs' stages (Applied to Active or Rejected) for every application (public forms, Engine copy, FynoLabs), the expert timeline and documents. `npm run sync:fynolabs` (`Copy FynoLabs data.bat`) copies everything through the `hub-sync` edge function and folds it in, re-runnable until the Lovable admin is retired |
| 3b | Admin parity screens on that structure, plus views, saved views, custom fields and automations | Next (see below) |
| 4 | Cut-over: migrate data from the Lovable admin and the jobs site, move the jobs.fynolabs.si domain, retire the old admin | Started 23 Nov: one environment (expert-hub's main branch); `npm run copy:engine` copies every expert record from Engine (replica in `engine_copy`, everything mapped into `hub`) and is re-run until jobs.fynolabs.si moves over. Lovable admin data, the domain move and retiring the old admin still to do |

## Phase 3b: the admin screens

The data and the rules are in place (Phase 3a); these screens put them in front of the team, with the same list / board / side panel patterns as Experts. Every save sets `updated_by` to the person, so the FynoLabs sync then leaves that record alone.

| Screen | What it shows and does |
|---|---|
| **Companies** `/admin/companies` (today's Partners, grown) | Every company with kind, owner, stage chip, next step, due date chip, best route, tags; table and board by stage; side panel with contacts, activity log (note, call, meeting, email, stage), projects, requirements, jobs and referrals; log an activity; change stage (writes an activity). |
| **Contacts** | People at companies: role, stage, source, email / LinkedIn, next follow-up; filters by company, stage and follow-up due. |
| **Calendar** | One timeline of calls, meetings, follow-ups, deadlines, tasks and posts in India time, beside companies' next steps, pipelines' next actions and job closing dates; mark done (logs it on the company). |
| **Pipelines** | Per job and per project: board by stage (Applied, Shortlisted, Proposed to client, Selected, Documents sent, Signed, Active, Ended, Rejected) with owner, track, next action and reject reason; moving a card writes the timeline; documents due by stage. |
| **Expert page** | Already shows the pipeline stage, timeline and outreach fields; next: edit owner, outreach, next action; documents (send, signed, withdraw); engagements and (money roles) earnings and commission. |
| **Projects** | Code, kind, status, company, platform, target and pace, tracks, team with roles and capacity, rules, documents, fee rules (money roles). |
| **Platforms and referrals** | Platforms with referral links; send referrals (one or a group); sent referrals with method, outcome, opens and clicks; referral groups; referral fees (money roles). |
| **Campaigns** | Templates; bulk emails with approval, follow-up, recipients and their status; the email log; suppressed addresses. |
| **Messages** | Contact-form messages and replies, with drafts; mark handled. |
| **Job radar** | Roles found on other platforms with matched keywords and status; publish one as an internal job. |
| **Analytics** | Visitors and page views per source per day, top pages. |
| **Saved views** | Translate the copied FynoLabs views (`fynolabs_experts`, `fynolabs_submissions`) into hub views. |

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
