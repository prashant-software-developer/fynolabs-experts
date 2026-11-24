// The job's FynoLabs posting fields (Details tab): badge, apply link, project and track, "GitHub
// required", the company the post names (internal) and, for money roles, the pay unit.
import Link from "next/link";
import { getDb } from "@/db/client";
import { can, canSeeMoney } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { JOB_BADGES } from "@/lib/talent";
import { jobPosting, PAY_UNITS } from "@/lib/server/job-posting";
import { projectOptions, trackOptions } from "@/lib/server/pipelines";
import { SubmitButton } from "@/components/ui/client";
import { Checkbox, Field, FieldRow, Input, Select } from "@/components/ui/field";
import { DefinitionList, Section } from "@/components/ui/layout";
import { saveJobPosting } from "../posting-actions";

export async function PostingSection({ jobId, user }: { jobId: string; user: CurrentUser }) {
  const db = await getDb();
  const p = await jobPosting(db, jobId);
  if (!p) return null;
  const money = canSeeMoney(user.role);
  const radar = p.radarListingId ? (
    <Link href={`/admin/jobs/radar?tab=published&r=${p.radarListingId}`} className="text-primary hover:underline">
      {p.radarPlatform}: {p.radarTitle}
    </Link>
  ) : null;
  if (!can(user.role, "jobs.manage")) {
    return (
      <Section title="Posting" description="The FynoLabs posted-job details. Internal: the public page shows the company label above.">
        <DefinitionList
          items={[
            { label: "Badge", value: p.badge },
            { label: "Platform or client (internal)", value: p.companyName },
            { label: "Apply link", value: p.applyUrl ? <span className="break-all">{p.applyUrl}</span> : null },
            { label: "Project", value: p.projectCode },
            { label: "Ask for GitHub", value: p.requireGithub ? "Yes" : "No" },
            { label: "From the job radar", value: radar },
            ...(money ? [{ label: "Pay unit (internal)", value: PAY_UNITS.find((u) => u.value === p.payUnit)?.label ?? p.payUnit }] : []),
          ]}
        />
      </Section>
    );
  }
  const [projects, tracks] = await Promise.all([projectOptions(db), trackOptions(db, p.projectId)]);
  return (
    <Section title="Posting" description="The FynoLabs posted-job details. Internal: the public page keeps the company label above and never shows pay or the client's name.">
      <form action={saveJobPosting} className="space-y-4">
        <input type="hidden" name="id" value={jobId} />
        <FieldRow>
          <Field label="Platform or client (internal)" htmlFor="companyName" hint="Who the role is really for. Never on the public page.">
            <Input id="companyName" name="companyName" defaultValue={p.companyName ?? ""} maxLength={160} />
          </Field>
          <Field label="Badge" htmlFor="badge">
            <Select id="badge" name="badge" defaultValue={p.badge ?? ""} options={JOB_BADGES.map((b) => ({ value: b, label: b }))} placeholder="No badge" />
          </Field>
        </FieldRow>
        <Field label="Apply link" htmlFor="applyUrl" hint="Optional. The platform page, with your referral (job radar roles get it filled in).">
          <Input id="applyUrl" name="applyUrl" defaultValue={p.applyUrl ?? ""} placeholder="https://…" inputMode="url" />
        </Field>
        <FieldRow>
          <Field label="Project" htmlFor="projectId" hint="Save, then pick a track.">
            <Select id="projectId" name="projectId" defaultValue={p.projectId ?? ""} options={projects.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))} placeholder="No project" />
          </Field>
          <Field label="Track" htmlFor="trackId">
            <Select id="trackId" name="trackId" defaultValue={p.trackId ?? ""} options={tracks.map((t) => ({ value: t.id, label: t.name }))} placeholder={p.projectId ? "No track" : "Pick a project first"} disabled={!p.projectId} />
          </Field>
        </FieldRow>
        {money ? (
          <Field label="Pay unit (internal)" htmlFor="payUnit" hint="Money: admins and finance. Never public.">
            <Select id="payUnit" name="payUnit" defaultValue={p.payUnit ?? ""} options={PAY_UNITS.map((u) => ({ value: u.value, label: u.label }))} placeholder="Not set" />
          </Field>
        ) : null}
        <Checkbox name="requireGithub" value="yes" defaultChecked={p.requireGithub} label="Ask for GitHub (applicants must add a GitHub profile)" />
        {radar ? <p className="text-small text-muted-foreground">From the job radar: {radar}</p> : null}
        <SubmitButton size="sm" variant="secondary" pendingText="Saving...">
          Save posting details
        </SubmitButton>
      </form>
    </Section>
  );
}
