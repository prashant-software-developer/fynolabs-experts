import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { apiGuard } from "@/lib/auth/api";
import { canOpenSection } from "@/lib/auth/sections";
import { todayIST } from "@/lib/crm/dates";
import { logActivity } from "@/lib/server/activity";
import { allCompanies, companyView, myTeamMemberId, parseCompanyFilters } from "@/lib/server/companies";
import { accountsCsv, idsParam, pickRows } from "@/lib/server/crm-export";

export const dynamic = "force-dynamic";

/** The ticked accounts (?ids=) or, without ids, the list as filtered (?tab=&stage=…), as CSV. */
export async function GET(req: NextRequest) {
  const user = await apiGuard("crm.edit");
  if (user instanceof NextResponse) return user;
  if (!canOpenSection(user, "accounts")) return NextResponse.json({ error: "Your access doesn't include Accounts." }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const ids = idsParam(sp);
  const db = await getDb();
  const [all, meId] = await Promise.all([allCompanies(db), myTeamMemberId(db, user.email)]);
  const rows = ids.length ? pickRows(companyView(all, parseCompanyFilters({ tab: "all" }), todayIST(), meId).rows, ids) : companyView(all, parseCompanyFilters(Object.fromEntries(sp.entries())), todayIST(), meId).rows;
  await logActivity(db, { entityType: "import", entityId: "accounts_export", actor: user, action: "accounts_exported", detail: { rows: rows.length, ticked: ids.length } });
  return new NextResponse(accountsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="accounts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
