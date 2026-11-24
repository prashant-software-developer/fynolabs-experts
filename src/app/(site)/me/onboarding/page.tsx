import Link from "next/link";
import { Check } from "lucide-react";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { one, type SearchParams } from "@/lib/filters";
import { completeness, isStep, ONBOARDING_STEPS, ownCv, ownProfile, type StepId } from "@/lib/server/portal";
import { OnboardingForm } from "@/components/portal/onboarding-form";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/feedback";

export const metadata = { title: "Complete your profile" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await portalContext("/me/onboarding");
  if (ctx.kind !== "expert") return null;
  const db = await getDb();
  const [p, cv] = await Promise.all([ownProfile(db, ctx.expertId), ownCv(db, ctx.expertId)]);
  if (!p) return null;
  const done = new Set(p.onboardingDone);
  const asked = one(sp.step);
  const step: StepId = isStep(asked) ? asked : (ONBOARDING_STEPS.find((s) => !done.has(s.id))?.id ?? "basics");
  const i = ONBOARDING_STEPS.findIndex((s) => s.id === step);
  const meta = ONBOARDING_STEPS[i];
  const next = ONBOARDING_STEPS[i + 1];
  const score = completeness(p, Boolean(cv));
  const initial: Record<string, string> = {
    fullName: p.fullName ?? "",
    country: p.country ?? "",
    city: p.city ?? "",
    region: p.region ?? "",
    phone: p.phone ?? "",
    linkedinUrl: p.linkedinUrl ?? "",
    headline: p.headline ?? "",
    domain: p.domain ?? "",
    skills: p.skills.join(", "),
    languages: p.languages.join(", "),
    yearsExperience: p.yearsExperience != null ? String(p.yearsExperience) : "",
    highestDegree: p.highestDegree ?? "",
    fieldOfStudy: p.fieldOfStudy ?? "",
    university: p.university ?? "",
    availability: p.availability ?? "",
    hoursPerWeek: p.hoursPerWeek != null ? String(p.hoursPerWeek) : "",
    consent: p.cvConsent === "unknown" ? "" : p.cvConsent,
  };
  const saved = one(sp.saved);
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm text-foreground/80">
            Step {i + 1} of {ONBOARDING_STEPS.length}
          </p>
          <p className="tabular text-sm text-muted-foreground">Profile {score.percent}% complete</p>
        </div>
        <div className="h-1.5 overflow-hidden bg-secondary" role="progressbar" aria-valuenow={score.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
          <div className="h-1.5 bg-primary transition-all" style={{ width: `${score.percent}%` }} />
        </div>
        <ol className="flex flex-wrap gap-2 pt-1">
          {ONBOARDING_STEPS.map((s, n) => {
            const isDone = done.has(s.id);
            const current = s.id === step;
            return (
              <li key={s.id}>
                <Link
                  href={`/me/onboarding?step=${s.id}`}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 border px-3 text-small transition-colors",
                    current ? "border-foreground bg-foreground text-background" : isDone ? "border-border text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isDone && !current ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="tabular text-xs opacity-70">{n + 1}</span>}
                  {s.title}
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
      {saved && isStep(saved) ? <Notice tone="success">Saved {ONBOARDING_STEPS.find((s) => s.id === saved)?.title.toLowerCase()}.</Notice> : null}
      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-[15px] font-normal text-foreground">{meta.title}</h2>
          <p className="text-small text-muted-foreground">{meta.blurb}</p>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <OnboardingForm key={step} step={step} initial={initial} nextHref={next ? `/me/onboarding?step=${next.id}` : null} cvFilename={cv?.filename ?? null} />
        </div>
      </section>
    </div>
  );
}
