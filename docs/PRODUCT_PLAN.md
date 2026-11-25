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
| Surfaces | Content in bordered cards with a title bar; number tiles share their borders |
| Status | Soft tints with readable text: green for placed / approved / active / won, amber for waiting or partner review, blue for open, purple for in progress, red for do not contact or rejected, grey for finished |
| Type | Light page titles with a one-line subtitle, 15px section titles, 11px letter-spaced labels, tabular figures |

Generous white space, short labels, and tables over side-by-side columns.

**Expert Hub keeps its own design; the FynoLabs admin gives features, not looks (26 Nov 2026, Prashant).** On 24 Nov the FynoLabs admin's design was copied in class for class (its kit, a 282px sidebar, square corners, uppercase outlined statuses, a dark theme). That wasn't the intent, so the look is Expert Hub's own again, as on 23 Nov, and every screen and feature that came from the FynoLabs admin stays, drawn with the hub's own components (`src/components/ui`; the ported kit in `src/components/admin` is gone).

- **Frame** (`src/components/nav.tsx`, `src/app/admin/layout.tsx`): a 224px sidebar (the FynoLabs mark with "Expert Hub"; groups Workspace · Inbox · Outreach · Talent · Jobs · Money · Settings under small labels; per-section access; the current page kept in view; the public job board at the bottom) and a top bar with where you are (Group / Page), a search field and the account menu (email and role: Settings, Change password, Public job board, Refresh, Sign out). Phones: a menu button opens the same groups. Page titles read "<Page> · Expert Hub". Light only.
- **Search** (Ctrl K, or the field in the top bar): pages, experts, accounts, leads, posted jobs, platforms and messages in one palette; arrow keys and Enter. `GET /api/admin/search` (`src/lib/server/search.ts`, tests in `tests/search.test.ts`) searches only the sections the person may open, masks emails for viewers (and doesn't search by them) and reads no money fields.
- **Dashboard**: the hub's sections plus the FynoLabs numbers and the 30-day trends (`src/components/crm/trend.tsx`, Recharts).
- **Not done yet**: drag and drop on boards; the widest tables scroll sideways on smaller screens.

Screenshots: `docs/screenshots/`.

## Phases

| Phase | What ships | Status |
|---|---|---|
| 1 | Internal hub: expert database, requirement matching, partner submissions, placements and pay | Built 22 Nov (v1), with roles, saved views and the FynoLabs design system |
| 2 | Requirement to job to auto-match to invite, plus public job board and expert portal (sign-up, onboarding, profile, apply) | Built 23 Nov: jobs with a form builder (17 field types, templates), public applications merged into the expert record, Matches and invites, job board with Google Jobs data, expert sign-up, onboarding, profile, data export and deletion requests; team app moved to `/admin`. Real sign-in and sign-up (23 Nov): email + password for the team and experts, email verification, password reset, Team & access with temporary passwords, `npm run admin:create` for the owner; the preview / demo mode is gone. Screening assessments and the longer job pipeline move to Phase 3 |
| 3a | The FynoLabs admin's structure and data in the hub | **Done 23 Nov**: the hub has the same tables as the Lovable admin (companies with owner, stage, next step, due date and activity; contacts; calendar; platforms and referral links; referral groups and sent referrals; projects with tracks, team, documents and fee rules; engagements and monthly earnings; campaigns, templates and the email log; messages and replies; job radar; settings; visitor analytics), one expert per person with every FynoLabs field, a pipeline per person per job with FynoLabs' stages (Applied to Active or Rejected) for every application (public forms, Engine copy, FynoLabs), the expert timeline and documents. `npm run sync:fynolabs` (`Copy FynoLabs data.bat`) copies everything through the `hub-sync` edge function and folds it in, re-runnable until the Lovable admin is retired |
| 3b | Admin parity screens on that structure, plus views, saved views, custom fields and automations | **Built 24 Nov**: the CRM and operations screens (Dashboard, My work, Accounts, Leads, Calendar, Platforms, Projects, Messages, Analytics, Settings → Email replies) and the talent and outreach screens (pipelines, applications, campaigns, referrals, groups, fees, job radar), merged into one admin (tables below) |
| 4 | Cut-over: migrate data from the Lovable admin and the jobs site, move the jobs.fynolabs.si domain, retire the old admin | Started 23 Nov: one environment (expert-hub's main branch); `npm run copy:engine` copies every expert record from Engine (replica in `engine_copy`, everything mapped into `hub`) and is re-run until jobs.fynolabs.si moves over. Lovable admin data, the domain move and retiring the old admin still to do |

## Phase 3b: the admin screens

**Done 24 Nov 2026 (talent and outreach):**

| Screen | What it does |
|---|---|
| **Experts** `/admin/experts` | Stat tiles (experts, new to review, onboarding, active); the hub's search, filters, saved views, columns, matching and CV consent, plus FynoLabs' owner, outreach, next action (due), came from, and pipeline filters (job, project, track, stage); columns Stage (bar), Owner, Outreach, Next action, Came from, Last activity. Layouts: Table, Board (by status) and **Pipelines** (one column per FynoLabs stage, a card per person and job, stage change on the card; Rejected asks why). Bulk: assign owner, set outreach, add or remove tags, add to a job, add to a group, Email them (a draft campaign), Refer them, mark do not contact, add to requirement. Clicking a name opens the side panel (facts, jobs with stage controls, latest activity) with "Open full profile". |
| **Expert page** | Tiles (status, open jobs, documents signed, last activity) and tabs: Profile (everything incl. expert_details, editable owner / outreach / next action / came from / do not contact), **Pipelines** (add to a job; per job: stage with required reject reason, owner, track, next action and due, contract dates), **Timeline** (expert_activities and the audit log, by day; add a note), Documents (status changes write the timeline), Referrals (outcome changes), Engagements & earnings (commission and earnings money-only), Applications (with sources), Submissions & placements. Every stage change writes the timeline and the audit log, keeps status in step (trigger), moves the expert's status (placed while a pipeline is Active) and adds an expected fee when the project has a fee rule for that stage. |
| **Applications** `/admin/applications` | Talent call (the internal "Talent call (FynoLabs)" job) / Job applications / All; New, Handled, All; search; mark handled or open (one or ticked); side panel with what they sent, then "Open full expert". |
| **Send emails** `/admin/campaigns` | Tiles; Campaigns, Templates (create, edit, delete), Send log, Suppressed. New campaign: who (saved view, Experts filters, a job or project with a stage, a group, people picked on Experts) → check who gets it (no email, do not contact incl. other addresses of do-not-contact records, unsubscribed, suppressed are skipped with the reason) → the email (template, merge fields, optional follow-up) → draft. Campaign page: edit the draft, approve, cancel, recipients by status, preview. **Send** says "Email isn't set up yet" (and stays off even then until the unsubscribe page exists). |
| **Send referrals** `/admin/send-referrals`, **Sent referrals** `/admin/referrals` | Platform / project / link (the saved referral link fills in), or a partner's name; method (sign-up link, their form, profile shared, introduction, other; referral email once email is set up); personal note; people by search, a group or picked on Experts (badges: do not contact, no email, no consent, already referred); preview to copy. Profile shares and introductions need consent on record, or the "they agreed" box, which records it on the timeline. Never do not contact; the same place within 30 days is skipped unless repeated on purpose. Sent list: tiles (sent, opened, clicked, working), outcome tabs, filters, bulk outcome with the partner's date; outcomes write the timeline and move the linked pipeline forward. |
| **Groups** `/admin/groups` | Active / inactive; new group; side panel then the group page: rename, status, add by pasted emails (linked to the expert with that email) or by finding experts, remove, delete (admins), Email them, Refer them. |
| **Fees** `/admin/fees` | Admins and finance. Tiles (to invoice, invoiced, overdue, paid, per currency); To invoice, Invoiced, Paid, Void, All (project and month filters, mark invoiced / paid / void, one or ticked; paid and void are final), Totals (by project, payer, month), Fee rules (one per project or track; after saving, add fees for people already past the stage), Earnings (by month, every row, engagements). |
| **Job radar** `/admin/jobs/radar` | New, Approved, Discarded, Published; search, platform, keyword; approve, discard, restore (one or ticked); **Publish as job** makes a hub job as an internal draft (apply link with the referral, company, the listing's pay in the internal rate note); side panel with the apply link. Scan settings shown read-only (scans still run in the FynoLabs admin). The job's Details tab gains the FynoLabs posting fields: company (internal), badge, apply link, project and track, ask for GitHub, pay unit (money). |

Per-section access: `team_members.sections` (the FynoLabs module keys: profiles, referrals, send-referrals, posted-jobs, job-radar, fees) limits a member to those modules (empty = what the role allows; admins everything), in the menu and on the server. No new tables: everything uses migration 0006. Not yet: sending (campaigns, referral emails), drag and drop on the boards, uploading documents from the hub, running a radar scan from the hub.

The rest of the original list:

The data and the rules are in place (Phase 3a); these screens put them in front of the team, with the same list / board / side panel patterns as Experts. Every save sets `updated_by` to the person, so the FynoLabs sync then leaves that record alone.

### Done (24 Nov 2026): CRM and operations

Matched screen by screen to the Lovable admin (`Main Website - FyonLabs/src/pages`). Clicking a row opens a side panel first, with "Open full …"; stacked sections and tabs, no side-by-side layouts; page-size empty states on main pages, one-line ones below.

| Screen | Status | What it does |
|---|---|---|
| **Dashboard** `/admin` | Done | Twelve tiles: the hub's (experts, jobs taking applications, open slots, waiting on partners, active placements) and the FynoLabs admin's (new to review, in a job pipeline, active experts, platforms, open messages, referrals sent, visitors in 30 days); then jobs taking applications, experts by status, open requirements, waiting on partners, active placements, applications / messages / referrals over 30 days, and recent activity. |
| **My work** `/admin/my-work` | Done | Today's list (India time): follow-ups due (own accounts' next steps, contacts' follow-ups, experts' and pipelines' next actions), calendar, to screen, prospects ("Contacted" sets a follow-up in 3 days), no reply, referral links, documents. Admins pick anyone, or Everyone. |
| **Accounts** `/admin/accounts` (+ `[id]`) | Done | Table (stage, then due date) or board (Not contacted, Contacted, Talking, Pilot & active, Parked); tabs Pipeline / Due now / Parked / All; filters type, stage, owner, line, tag, search; side panel; account page with Overview (next step and details), People (add, link, unlink), Activity (log note, email, call, meeting, LinkedIn, task; stage changes logged), Calendar, Jobs & projects (jobs, projects, requirements, referrals). `/admin/partners` redirects here. |
| **Leads** `/admin/leads` | Done | Contacts: person, role, account, stage bar, email / profile, source, next follow-up; tabs Open / Won / Lost / All; filters; board by stage; side panel with edit, link to an account, delete (admins). |
| **Calendar** `/admin/calendar` | Done | Agenda (overdue, 14 days), week and month, India time; kind filter and "Only mine"; events plus read-only next steps, follow-ups and job closing dates; Unscheduled list; create, edit, mark done (a call or meeting with an account is logged there), delete (admins); someone new on their side joins Leads at Call booked. |
| **Platforms** `/admin/platforms` (+ `[id]`) | Done | Tabs All / Platforms / Agencies / No referral link; referral link (copy), jobs page, logo (upload or address), status, notes, reference links; linked accounts and projects; referrals by outcome and the people referred (read only). |
| **Projects** `/admin/projects` (+ `[id]`) | Done | Tabs Active / Planned / Paused or closed / All; project page with facts, People / Achieved / Per week / Target reached, and tabs Pipeline (by stage, 12 weeks), People, Roles (link, unlink), Team, Tracks, Documents, Fee rules (admins and finance only), Partner reports, Details (edit, rules as JSON, delete). |
| **Messages** `/admin/messages` | Done | Tabs All / Open / Handled, search; panel with the message, mark handled / open, reply with saved drafts, previous replies. Sending is off until email is set up ("Email isn't set up yet"): copy, open in the email app, "I sent it" records the reply. |
| **Analytics** `/admin/analytics` | Done | 7 / 30 / 90 days or a date range: visitors, page views, applications, messages; visitors per day by source; applications and messages per day; sources; top landing pages, pages and referrers. |
| **Settings** `/admin/settings` | Done | Email replies (company context, writing style, links, sign-off; starters until saved) and the way to Team & access. Job radar settings live with Job radar. |

Access: each module has a section key (`src/lib/auth/sections.ts`); a team member whose `team_members.sections` is filled in only opens those (the FynoLabs keys count: `leads` opens Accounts, Leads and Calendar, `contact` opens Messages). Editing is admins and recruiters; deleting is admins; fee rules are admins and finance; viewers read with contact details masked.

Still to do on these screens: editing a member's sections on Team & access, drag and drop on the boards (a stage select for now), "Add people" to a project (with the pipeline screens), AI reply drafts.

### The rest of Phase 3b

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
