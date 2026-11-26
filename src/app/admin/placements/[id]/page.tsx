import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { can, canSeeMoney, roleLabel } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { PLACEMENT_STATUSES, label } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { computeMoney, formatMoney } from "@/lib/money";
import { activityFor } from "@/lib/server/activity";
import { getPlacement, typedTotal } from "@/lib/server/placements";
import { listPartners } from "@/lib/server/requirements";
import { ActivityList } from "@/components/activity-list";
import { PlacementForm } from "@/components/placement-form";
import { StatusBadge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/client";
import { FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { OrgLogo } from "@/components/crm/org-logo";
import { DefinitionList, PageHeader, Section, Stack } from "@/components/ui/layout";
import { savePlacementProgress } from "../actions";

export const metadata = { title: "Placement" };

const str = (v: number | string | null | undefined) => (v == null ? "" : String(v));
const typed = (stored: number | null, units: number | null, rate: number | null) => str(typedTotal(stored, units, rate));

export default async function PlacementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const row = await getPlacement(db, id);
  if (!row) notFound();
  const p = row.p;
  const scopeCtx = { partnerId: p.partnerId, partnerIds: user.partnerIds };
  if (!can(user.role, "placements.read", scopeCtx)) {
    return (
      <>
        <PageHeader title="Placement" back={{ href: "/admin/placements", label: "Placements" }} />
        <Section flush>
          <NoAccess what="This placement (another partner's)" role={roleLabel(user.role)} />
        </Section>
      </>
    );
  }
  const fullEdit = can(user.role, "placements.edit");
  const progress = !fullEdit && can(user.role, "placements.progress", scopeCtx);
  const money = canSeeMoney(user.role);
  const [partners, activity] = await Promise.all([fullEdit ? listPartners(db) : Promise.resolve([]), activityFor(db, "placement", id, 50)]);
  const m = computeMoney(p);
  const units = p.basis === "per_task" ? p.tasksAccepted : p.hoursApproved;
  return (
    <>
      <PageHeader
        title={p.projectName}
        back={{ href: "/admin/placements", label: "Placements" }}
        media={<OrgLogo name={row.partnerName ?? ""} size={48} />}
        badge={<StatusBadge value={p.status} />}
        subtitle={row.partnerName ?? undefined}
        meta={
          p.expertId ? (
            <Link href={`/admin/experts/${p.expertId}`} className="inline-flex items-center gap-2 font-medium text-foreground hover:text-primary">
              <Avatar name={row.expertName} size="sm" />
              {row.expertName}
            </Link>
          ) : (
            <span className="text-muted-foreground/70">Deleted expert</span>
          )
        }
      />
      <FlashFromParams ok={sp.ok} error={sp.error} />
      <Stack>
        {fullEdit ? (
          <Section>
            <PlacementForm
              id={id}
              partners={partners.map((x) => ({ id: x.id, name: x.name }))}
              expertLabel={row.expertName ?? null}
              cancelHref="/admin/placements"
              initial={{
                expertId: p.expertId ?? "",
                partnerId: p.partnerId,
                submissionId: p.submissionId ?? "",
                projectName: p.projectName,
                startDate: p.startDate ?? "",
                endDate: p.endDate ?? "",
                basis: p.basis,
                rateToExpert: str(p.rateToExpert),
                rateFromPartner: str(p.rateFromPartner),
                currency: p.currency,
                hoursApproved: str(p.hoursApproved),
                tasksAccepted: str(p.tasksAccepted),
                earnedByExpert: typed(p.earnedByExpert, units, p.rateToExpert),
                revenue: typed(p.revenue, units, p.rateFromPartner),
                status: p.status,
                notes: p.notes ?? "",
              }}
            />
          </Section>
        ) : (
          <>
            <Section title="Placement">
              <DefinitionList
                items={[
                  { label: "Partner", value: row.partnerName },
                  { label: "Start", value: fmtDate(p.startDate) },
                  { label: "End", value: p.endDate ? fmtDate(p.endDate) : null },
                  { label: "Basis", value: label(p.basis) },
                  { label: "Hours approved", value: p.hoursApproved ?? null },
                  { label: "Tasks accepted", value: p.tasksAccepted ?? null },
                  ...(money
                    ? [
                        { label: "Earned by expert", value: formatMoney(m.earned, p.currency) },
                        { label: "Revenue", value: formatMoney(m.revenue, p.currency) },
                        { label: "Margin", value: formatMoney(m.margin, p.currency) },
                      ]
                    : []),
                ]}
              />
            </Section>
            {progress ? (
              <Section title="Update progress" description="Hours approved, tasks accepted and status. Pay is kept by finance.">
                <form action={savePlacementProgress} className="space-y-4">
                  <input type="hidden" name="id" value={id} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Hours approved" htmlFor="hoursApproved">
                      <Input id="hoursApproved" name="hoursApproved" inputMode="decimal" defaultValue={str(p.hoursApproved)} />
                    </Field>
                    <Field label="Tasks accepted" htmlFor="tasksAccepted">
                      <Input id="tasksAccepted" name="tasksAccepted" inputMode="numeric" defaultValue={str(p.tasksAccepted)} />
                    </Field>
                    <Field label="Status" htmlFor="status">
                      <Select id="status" name="status" defaultValue={p.status} options={PLACEMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))} />
                    </Field>
                  </div>
                  <SubmitButton size="sm" pendingText="Saving...">
                    Save progress
                  </SubmitButton>
                </form>
              </Section>
            ) : null}
          </>
        )}
        <Section title="Activity">
          <ActivityList items={activity} showEntity={false} />
        </Section>
      </Stack>
    </>
  );
}
