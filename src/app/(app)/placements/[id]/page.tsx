import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { activityFor } from "@/lib/server/activity";
import { getPlacement } from "@/lib/server/placements";
import { listPartners } from "@/lib/server/requirements";
import { ActivityList } from "@/components/activity-list";
import { PlacementForm } from "@/components/placement-form";
import { StatusBadge } from "@/components/ui/badge";
import { FlashFromParams } from "@/components/ui/feedback";
import { PageHeader, Section, Stack } from "@/components/ui/layout";

export const metadata = { title: "Placement" };

const str = (v: number | string | null | undefined) => (v == null ? "" : String(v));

/** Show a stored total only if someone typed it (not when it's just units x rate). */
function typedTotal(stored: number | null, units: number | null, rate: number | null): string {
  if (stored == null) return "";
  if (units != null && rate != null && Math.abs(units * rate - stored) < 0.005) return "";
  return String(stored);
}

export default async function PlacementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const row = await getPlacement(db, id);
  if (!row) notFound();
  const [partners, activity] = await Promise.all([listPartners(db), activityFor(db, "placement", id, 50)]);
  const p = row.p;
  return (
    <>
      <PageHeader
        title={p.projectName}
        back={{ href: "/placements", label: "Placements" }}
        meta={
          <>
            {p.expertId ? (
              <Link href={`/experts/${p.expertId}`} className="font-medium text-foreground hover:text-primary">
                {row.expertName}
              </Link>
            ) : (
              <span className="text-muted-foreground/70">Deleted expert</span>
            )}
            <span className="text-muted-foreground">· {row.partnerName}</span>
            <StatusBadge value={p.status} />
          </>
        }
      />
      <FlashFromParams ok={sp.ok} error={sp.error} />
      <Stack>
        <Section>
          <PlacementForm
            id={id}
            partners={partners.map((x) => ({ id: x.id, name: x.name }))}
            expertLabel={row.expertName ?? null}
            cancelHref="/placements"
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
              earnedByExpert: typedTotal(p.earnedByExpert, p.basis === "per_task" ? p.tasksAccepted : p.hoursApproved, p.rateToExpert),
              revenue: typedTotal(p.revenue, p.basis === "per_task" ? p.tasksAccepted : p.hoursApproved, p.rateFromPartner),
              status: p.status,
              notes: p.notes ?? "",
            }}
          />
        </Section>
        <Section title="Activity">
          <ActivityList items={activity} showEntity={false} />
        </Section>
      </Stack>
    </>
  );
}
