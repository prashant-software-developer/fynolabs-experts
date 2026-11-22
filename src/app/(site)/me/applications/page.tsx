import Link from "next/link";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { fmtDate } from "@/lib/format";
import { ownApplications } from "@/lib/server/portal";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Section } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export const metadata = { title: "Applications" };

const TONE: Record<string, "neutral" | "info" | "progress" | "success" | "muted" | "warning"> = {
  new: "neutral",
  reviewing: "progress",
  shortlisted: "info",
  submitted_to_partner: "info",
  hired: "success",
  rejected: "muted",
  withdrawn: "muted",
};

export default async function MyApplicationsPage() {
  const ctx = await portalContext("/me/applications");
  if (ctx.kind !== "expert") return null;
  const apps = await ownApplications(await getDb(), ctx.expertId);
  return (
    <Section title="Your applications" description="Status updates appear here. We also email you about next steps." flush>
      {apps.length ? (
        <Table>
          <THead>
            <Th>Role</Th>
            <Th>Applied</Th>
            <Th>Status</Th>
            <Th>Last update</Th>
          </THead>
          <TBody>
            {apps.map((a) => (
              <Tr key={a.id}>
                <Td className="min-w-56">
                  {a.linkable ? (
                    <Link href={`/jobs/${a.slug}`} className="font-medium text-foreground hover:text-primary">
                      {a.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{a.title}</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">{fmtDate(a.createdAt)}</Td>
                <Td>
                  <Badge tone={TONE[a.status] ?? "neutral"}>{a.statusLabel}</Badge>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(a.updatedAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState
          title="No applications yet"
          description="When you apply to a role, it shows up here."
          action={
            <Link href="/" className={buttonClass("secondary", "sm")}>
              Browse open roles
            </Link>
          }
        />
      )}
    </Section>
  );
}
