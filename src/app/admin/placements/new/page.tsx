import { getDb } from "@/db/client";
import { can, roleLabel } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { getExpert, isUuid } from "@/lib/server/experts";
import { placementDraftFromSubmission } from "@/lib/server/placements";
import { listPartners } from "@/lib/server/requirements";
import { PlacementForm } from "@/components/placement-form";
import { EmptyState, NoAccess } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/ui/layout";

export const metadata = { title: "New placement" };

export default async function NewPlacementPage({ searchParams }: { searchParams: Promise<{ submission?: string; expert?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user.role, "placements.create")) {
    return (
      <>
        <PageHeader title="New placement" back={{ href: "/admin/placements", label: "Placements" }} />
        <Section flush>
          <NoAccess what="Creating placements" role={roleLabel(user.role)} />
        </Section>
      </>
    );
  }
  const db = await getDb();
  const partners = await listPartners(db);
  const fromSub = sp.submission ? await placementDraftFromSubmission(db, sp.submission) : null;
  const expert = !fromSub && sp.expert && isUuid(sp.expert) ? await getExpert(db, sp.expert) : null;
  if (!fromSub && !expert) {
    return (
      <>
        <PageHeader title="New placement" back={{ href: "/admin/placements", label: "Placements" }} />
        <Section>
          <EmptyState padded={false} title="Start from an approved submission" description="Open a requirement, go to Submissions and choose Create placement next to someone the partner approved. Or start from an expert's profile." action={<ButtonLink href="/admin/requirements">Requirements</ButtonLink>} />
        </Section>
      </>
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="New placement" back={{ href: fromSub ? `/admin/requirements/${fromSub.sub.requirementId}?tab=submissions` : `/admin/experts/${expert!.id}?tab=work`, label: "Back" }} />
      <Section>
        <PlacementForm
          partners={partners.map((p) => ({ id: p.id, name: p.name }))}
          expertLabel={fromSub ? fromSub.expertName : expert!.fullName}
          cancelHref="/admin/placements"
          initial={{
            expertId: fromSub ? fromSub.sub.expertId : expert!.id,
            partnerId: fromSub ? fromSub.partnerId : "",
            submissionId: fromSub ? fromSub.sub.id : "",
            projectName: fromSub ? fromSub.reqTitle : "",
            startDate: today,
            endDate: "",
            basis: "hourly",
            rateToExpert: "",
            rateFromPartner: "",
            currency: "USD",
            hoursApproved: "",
            tasksAccepted: "",
            earnedByExpert: "",
            revenue: "",
            status: "active",
            notes: "",
          }}
        />
      </Section>
    </>
  );
}
