import Link from "next/link";
import { Award, Download, ExternalLink, FileText, KeyRound, Mail, Wallet } from "lucide-react";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { AVAILABILITY, DOMAINS, START_AVAILABILITY, START_AVAILABILITY_LABELS, WEEKDAYS, WEEKDAY_LABELS } from "@/lib/constants";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { CONSENT_TEXT, DEGREE_CHOICES } from "@/lib/forms/field-meta";
import { one, type SearchParams } from "@/lib/filters";
import { bytes, fmtDate } from "@/lib/format";
import { ownPayoutMethod } from "@/lib/server/payouts";
import { profileData, type ProfileData } from "@/lib/server/portal-profile";
import type { CertificationItem, EducationItem, ExperienceItem, ProjectItem } from "@/db/schema";
import { PortalCard, PortalHeader, PortalTabs } from "@/components/portal/page";
import { ItemList, ProfileSection, SaveRow, Toggle, type Flash } from "@/components/portal/profile/bits";
import { Badge, Chips } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { FileDrop } from "@/components/ui/file-drop";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { FlashFromParams } from "@/components/ui/feedback";
import { UPLOAD_HINT } from "@/lib/upload-limit";
import { requestMyDeletion, setMyConsent } from "../actions";
import { removeMyAvatar, saveProfileSection, uploadMyAvatar, uploadMyCvFromProfile } from "./actions";

export const metadata = { title: "Profile" };

const TABS = [
  { key: "resume", label: "Resume" },
  { key: "location", label: "Location & work authorization" },
  { key: "availability", label: "Availability" },
  { key: "preferences", label: "Work preferences" },
  { key: "communications", label: "Communications" },
  { key: "account", label: "Account" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const AVAIL_LABELS: Record<string, string> = { available: "Available now", limited: "Limited (a few hours a week)", busy: "Busy for now, available later", unavailable: "Not available right now" };
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};
function timeZones(): string[] {
  const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
  return list?.length ? list : ["Asia/Kolkata", "UTC", "Europe/London", "America/New_York", "America/Los_Angeles"];
}

/** The completeness items' onboarding steps, as places on this page. */
const STEP_HREF: Record<string, string> = {
  basics: "/me/profile?tab=resume#personal",
  expertise: "/me/profile?tab=resume#personal",
  experience: "/me/profile?tab=resume#personal",
  cv: "/me/profile?tab=resume#cv",
  availability: "/me/profile?tab=availability",
  consent: "/me/profile?tab=account#consent",
};

const hidden = (section: string) => <input type="hidden" name="section" value={section} />;

function ResumeTab({ d, flash }: { d: ProfileData; flash: Flash }) {
  const p = d.profile;
  const det = d.details;
  const jump = [
    ["personal", "Personal info"],
    ["cv", "CV"],
    ["education", "Education"],
    ["experience", "Work experience"],
    ["projects", "Projects"],
    ["certifications", "Certifications"],
    ["links", "Links"],
    ["skills", "Skills"],
  ];
  return (
    <div className="space-y-6">
      <PortalCard className="space-y-3 px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Profile completeness</p>
            <p className="text-stat text-foreground tabular">{d.score.percent}%</p>
          </div>
          {d.score.percent === 100 ? <Badge tone="success">Ready for matching</Badge> : null}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={d.score.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${d.score.percent}%` }} />
        </div>
        {d.score.missing.length ? (
          <p className="text-sm text-muted-foreground">
            Still missing:{" "}
            {d.score.missing.map((m, i) => (
              <span key={m.label}>
                <Link href={STEP_HREF[m.step] ?? "/me/profile"} className="text-foreground underline-offset-4 hover:underline">
                  {m.label.toLowerCase()}
                </Link>
                {i < d.score.missing.length - 1 ? ", " : "."}
              </span>
            ))}
          </p>
        ) : null}
      </PortalCard>

      <nav className="flex flex-wrap gap-2" aria-label="Resume sections">
        {jump.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground/75 transition-colors hover:border-foreground/25 hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      <ProfileSection id="personal" title="Personal info" description="This is what partners see first. Use your full legal name." flash={flash}>
        <form action={saveProfileSection} className="space-y-4">
          {hidden("personal")}
          <Field label="Full legal name *" htmlFor="fullName">
            <Input id="fullName" name="fullName" defaultValue={p.fullName ?? ""} required autoComplete="name" />
          </Field>
          <FieldRow>
            <Field label="Email" htmlFor="email" hint="To change your email, write to hello@fynolabs.si.">
              <Input id="email" value={p.email ?? ""} readOnly disabled />
            </Field>
            <Field label="Phone number" htmlFor="phone" hint="With the country code, e.g. +91 98765 43210.">
              <Input id="phone" name="phone" type="tel" defaultValue={p.phone ?? ""} autoComplete="tel" />
            </Field>
          </FieldRow>
          <Field label="LinkedIn profile" htmlFor="linkedinUrl">
            <Input id="linkedinUrl" name="linkedinUrl" type="url" defaultValue={p.linkedinUrl ?? ""} placeholder="https://www.linkedin.com/in/..." />
          </Field>
          <Field label="Headline" htmlFor="headline" hint="One line, e.g. 'Rust engineer, 6 years in systems programming'.">
            <Input id="headline" name="headline" defaultValue={p.headline ?? ""} maxLength={200} />
          </Field>
          <FieldRow>
            <Field label="Field" htmlFor="domain">
              <Select id="domain" name="domain" defaultValue={p.domain ?? ""} options={[...DOMAINS]} placeholder="Choose a field" />
            </Field>
            <Field label="Years of experience" htmlFor="yearsExperience">
              <Input id="yearsExperience" name="yearsExperience" type="number" min={0} max={70} defaultValue={p.yearsExperience ?? ""} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Highest degree" htmlFor="highestDegree">
              <Select id="highestDegree" name="highestDegree" defaultValue={p.highestDegree ?? ""} options={DEGREE_CHOICES} placeholder="Choose one" />
            </Field>
            <Field label="Field of study" htmlFor="fieldOfStudy">
              <Input id="fieldOfStudy" name="fieldOfStudy" defaultValue={p.fieldOfStudy ?? ""} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="University" htmlFor="university">
              <Input id="university" name="university" defaultValue={p.university ?? ""} />
            </Field>
            <Field label="Languages" htmlFor="languages" hint="Separate with commas.">
              <Input id="languages" name="languages" defaultValue={(p.languages ?? []).join(", ")} />
            </Field>
          </FieldRow>
          <SaveRow />
        </form>
      </ProfileSection>

      <ProfileSection id="cv" title="CV" description="The CV we use when we match you to roles. Uploading a new one replaces it." flash={flash}>
        {d.cv ? (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3">
            <FileText className="h-5 w-5 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] text-foreground">{d.cv.filename}</p>
              <p className="text-xs text-muted-foreground">
                {bytes(d.cv.size)} · uploaded {fmtDate(d.cv.createdAt)}
              </p>
            </div>
          </div>
        ) : null}
        <form action={uploadMyCvFromProfile}>
          <FileDrop name="file" accept=".pdf,.doc,.docx,.txt,.rtf" label={d.cv ? "Upload a new CV" : "Upload your CV"} hint={UPLOAD_HINT} submitLabel="Upload CV" />
        </form>
      </ProfileSection>

      <ProfileSection id="education" title="Education" flash={flash}>
        <ItemList<EducationItem>
          list="education"
          items={det.education}
          addLabel="Add education"
          emptyText="No education added yet."
          render={(e) => (
            <>
              <p className="text-[15px] text-foreground">{[e.degree, e.field].filter(Boolean).join(", ") || e.school}</p>
              <p className="text-sm text-muted-foreground">
                {e.degree || e.field ? e.school : null}
                {e.start_year || e.end_year ? ` · ${e.start_year ?? "?"} – ${e.end_year ?? "now"}` : ""}
                {e.grade ? ` · ${e.grade}` : ""}
              </p>
            </>
          )}
          fields={(e) => (
            <>
              <Field label="School or university *">
                <Input name="school" defaultValue={e?.school ?? ""} required />
              </Field>
              <FieldRow>
                <Field label="Degree">
                  <Input name="degree" defaultValue={e?.degree ?? ""} placeholder="e.g. B.Tech" />
                </Field>
                <Field label="Major">
                  <Input name="field" defaultValue={e?.field ?? ""} placeholder="e.g. Computer Science" />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Start year">
                  <Input name="start_year" type="number" min={1950} max={2100} defaultValue={e?.start_year ?? ""} />
                </Field>
                <Field label="End year">
                  <Input name="end_year" type="number" min={1950} max={2100} defaultValue={e?.end_year ?? ""} />
                </Field>
              </FieldRow>
              <Field label="GPA or grade">
                <Input name="grade" defaultValue={e?.grade ?? ""} maxLength={40} />
              </Field>
            </>
          )}
        />
      </ProfileSection>

      <ProfileSection id="experience" title="Work experience" flash={flash}>
        <ItemList<ExperienceItem>
          list="experience"
          items={det.experience}
          addLabel="Add work experience"
          emptyText="No work experience added yet."
          render={(x) => (
            <>
              <p className="text-[15px] text-foreground">
                {x.title} <span className="text-muted-foreground">at</span> {x.company}
              </p>
              <p className="text-sm text-muted-foreground">
                {[x.start ? `${x.start} – ${x.current ? "present" : x.end ?? "?"}` : x.current ? "Current" : null, x.location].filter(Boolean).join(" · ")}
              </p>
              {x.description ? <p className="mt-1.5 line-clamp-3 text-sm text-foreground/75">{x.description}</p> : null}
            </>
          )}
          fields={(x) => (
            <>
              <FieldRow>
                <Field label="Company *">
                  <Input name="company" defaultValue={x?.company ?? ""} required />
                </Field>
                <Field label="Role *">
                  <Input name="title" defaultValue={x?.title ?? ""} required />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Start" hint="Year, or year and month.">
                  <Input name="start" defaultValue={x?.start ?? ""} placeholder="2024 or 2024-03" pattern="(19[5-9]\d|20\d\d)(-(0[1-9]|1[0-2]))?" />
                </Field>
                <Field label="End" hint="Leave empty if it's your current role.">
                  <Input name="end" defaultValue={x?.end ?? ""} placeholder="2025-06" pattern="(19[5-9]\d|20\d\d)(-(0[1-9]|1[0-2]))?" />
                </Field>
              </FieldRow>
              <label className="flex items-center gap-2 text-sm text-foreground/85">
                <input type="checkbox" name="current" defaultChecked={Boolean(x?.current)} className="h-4 w-4 rounded border-input accent-primary" /> I work here now
              </label>
              <Field label="Location">
                <Input name="location" defaultValue={x?.location ?? ""} placeholder="City, country or Remote" />
              </Field>
              <Field label="What you did">
                <Textarea name="description" rows={4} defaultValue={x?.description ?? ""} maxLength={2000} />
              </Field>
            </>
          )}
        />
      </ProfileSection>

      <ProfileSection id="projects" title="Projects" description="Open-source work, research, apps: anything that shows what you can do." flash={flash}>
        <ItemList<ProjectItem>
          list="projects"
          items={det.projects}
          addLabel="Add project"
          emptyText="No projects added yet."
          render={(x) => (
            <>
              <p className="text-[15px] text-foreground">
                {x.title}
                {x.year ? <span className="text-muted-foreground"> · {x.year}</span> : null}
              </p>
              {x.url ? (
                <a href={x.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                  {x.url.replace(/^https?:\/\//, "").slice(0, 60)} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
              {x.description ? <p className="mt-1 line-clamp-3 text-sm text-foreground/75">{x.description}</p> : null}
            </>
          )}
          fields={(x) => (
            <>
              <FieldRow>
                <Field label="Name *">
                  <Input name="title" defaultValue={x?.title ?? ""} required />
                </Field>
                <Field label="Year">
                  <Input name="year" type="number" min={1950} max={2100} defaultValue={x?.year ?? ""} />
                </Field>
              </FieldRow>
              <Field label="Link">
                <Input name="url" type="url" defaultValue={x?.url ?? ""} placeholder="https://" />
              </Field>
              <Field label="About it">
                <Textarea name="description" rows={3} defaultValue={x?.description ?? ""} maxLength={1500} />
              </Field>
            </>
          )}
        />
      </ProfileSection>

      <ProfileSection id="certifications" title="Certifications" flash={flash}>
        {d.certificates.length ? (
          <div className="mb-5 space-y-2">
            <p className="text-sm text-muted-foreground">Earned on FynoLabs Learn</p>
            <ul className="flex flex-wrap gap-2">
              {d.certificates.map((c) => (
                <li key={c.slug}>
                  <Link href={`/me/learn/${c.slug}`} className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-sm text-success">
                    <Award className="h-3.5 w-3.5" aria-hidden /> {c.title} · {fmtDate(c.completedAt)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ItemList<CertificationItem>
          list="certifications"
          items={det.certifications}
          addLabel="Add certification"
          emptyText="No other certifications added yet."
          render={(c) => (
            <>
              <p className="text-[15px] text-foreground">{c.name}</p>
              <p className="text-sm text-muted-foreground">{[c.issuer, c.year].filter(Boolean).join(" · ")}</p>
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
                  View credential
                </a>
              ) : null}
            </>
          )}
          fields={(c) => (
            <>
              <Field label="Name *">
                <Input name="name" defaultValue={c?.name ?? ""} required />
              </Field>
              <FieldRow>
                <Field label="Issued by">
                  <Input name="issuer" defaultValue={c?.issuer ?? ""} />
                </Field>
                <Field label="Year">
                  <Input name="year" type="number" min={1950} max={2100} defaultValue={c?.year ?? ""} />
                </Field>
              </FieldRow>
              <Field label="Credential link">
                <Input name="url" type="url" defaultValue={c?.url ?? ""} placeholder="https://" />
              </Field>
            </>
          )}
        />
      </ProfileSection>

      <ProfileSection id="links" title="Links" description="GitHub, portfolio, Google Scholar, personal site. One per line." flash={flash}>
        <form action={saveProfileSection} className="space-y-4">
          {hidden("links")}
          <Textarea name="links" rows={4} defaultValue={d.links.join("\n")} placeholder={"https://github.com/you\nhttps://your-site.com"} aria-label="Links, one per line" />
          <SaveRow />
        </form>
      </ProfileSection>

      <ProfileSection id="skills" title="Skills" description="Tools, languages and areas you know well. Separate with commas." flash={flash}>
        {p.skills?.length ? (
          <div className="mb-4">
            <Chips items={p.skills} max={40} />
          </div>
        ) : null}
        <form action={saveProfileSection} className="space-y-4">
          {hidden("skills")}
          <Textarea name="skills" rows={3} defaultValue={(p.skills ?? []).join(", ")} placeholder="e.g. Python, Rust, Docker, linear algebra" aria-label="Skills" />
          <SaveRow />
        </form>
      </ProfileSection>
    </div>
  );
}

function LocationTab({ d, flash }: { d: ProfileData; flash: Flash }) {
  const p = d.profile;
  const det = d.details;
  return (
    <ProfileSection id="location" title="Work authorization" description="Where you live and where you'll work from. Some projects can only take people in certain countries." flash={flash}>
      <form action={saveProfileSection} className="space-y-8">
        {hidden("location")}
        <div className="space-y-4">
          <h3 className="text-[15px] text-foreground">Where you live</h3>
          <FieldRow>
            <Field label="Country *" htmlFor="country">
              <Select id="country" name="country" defaultValue={p.country ?? ""} options={COUNTRY_OPTIONS} placeholder="Choose a country" required />
            </Field>
            <Field label="State, province or region" htmlFor="region">
              <Input id="region" name="region" defaultValue={p.region ?? ""} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" defaultValue={p.city ?? ""} autoComplete="address-level2" />
            </Field>
            <Field label="Postal code" htmlFor="postalCode">
              <Input id="postalCode" name="postalCode" defaultValue={det.postalCode ?? ""} autoComplete="postal-code" />
            </Field>
          </FieldRow>
          <Field label="Address" htmlFor="addressLine1" hint="Only used on the agreements you sign with us.">
            <Input id="addressLine1" name="addressLine1" defaultValue={det.addressLine1 ?? ""} autoComplete="address-line1" />
          </Field>
          <Input name="addressLine2" defaultValue={det.addressLine2 ?? ""} autoComplete="address-line2" aria-label="Address, second line" placeholder="Apartment, area (optional)" />
        </div>

        <div className="space-y-4 rounded-lg [&:has(input[name=workSameAsResidence]:checked)_.work-fields]:hidden">
          <h3 className="text-[15px] text-foreground">Where you'll work from</h3>
          <label className="flex items-center gap-2 text-sm text-foreground/85">
            <input type="checkbox" name="workSameAsResidence" defaultChecked={det.workSameAsResidence} className="h-4 w-4 rounded border-input accent-primary" /> Same as where I live
          </label>
          <div className="work-fields space-y-4">
            <FieldRow>
              <Field label="Country" htmlFor="workCountry">
                <Select id="workCountry" name="workCountry" defaultValue={det.workCountry ?? ""} options={COUNTRY_OPTIONS} placeholder="Choose a country" />
              </Field>
              <Field label="State, province or region" htmlFor="workRegion">
                <Input id="workRegion" name="workRegion" defaultValue={det.workRegion ?? ""} />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="City" htmlFor="workCity">
                <Input id="workCity" name="workCity" defaultValue={det.workCity ?? ""} />
              </Field>
              <Field label="Postal code" htmlFor="workPostalCode">
                <Input id="workPostalCode" name="workPostalCode" defaultValue={det.workPostalCode ?? ""} />
              </Field>
            </FieldRow>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border px-4 py-4">
          <label className="flex items-start gap-2.5 text-sm text-foreground/85">
            <input type="checkbox" name="workAuthorized" defaultChecked={Boolean(det.workAuthorized)} className="mt-0.5 h-4 w-4 rounded border-input accent-primary" />
            <span>I confirm I&apos;m legally allowed to do paid work from this location.</span>
          </label>
          {det.workAuthorizedAt ? <p className="pl-6 text-xs text-muted-foreground">Last confirmed {fmtDate(det.workAuthorizedAt)}</p> : null}
        </div>
        <SaveRow />
      </form>
    </ProfileSection>
  );
}

function AvailabilityTab({ d, flash, tz }: { d: ProfileData; flash: Flash; tz: string[] }) {
  const det = d.details;
  const p = d.profile;
  const hours = det.weeklyHours ?? {};
  const zone = d.timezone ?? "Asia/Kolkata";
  // Some systems list India as Asia/Calcutta: keep the expert's own zone and Asia/Kolkata in the list.
  const zones = [...new Set([zone, "Asia/Kolkata", ...tz])].sort((a, b) => a.localeCompare(b));
  return (
    <ProfileSection
      id="availability"
      title="Availability"
      description="When you can start and when you usually work. We use this to match you to projects you can take."
      flash={flash}
      aside={det.availabilityConfirmedAt ? <p className="text-xs text-muted-foreground">Last updated {fmtDate(det.availabilityConfirmedAt)}</p> : null}
    >
      <form action={saveProfileSection} className="space-y-8">
        {hidden("availability")}
        <FieldRow>
          <Field label="Could start *" htmlFor="startAvailability" hint="How soon you could begin a new project.">
            <Select id="startAvailability" name="startAvailability" defaultValue={det.startAvailability ?? "immediately"} options={START_AVAILABILITY.map((s) => ({ value: s, label: START_AVAILABILITY_LABELS[s] }))} required />
          </Field>
          <Field label="Hours per week *" htmlFor="hoursPerWeek" hint="Roughly how many hours a week you'd like to work.">
            <Input id="hoursPerWeek" name="hoursPerWeek" type="number" min={1} max={80} defaultValue={p.hoursPerWeek ?? ""} required />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Time zone *" htmlFor="timezone" hint="Your working hours below are in this time zone.">
            <Select id="timezone" name="timezone" defaultValue={zone} options={zones} required />
          </Field>
          <Field label="Right now" htmlFor="availability">
            <Select id="availability" name="availability" defaultValue={p.availability ?? "available"} options={AVAILABILITY.map((a) => ({ value: a, label: AVAIL_LABELS[a] ?? a }))} />
          </Field>
        </FieldRow>
        <div className="space-y-3">
          <div>
            <h3 className="text-[15px] text-foreground">Working hours</h3>
            <p className="text-sm text-muted-foreground">Tick the days you usually work.</p>
          </div>
          <ul className="space-y-2">
            {WEEKDAYS.map((day) => {
              const slot = hours[day]?.[0];
              return (
                <li key={day} className="flex flex-wrap items-center gap-3 [&:not(:has(input[type=checkbox]:checked))_select]:opacity-40">
                  <label className="flex w-36 items-center gap-2.5 text-sm text-foreground">
                    <input type="checkbox" name={`${day}_on`} defaultChecked={Boolean(slot) || (!det.weeklyHours && !["sat", "sun"].includes(day))} className="h-4 w-4 rounded border-input accent-primary" />
                    {WEEKDAY_LABELS[day]}
                  </label>
                  <select name={`${day}_from`} defaultValue={slot?.[0] ?? "09:00"} aria-label={`${WEEKDAY_LABELS[day]} from`} className="control h-10 w-32">
                    {TIMES.map((t) => (
                      <option key={t} value={t}>
                        {timeLabel(t)}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground" aria-hidden>
                    →
                  </span>
                  <select name={`${day}_to`} defaultValue={slot?.[1] ?? "17:00"} aria-label={`${WEEKDAY_LABELS[day]} to`} className="control h-10 w-32">
                    {TIMES.map((t) => (
                      <option key={t} value={t}>
                        {timeLabel(t)}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
        <SaveRow />
      </form>
    </ProfileSection>
  );
}

function PreferencesTab({ d, flash }: { d: ProfileData; flash: Flash }) {
  const det = d.details;
  const others = det.domainInterests.filter((x) => !(DOMAINS as readonly string[]).includes(x));
  return (
    <ProfileSection id="preferences" title="Work preferences" description="What you'd most like to work on. We'll tailor invitations to it." flash={flash}>
      <form action={saveProfileSection} className="space-y-8">
        {hidden("preferences")}
        <fieldset className="space-y-3">
          <legend className="mb-3 text-[15px] text-foreground">Fields you&apos;re interested in</legend>
          <div className="flex flex-wrap gap-2">
            {DOMAINS.map((dm) => (
              <label key={dm} className="cursor-pointer">
                <input type="checkbox" name="domainInterests" value={dm} defaultChecked={det.domainInterests.includes(dm)} className="peer sr-only" />
                <span className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm text-foreground/80 transition-colors peer-checked:border-primary/40 peer-checked:bg-primary/[0.07] peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:border-foreground/25">
                  {dm}
                </span>
              </label>
            ))}
          </div>
          <Input name="otherInterests" defaultValue={others.join(", ")} placeholder="Others (separate with commas)" aria-label="Other fields" />
        </fieldset>
        <div className="space-y-4">
          <div>
            <h3 className="text-[15px] text-foreground">Minimum expected pay</h3>
            <p className="text-sm text-muted-foreground">We won&apos;t reach out about roles below this. It stays private and doesn&apos;t affect your offers.</p>
          </div>
          <FieldRow>
            <Field label="Full-time (US$ a year)" htmlFor="minFullTimeUsd">
              <Input id="minFullTimeUsd" name="minFullTimeUsd" inputMode="numeric" defaultValue={det.minFullTimeUsd ?? ""} placeholder="e.g. 60000" />
            </Field>
            <Field label="Part-time (US$ an hour)" htmlFor="minPartTimeUsd">
              <Input id="minPartTimeUsd" name="minPartTimeUsd" inputMode="numeric" defaultValue={det.minPartTimeUsd ?? ""} placeholder="e.g. 20" />
            </Field>
          </FieldRow>
        </div>
        <SaveRow />
      </form>
    </ProfileSection>
  );
}

function CommunicationsTab({ d, flash }: { d: ProfileData; flash: Flash }) {
  const c = d.details.commPrefs;
  const yes = (k: keyof typeof c) => c[k] !== false;
  return (
    <ProfileSection id="communications" title="Communications" description="How and when you'd like to hear from us." flash={flash}>
      <form action={saveProfileSection}>
        {hidden("communications")}
        <div className="divide-y divide-border">
          <Toggle name="lookingForWork" label="Looking for work" help="Turn off to pause job invitations while you're busy." defaultChecked={d.details.lookingForWork} />
          <div className="pt-5 pb-1">
            <h3 className="text-[15px] text-foreground">Channels</h3>
          </div>
          <Toggle name="email" label="Email" defaultChecked={yes("email")} />
          <Toggle name="whatsapp" label="WhatsApp" help="To the phone number on your profile." defaultChecked={yes("whatsapp")} />
          <div className="pt-5 pb-1">
            <h3 className="text-[15px] text-foreground">Opportunities</h3>
          </div>
          <Toggle name="fullTime" label="Full-time roles" defaultChecked={yes("fullTime")} />
          <Toggle name="partTime" label="Part-time and project work" defaultChecked={yes("partTime")} />
          <Toggle name="referrals" label="Referral opportunities" help="When a partner is looking for people you might know." defaultChecked={yes("referrals")} />
          <div className="pt-5 pb-1">
            <h3 className="text-[15px] text-foreground">General</h3>
          </div>
          <Toggle name="jobAlerts" label="New roles and invitations" defaultChecked={yes("jobAlerts")} />
          <Toggle name="learning" label="New courses on Learn" defaultChecked={yes("learning")} />
        </div>
        <SaveRow />
      </form>
    </ProfileSection>
  );
}

async function AccountTab({ d, flash, expertId, avatarUrl }: { d: ProfileData; flash: Flash; expertId: string; avatarUrl: string | null }) {
  const method = await ownPayoutMethod(await getDb(), expertId);
  const p = d.profile;
  return (
    <div className="space-y-6">
      <ProfileSection id="avatar" title="Profile picture" flash={flash}>
        <div className="flex flex-wrap items-center gap-5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-full border border-border object-cover" />
          ) : (
            <span className="grid h-[72px] w-[72px] place-items-center rounded-full border border-border bg-secondary text-xl text-foreground/70" aria-hidden>
              {(p.fullName ?? "?").slice(0, 1).toUpperCase()}
            </span>
          )}
          <form action={uploadMyAvatar} className="flex flex-wrap items-center gap-3">
            <input type="file" name="file" accept="image/jpeg,image/png,image/gif,image/webp" required className="max-w-60 text-sm text-muted-foreground file:mr-3 file:h-9 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:text-sm file:text-foreground hover:file:bg-secondary" />
            <SubmitButton size="sm" variant="secondary" pendingText="Uploading…">
              Change picture
            </SubmitButton>
          </form>
          {avatarUrl ? (
            <form action={removeMyAvatar}>
              <SubmitButton size="sm" variant="ghost" pendingText="…">
                Remove
              </SubmitButton>
            </form>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">JPG, PNG, GIF or WebP, 2 MB at most (a small square picture works best).</p>
      </ProfileSection>

      <PortalCard className="divide-y divide-border">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-[15px] text-foreground">Payout method</p>
              <p className="text-sm text-muted-foreground">{method ? `${method.label}${method.handle ? ` · ${method.handle}` : ""}` : "Not set yet"}</p>
            </div>
          </div>
          <Link href="/me/payments#method" className={buttonClass("secondary", "sm")}>
            {method ? "Change" : "Add"}
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-[15px] text-foreground">Password</p>
              <p className="text-sm text-muted-foreground">Change the password you sign in with.</p>
            </div>
          </div>
          <Link href="/account/password" className={buttonClass("secondary", "sm")}>
            Change password
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-[15px] text-foreground">Email</p>
              <p className="text-sm text-muted-foreground">{p.email}. To move your account to a new address, write to hello@fynolabs.si.</p>
            </div>
          </div>
          <a href="mailto:hello@fynolabs.si?subject=Change%20my%20email" className={buttonClass("secondary", "sm")}>
            Change email
          </a>
        </div>
      </PortalCard>

      <ProfileSection id="consent" title="Sharing your profile" description={CONSENT_TEXT} flash={flash}>
        <p className="mb-4 text-sm text-foreground/85">
          Right now:{" "}
          <strong className="font-normal text-foreground">{p.cvConsent === "yes" ? "Yes, you may share it" : p.cvConsent === "no" ? "No, don't share it" : "Not answered yet"}</strong>
          {p.cvConsentAt ? <span className="text-muted-foreground"> · since {fmtDate(p.cvConsentAt)}</span> : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={setMyConsent}>
            <input type="hidden" name="consent" value="yes" />
            <SubmitButton size="sm" variant={p.cvConsent === "yes" ? "secondary" : "primary"}>
              Yes, share my profile
            </SubmitButton>
          </form>
          <form action={setMyConsent}>
            <input type="hidden" name="consent" value="no" />
            <SubmitButton size="sm" variant="ghost">
              No, don&apos;t share it
            </SubmitButton>
          </form>
        </div>
      </ProfileSection>

      <ProfileSection id="data" title="Your data" flash={flash}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Download everything you&apos;ve given us, as a file.</p>
            <a href="/api/me/export" className={buttonClass("secondary", "sm")}>
              <Download className="h-4 w-4" aria-hidden /> Download my data
            </a>
          </div>
          <div className="border-t border-border pt-5">
            <p className="text-[15px] text-foreground">Delete my account</p>
            {d.deletion ? (
              <p className="mt-1 text-sm text-muted-foreground">We have your request from {fmtDate(d.deletion.createdAt)} and will confirm by email within 30 days.</p>
            ) : (
              <form action={requestMyDeletion} className="mt-2 space-y-3">
                <p className="text-sm text-muted-foreground">We delete your profile, CV and applications and confirm by email within 30 days. Records we must keep by law (for example payments) are kept without your details.</p>
                <Textarea name="note" rows={2} placeholder="Anything we should know? (optional)" aria-label="Note" maxLength={500} />
                <SubmitButton size="sm" variant="danger" confirm="Ask us to delete your account and data?">
                  Request deletion
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      </ProfileSection>
    </div>
  );
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await portalContext("/me/profile");
  if (ctx.kind !== "expert") return null;
  const db = await getDb();
  const d = await profileData(db, ctx.expertId);
  if (!d) return null;
  const raw = one(sp.tab);
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "resume";
  const flash: Flash = { s: one(sp.s) || undefined, ok: one(sp.ok) || undefined, error: one(sp.error) || undefined };
  const avatarUrl = d.details.avatarFileId ? `/api/me/avatar?v=${d.details.avatarFileId.slice(0, 8)}` : null;
  return (
    <>
      <PortalHeader title="Profile" />
      {/* Messages from forms outside a section (consent, deletion) arrive without ?s. */}
      {!flash.s ? <FlashFromParams ok={flash.ok} error={flash.error} /> : null}
      <PortalTabs label="Profile" tabs={TABS.map((t) => ({ href: t.key === "resume" ? "/me/profile" : `/me/profile?tab=${t.key}`, label: t.label, active: tab === t.key }))} />
      {tab === "resume" ? <ResumeTab d={d} flash={flash} /> : null}
      {tab === "location" ? <LocationTab d={d} flash={flash} /> : null}
      {tab === "availability" ? <AvailabilityTab d={d} flash={flash} tz={timeZones()} /> : null}
      {tab === "preferences" ? <PreferencesTab d={d} flash={flash} /> : null}
      {tab === "communications" ? <CommunicationsTab d={d} flash={flash} /> : null}
      {tab === "account" ? <AccountTab d={d} flash={flash} expertId={ctx.expertId} avatarUrl={avatarUrl} /> : null}
    </>
  );
}
