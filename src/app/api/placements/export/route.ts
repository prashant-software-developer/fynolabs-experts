import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { label } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import { apiGuard } from "@/lib/auth/api";
import { computeMoney } from "@/lib/money";
import { logActivity } from "@/lib/server/activity";
import { listPlacements } from "@/lib/server/placements";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Expert",
  "Project",
  "Partner",
  "Status",
  "Start",
  "End",
  "Basis",
  "Hours approved",
  "Tasks accepted",
  "Rate to expert",
  "Rate from partner",
  "Currency",
  "Earned by expert",
  "Revenue",
  "Margin",
];

/** Placements with money, for finance (internal: never send to a partner). Same filters as the page. */
export async function GET(req: NextRequest) {
  const user = await apiGuard("placements.export");
  if (user instanceof NextResponse) return user;
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const partnerId = req.nextUrl.searchParams.get("partner") || undefined;
  const db = await getDb();
  const rows = await listPlacements(db, { status, partnerId });
  const csv = toCsv(
    HEADERS,
    rows.map((r) => {
      const m = computeMoney(r.p);
      return [
        r.expertName ?? "Deleted expert",
        r.p.projectName,
        r.partnerName,
        label(r.p.status),
        r.p.startDate,
        r.p.endDate,
        label(r.p.basis),
        r.p.hoursApproved,
        r.p.tasksAccepted,
        r.p.rateToExpert,
        r.p.rateFromPartner,
        r.p.currency,
        m.earned,
        m.revenue,
        m.margin,
      ];
    }),
  );
  await logActivity(db, { entityType: "import", entityId: "placements_export", actor: user, action: "placements_exported", detail: { rows: rows.length } });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="placements-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
