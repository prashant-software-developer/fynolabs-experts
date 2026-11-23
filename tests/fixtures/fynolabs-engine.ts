// TEST ONLY. A small Engine (the old jobs site) with two people FynoLabs also has: Asha (same email,
// other capitals) and Chen (same LinkedIn; FynoLabs has no email for him), plus a staff account.
export const ENGINE_PEOPLE_SQL = `
insert into xdl_jobs_users (id, email, name, is_admin, country, city, linkedin_url, headline, domain, years_experience, highest_degree, university, hours_per_week, phone, skills, languages, created_at) values
  (1, 'staff@xocket.sh', 'Staff', true, null, null, null, null, null, null, null, null, null, null, null, null, '2026-09-01T00:00:00Z'),
  (2, 'Asha.Rao@example.com', 'Asha R', false, 'India', 'Bangalore', 'linkedin.com/in/asha-rao', 'ML engineer', 'Software', 5, 'Masters', 'IISc', 10, null, 'Python', 'English', '2026-09-10T00:00:00Z'),
  (3, 'chen.wei@example.com', 'Chen Wei', false, 'Singapore', null, 'https://linkedin.com/in/chen-wei', 'Researcher', 'Physics', 9, 'PhD', 'NUS', null, null, 'Mathematica, Python', null, '2026-09-12T00:00:00Z');
select setval(pg_get_serial_sequence('xdl_jobs_users', 'id'), 10);
insert into xdl_jobs_jobs (id, slug, title, domain, summary, description, status) values (1, 'ml-evals', 'ML evals', 'Software', 'Evals', 'Write evals', 'open');
insert into xdl_jobs_applications (id, job_id, user_id, status, why) values (1, 1, 2, 'reviewing', 'I like evals');
`;
