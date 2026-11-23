// TEST ONLY. Fictional FynoLabs admin data (example.com people), small but touching every table:
// one person in both FynoLabs and Engine (Asha), one only in FynoLabs with a full pipeline (Ben),
// one matched by LinkedIn only (Chen), applicants without a profile (Dana, Farid), and one person
// the hub deleted on request (Eve), whose rows must never reach the hub.
export const U = {
  prashant: "a0000000-0000-4000-8000-000000000001",
  nitin: "a0000000-0000-4000-8000-000000000002",
  oldLogin: "a0000000-0000-4000-8000-000000000003",
};
export const P = {
  asha: "b0000000-0000-4000-8000-000000000001",
  ben: "b0000000-0000-4000-8000-000000000002",
  chen: "b0000000-0000-4000-8000-000000000003",
  eve: "b0000000-0000-4000-8000-000000000004",
};
export const C = { acme: "c0000000-0000-4000-8000-000000000001", beta: "c0000000-0000-4000-8000-000000000002" };
export const PLAT = "d0000000-0000-4000-8000-000000000001";
export const L = { lena: "e0000000-0000-4000-8000-000000000001", omar: "e0000000-0000-4000-8000-000000000002" };
export const PR = { p101: "f0000000-0000-4000-8000-000000000001", track: "f0000000-0000-4000-8000-000000000011", member: "f0000000-0000-4000-8000-000000000021", doc: "f0000000-0000-4000-8000-000000000031", fee: "f0000000-0000-4000-8000-000000000041" };
export const J = { rust: "10000000-0000-4000-8000-000000000001", draft: "10000000-0000-4000-8000-000000000002" };
export const JA = { ben: "11000000-0000-4000-8000-000000000001", dana: "11000000-0000-4000-8000-000000000002", asha: "11000000-0000-4000-8000-000000000003", eve: "11000000-0000-4000-8000-000000000004" };
export const TA = { asha: "12000000-0000-4000-8000-000000000001", farid: "12000000-0000-4000-8000-000000000002" };
export const ENG = "13000000-0000-4000-8000-000000000001";
export const CAMP = "14000000-0000-4000-8000-000000000001";
export const MSG = "15000000-0000-4000-8000-000000000001";
export const LINK = "16000000-0000-4000-8000-000000000001";

/** The stored files: bucket, object name, bytes (as text). Eve's CV must never be copied. */
export const FILES = [
  { id: "17000000-0000-4000-8000-000000000001", bucket: "job-resumes", name: `${J.rust}/${JA.ben}.pdf`, body: "%PDF-1.4 Ben's CV" },
  { id: "17000000-0000-4000-8000-000000000002", bucket: "talent-resumes", name: `${TA.asha}.pdf`, body: "%PDF-1.4 Asha's CV (talent call)" },
  { id: "17000000-0000-4000-8000-000000000003", bucket: "expert-documents", name: `${P.ben}/nda.pdf`, body: "%PDF-1.4 Ben's NDA" },
  { id: "17000000-0000-4000-8000-000000000004", bucket: "expert-documents", name: `${P.ben}/nda-signed.pdf`, body: "%PDF-1.4 Ben's NDA, signed" },
  { id: "17000000-0000-4000-8000-000000000005", bucket: "talent-resumes", name: `eve/${P.eve}.pdf`, body: "%PDF-1.4 Eve's CV" },
];

export const FYNOLABS_DATA_SQL = `
insert into auth.users (id, email, encrypted_password, phone, confirmation_token, raw_user_meta_data, last_sign_in_at) values
  ('${U.prashant}', 'prashant@xocket.sh', 'secret-hash-1', '+910000000001', 'tok-1', '{"full_name": "Prashant"}', '2026-11-20T10:00:00Z'),
  ('${U.nitin}', 'nitin@example.com', 'secret-hash-2', null, null, '{"name": "Nitin Singh"}', null),
  ('${U.oldLogin}', 'old.login@example.com', 'secret-hash-3', null, null, '{}', null);
insert into public.team_members (user_id, email, name, invited_by, sections) values
  ('${U.prashant}', 'prashant@xocket.sh', 'Prashant', null, array['contact','talent','profiles','leads']),
  ('${U.nitin}', 'Nitin@Example.com', 'Nitin Singh', '${U.prashant}', array['talent','profiles']);
insert into public.user_roles (user_id, role) values ('${U.prashant}', 'admin');

insert into public.org_logos (id, name, kind, domain, referral_url, notes, reference_links) values
  ('${PLAT}', 'Acme Platform', 'both', 'acme.example', 'https://acme.example/r/fyno', 'Pays weekly', '[{"label":"Guide","url":"https://acme.example/guide"}]');
insert into public.accounts (id, name, business_line, kind, stage, priority, owner_id, owner_name, next_step, next_step_due, best_route, website_url, domain, location, platform_id, tags, notes) values
  ('${C.acme}', 'Acme Data', 'ai_training', 'partner', 'talking', 'high', '${U.nitin}', null, 'Send the pilot plan', '2026-11-25', 'Email Lena', 'https://acme.example', 'acme.example', 'San Francisco', '${PLAT}', array['pilot','rust'], 'Warm intro via Boardy'),
  ('${C.beta}', 'Beta Agency', 'both', 'marketplace', 'contacted', 'normal', null, 'Common (team)', null, null, null, null, null, null, null, '{}', null);
insert into public.leads (id, name, company, role, kind, stage, source, email, next_follow_up, notes, account_id, created_by) values
  ('${L.lena}', 'Lena Park', 'Acme Data', 'Head of Ops', 'partner', 'call', 'linkedin', 'lena@acme.example', '2026-11-26', 'Prefers email', '${C.acme}', '${U.nitin}'),
  ('${L.omar}', 'Omar Haddad', 'Gamma', 'Founder', 'client', 'new', 'event', null, null, null, null, null);
insert into public.account_activities (account_id, lead_id, kind, summary, detail, happened_at, created_by) values
  ('${C.acme}', '${L.lena}', 'call', 'Intro call', 'They need 20 Rust experts', '2026-11-18T09:30:00Z', '${U.nitin}'),
  ('${C.acme}', null, 'stage', 'Stage: contacted -> talking', null, '2026-11-18T10:00:00Z', '${U.prashant}');
insert into public.calendar_events (title, kind, status, event_date, start_time, end_time, account_id, lead_id, meeting_url, team_ids, lead_ids, created_by) values
  ('Acme pilot call', 'call', 'planned', '2026-11-25', '18:30', '19:00', '${C.acme}', '${L.lena}', 'https://meet.example/abc', array['${U.nitin}']::uuid[], array['${L.lena}']::uuid[], '${U.nitin}');

insert into public.import_batches (id, kind, label, total, created) values ('18000000-0000-4000-8000-000000000001', 'experts', 'Register Nov', 3, 2);
insert into public.talent_profiles (id, name, email, phone, location, headline, skills, links, notes, status, default_commission_percent, source, resume_path, linkedin_url, country, region, city, timezone, field, seniority, years_experience, education, university, languages, hours_per_week, tags, owner_id, source_detail, source_account_id, import_batch_id, attributes, outreach_status, last_contacted_at, next_action, next_action_due, consented_at, consent_source, do_not_contact, email_opt_out, created_at) values
  ('${P.asha}', 'Asha Rao', 'Asha.Rao@Example.com', '+91 98765 43210', 'Bengaluru, India', 'Senior ML engineer', 'Python, PyTorch, Rust', 'https://github.com/asharao', 'Strong on evals', 'bench', 15, 'talent_call', 'talent-resumes/${TA.asha}.pdf', 'https://www.linkedin.com/in/asha-rao/', 'IN', 'Karnataka', 'Bengaluru', 'Asia/Kolkata', 'Software engineering', 'senior', 7, 'masters', 'IISc', array['English','Hindi'], 20, array['rust','evals'], '${U.nitin}', 'Talent call, Oct', '${C.beta}', '18000000-0000-4000-8000-000000000001', '{"github_stars": 120}', 'interested', '2026-11-10T08:00:00Z', 'Send P101 brief', '2026-11-24', '2026-10-14T12:00:00Z', 'talent_call', false, false, '2026-10-14T12:00:00Z'),
  ('${P.ben}', 'Ben Okafor', 'ben.okafor@example.com', null, 'Lagos', 'Rust engineer', 'Rust; Go', null, null, 'active', 10, 'job', null, 'linkedin.com/in/ben-okafor', 'NG', null, 'Lagos', null, 'Software', 'mid', 5, 'bachelors', null, '{}', 30, '{}', '${U.prashant}', null, null, null, '{}', 'applied', null, null, null, '2026-11-01T12:00:00Z', 'applied', false, true, '2026-11-01T12:00:00Z'),
  ('${P.chen}', 'Chen Wei', null, null, null, 'Physicist', 'Mathematica', null, null, 'new', 0, 'sourced', null, 'https://linkedin.com/in/chen-wei', 'SG', null, null, null, 'Physics', null, null, 'phd', null, '{}', null, '{}', null, null, null, null, '{}', 'contacted', null, null, null, null, null, false, false, '2026-11-02T12:00:00Z'),
  ('${P.eve}', 'Eve Gone', 'eve@example.com', null, null, 'Erased person', 'Java', null, 'Must not come back', 'new', 0, 'manual', 'talent-resumes/eve/${P.eve}.pdf', null, null, null, null, null, null, null, null, null, null, '{}', null, '{}', null, null, null, null, '{}', null, null, null, null, null, null, false, false, '2026-11-03T12:00:00Z');
update public.talent_profiles set referred_by_id = '${P.asha}' where id = '${P.ben}';

insert into public.projects (id, code, name, kind, status, account_id, platform_id, referral_url, owner_id, target_count, starts_on, countries, rules, discord, description) values
  ('${PR.p101}', 'P101', 'Rust coding', 'managed', 'active', '${C.acme}', '${PLAT}', 'https://acme.example/r/p101', '${U.nitin}', 20, '2026-11-15', array['IN','NG'], '{"min_years": 3}', 'P101 · Rust', 'Rust tasks for an AI data partner');
insert into public.project_tracks (id, project_id, name, target_count, position) values ('${PR.track}', '${PR.p101}', 'Senior', 10, 0);
insert into public.project_members (id, project_id, user_id, role, capacity) values ('${PR.member}', '${PR.p101}', '${U.nitin}', 'lead', 30);
insert into public.project_documents (id, project_id, kind, title, required_stage) values ('${PR.doc}', '${PR.p101}', 'nda', 'NDA', 'selected');
insert into public.project_fee_rules (id, project_id, track_id, amount, currency, earned_at_stage) values ('${PR.fee}', '${PR.p101}', '${PR.track}', 150.00, 'USD', 'active');

insert into public.job_listings (id, platform, org_id, external_id, title, company, url, pay_min, pay_max, pay_period, status, matched_keywords) values
  ('19000000-0000-4000-8000-000000000001', 'acme', '${PLAT}', 'A-1', 'Rust reviewer', 'Acme', 'https://acme.example/jobs/1', 40, 60, 'hour', 'new', array['rust']),
  ('19000000-0000-4000-8000-000000000002', 'acme', '${PLAT}', 'A-2', 'Math tutor', 'Acme', 'https://acme.example/jobs/2', null, null, null, 'ignored', '{}');
insert into public.job_scan_settings (id, keywords, min_pay) values (true, array['rust','math'], 30);
insert into public.posted_jobs (id, slug, title, company, pay, location, job_type, summary, responsibilities, requirements, closes_on, status, apply_url, source_listing_id, require_github, pay_unit, badge, project_id, track_id, visibility) values
  ('${J.rust}', 'rust-engineer', 'Rust engineer', 'Acme Data', '$50/hour', 'Remote', 'hourly', 'Write and review Rust tasks.', 'Write tasks.', '3+ years of Rust.', '2026-12-31', 'open', null, '19000000-0000-4000-8000-000000000001', true, 'hour', 'New', '${PR.p101}', '${PR.track}', 'public'),
  ('${J.draft}', 'math-tutor', 'Math tutor', null, null, null, 'part-time', null, null, null, null, 'draft', null, null, false, 'task', null, null, null, 'internal');

insert into public.job_applications (id, job_id, name, email, link, note, resume_path, status, github_url, consent_version, consent_at, profile_id, stage_changed_at, started_on, owner_id, track_id, source, screening, eligible, next_action, next_action_due, reject_reason, created_at) values
  ('${JA.ben}', '${J.rust}', 'Ben Okafor', 'ben.okafor@example.com', 'https://linkedin.com/in/ben-okafor', 'Happy to start Monday', '${J.rust}/${JA.ben}.pdf', 'selected', 'https://github.com/benok', '2026-10-14', '2026-11-01T12:00:00Z', '${P.ben}', '2026-11-12T12:00:00Z', null, '${U.nitin}', '${PR.track}', 'applied', '{"rust_years": 5}', true, 'Send NDA', '2026-11-24', null, '2026-11-01T12:00:00Z'),
  ('${JA.dana}', '${J.rust}', 'Dana Cruz', 'Dana.Cruz@example.com', null, null, null, 'new', null, '2026-10-14', '2026-11-20T12:00:00Z', null, '2026-11-20T12:00:00Z', null, null, null, 'applied', '{}', null, null, null, null, '2026-11-20T12:00:00Z'),
  ('${JA.asha}', '${J.rust}', 'Asha Rao', 'asha.rao@example.com', null, null, null, 'rejected', null, null, null, '${P.asha}', '2026-11-15T12:00:00Z', null, null, null, 'sourced', '{}', false, null, null, 'location', '2026-11-05T12:00:00Z'),
  ('${JA.eve}', '${J.rust}', 'Eve Gone', 'eve@example.com', null, null, null, 'new', null, null, null, '${P.eve}', '2026-11-05T12:00:00Z', null, null, null, 'applied', '{}', null, null, null, null, '2026-11-05T12:00:00Z');
insert into public.talent_applications (id, name, email, location, role, skills, projects, links, availability, notes, handled_at, handled_by, consent_version, consent_at, resume_path, profile_id, created_at) values
  ('${TA.asha}', 'Asha Rao', 'asha.rao@example.com', 'Bengaluru', 'ML engineer', 'Python, Rust', 'Eval harness', 'https://github.com/asharao', '20 h/week', null, '2026-10-15T09:00:00Z', '${U.prashant}', '2026-10-14', '2026-10-14T12:00:00Z', '${TA.asha}.pdf', '${P.asha}', '2026-10-14T12:00:00Z'),
  ('${TA.farid}', 'Farid Nasser', 'farid@example.com', 'Cairo', 'Data scientist', 'R, SQL', null, null, 'Evenings', 'Found us on Reddit', null, null, '2026-10-14', '2026-11-19T12:00:00Z', null, null, '2026-11-19T12:00:00Z');
update public.talent_profiles set application_id = '${TA.asha}' where id = '${P.asha}';

insert into public.expert_activities (profile_id, application_id, kind, summary, detail, happened_at, created_by) values
  ('${P.ben}', '${JA.ben}', 'application', 'Applied to Rust engineer', null, '2026-11-01T12:00:00Z', null),
  ('${P.ben}', '${JA.ben}', 'stage', 'Stage: Shortlisted -> Selected', null, '2026-11-12T12:00:00Z', '${U.nitin}'),
  ('${P.ben}', null, 'note', 'Call went well', 'Strong on async Rust', '2026-11-11T12:00:00Z', '${U.nitin}'),
  ('${P.asha}', null, 'consent', 'Consent recorded (talent call)', null, '2026-10-14T12:00:00Z', null),
  ('${P.eve}', null, 'note', 'Eve note', 'must not come back', '2026-11-03T12:00:00Z', null);
insert into public.expert_documents (profile_id, application_id, kind, title, status, file_path, signed_path, sent_to, sent_at, signed_at, requirement_id) values
  ('${P.ben}', '${JA.ben}', 'nda', 'NDA', 'signed', '${P.ben}/nda.pdf', '${P.ben}/nda-signed.pdf', 'ben.okafor@example.com', '2026-11-12T13:00:00Z', '2026-11-13T09:00:00Z', '${PR.doc}');
insert into public.expert_invites (profile_id, job_id, opened_at) values ('${P.asha}', '${J.rust}', '2026-11-04T10:00:00Z');

insert into public.talent_engagements (id, profile_id, platform, agency, project, status, commission_percent, started_on) values
  ('${ENG}', '${P.ben}', 'Acme Platform', null, 'P101', 'active', 10, '2026-11-15');
insert into public.talent_monthly_earnings (engagement_id, profile_id, month, gross_inr, commission_inr) values ('${ENG}', '${P.ben}', '2026-11-01', 50000, 5000);
insert into public.talent_referrals (profile_id, org_id, platform, referral_url, recipient_email, recipient_name, status, method, project_id, application_id, account_id, outcome, open_count, engagement_id, submitted_by) values
  ('${P.ben}', '${PLAT}', 'Acme Platform', 'https://acme.example/r/fyno', 'ben.okafor@example.com', 'Ben', 'sent', 'email', '${PR.p101}', '${JA.ben}', '${C.acme}', 'active', 3, '${ENG}', '${U.nitin}'),
  ('${P.asha}', null, 'Other platform', null, 'asha.rao@example.com', 'Asha', 'sent', 'profile_share', null, null, '${C.acme}', 'in_review', 0, null, '${U.prashant}'),
  ('${P.eve}', null, 'Other platform', 'https://x.example', 'eve@example.com', 'Eve', 'sent', 'email', null, null, null, 'sent', 0, null, null);
insert into public.referral_fees (project_id, account_id, rule_id, application_id, profile_id, job_id, person_name, amount, currency, status, earned_on) values
  ('${PR.p101}', '${C.acme}', '${PR.fee}', '${JA.ben}', '${P.ben}', '${J.rust}', 'Ben Okafor', 150, 'USD', 'expected', '2026-11-16');
insert into public.referral_groups (id, name) values ('1a000000-0000-4000-8000-000000000001', 'Rust bench');
insert into public.referral_group_members (group_id, email, name) values
  ('1a000000-0000-4000-8000-000000000001', 'ben.okafor@example.com', 'Ben'),
  ('1a000000-0000-4000-8000-000000000001', 'someone@example.com', null);
insert into public.tracked_links (id, code, label, target_url, channel, project_id, job_id, org_id, account_id, clicks) values
  ('${LINK}', 'rust-li', 'Rust job on LinkedIn', 'https://fynolabs.si/jobs/rust-engineer', 'linkedin', '${PR.p101}', '${J.rust}', '${PLAT}', '${C.acme}', 7);
insert into public.tracked_link_clicks (link_id, day, clicks) values ('${LINK}', '2026-11-20', 4), ('${LINK}', '2026-11-21', 3);

insert into public.email_templates (id, name, kind, subject, body) values ('1b000000-0000-4000-8000-000000000001', 'P101 invite', 'invite', 'A Rust role', 'Hi {first_name}');
insert into public.email_campaigns (id, name, kind, template_id, subject, body, job_id, project_id, status, recipient_count, created_by, approved_by) values
  ('${CAMP}', 'Rust invite', 'outreach', '1b000000-0000-4000-8000-000000000001', 'A Rust role', 'Hi', '${J.rust}', '${PR.p101}', 'done', 2, '${U.nitin}', '${U.prashant}');
insert into public.email_campaign_recipients (campaign_id, profile_id, email, status, sent_at) values
  ('${CAMP}', '${P.asha}', 'asha.rao@example.com', 'sent', '2026-11-19T10:00:00Z'),
  ('${CAMP}', '${P.ben}', 'ben.okafor@example.com', 'skipped', null);
insert into public.email_send_log (template_name, recipient_email, status, metadata) values ('campaign', 'asha.rao@example.com', 'sent', '{"campaign": "rust"}'), ('digest', 'prashant@xocket.sh', 'sent', null);
insert into public.email_send_state (id, batch_size) values (1, 10);
insert into public.suppressed_emails (email, reason) values ('nomore@example.com', 'unsubscribe');
insert into public.email_unsubscribe_tokens (token, email) values ('raw-token-1', 'nomore@example.com');

insert into public.contact_submissions (id, name, email, message, handled_at, handled_by) values ('${MSG}', 'Gail Ross', 'gail@example.com', 'Do you staff physicists?', '2026-11-21T10:00:00Z', '${U.prashant}');
insert into public.admin_replies (source_type, source_id, recipient_email, subject, body, status, sent_by) values
  ('contact', '${MSG}', 'gail@example.com', 'Re: physicists', 'Yes we do', 'sent', '${U.prashant}'),
  ('job', '${JA.ben}', 'ben.okafor@example.com', 'Next steps', 'NDA attached', 'sent', '${U.nitin}');
insert into public.reply_drafts (source_type, source_id, subject, body) values ('talent', '${TA.farid}', 'Thanks', 'Draft reply');
insert into public.saved_views (owner_id, name, kind, filters, sort, shared) values ('${U.prashant}', 'Rust bench', 'experts', '{"status": ["bench"], "q": "rust"}', 'activity', true);
insert into public.audit_log (happened_at, actor, table_name, row_id, action, changes) values
  ('2026-11-18T10:00:00Z', '${U.prashant}', 'accounts', '${C.acme}', 'update', '{"stage": {"old": "contacted", "new": "talking"}}'),
  ('2026-11-12T12:00:00Z', '${U.nitin}', 'job_applications', '${JA.ben}', 'update', '{"status": {"old": "shortlisted", "new": "selected"}}'),
  ('2026-11-05T12:00:00Z', null, 'talent_profiles', '${P.eve}', 'insert', null);
insert into public.admin_settings (key, value) values ('digest_recipients', 'prashant@xocket.sh'), ('radar_enabled', 'true');
insert into public.privacy_log (email_hash, reason, records) values (md5('gone@example.com'), 'Asked by email', '{"profiles": 1}');
insert into public.partner_reports (project_id, account_id, label, period_start, period_end, signups, qualified, active, rows_total, matched) values ('${PR.p101}', '${C.acme}', 'Nov report', '2026-11-01', '2026-11-30', 5, 3, 2, 5, 4);
insert into public.visitor_pageviews (session_id, source, referrer_host, landing_path, page_path, created_at) values
  ('1c000000-0000-4000-8000-000000000001', 'linkedin', 'linkedin.com', '/', '/', '2026-11-20T08:00:00Z'),
  ('1c000000-0000-4000-8000-000000000001', 'linkedin', 'linkedin.com', '/', '/jobs', '2026-11-20T08:01:00Z'),
  ('1c000000-0000-4000-8000-000000000002', 'google', 'google.com', '/learn', '/learn', '2026-11-20T09:00:00Z'),
  ('1c000000-0000-4000-8000-000000000003', 'direct', null, '/', '/', '2026-11-21T09:00:00Z'),
  ('1c000000-0000-4000-8000-000000000003', 'direct', null, '/', '/contact', '2026-11-21T09:02:00Z');
insert into public.visitor_source_daily (visit_date, source, visitors, page_views) values ('2026-11-20', 'linkedin', 1, 2), ('2026-11-20', 'google', 1, 1);
insert into public.visitor_source_sessions (visit_date, source, session_id) values
  ('2026-11-20', 'linkedin', '1c000000-0000-4000-8000-000000000001'), ('2026-11-20', 'google', '1c000000-0000-4000-8000-000000000002'), ('2026-11-21', 'direct', '1c000000-0000-4000-8000-000000000003');
`;

/** storage.objects rows for FILES (the bytes are served by the fake storage). */
export const STORAGE_SQL = `insert into storage.objects (id, bucket_id, name, metadata) values ${FILES.map((f) => `('${f.id}', '${f.bucket}', '${f.name}', '{"mimetype": "application/pdf", "size": ${f.body.length}}')`).join(", ")};`;
