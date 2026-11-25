import Link from "next/link";
import { Download, FileText, Trash2 } from "lucide-react";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { CONSENT_TEXT } from "@/lib/forms/job-fields";
import { one, type SearchParams } from "@/lib/filters";
import { bytes, fmtDate, place } from "@/lib/format";
import { completeness, ONBOARDING_STEPS, openDeletionRequest, ownApplications, ownCv, ownProfile, type StepId } from "@/lib/server/portal";
import { label } from "@/lib/constants";
import { Badge, Chips } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { FileDrop } from "@/components/ui/file-drop";
import { FlashFromParams, Notice } from "@/components/ui/feedback";
import { DefinitionList, Section, Stack } from "@/components/ui/layout";
import { requestMyDeletion, setMyConsent, uploadMyCv } from "./actions";

export const metadata = { title: "Profile" };

const edit = (step: StepId) => (
  <Link href={`/me/onboarding?step=${step}`} className={buttonClass("ghost", "sm")}>
    Edit
  </Link>
);

export default async function MePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await portalContext("/me");
  if (ctx.kind !== "expert") return null;
  const db = await getDb();
  const [p, cv, apps, deletion] = await Promise.all([ownProfile(db, ctx.expertId), ownCv(db, ctx.expertId), ownApplications(db, ctx.expertId), openDeletionRequest(db, ctx.expertId)]);
  if (!p) return null;
  const score = completeness(p, Boolean(cv));
  const nextStep = score.missing[0]?.step ?? ONBOARDING_STEPS.find((s) => !p.onboardingDone.includes(s.id))?.id;
  return (
    <Stack>
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <section className="space-y-4 rounded-md border border-border bg-card px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="eyebrow text-muted-foreground">Profile completeness</p>
            <p className="tabular text-stat text-foreground">{score.percent}%</p>
          </div>
          {score.percent < 100 && nextStep ? (
            <Link href={`/me/onboarding?step=${nextStep}`} className={buttonClass("primary", "md")}>
              {p.onboardingDone.length ? "Continue your profile" : "Complete your profile"}
            </Link>
          ) : (
            <Badge tone="success">Ready for matching</Badge>
          )}
        </div>
        <div className="h-1.5 overflow-hidden bg-secondary" role="progressbar" aria-valuenow={score.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
          <div className="h-1.5 bg-primary" style={{ width: `${score.percent}%` }} />
        </div>
        {score.missing.length ? (
          <p className="text-small text-muted-foreground">
            Still missing:{" "}
            {score.missing.map((m, i) => (
              <span key={m.label}>
                <Link href={`/me/onboarding?step=${m.step}`} className="text-foreground underline-offset-4 hover:underline">
                  {m.label}
                </Link>
                {i < score.missing.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </p>
        ) : null}
        <p className="text-small text-muted-foreground">
          {apps.length ? (
            <>
              {apps.length} {apps.length === 1 ? "application" : "applications"} ·{" "}
              <Link href="/me/applications" className="text-foreground underline-offset-4 hover:underline">
                see their status
              </Link>
            </>
          ) : (
            <>
              No applications yet ·{" "}
              <Link href="/" className="text-foreground underline-offset-4 hover:underline">
                browse open roles
              </Link>
            </>
          )}
        </p>
      </section>

      <Section title="Basics" actions={edit("basics")}>
        <DefinitionList
          items={[
            { label: "Name", value: p.fullName },
            { label: "Email", value: p.email },
            { label: "Phone", value: p.phone },
            { label: "Location", value: p.country ? place(p) : null },
            { label: "LinkedIn", value: p.linkedinUrl ? <a href={p.linkedinUrl} className="text-primary underline-offset-4 hover:underline" target="_blank" rel="noreferrer">{p.linkedinUrl.replace(/^https:\/\/(www\.)?/, "")}</a> : null },
          ]}
        />
      </Section>
      <Section title="Expertise & skills" actions={edit("expertise")}>
        <DefinitionList
          items={[
            { label: "Headline", value: p.headline },
            { label: "Field", value: p.domain },
            { label: "Skills", value: p.skills.length ? <Chips items={p.skills} max={30} /> : null },
            { label: "Languages", value: p.languages.join(", ") || null },
          ]}
        />
      </Section>
      <Section title="Experience & education" actions={edit("experience")}>
        <DefinitionList
          items={[
            { label: "Years of experience", value: p.yearsExperience },
            { label: "Highest degree", value: p.highestDegree },
            { label: "Field of study", value: p.fieldOfStudy },
            { label: "University", value: p.university },
          ]}
        />
      </Section>
      <Section title="Availability & hours" actions={edit("availability")}>
        <DefinitionList
          items={[
            { label: "Availability", value: label(p.availability) },
            { label: "Hours per week", value: p.hoursPerWeek },
          ]}
        />
      </Section>

      <Section title="CV" description="The CV we use for the roles you apply to.">
        <div className="space-y-4">
          {cv ? (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-foreground">{cv.filename}</span>
              <span className="text-xs text-muted-foreground">
                {bytes(cv.size)} · {fmtDate(cv.createdAt)}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No CV yet.</p>
          )}
          <form action={uploadMyCv}>
            <FileDrop name="file" accept=".pdf,.doc,.docx" label={cv ? "Replace your CV" : "Upload your CV"} hint="PDF or Word, up to 4 MB." submitLabel="Upload" />
          </form>
        </div>
      </Section>

      <Section title="Sharing consent" description={CONSENT_TEXT}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-foreground/80">
            {p.cvConsent === "yes" ? `You agreed${p.cvConsentAt ? ` on ${fmtDate(p.cvConsentAt)}` : ""}.` : p.cvConsent === "no" ? `You said no${p.cvConsentAt ? ` on ${fmtDate(p.cvConsentAt)}` : ""}. We won't share your profile.` : "Not answered yet."}
          </span>
          <form action={setMyConsent} className="flex gap-2">
            {p.cvConsent !== "yes" ? (
              <SubmitButton name="consent" value="yes" size="sm" variant="secondary">
                I agree
              </SubmitButton>
            ) : null}
            {p.cvConsent !== "no" ? (
              <SubmitButton name="consent" value="no" size="sm" variant="ghost">
                {p.cvConsent === "yes" ? "Withdraw consent" : "No, don't share"}
              </SubmitButton>
            ) : null}
          </form>
        </div>
      </Section>

      <Section title="Your data" description="Download everything you gave us, or ask us to delete it.">
        <div className="space-y-4">
          <a href="/api/me/export" className={buttonClass("secondary", "sm")}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Download my data (JSON)
          </a>
          {deletion ? (
            <Notice tone="info" title="Deletion requested">
              You asked us to delete your data on {fmtDate(deletion.createdAt)}. We will confirm by email within 30 days.
            </Notice>
          ) : (
            <form action={requestMyDeletion} className="space-y-2">
              <label htmlFor="del-note" className="block text-small text-muted-foreground">
                Anything we should know? (optional)
              </label>
              <textarea id="del-note" name="note" rows={2} maxLength={500} className="control" />
              <SubmitButton variant="ghost" size="sm" className="text-danger" confirm="Ask FynoLabs to delete your profile, CV and applications? This can't be undone once we act on it.">
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete my data
              </SubmitButton>
            </form>
          )}
        </div>
      </Section>
    </Stack>
  );
}
