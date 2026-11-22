import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { attachmentHeader } from "@/lib/csv";
import { apiGuard } from "@/lib/auth/api";
import { logActivity } from "@/lib/server/activity";
import { getFileRow, readCv } from "@/lib/server/cv";
import { isUuid } from "@/lib/server/experts";

export const dynamic = "force-dynamic";

/** Download one CV (internal). Jobs-site CVs are streamed from the jobs table, read only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiGuard("experts.cv_download");
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const row = await getFileRow(db, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = await readCv(db, row);
  if (!file) return NextResponse.json({ error: "The file is no longer available." }, { status: 410 });
  await logActivity(db, { entityType: "expert", entityId: row.expertId, actor: user, action: "cv_downloaded", detail: { fileId: id } });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Disposition": attachmentHeader(file.filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
