import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { apiGuard } from "@/lib/auth/api";
import { label } from "@/lib/constants";
import { attachmentHeader, toCsv } from "@/lib/csv";
import { answerText, type Answer } from "@/lib/forms/job-fields";
import { logActivity } from "@/lib/server/activity";
import { listApplicants } from "@/lib/server/applications";
import { isUuid } from "@/lib/server/experts";
import { getJob, jobFields } from "@/lib/server/jobs";

export const dynamic = "force-dynamic";

/**
 * Applicants of one job as CSV (admins and recruiters). One column per question; no money (rates,
 * the job's internal rate note) and no internal notes. File answers are file names only.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiGuard("applications.export");
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const found = await getJob(db, id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const fields = (await jobFields(db, id)).filter((f) => f.type !== "section");
  const rows = await listApplicants(db, id, { status: req.nextUrl.searchParams.get("status") ?? "" });
  const headers = ["Name", "Email", "Phone", "Country", "Status", "CV consent", "Applied", "Updated", "Source", ...fields.map((f) => (f.type === "consent" ? "Consent" : f.label.slice(0, 80)))];
  const body = rows.map((r) => {
    const a = r.app.answers as Record<string, Answer>;
    const src = r.app.source;
    return [
      r.expertName,
      r.expertEmail,
      r.expertPhone,
      r.expertCountry,
      label(r.app.status),
      label(r.cvConsent),
      r.app.createdAt.toISOString().slice(0, 10),
      r.app.updatedAt.toISOString().slice(0, 10),
      src?.invited ? "invite" : [src?.utm?.source, src?.utm?.medium, src?.utm?.campaign].filter(Boolean).join("/") || src?.ref || "direct",
      ...fields.map((f) => answerText(a[f.id])),
    ];
  });
  await logActivity(db, { entityType: "job", entityId: id, actor: user, action: "applicants_exported", detail: { rows: rows.length } });
  return new NextResponse(toCsv(headers, body), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": attachmentHeader(`${found.job.slug}-applicants-${new Date().toISOString().slice(0, 10)}.csv`),
      "Cache-Control": "private, no-store",
    },
  });
}
