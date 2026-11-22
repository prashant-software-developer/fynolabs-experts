import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { label } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import { parseExpertFilters } from "@/lib/filters";
import { apiGuard } from "@/lib/auth/api";
import { canSeeMoney } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/server/activity";
import { listExperts } from "@/lib/server/experts";

export const dynamic = "force-dynamic";
const MAX_ROWS = 10_000;

const HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Country",
  "State / region",
  "City",
  "LinkedIn",
  "Headline",
  "Domain",
  "Skills",
  "Languages",
  "Years of experience",
  "Highest degree",
  "Field of study",
  "University",
  "Hours per week",
  "Availability",
  "Status",
  "CV consent",
  "Rate expectation USD (internal)",
  "Source",
  "Tags",
  "Added",
  "Updated",
];

/** The current filtered list as CSV (internal use: includes contact details). */
export async function GET(req: NextRequest) {
  const user = await apiGuard("experts.export");
  if (user instanceof NextResponse) return user;
  const money = canSeeMoney(user.role);
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const f = { ...parseExpertFilters(sp), page: 1 };
  const db = await getDb();
  const { rows, total } = await listExperts(db, f, { limit: MAX_ROWS, offset: 0 });
  // The rate expectation column only goes to roles that may see money.
  const RATE = HEADERS.indexOf("Rate expectation USD (internal)");
  const keep = <T,>(cells: T[]) => (money ? cells : cells.filter((_, i) => i !== RATE));
  const csv = toCsv(
    keep(HEADERS),
    rows.map((e) => keep([
      e.fullName,
      e.email,
      e.phone,
      e.country,
      e.region,
      e.city,
      e.linkedinUrl,
      e.headline,
      e.domain,
      e.skills.join(", "),
      e.languages.join(", "),
      e.yearsExperience,
      e.highestDegree,
      e.fieldOfStudy,
      e.university,
      e.hoursPerWeek,
      label(e.availability),
      label(e.status),
      label(e.cvConsent),
      e.rateExpectationUsd,
      label(e.primarySource),
      e.tags.join(", "),
      e.createdAt.toISOString().slice(0, 10),
      e.updatedAt.toISOString().slice(0, 10),
    ])),
  );
  await logActivity(db, { entityType: "import", entityId: "experts_export", actor: user, action: "experts_exported", detail: { rows: rows.length, total, filters: Object.keys(sp) } });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="experts-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
