// The expert portal's Profile tabs and Home: saving each section to the expert's own record, the
// editable lists, availability grid, communications (pausing job outreach), the avatar, Home's tasks
// and project titles that never show the partner's name.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import type { DB } from "@/db/client";
import { accounts, documentTemplates, expertDetails, expertFiles, experts, partners, placements } from "@/db/schema";
import { linkExpertForAccount } from "@/lib/server/accounts";
import { confirmAvailability, homeData, portalFrame, projectTitleForExpert } from "@/lib/server/portal-home";
import { ownAvatar, parseWeeklyHours, profileData, removeAvatar, saveAvailability, saveAvatar, saveCommunications, saveLinks, saveListItem, saveLocation, savePersonal, savePreferences, saveSkills, splitLinks } from "@/lib/server/portal-profile";

let db: DB;
let client: PGlite;
const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
async function expert(email: string, name: string) {
  const [row] = await db.insert(accounts).values({ email, name, accountType: "expert", emailVerifiedAt: new Date() }).returning();
  const link = await linkExpertForAccount(db, row);
  if (!link.ok) throw new Error("no link");
  return link.expertId;
}

beforeAll(async () => {
  ({ db, client } = await openTestDb({ demo: false }));
});
afterAll(async () => {
  await client.close();
});

describe("profile: resume", () => {
  it("saves personal info, skills and links, and refuses bad values", async () => {
    const id = await expert("ravi@example.org", "Ravi");
    expect(await savePersonal(db, id, fd({ fullName: "" }))).toMatchObject({ ok: false });
    expect(await savePersonal(db, id, fd({ fullName: "Ravi Kumar", linkedinUrl: "github.com/ravi" }))).toMatchObject({ ok: false });
    expect(await savePersonal(db, id, fd({ fullName: "Ravi Kumar", domain: "Astrology" }))).toMatchObject({ ok: false });
    expect(await savePersonal(db, id, fd({ fullName: "Ravi Kumar", phone: "+91 98765 43210", linkedinUrl: "linkedin.com/in/ravi-k", domain: "Software", yearsExperience: "6", languages: "English, Hindi" }))).toMatchObject({ ok: true });
    const [e] = await db.select().from(experts).where(eq(experts.id, id));
    expect(e).toMatchObject({ fullName: "Ravi Kumar", domain: "Software", yearsExperience: 6, languages: ["English", "Hindi"] });
    expect(await saveSkills(db, id, fd({ skills: "" }))).toMatchObject({ ok: false });
    expect(await saveSkills(db, id, fd({ skills: "Rust, Docker, pytest" }))).toMatchObject({ ok: true });
    expect(await saveLinks(db, id, fd({ links: "github.com/ravi" }))).toMatchObject({ ok: false });
    expect(await saveLinks(db, id, fd({ links: "https://github.com/ravi\nhttps://ravi.dev" }))).toMatchObject({ ok: true });
    expect(splitLinks((await db.select({ l: experts.links }).from(experts).where(eq(experts.id, id)))[0].l)).toEqual(["https://github.com/ravi", "https://ravi.dev"]);
  });

  it("adds, edits and removes list items; checks dates", async () => {
    const id = await expert("lists@example.org", "Lists");
    expect(await saveListItem(db, id, fd({ list: "education", index: "-1", school: "" }))).toMatchObject({ ok: false });
    expect(await saveListItem(db, id, fd({ list: "education", index: "-1", school: "IIIT Sonepat", degree: "B.Tech", start_year: "2021", end_year: "2019" }))).toMatchObject({ ok: false });
    expect(await saveListItem(db, id, fd({ list: "education", index: "-1", school: "IIIT Sonepat", degree: "B.Tech", field: "Computer Science", start_year: "2021", end_year: "2025" }))).toMatchObject({ ok: true });
    expect(await saveListItem(db, id, fd({ list: "experience", index: "-1", title: "Task author", company: "Acme", start: "2026-13" }))).toMatchObject({ ok: false });
    expect(await saveListItem(db, id, fd({ list: "experience", index: "-1", title: "Task author", company: "Acme", start: "2026-01", current: "on", end: "2020" }))).toMatchObject({ ok: true });
    expect(await saveListItem(db, id, fd({ list: "projects", index: "-1", title: "Bench", url: "ftp://x" }))).toMatchObject({ ok: false });
    expect(await saveListItem(db, id, fd({ list: "projects", index: "-1", title: "Bench", url: "https://github.com/x/bench", year: "2025" }))).toMatchObject({ ok: true });
    expect(await saveListItem(db, id, fd({ list: "certifications", index: "-1", name: "AWS SAA", issuer: "AWS", year: "2024" }))).toMatchObject({ ok: true });
    let d = await profileData(db, id);
    expect(d?.details.education[0]).toMatchObject({ school: "IIIT Sonepat", start_year: 2021, end_year: 2025 });
    expect(d?.details.experience[0]).toMatchObject({ title: "Task author", current: true, end: null });
    expect(await saveListItem(db, id, fd({ list: "education", index: "0", school: "IIIT Sonepat", degree: "B.Tech", grade: "8.5" }))).toMatchObject({ ok: true });
    expect(await saveListItem(db, id, fd({ list: "certifications", index: "0", remove: "1" }))).toMatchObject({ ok: true });
    expect(await saveListItem(db, id, fd({ list: "certifications", index: "5", remove: "1" }))).toMatchObject({ ok: false });
    expect(await saveListItem(db, id, fd({ list: "salary", index: "-1" }))).toMatchObject({ ok: false });
    d = await profileData(db, id);
    expect(d?.details.education[0].grade).toBe("8.5");
    expect(d?.details.certifications).toEqual([]);
    const [row] = await db.select({ by: expertDetails.updatedBy }).from(expertDetails).where(eq(expertDetails.expertId, id));
    expect(row.by).toBe("expert-portal");
  });
});

describe("profile: location, availability, preferences, communications", () => {
  it("saves where they live and work, and the attestation date", async () => {
    const id = await expert("loc@example.org", "Loc");
    expect(await saveLocation(db, id, fd({ country: "" }))).toMatchObject({ ok: false });
    expect(await saveLocation(db, id, fd({ country: "India", city: "Lucknow" }))).toMatchObject({ ok: false });
    expect(await saveLocation(db, id, fd({ country: "India", region: "Uttar Pradesh", city: "Lucknow", postalCode: "226012", workSameAsResidence: "on", workAuthorized: "on" }))).toMatchObject({ ok: true });
    const d = await profileData(db, id);
    expect(d?.profile).toMatchObject({ country: "India", city: "Lucknow" });
    expect(d?.details).toMatchObject({ postalCode: "226012", workSameAsResidence: true, workAuthorized: true });
    expect(d?.details.workAuthorizedAt).toBeInstanceOf(Date);
  });

  it("checks the working-hours grid and time zone, and counts as the weekly check-in", async () => {
    const id = await expert("avail@example.org", "Avail");
    expect(parseWeeklyHours(fd({ mon_on: "on", mon_from: "17:00", mon_to: "09:00" }))).toMatchObject({ ok: false });
    expect(parseWeeklyHours(fd({ mon_on: "on", mon_from: "09:00", mon_to: "17:00", tue_from: "09:00", tue_to: "17:00" }))).toEqual({ ok: true, hours: { mon: [["09:00", "17:00"]] } });
    expect(await saveAvailability(db, id, fd({ startAvailability: "soon", hoursPerWeek: "15", timezone: "Asia/Kolkata" }))).toMatchObject({ ok: false });
    expect(await saveAvailability(db, id, fd({ startAvailability: "immediately", hoursPerWeek: "15", timezone: "Mars/Olympus" }))).toMatchObject({ ok: false });
    expect(await saveAvailability(db, id, fd({ startAvailability: "1_week", hoursPerWeek: "15", timezone: "Asia/Kolkata", availability: "limited", mon_on: "on", mon_from: "09:00", mon_to: "17:00" }))).toMatchObject({ ok: true });
    const d = await profileData(db, id);
    expect(d?.profile).toMatchObject({ hoursPerWeek: 15, availability: "limited" });
    expect(d?.timezone).toBe("Asia/Kolkata");
    expect(d?.details.startAvailability).toBe("1_week");
    expect(d?.details.availabilityConfirmedAt).toBeInstanceOf(Date);
  });

  it("keeps preferences private to the expert's record and pauses outreach when not looking", async () => {
    const id = await expert("pref@example.org", "Pref");
    expect(await savePreferences(db, id, fd({ minPartTimeUsd: "lots" }))).toMatchObject({ ok: false });
    expect(await savePreferences(db, id, fd({ domainInterests: ["Software", "Not a field"], otherInterests: "Robotics", minFullTimeUsd: "150,000", minPartTimeUsd: "20" }))).toMatchObject({ ok: true });
    let d = await profileData(db, id);
    expect(d?.details).toMatchObject({ domainInterests: ["Software", "Robotics"], minFullTimeUsd: 150000, minPartTimeUsd: 20 });
    expect(await saveCommunications(db, id, fd({ email: "on" }))).toMatchObject({ ok: true });
    d = await profileData(db, id);
    expect(d?.details.lookingForWork).toBe(false);
    expect(d?.details.commPrefs).toMatchObject({ email: true, whatsapp: false });
    expect(d?.profile.availability).toBe("unavailable");
    expect(await saveCommunications(db, id, fd({ lookingForWork: "on" }))).toMatchObject({ ok: true });
    expect((await profileData(db, id))?.profile.availability).toBe("available");
  });
});

describe("profile: avatar", () => {
  it("accepts small images only, replaces the old one and serves only the owner's", async () => {
    const id = await expert("pic@example.org", "Pic");
    const other = await expert("other-pic@example.org", "Other");
    expect(await saveAvatar(db, id, { name: "x.exe", type: "application/octet-stream", bytes: new Uint8Array([1]) })).toMatchObject({ ok: false });
    expect(await saveAvatar(db, id, { name: "big.png", type: "image/png", bytes: new Uint8Array(2 * 1024 * 1024 + 1) })).toMatchObject({ ok: false });
    expect(await saveAvatar(db, id, { name: "a.png", type: "image/png", bytes: new Uint8Array([137, 80, 78, 71]) })).toMatchObject({ ok: true });
    expect(await saveAvatar(db, id, { name: "b.png", type: "image/png", bytes: new Uint8Array([137, 80, 78, 71, 1]) })).toMatchObject({ ok: true });
    expect(await db.$count(expertFiles, eq(expertFiles.expertId, id))).toBe(1);
    expect((await ownAvatar(db, id))?.bytes.byteLength).toBe(5);
    expect(await ownAvatar(db, other)).toBeNull();
    expect((await portalFrame(db, id)).avatarUrl).toMatch(/^\/api\/me\/avatar\?v=/);
    expect(await removeAvatar(db, id)).toMatchObject({ ok: true });
    expect(await ownAvatar(db, id)).toBeNull();
  });
});

describe("home", () => {
  it("lists tasks (documents, profile, check-in) and projects without the partner's name", async () => {
    const id = await expert("home@example.org", "Meera Shah");
    await db.insert(documentTemplates).values({ title: "Non-Disclosure Agreement", kind: "nda", body: "Hello {{full_name}}", requiredForAll: true });
    const [p] = await db.insert(partners).values({ name: "Acme Labs" }).returning();
    await db.insert(placements).values([
      { expertId: id, partnerId: p.id, projectName: "Acme Labs - Rust benchmark", basis: "per_task", rateToExpert: 3400, currency: "INR", status: "active" },
      { expertId: id, partnerId: p.id, projectName: "Image grading", basis: "hourly", rateToExpert: 30, currency: "USD", status: "ended" },
    ]);
    let h = await homeData(db, id);
    expect(h.firstName).toBe("Meera");
    expect(h.tasks.map((t) => t.key)).toEqual(expect.arrayContaining([expect.stringMatching(/^doc-t-/), "profile", "checkin"]));
    expect(h.current.map((x) => x.title)).toEqual(["Rust benchmark"]);
    expect(h.past.map((x) => x.title)).toEqual(["Image grading"]);
    expect(JSON.stringify(h.current.map((x) => x.title))).not.toContain("Acme");
    expect((await portalFrame(db, id)).attention.documents).toBe(1);
    await confirmAvailability(db, id);
    h = await homeData(db, id);
    expect(h.tasks.map((t) => t.key)).not.toContain("checkin");
  });

  it("strips partner names from project titles", () => {
    expect(projectTitleForExpert("Acme Labs - Rust benchmark", "Acme Labs")).toBe("Rust benchmark");
    expect(projectTitleForExpert("Acme Labs", "Acme Labs")).toBe("Project");
    expect(projectTitleForExpert("Terminal tasks", null)).toBe("Terminal tasks");
  });
});
