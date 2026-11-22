import { ExpertForm } from "@/components/expert-form";
import { NoAccess } from "@/components/ui/feedback";
import { PageHeader, Section } from "@/components/ui/layout";
import { can, canSeeMoney, roleLabel } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { valuesFromExpert } from "@/lib/forms/expert";

export const metadata = { title: "Add expert" };

export default async function NewExpertPage() {
  const user = await requireUser();
  const allowed = can(user.role, "experts.create");
  return (
    <>
      <PageHeader
        title="Add expert"
        subtitle={allowed ? "We warn you if the email or LinkedIn URL is already in the hub." : undefined}
        back={{ href: "/experts", label: "Experts" }}
      />
      {allowed ? (
        <Section>
          <ExpertForm initial={valuesFromExpert(null)} cancelHref="/experts" showRate={canSeeMoney(user.role)} />
        </Section>
      ) : (
        <Section flush>
          <NoAccess what="Adding experts" role={roleLabel(user.role)} />
        </Section>
      )}
    </>
  );
}
