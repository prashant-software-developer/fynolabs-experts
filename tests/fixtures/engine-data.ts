// TEST ONLY. A small, fictional Engine: people, jobs, applications, screenings, files (CVs and a tax
// form) and saved jobs, written into the real jobs-site schema (engine-schema.ts).
//   101 Asha: full profile, CRM stage vetted, tags, note, experience, address, payout, tax form, 2 CVs
//   104 the same email as 101 in capitals (merged into Asha)
//   102 Ben: referred by Asha, CRM do_not_contact
//   103 staff (is_admin): never an expert
//   105 Cara: same LinkedIn as Asha, other email (held for review)
//   106 Dev: no applications
export const ENGINE_DATA_SQL = `
insert into public.xdl_jobs_users (id, email, name, password_hash, pw_version, is_admin, country, city, state, linkedin_url, headline, domain,
  years_experience, highest_degree, field_of_study, university, hours_per_week, phone, failed_logins, locked_until, created_at, last_login_at,
  otp_sent_at, reset_sent_at, phone_code_hash, phone_code_exp, phone_code_tries, phone_sends_day, phone_sends_count, phone_sent_at,
  ref_code, referred_by, address_line1, address_line2, postal_code, work_authorized, work_authorized_at, experience, education, no_experience,
  skills, languages, payout_method, payout_handle, tax_form_type, tax_form_at, crm_stage, crm_tags, crm_note)
values
  (101, 'asha@example.org', 'Asha Testperson', 'pbkdf2$secret-hash-101', 3, false, 'India', 'Pune', 'Maharashtra', 'https://linkedin.com/in/Asha-Test', 'Maths PhD', 'STEM',
   6, 'PhD', 'Mathematics', 'IIT Example', 20, '+91 98765 43210', 2, now() + interval '1 hour', '2026-03-01 09:30:00+05:30', '2026-11-20 10:00:00+00',
   now(), now(), 'otp-code-hash-101', now() + interval '10 minutes', 1, '2026-11-20', 3, now(),
   'ASHA1', null, '12 Test Road', 'Flat 4', '411001', true, '2026-04-01 00:00:00+00',
   '[{"title":"Lecturer","company":"Example College","start":"2020-01","current":true,"end":null,"location":"Pune","description":"Taught calculus"}]',
   '[{"school":"IIT Example","degree":"PhD","field":"Mathematics","start_year":2014,"end_year":2019,"grade":null}]', false,
   'Python, LaTeX, numerical methods', 'English, Hindi', 'paypal', 'asha.pay@example.org', 'W-8BEN', '2026-05-01 00:00:00+00',
   'vetted', '{python,Top Expert}', 'Great at proofs'),
  (102, 'ben@example.org', 'Ben Testperson', null, 1, false, 'Kenya', 'Nairobi', null, null, 'Analyst', 'Finance',
   3, 'Master''s', 'Finance', null, 10, null, 0, null, '2026-04-01 00:00:00+00', null,
   null, null, null, null, 0, null, 0, null,
   null, 101, null, null, null, null, null, '[]', '[]', true,
   'Excel', 'English', null, null, null, null, 'do_not_contact', '{}', null),
  (103, 'staff@xocket.sh', 'Staff Person', 'pbkdf2$staff', 1, true, null, null, null, null, null, null,
   null, null, null, null, null, null, 0, null, '2026-01-01 00:00:00+00', null,
   null, null, null, null, 0, null, 0, null, null, null, null, null, null, null, null, '[]', '[]', false,
   null, null, null, null, null, null, null, '{}', null),
  (104, 'ASHA@example.org', 'Asha Testperson', null, 1, false, 'India', null, null, null, null, null,
   null, null, null, null, null, null, 0, null, '2026-02-01 00:00:00+00', null,
   null, null, null, null, 0, null, 0, null, null, null, null, null, null, null, null, '[]', '[]', false,
   null, null, null, null, null, null, null, '{}', null),
  (105, 'cara@example.org', 'Cara Testperson', null, 1, false, 'India', null, null, 'https://www.linkedin.com/in/asha-test', null, null,
   null, null, null, null, null, null, 0, null, '2026-05-01 00:00:00+00', null,
   null, null, null, null, 0, null, 0, null, null, null, null, null, null, null, null, '[]', '[]', false,
   null, null, null, null, null, null, null, '{}', null),
  (106, 'dev.person@example.org', 'Dev Testperson', null, 1, false, 'Brazil', null, null, null, 'Physicist', 'STEM',
   2, null, null, null, null, null, 0, null, '2026-06-01 00:00:00+00', null,
   null, null, null, null, 0, null, 0, null, null, null, null, null, null, null, null, '[]', '[]', false,
   'Physics', null, null, null, null, null, 'new', '{}', null);

insert into public.xdl_jobs_jobs (id, slug, title, domain, employment, location, regions, pay_min, pay_max, pay_unit, hours, summary, description, requirements, status, featured, created_by, created_at, pay_currency, screening2_questions)
values
  (1, 'maths-reviewer', 'Maths Reviewer', 'STEM', 'Contract', 'Remote', 'India, Kenya', 30, 50, 'hour', '10-20 h/week', 'Review proofs.', 'Check maths answers written by AI.', 'PhD in maths', 'open', true, 103, '2026-02-01 00:00:00+00', 'USD', '["Show a proof"]'),
  (2, 'rust-dev', 'Rust Developer', 'Software', 'Part-time', 'Remote', null, null, null, 'hour', null, 'Write Rust.', 'Systems work.', null, 'closed', false, 103, '2026-03-01 00:00:00+00', 'USD', null);

insert into public.xdl_jobs_files (id, user_id, kind, filename, mime, size, data, created_at) values
  (901, 101, 'resume', 'asha_old.pdf', 'application/pdf', 14, convert_to('%PDF-1.4 older', 'UTF8'), '2026-03-01 00:00:00+00'),
  (902, 101, 'resume', 'asha_new.pdf', 'application/pdf', 14, convert_to('%PDF-1.4 newer', 'UTF8'), '2026-10-01 00:00:00+00'),
  (903, 101, 'tax', 'w8ben.pdf', 'application/pdf', 9, convert_to('%PDF tax', 'UTF8'), '2026-05-01 00:00:00+00'),
  (904, 102, 'resume', 'ben.pdf', 'application/pdf', 8, convert_to('%PDF ben', 'UTF8'), '2026-04-02 00:00:00+00'),
  (905, 105, 'resume', 'cara.pdf', 'application/pdf', 9, convert_to('%PDF cara', 'UTF8'), '2026-05-02 00:00:00+00'),
  (906, 103, 'resume', 'staff.pdf', 'application/pdf', 10, convert_to('%PDF staff', 'UTF8'), '2026-01-02 00:00:00+00');

insert into public.xdl_jobs_applications (id, job_id, user_id, status, why, hours_per_week, start_when, rate_expectation, resume_file_id, admin_note, created_at, updated_at) values
  (501, 1, 101, 'reviewing', 'I have taught calculus for six years and love proofs.', 20, 'Immediately', 40, 901, 'Strong maths', '2026-03-02 00:00:00+00', '2026-11-01 00:00:00+00'),
  (502, 2, 101, 'accepted', 'I write Rust at home and want to do it for work.', 10, 'Within 1 week', 35, 902, null, '2026-03-03 00:00:00+00', '2026-03-10 00:00:00+00'),
  (503, 1, 102, 'submitted', 'Finance analyst who also likes maths a lot, honestly.', 10, 'Within a month', null, 904, null, '2026-04-03 00:00:00+00', '2026-04-03 00:00:00+00'),
  (504, 1, 104, 'submitted', 'Second account of the same person applying again here.', 5, null, 20, null, null, '2026-02-02 00:00:00+00', '2026-02-02 00:00:00+00'),
  (505, 1, 105, 'submitted', 'Held for review: shares a LinkedIn link with someone.', 5, null, null, 905, null, '2026-05-03 00:00:00+00', '2026-05-03 00:00:00+00'),
  (506, 2, 103, 'withdrawn', 'Staff testing the application form, please ignore it.', 1, null, null, 906, null, '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00');

insert into public.xdl_jobs_screenings (application_id, stage, answers, submitted_at) values
  (501, 1, '[{"q":"Why AI training?","a":"I like teaching machines."}]', '2026-03-04 00:00:00+00'),
  (501, 2, '[{"q":"Show a proof","a":"Let n be even..."}]', '2026-03-05 00:00:00+00'),
  (503, 1, '[{"q":"Why AI training?","a":"Curious."}]', '2026-04-04 00:00:00+00');

insert into public.xdl_jobs_saved (user_id, job_id, created_at) values (101, 2, '2026-03-02 00:00:00+00'), (102, 1, '2026-04-02 00:00:00+00');
insert into public.xdl_jobs_notifications (user_id, kind, title, body) values (101, 'status', 'In review', 'Your application is in review.');
`;
