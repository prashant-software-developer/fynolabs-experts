import { getDb } from "@/db/client";
import { listPartners } from "@/lib/server/requirements";
import { RequirementForm } from "@/components/requirement-form";
import { PageHeader, Section } from "@/components/ui/layout";

export const metadata = { title: "New requirement" };

export default async function NewRequirementPage({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const partners = await listPartners(db);
  return (
    <>
      <PageHeader title="New requirement" subtitle="Paste what the partner sent, check the fields, save. Matches appear right after." back={{ href: "/requirements", label: "Requirements" }} />
      <Section>
        <RequirementForm
          withPaste
          cancelHref="/requirements"
          partners={partners.map((p) => ({ id: p.id, name: p.name }))}
          initial={{
            partnerId: sp.partner && partners.some((p) => p.id === sp.partner) ? sp.partner : partners.length ? "" : "new",
            newPartner: "",
            title: "",
            externalRef: "",
            description: "",
            mustSkills: "",
            niceSkills: "",
            domains: [],
            degrees: [],
            countriesAllowed: "",
            countriesBlocked: "",
            minYears: "",
            slots: "1",
            rateNote: "",
            deadline: "",
            status: "open",
          }}
        />
      </Section>
    </>
  );
}
