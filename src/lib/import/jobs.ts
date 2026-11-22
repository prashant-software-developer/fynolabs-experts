// Maps a jobs-site user (public.xdl_jobs_users) and their applications to an expert draft.
import { normalizeCountry, normalizeDomain, splitSkills } from "@/lib/match/dictionary";
import { cleanText, normalizeEmail, normalizeLinkedin, normalizePhone, splitList, toInt } from "@/lib/normalize";
import type { ExpertStatus } from "@/lib/constants";
import { emptyDraft, type DraftRow } from "./types";

export type JobsUser = {
  id: number;
  email: string;
  name: string;
  country: string | null;
  city: string | null;
  state: string | null;
  linkedin_url: string | null;
  headline: string | null;
  domain: string | null;
  years_experience: number | null;
  highest_degree: string | null;
  field_of_study: string | null;
  university: string | null;
  hours_per_week: number | null;
  phone: string | null;
  skills: string | null;
  languages: string | null;
};

export type JobsApplication = { user_id: number; status: string; rate_expectation: number | null; created_at: Date | string; title: string };

/** Furthest stage reached on the jobs site -> starting status here. */
export function statusFromApplications(apps: JobsApplication[]): ExpertStatus {
  const s = new Set(apps.map((a) => a.status));
  if (s.has("accepted") || s.has("selected")) return "bench";
  if (s.has("assessment") || s.has("reviewing") || s.has("client_interview")) return "screening";
  return "applicant";
}

export function mapJobsUser(u: JobsUser, apps: JobsApplication[]): DraftRow {
  const d = emptyDraft();
  const warnings: string[] = [];
  d.fullName = cleanText(u.name, 200);
  d.email = normalizeEmail(u.email);
  if (!d.email) warnings.push("Email not valid");
  d.phone = normalizePhone(u.phone);
  d.country = normalizeCountry(u.country);
  d.region = cleanText(u.state, 80);
  d.city = cleanText(u.city, 80);
  d.linkedinUrl = normalizeLinkedin(u.linkedin_url);
  d.headline = cleanText(u.headline, 200);
  d.domain = u.domain ? normalizeDomain(u.domain) : null;
  d.skills = splitSkills(u.skills);
  d.languages = splitList(u.languages, 20);
  d.yearsExperience = u.years_experience != null ? toInt(u.years_experience, 0, 70) : null;
  d.highestDegree = cleanText(u.highest_degree, 120);
  d.fieldOfStudy = cleanText(u.field_of_study, 120);
  d.university = cleanText(u.university, 160);
  d.hoursPerWeek = u.hours_per_week != null ? toInt(u.hours_per_week, 0, 80) : null;
  const sorted = [...apps].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  d.rateExpectationUsd = sorted.find((a) => a.rate_expectation != null)?.rate_expectation ?? null;
  d.status = apps.length ? statusFromApplications(apps) : "applicant";
  d.tags = ["jobs-site"];
  return { row: u.id, source: "jobs_site", externalId: String(u.id), draft: d, warnings };
}
