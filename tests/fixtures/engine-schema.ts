// TEST ONLY. Engine's jobs-site tables exactly as the jobs site creates them: a verbatim copy of
// Jobs - FynoLabs/src/schema.sql (taken 23 Nov 2026), so the copy is tested against the real
// column names, types, keys and NOT NULLs. Plus a few Engine tables the copy must never read.
export const ENGINE_SCHEMA_SQL = `
create table if not exists xdl_jobs_settings (key text primary key, value text not null);
create table if not exists xdl_jobs_users (
  id serial primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  pw_version int not null default 1,
  is_admin boolean not null default false,
  country text, city text, linkedin_url text, headline text,
  domain text, years_experience int, highest_degree text, field_of_study text, university text,
  hours_per_week int, phone text,
  failed_logins int not null default 0, locked_until timestamptz,
  created_at timestamptz not null default now(), last_login_at timestamptz
);
create table if not exists xdl_jobs_files (
  id serial primary key,
  user_id int not null references xdl_jobs_users(id) on delete cascade,
  kind text not null default 'resume',
  filename text not null,
  mime text not null,
  size int not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists xdl_jobs_files_user_idx on xdl_jobs_files (user_id, kind, created_at desc);
create table if not exists xdl_jobs_jobs (
  id serial primary key,
  slug text not null unique,
  title text not null,
  domain text not null,
  employment text not null default 'Contract',
  location text not null default 'Remote',
  regions text,
  pay_min int, pay_max int, pay_unit text not null default 'hour',
  hours text,
  summary text not null,
  description text not null,
  requirements text,
  status text not null default 'open' check (status in ('open','paused','closed')),
  featured boolean not null default false,
  created_by int references xdl_jobs_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists xdl_jobs_applications (
  id serial primary key,
  job_id int not null references xdl_jobs_jobs(id) on delete cascade,
  user_id int not null references xdl_jobs_users(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted','reviewing','assessment','accepted','rejected','withdrawn')),
  why text not null,
  hours_per_week int,
  start_when text,
  rate_expectation int,
  resume_file_id int references xdl_jobs_files(id) on delete set null,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, user_id)
);
create table if not exists xdl_jobs_admin_invites (
  id serial primary key,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by int references xdl_jobs_users(id),
  used_at timestamptz
);
alter table xdl_jobs_users alter column password_hash drop not null;
alter table xdl_jobs_users add column if not exists auth_user_id uuid;
alter table xdl_jobs_users add column if not exists email_verified_at timestamptz;
alter table xdl_jobs_users add column if not exists otp_sent_at timestamptz;
alter table xdl_jobs_users add column if not exists reset_sent_at timestamptz;
create unique index if not exists xdl_jobs_users_auth_idx on xdl_jobs_users (auth_user_id) where auth_user_id is not null;
create unique index if not exists xdl_jobs_users_phone_key on xdl_jobs_users (phone) where phone is not null
;
alter table xdl_jobs_users add column if not exists linkedin_sub text;
alter table xdl_jobs_users add column if not exists linkedin_name text;
alter table xdl_jobs_users add column if not exists linkedin_connected_at timestamptz;
create unique index if not exists xdl_jobs_users_linkedin_key on xdl_jobs_users (linkedin_sub) where linkedin_sub is not null
;
alter table xdl_jobs_users add column if not exists phone_verified_at timestamptz;
alter table xdl_jobs_users add column if not exists phone_sent_at timestamptz;
alter table xdl_jobs_users add column if not exists phone_sends_day text;
alter table xdl_jobs_users add column if not exists phone_sends_count integer not null default 0;
alter table xdl_jobs_users add column if not exists phone_code_hash text;
alter table xdl_jobs_users add column if not exists phone_code_exp timestamptz;
alter table xdl_jobs_users add column if not exists phone_code_tries integer not null default 0;
alter table xdl_jobs_users add column if not exists ref_code text;
alter table xdl_jobs_users add column if not exists referred_by integer;
create unique index if not exists xdl_jobs_users_ref_key on xdl_jobs_users (ref_code) where ref_code is not null;
alter table xdl_jobs_applications drop constraint if exists xdl_jobs_applications_status_check;
alter table xdl_jobs_applications add constraint xdl_jobs_applications_status_check check (status in ('submitted','reviewing','client_interview','selected','assessment','accepted','rejected','withdrawn'))
;
alter table xdl_jobs_users add column if not exists address_line1 text;
alter table xdl_jobs_users add column if not exists address_line2 text;
alter table xdl_jobs_users add column if not exists state text;
alter table xdl_jobs_users add column if not exists postal_code text;
alter table xdl_jobs_users add column if not exists work_authorized boolean;
alter table xdl_jobs_users add column if not exists work_authorized_at timestamptz
;
alter table xdl_jobs_users add column if not exists experience jsonb not null default '[]'::jsonb;
alter table xdl_jobs_users add column if not exists education jsonb not null default '[]'::jsonb;
alter table xdl_jobs_users add column if not exists no_experience boolean not null default false;
alter table xdl_jobs_users add column if not exists skills text;
alter table xdl_jobs_users add column if not exists languages text
;
create table if not exists xdl_jobs_earnings (
  id serial primary key,
  user_id int not null references xdl_jobs_users(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  work_date date not null,
  note text,
  created_by int references xdl_jobs_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists xdl_jobs_earnings_user_idx on xdl_jobs_earnings (user_id, work_date);
create table if not exists xdl_jobs_commissions (
  id serial primary key,
  earning_id int not null unique references xdl_jobs_earnings(id) on delete cascade,
  referrer_id int not null references xdl_jobs_users(id) on delete cascade,
  referred_id int not null references xdl_jobs_users(id) on delete cascade,
  amount_cents int not null,
  status text not null default 'owed' check (status in ('owed','paid')),
  paid_at timestamptz,
  paid_note text,
  created_at timestamptz not null default now()
);
create index if not exists xdl_jobs_commissions_ref_idx on xdl_jobs_commissions (referrer_id, status);
alter table xdl_jobs_users add column if not exists payout_method text;
alter table xdl_jobs_users add column if not exists payout_handle text;
alter table xdl_jobs_users add column if not exists tax_form_type text;
alter table xdl_jobs_users add column if not exists tax_form_at timestamptz;
alter table xdl_jobs_users add column if not exists identity_status text;
alter table xdl_jobs_users add column if not exists identity_submitted_at timestamptz;
alter table xdl_jobs_users add column if not exists identity_verified_at timestamptz;
alter table xdl_jobs_users add column if not exists identity_note text;
alter table xdl_jobs_users add column if not exists email_notifications boolean not null default true;
alter table xdl_jobs_users add column if not exists alert_domains jsonb;
alter table xdl_jobs_jobs add column if not exists alerted_at timestamptz default now();
alter table xdl_jobs_jobs alter column alerted_at drop default;
create table if not exists xdl_jobs_projects (
  id serial primary key,
  name text not null,
  description text,
  job_id int references xdl_jobs_jobs(id) on delete set null,
  rate_cents int not null check (rate_cents > 0),
  status text not null default 'active' check (status in ('active','closed')),
  created_by int references xdl_jobs_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists xdl_jobs_project_members (
  project_id int not null references xdl_jobs_projects(id) on delete cascade,
  user_id int not null references xdl_jobs_users(id) on delete cascade,
  rate_cents int,
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create table if not exists xdl_jobs_timesheets (
  id serial primary key,
  user_id int not null references xdl_jobs_users(id) on delete cascade,
  project_id int not null references xdl_jobs_projects(id) on delete cascade,
  week_start date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 80),
  note text,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  review_note text,
  reviewed_by int references xdl_jobs_users(id) on delete set null,
  reviewed_at timestamptz,
  earning_id int references xdl_jobs_earnings(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, project_id, week_start)
);
create index if not exists xdl_jobs_timesheets_status_idx on xdl_jobs_timesheets (status, week_start);
create table if not exists xdl_jobs_payouts (
  id serial primary key,
  user_id int not null references xdl_jobs_users(id) on delete cascade,
  amount_cents int not null,
  method text not null,
  handle text,
  reference text,
  created_by int references xdl_jobs_users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table xdl_jobs_earnings add column if not exists payout_id int references xdl_jobs_payouts(id) on delete set null;
create table if not exists xdl_jobs_assessments (
  job_id int primary key references xdl_jobs_jobs(id) on delete cascade,
  title text not null,
  instructions text not null,
  time_limit_min int not null default 60,
  updated_at timestamptz not null default now()
);
create table if not exists xdl_jobs_assessment_attempts (
  id serial primary key,
  application_id int not null unique references xdl_jobs_applications(id) on delete cascade,
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  submitted_at timestamptz,
  answer text,
  late boolean not null default false,
  score int check (score between 1 and 5),
  review_note text,
  reviewed_at timestamptz
);
create table if not exists xdl_jobs_interviews (
  id serial primary key,
  application_id int not null unique references xdl_jobs_applications(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  score int,
  summary text,
  strengths jsonb,
  concerns jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists xdl_jobs_notifications (
  id serial primary key,
  user_id int not null references xdl_jobs_users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  emailed_at timestamptz,
  email_error text,
  created_at timestamptz not null default now()
);
create index if not exists xdl_jobs_notifications_user_idx on xdl_jobs_notifications (user_id, created_at desc);
create table if not exists xdl_jobs_saved (
  user_id int not null references xdl_jobs_users(id) on delete cascade,
  job_id int not null references xdl_jobs_jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
)
;
alter table xdl_jobs_jobs add column if not exists screening2_questions jsonb;
alter table xdl_jobs_jobs add column if not exists pay_currency text not null default 'USD';
create table if not exists xdl_jobs_screenings (
  application_id int not null references xdl_jobs_applications(id) on delete cascade,
  stage int not null check (stage in (1,2)),
  answers jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (application_id, stage)
);
alter table xdl_jobs_users add column if not exists crm_stage text;
alter table xdl_jobs_users add column if not exists crm_tags text[] not null default '{}';
alter table xdl_jobs_users add column if not exists crm_note text;
`;

/** Other things in Engine that must stay out of the copy (logins, CRM, other apps). */
export const ENGINE_OTHER_SQL = `
create schema if not exists neon_auth;
create table if not exists neon_auth.session (id text primary key, token text not null, user_id text not null);
insert into neon_auth.session values ('s1', 'secret-session-token', 'u1');
create table if not exists public.xdl_jobs_bundle_items (id serial primary key, name text not null);
insert into public.xdl_jobs_bundle_items (name) values ('bundle');
create table if not exists public.xdl_crm_contacts (id serial primary key, email text not null);
insert into public.xdl_crm_contacts (email) values ('crm.person@example.net');
create table if not exists public.leads (id serial primary key, company text not null);
insert into public.leads (company) values ('Lead Co');
insert into public.xdl_jobs_settings (key, value) values ('screening1_questions', '["Why AI training?"]');
insert into public.xdl_jobs_admin_invites (token_hash, expires_at) values ('invite-token-hash', now() + interval '1 day');
`;
