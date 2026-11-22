// LOCAL ONLY. A minimal copy of the jobs site's tables (public.xdl_jobs_*) so the jobs-site import
// can run against PGlite in development and tests. Column names and types match
// Jobs - FynoLabs/src/schema.sql for every column this app reads.
// This is never run against a real database: openLocalDb() is the only caller.
export const JOBS_STUB_SQL = `
create table if not exists public.xdl_jobs_users (
  id serial primary key,
  email text not null unique,
  name text not null,
  password_hash text,
  is_admin boolean not null default false,
  country text, city text, state text, linkedin_url text, headline text,
  domain text, years_experience int, highest_degree text, field_of_study text, university text,
  hours_per_week int, phone text,
  skills text, languages text,
  created_at timestamptz not null default now()
);
create table if not exists public.xdl_jobs_files (
  id serial primary key,
  user_id int not null references public.xdl_jobs_users(id) on delete cascade,
  kind text not null default 'resume',
  filename text not null,
  mime text not null,
  size int not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create table if not exists public.xdl_jobs_jobs (
  id serial primary key,
  slug text not null unique,
  title text not null,
  domain text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create table if not exists public.xdl_jobs_applications (
  id serial primary key,
  job_id int not null references public.xdl_jobs_jobs(id) on delete cascade,
  user_id int not null references public.xdl_jobs_users(id) on delete cascade,
  status text not null default 'submitted',
  why text not null default '',
  hours_per_week int,
  rate_expectation int,
  resume_file_id int references public.xdl_jobs_files(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, user_id)
);
create table if not exists public.xdl_jobs_screenings (
  application_id int not null references public.xdl_jobs_applications(id) on delete cascade,
  stage int not null,
  answers jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (application_id, stage)
);
`;
