import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { apiGuard } from "@/lib/auth/api";
import { canSeeContact } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { todayIST } from "@/lib/crm/dates";
import { logActivity } from "@/lib/server/activity";
import { allContacts, contactView, parseContactFilters } from "@/lib/server/contacts";
import { idsParam, leadsCsv, pickRows } from "@/lib/server/crm-export";

export const dynamic = "force-dynamic";

/** The ticked leads (?ids=) or, without ids, the list as filtered, as CSV. Emails masked as on the page. */
export async function GET(req: NextRequest) {
  const user = await apiGuard("crm.edit");
  if (user instanceof NextResponse) return user;
  if (!canOpenSection(user, "leads")) return NextResponse.json({ error: "Your access doesn't include Leads." }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const ids = idsParam(sp);
  const db = await getDb();
  const all = await allContacts(db);
  const searchEmail = canSeeContact(user.role);
  const rows = ids.length ? pickRows(all, ids) : contactView(all, parseContactFilters(Object.fromEntries(sp.entries())), todayIST(), { searchEmail }).rows;
  await logActivity(db, { entityType: "import", entityId: "leads_export", actor: user, action: "leads_exported", detail: { rows: rows.length, ticked: ids.length } });
  return new NextResponse(leadsCsv(rows, user.role), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
