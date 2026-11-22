import { ExpertForm } from "@/components/expert-form";
import { PageHeader, Section } from "@/components/ui/layout";
import { valuesFromExpert } from "@/lib/forms/expert";

export const metadata = { title: "Add expert" };

export default function NewExpertPage() {
  return (
    <>
      <PageHeader title="Add expert" subtitle="We warn you if the email or LinkedIn URL is already in the hub." back={{ href: "/experts", label: "Experts" }} />
      <Section>
        <ExpertForm initial={valuesFromExpert(null)} cancelHref="/experts" />
      </Section>
    </>
  );
}
