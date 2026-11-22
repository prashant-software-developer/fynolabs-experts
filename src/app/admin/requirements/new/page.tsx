import { getDb } from "@/db/client";
import { can, roleLabel } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { NoAccess } from "@/components/ui/feedback";
import { listPartners } from "@/lib/server/requirements";
import { RequirementForm } from "@/components/requirement-form";
import { PageHeader, Section } from "@/components/ui/layout";

export const metadata = { title: "New requirement" };

export default async function NewRequirementPage({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user.role, "requirements.create")) {
    return (
      <>
        <PageHeader title="New requirement" back={{ href: "/admin/requirements", label: "Requirements" }} />
        <Section flush>
          <NoAccess what="Adding requirements" role={roleLabel(user.role)} />
        </Section>
      </>
    );
  }
  const allowNewPartner = can(user.role, "partners.manage");
  const db = await getDb();
  const partners = await listPartners(db);
  return (
    <>
      <PageHeader title="New requirement" subtitle="Paste what the partner sent, check the fields, save. Matches appear right after." back={{ href: "/admin/requirements", label: "Requirements" }} />
      <Section>
        <RequirementForm
          withPaste
          allowNewPartner={allowNewPartner}
          cancelHref="/admin/requirements"
          partners={partners.map((p) => ({ id: p.id, name: p.name }))}
          initial={{
            partnerId: sp.partner && partners.some((p) => p.id === sp.partner) ? sp.partner : partners.length || !allowNewPartner ? "" : "new",
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
