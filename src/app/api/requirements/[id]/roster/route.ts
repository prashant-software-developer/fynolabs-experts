import { NextResponse, type NextRequest } from "next/server";
import { zipSync } from "fflate";
import { getDb } from "@/db/client";
import { safeFilename } from "@/lib/csv";
import { rosterCsv } from "@/lib/roster";
import { apiUser } from "@/lib/auth/api";
import { logActivity } from "@/lib/server/activity";
import { readCv } from "@/lib/server/cv";
import { isUuid } from "@/lib/server/experts";
import { getRequirement } from "@/lib/server/requirements";
import { rosterFor } from "@/lib/server/roster";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Roster for the partner: ?format=csv (one row per expert) or ?format=zip (their CVs).
 * Only experts with CV consent = yes are included; the requirement page lists who was left out.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const found = await getRequirement(db, id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { plan, fileByExpert } = await rosterFor(db, id);
  const format = req.nextUrl.searchParams.get("format") === "zip" ? "zip" : "csv";
  const base = safeFilename(`${found.req.title}${found.req.externalRef ? ` ${found.req.externalRef}` : ""} - roster`, "roster");

  await logActivity(db, {
    entityType: "requirement",
    entityId: id,
    actor: user.email,
    action: "roster_exported",
    detail: { format, included: plan.included.length, skipped: plan.skipped.length },
  });

  if (format === "csv") {
    return new NextResponse(rosterCsv(plan.included), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // The ZIP goes to the partner: CVs of consenting experts plus the roster, nothing about anyone else.
  const entries: Record<string, Uint8Array> = {};
  for (const line of plan.included) {
    if (!line.zipName) continue;
    const f = fileByExpert.get(line.expert.id);
    const cv = f ? await readCv(db, f) : null;
    if (cv) entries[line.zipName] = cv.bytes;
  }
  entries["roster.csv"] = new TextEncoder().encode(rosterCsv(plan.included));
  const zip = zipSync(entries, { level: 6 });
  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${base}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
