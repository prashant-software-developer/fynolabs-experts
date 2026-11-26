// Expert portal Profile (/me/profile): the six tabs (Resume, Location & work authorization,
// Availability, Work preferences, Communications, Account). Reads and writes only the signed-in
// expert's own record (the id comes from the session, src/lib/auth/expert.ts). Experts write their
// own details into experts and expert_details; expert_details.updated_by = 'expert-portal' then tells
// the Engine copy to leave those fields alone. Tested in tests/portal-profile.test.ts.
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { expertDetails, expertFiles, experts, type CertificationItem, type CommPrefs, type EducationItem, type ExperienceItem, type ProjectItem, type WeeklyHours } from "@/db/schema";
import { AVAILABILITY, DOMAINS, START_AVAILABILITY, WEEKDAYS, isOneOf } from "@/lib/constants";
import { toCountryName } from "@/lib/countries";
import { splitSkills } from "@/lib/match/dictionary";
import { cleanLongText, cleanText, normalizeLinkedin, normalizePhone, splitList, toInt } from "@/lib/normalize";
import { logActivity, type Actor } from "./activity";
import { completedCourses } from "./learn";
import { completeness, openDeletionRequest, ownCv, ownProfile } from "./portal";

const PORTAL_ACTOR: Actor = { email: "expert-portal", role: "expert" };
const BY = "expert-portal";
const MAX_ITEMS = 20;

export type SaveResult = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): SaveResult => ({ ok: false, error });
const done = (message: string): SaveResult => ({ ok: true, message });
const v = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const on = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "yes" || fd.get(k) === "true";

/** Everything the six tabs show. */
export async function profileData(db: DB, expertId: string) {
  const [profile, cv, deletion, certificates, extra, details] = await Promise.all([
    ownProfile(db, expertId),
    ownCv(db, expertId),
    openDeletionRequest(db, expertId),
    completedCourses(db, expertId),
    db.select({ timezone: experts.timezone, links: experts.links }).from(experts).where(eq(experts.id, expertId)).limit(1),
    db.select().from(expertDetails).where(eq(expertDetails.expertId, expertId)).limit(1),
  ]);
  if (!profile) return null;
  const d = details[0] ?? null;
  return {
    profile,
    timezone: extra[0]?.timezone ?? null,
    links: splitLinks(extra[0]?.links ?? null),
    cv,
    deletion,
    certificates,
    score: completeness(profile, Boolean(cv)),
    details: {
      experience: (d?.experience ?? []) as ExperienceItem[],
      education: (d?.education ?? []) as EducationItem[],
      projects: (d?.projects ?? []) as ProjectItem[],
      certifications: (d?.certifications ?? []) as CertificationItem[],
      addressLine1: d?.addressLine1 ?? null,
      addressLine2: d?.addressLine2 ?? null,
      postalCode: d?.postalCode ?? null,
      workAuthorized: d?.workAuthorized ?? null,
      workAuthorizedAt: d?.workAuthorizedAt ?? null,
      workSameAsResidence: d?.workSameAsResidence ?? true,
      workCountry: d?.workCountry ?? null,
      workRegion: d?.workRegion ?? null,
      workCity: d?.workCity ?? null,
      workPostalCode: d?.workPostalCode ?? null,
      startAvailability: d?.startAvailability ?? null,
      weeklyHours: (d?.weeklyHours ?? null) as WeeklyHours | null,
      domainInterests: d?.domainInterests ?? [],
      minFullTimeUsd: d?.minFullTimeUsd ?? null,
      minPartTimeUsd: d?.minPartTimeUsd ?? null,
      lookingForWork: d?.lookingForWork ?? true,
      commPrefs: (d?.commPrefs ?? {}) as CommPrefs,
      availabilityConfirmedAt: d?.availabilityConfirmedAt ?? null,
      avatarFileId: d?.avatarFileId ?? null,
      updatedAt: d?.updatedAt ?? null,
    },
  };
}
export type ProfileData = NonNullable<Awaited<ReturnType<typeof profileData>>>;

/** experts.links is free text: one address per line (older rows may use commas or spaces). */
export function splitLinks(raw: string | null): string[] {
  return (raw ?? "")
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/\S+\.\S+/i.test(s))
    .slice(0, 12);
}

async function upsertDetails(db: DB, expertId: string, patch: Partial<typeof expertDetails.$inferInsert>) {
  const now = new Date();
  const set = { ...patch, updatedBy: BY, updatedAt: now };
  await db.insert(expertDetails).values({ expertId, ...set }).onConflictDoUpdate({ target: expertDetails.expertId, set });
}

async function updateExpert(db: DB, expertId: string, patch: Partial<typeof experts.$inferInsert>) {
  await db.update(experts).set({ ...patch, updatedAt: new Date() }).where(eq(experts.id, expertId));
}

const log = (db: DB, expertId: string, section: string, fields: string[]) => logActivity(db, { entityType: "expert", entityId: expertId, actor: PORTAL_ACTOR, action: "updated_by_expert", detail: { section, fields } });

// ---------------------------------------------------------------- Resume

/** Personal info: name, phone, LinkedIn, headline, field, experience in years, degree, languages. */
export async function savePersonal(db: DB, expertId: string, fd: FormData): Promise<SaveResult> {
  const fullName = cleanText(v(fd, "fullName"), 200);
  if (!fullName) return fail("Your full legal name is required.");
  const phone = v(fd, "phone") ? normalizePhone(v(fd, "phone")) : null;
  if (v(fd, "phone") && !phone) return fail("Enter your phone number with the country code, e.g. +91 98765 43210.");
  const linkedin = v(fd, "linkedinUrl") ? normalizeLinkedin(v(fd, "linkedinUrl")) : null;
  if (v(fd, "linkedinUrl") && (!linkedin || !/linkedin\.com\/(in|pub|profile)/i.test(linkedin))) return fail("Paste your LinkedIn profile link (linkedin.com/in/...).");
  const domain = v(fd, "domain");
  if (domain && !isOneOf(DOMAINS, domain)) return fail("Pick your field from the list.");
  const years = v(fd, "yearsExperience") ? toInt(v(fd, "yearsExperience"), 0, 70) : null;
  if (v(fd, "yearsExperience") && years == null) return fail("Years of experience: a whole number from 0 to 70.");
  const patch = {
    fullName,
    phone,
    linkedinUrl: linkedin,
    headline: cleanText(v(fd, "headline"), 200),
    domain: domain || null,
    yearsExperience: years,
    highestDegree: cleanText(v(fd, "highestDegree"), 120),
    fieldOfStudy: cleanText(v(fd, "fieldOfStudy"), 120),
    university: cleanText(v(fd, "university"), 160),
    languages: splitList(v(fd, "languages"), 20),
  };
  await updateExpert(db, expertId, patch);
  await log(db, expertId, "personal", Object.keys(patch));
  return done("Personal info saved.");
}

export async function saveSkills(db: DB, expertId: string, fd: FormData): Promise<SaveResult> {
  const skills = splitSkills(v(fd, "skills"));
  if (!skills.length) return fail("Add at least one skill.");
  if (skills.length > 40) return fail("Up to 40 skills.");
  await updateExpert(db, expertId, { skills });
  await log(db, expertId, "skills", ["skills"]);
  return done("Skills saved.");
}

export async function saveLinks(db: DB, expertId: string, fd: FormData): Promise<SaveResult> {
  const raw = v(fd, "links")
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (raw.length > 12) return fail("Up to 12 links.");
  const bad = raw.find((s) => !/^https?:\/\/\S+\.\S+$/i.test(s) || s.length > 300);
  if (bad) return fail(`"${bad.slice(0, 60)}" isn't a full link. Start each one with https://`);
  await updateExpert(db, expertId, { links: raw.length ? raw.join("\n") : null });
  await log(db, expertId, "links", ["links"]);
  return done("Links saved.");
}

const LISTS = ["education", "experience", "projects", "certifications"] as const;
export type ListKey = (typeof LISTS)[number];
export const isListKey = (x: unknown): x is ListKey => isOneOf(LISTS, x);
const LIST_NAMES: Record<ListKey, string> = { education: "Education", experience: "Work experience", projects: "Project", certifications: "Certification" };

const year = (raw: string): number | null | "bad" => {
  if (!raw) return null;
  const n = toInt(raw, 1950, 2100);
  return n == null ? "bad" : n;
};
/** "2024" or "2024-03" (a month picker sends YYYY-MM). */
const yearMonth = (raw: string): string | null | "bad" => {
  if (!raw) return null;
  return /^(19[5-9]\d|20\d\d)(-(0[1-9]|1[0-2]))?$/.test(raw) ? raw : "bad";
};
const url = (raw: string): string | null | "bad" => {
  if (!raw) return null;
  return /^https?:\/\/\S+\.\S+$/i.test(raw) && raw.length <= 300 ? raw : "bad";
};

/** One item of a list, checked; or the reason it can't be saved. */
export function parseItem(list: ListKey, fd: FormData): { ok: true; item: EducationItem | ExperienceItem | ProjectItem | CertificationItem } | { ok: false; error: string } {
  if (list === "education") {
    const school = cleanText(v(fd, "school"), 160);
    if (!school) return { ok: false, error: "School or university is required." };
    const start = year(v(fd, "start_year"));
    const end = year(v(fd, "end_year"));
    if (start === "bad" || end === "bad") return { ok: false, error: "Years look like 2021." };
    if (start && end && end < start) return { ok: false, error: "The end year is before the start year." };
    return { ok: true, item: { school, degree: cleanText(v(fd, "degree"), 120), field: cleanText(v(fd, "field"), 120), start_year: start, end_year: end, grade: cleanText(v(fd, "grade"), 40) } };
  }
  if (list === "experience") {
    const title = cleanText(v(fd, "title"), 160);
    const company = cleanText(v(fd, "company"), 160);
    if (!title || !company) return { ok: false, error: "Role and company are both required." };
    const start = yearMonth(v(fd, "start"));
    const current = on(fd, "current");
    const end = current ? null : yearMonth(v(fd, "end"));
    if (start === "bad" || end === "bad") return { ok: false, error: "Dates look like 2024 or 2024-03." };
    if (start && end && end < start) return { ok: false, error: "The end date is before the start date." };
    return { ok: true, item: { title, company, location: cleanText(v(fd, "location"), 120), start, end, current, description: cleanLongText(v(fd, "description"), 2000) } };
  }
  if (list === "projects") {
    const title = cleanText(v(fd, "title"), 160);
    if (!title) return { ok: false, error: "A project needs a name." };
    const link = url(v(fd, "url"));
    const y = year(v(fd, "year"));
    if (link === "bad") return { ok: false, error: "The link must start with https://" };
    if (y === "bad") return { ok: false, error: "The year looks like 2025." };
    return { ok: true, item: { title, url: link, year: y, description: cleanLongText(v(fd, "description"), 1500) } };
  }
  const name = cleanText(v(fd, "name"), 160);
  if (!name) return { ok: false, error: "A certification needs a name." };
  const link = url(v(fd, "url"));
  const y = year(v(fd, "year"));
  if (link === "bad") return { ok: false, error: "The link must start with https://" };
  if (y === "bad") return { ok: false, error: "The year looks like 2025." };
  return { ok: true, item: { name, issuer: cleanText(v(fd, "issuer"), 160), year: y, url: link } };
}

/** Adds (index -1), replaces or removes one item of education, experience, projects or certifications. */
export async function saveListItem(db: DB, expertId: string, fd: FormData): Promise<SaveResult> {
  const list = v(fd, "list");
  if (!isListKey(list)) return fail("Unknown section.");
  const index = Number(v(fd, "index") || "-1");
  const [row] = await db.select({ education: expertDetails.education, experience: expertDetails.experience, projects: expertDetails.projects, certifications: expertDetails.certifications }).from(expertDetails).where(eq(expertDetails.expertId, expertId)).limit(1);
  const items = [...((row?.[list] as unknown[] | undefined) ?? [])];
  if (index >= items.length || (index < 0 && index !== -1) || !Number.isInteger(index)) return fail("That item no longer exists. Reload the page.");
  if (fd.get("remove")) {
    if (index < 0) return fail("Nothing to remove.");
    items.splice(index, 1);
    await upsertDetails(db, expertId, { [list]: items } as Partial<typeof expertDetails.$inferInsert>);
    await log(db, expertId, list, [list]);
    return done(`${LIST_NAMES[list]} removed.`);
  }
  const parsed = parseItem(list, fd);
  if (!parsed.ok) return fail(parsed.error);
  if (index === -1) {
    if (items.length >= MAX_ITEMS) return fail(`Up to ${MAX_ITEMS} entries.`);
    items.unshift(parsed.item);
  } else items[index] = parsed.item;
  await upsertDetails(db, expertId, { [list]: items } as Partial<typeof expertDetails.$inferInsert>);
  await log(db, expertId, list, [list]);
  return done(`${LIST_NAMES[list]} saved.`);
}

// ---------------------------------------------------------------- Location & work authorization

export async function saveLocation(db: DB, expertId: string, fd: FormData): Promise<SaveResult> {
  const country = v(fd, "country") ? toCountryName(v(fd, "country")) : null;
  if (!country) return fail("Pick the country you live in.");
  const same = on(fd, "workSameAsResidence");
  const workCountry = same ? null : v(fd, "workCountry") ? toCountryName(v(fd, "workCountry")) : null;
  if (!same && !workCountry) return fail("Pick the country you'll work from, or tick \"Same as where I live\".");
  const authorized = on(fd, "workAuthorized");
  const [cur] = await db.select({ authorized: expertDetails.workAuthorized, at: expertDetails.workAuthorizedAt }).from(expertDetails).where(eq(expertDetails.expertId, expertId)).limit(1);
  await updateExpert(db, expertId, { country, region: cleanText(v(fd, "region"), 80), city: cleanText(v(fd, "city"), 80) });
  await upsertDetails(db, expertId, {
    addressLine1: cleanText(v(fd, "addressLine1"), 200),
    addressLine2: cleanText(v(fd, "addressLine2"), 200),
    postalCode: cleanText(v(fd, "postalCode"), 20),
    workSameAsResidence: same,
    workCountry,
    workRegion: same ? null : cleanText(v(fd, "workRegion"), 80),
    workCity: same ? null : cleanText(v(fd, "workCity"), 80),
    workPostalCode: same ? null : cleanText(v(fd, "workPostalCode"), 20),
    workAuthorized: authorized,
    workAuthorizedAt: authorized ? (cur?.authorized ? cur.at : new Date()) : null,
  });
  await log(db, expertId, "location", ["country", "region", "city", "address", "work_location", "work_authorized"]);
  return done("Location saved.");
}

// ---------------------------------------------------------------- Availability

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The working-hours grid: per day either off, or from–to in 24-hour time. */
export function parseWeeklyHours(fd: FormData): { ok: true; hours: WeeklyHours } | { ok: false; error: string } {
  const hours: WeeklyHours = {};
  for (const day of WEEKDAYS) {
    if (!on(fd, `${day}_on`)) continue;
    const from = v(fd, `${day}_from`);
    const to = v(fd, `${day}_to`);
    if (!TIME.test(from) || !TIME.test(to)) return { ok: false, error: "Pick a start and end time for each day you work." };
    if (to <= from) return { ok: false, error: "Each day's end time must be after its start time." };
    hours[day] = [[from, to]];
  }
  return { ok: true, hours };
}

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function saveAvailability(db: DB, expertId: string, fd: FormData): Promise<SaveResult> {
  const start = v(fd, "startAvailability");
  if (!isOneOf(START_AVAILABILITY, start)) return fail("Pick how soon you could start.");
  const hoursPerWeek = toInt(v(fd, "hoursPerWeek"), 1, 80);
  if (hoursPerWeek == null) return fail("Hours per week: a number from 1 to 80.");
  const tz = v(fd, "timezone");
  if (!tz || !isTimeZone(tz)) return fail("Pick your time zone.");
  const grid = parseWeeklyHours(fd);
  if (!grid.ok) return fail(grid.error);
  const availability = isOneOf(AVAILABILITY, v(fd, "availability")) ? v(fd, "availability") : undefined;
  await updateExpert(db, expertId, { hoursPerWeek, timezone: tz, ...(availability ? { availability } : {}) });
  await upsertDetails(db, expertId, { startAvailability: start, weeklyHours: grid.hours, availabilityConfirmedAt: new Date() });
  await log(db, expertId, "availability", ["start_availability", "hours_per_week", "timezone", "weekly_hours"]);
  return done("Availability saved.");
}

// ---------------------------------------------------------------- Work preferences

export async function savePreferences(db: DB, expertId: string, fd: FormData): Promise<SaveResult> {
  const picked = fd.getAll("domainInterests").map(String).filter((d) => isOneOf(DOMAINS, d));
  const others = splitList(v(fd, "otherInterests"), 10).map((s) => s.slice(0, 60));
  const fullTime = v(fd, "minFullTimeUsd") ? toInt(v(fd, "minFullTimeUsd").replace(/[,\s]/g, ""), 0, 2_000_000) : null;
  const partTime = v(fd, "minPartTimeUsd") ? toInt(v(fd, "minPartTimeUsd").replace(/[,\s]/g, ""), 0, 2_000) : null;
  if (v(fd, "minFullTimeUsd") && fullTime == null) return fail("Full-time minimum: a yearly amount in US dollars, e.g. 60000.");
  if (v(fd, "minPartTimeUsd") && partTime == null) return fail("Part-time minimum: an hourly amount in US dollars, e.g. 20.");
  await upsertDetails(db, expertId, { domainInterests: [...new Set([...picked, ...others])], minFullTimeUsd: fullTime, minPartTimeUsd: partTime });
  await log(db, expertId, "preferences", ["domain_interests", "min_compensation"]);
  return done("Work preferences saved.");
}

// ---------------------------------------------------------------- Communications

export const COMM_KEYS = ["email", "whatsapp", "fullTime", "partTime", "referrals", "jobAlerts", "learning"] as const;

export async function saveCommunications(db: DB, expertId: string, fd: FormData): Promise<SaveResult> {
  const looking = on(fd, "lookingForWork");
  const prefs = Object.fromEntries(COMM_KEYS.map((k) => [k, on(fd, k)])) as CommPrefs;
  const [cur] = await db.select({ availability: experts.availability }).from(experts).where(eq(experts.id, expertId)).limit(1);
  // Not looking for work: the team sees them as unavailable; turning it back on makes them available.
  if (!looking && cur?.availability !== "unavailable") await updateExpert(db, expertId, { availability: "unavailable" });
  if (looking && cur?.availability === "unavailable") await updateExpert(db, expertId, { availability: "available" });
  await upsertDetails(db, expertId, { lookingForWork: looking, commPrefs: prefs });
  await log(db, expertId, "communications", ["looking_for_work", "comm_prefs"]);
  return done(looking ? "Saved." : "Saved. We've paused job outreach until you turn \"Looking for work\" back on.");
}

// ---------------------------------------------------------------- Account: avatar

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export async function saveAvatar(db: DB, expertId: string, file: { name: string; type: string; bytes: Uint8Array }): Promise<SaveResult> {
  if (!file.bytes.byteLength) return fail("Choose a picture first.");
  if (!AVATAR_TYPES.includes(file.type)) return fail("Use a JPG, PNG, GIF or WebP picture.");
  if (file.bytes.byteLength > MAX_AVATAR_BYTES) return fail("Pictures can be 2 MB at most.");
  const b64 = Buffer.from(file.bytes).toString("base64");
  const { sql } = await import("drizzle-orm");
  const [prev] = await db.select({ id: expertDetails.avatarFileId }).from(expertDetails).where(eq(expertDetails.expertId, expertId)).limit(1);
  const [row] = await db
    .insert(expertFiles)
    .values({ expertId, kind: "avatar", filename: file.name.slice(0, 200) || "avatar", mime: file.type, size: file.bytes.byteLength, storage: "upload", data: sql`decode(${b64}, 'base64')`, createdBy: BY })
    .returning({ id: expertFiles.id });
  await upsertDetails(db, expertId, { avatarFileId: row.id });
  if (prev?.id) await db.delete(expertFiles).where(and(eq(expertFiles.id, prev.id), eq(expertFiles.expertId, expertId), eq(expertFiles.kind, "avatar")));
  await log(db, expertId, "account", ["avatar"]);
  return done("Picture updated.");
}

export async function removeAvatar(db: DB, expertId: string): Promise<SaveResult> {
  const [prev] = await db.select({ id: expertDetails.avatarFileId }).from(expertDetails).where(eq(expertDetails.expertId, expertId)).limit(1);
  if (!prev?.id) return done("No picture to remove.");
  await upsertDetails(db, expertId, { avatarFileId: null });
  await db.delete(expertFiles).where(and(eq(expertFiles.id, prev.id), eq(expertFiles.expertId, expertId), eq(expertFiles.kind, "avatar")));
  await log(db, expertId, "account", ["avatar"]);
  return done("Picture removed.");
}

/** The signed-in expert's avatar bytes (for /api/me/avatar). */
export async function ownAvatar(db: DB, expertId: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  const [row] = await db
    .select({ mime: expertFiles.mime, data: expertFiles.data })
    .from(expertDetails)
    .innerJoin(expertFiles, and(eq(expertFiles.id, expertDetails.avatarFileId), eq(expertFiles.expertId, expertDetails.expertId)))
    .where(eq(expertDetails.expertId, expertId))
    .limit(1);
  if (!row?.data) return null;
  return { mime: row.mime, bytes: row.data };
}
