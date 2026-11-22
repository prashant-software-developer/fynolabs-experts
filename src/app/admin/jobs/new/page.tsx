import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { one, type SearchParams } from "@/lib/filters";
import { emptyJobValues, jobPrefillFromRequirement } from "@/lib/forms/job";
import { getRequirement, listPartners, listRequirements } from "@/lib/server/requirements";
import { JobForm } from "@/components/jobs/job-form";
import { Notice, NoAccess } from "@/components/ui/feedback";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { ROLE_LABELS } from "@/lib/auth/permissions";

export const metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user.role, "jobs.manage")) return <NoAccess what="Creating jobs" role={ROLE_LABELS[user.role]} />;
  const db = await getDb();
  const reqId = one(sp.requirement);
  const fromReq = reqId ? await getRequirement(db, reqId) : null;
  const [partners, reqs] = await Promise.all([listPartners(db), listRequirements(db)]);
  const initial = fromReq ? jobPrefillFromRequirement(fromReq.req, { withRateNote: can(user.role, "jobs.rate_note") }) : emptyJobValues();
  return (
    <>
      <PageHeader title="New job" back={fromReq ? { href: `/admin/requirements/${fromReq.req.id}`, label: fromReq.req.title } : { href: "/admin/jobs", label: "Jobs" }} subtitle="Starts as a draft with the standard application form. Nothing is public until you open it." />
      <Stack>
        {fromReq ? (
          <Notice tone="info" title="Filled in from the requirement">
            Title, skills, fields, countries, minimum years, openings and the closing date come from {fromReq.req.title}. The partner stays internal; the public sees the company label. Check the wording before you publish.
          </Notice>
        ) : null}
        <Section>
          <JobForm
            initial={initial}
            partners={partners.map((p) => ({ id: p.id, name: p.name }))}
            requirements={reqs.map((r) => ({ id: r.req.id, label: `${r.req.title} · ${r.partnerName}` }))}
            cancelHref={fromReq ? `/admin/requirements/${fromReq.req.id}` : "/admin/jobs"}
            canSeeRateNote={can(user.role, "jobs.rate_note")}
          />
        </Section>
      </Stack>
    </>
  );
}
