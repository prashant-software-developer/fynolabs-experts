// The team's record of one expert document, as a plain print-friendly page: the text as signed (or
// links to the original and signed PDFs) and the signature certificate. Email and IP address only
// for roles that see contact details; file links only for roles that may download files.
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { apiGuard } from "@/lib/auth/api";
import { can, canSeeContact, maskEmail } from "@/lib/auth/permissions";
import { canOpenSection, sectionMessage } from "@/lib/auth/sections";
import { documentRecord, recordHtml, teamRecordPage } from "@/lib/server/portal-documents";
import { DOCUMENT_KIND_LABELS, DOCUMENT_STATUS_LABELS } from "@/lib/talent";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiGuard("experts.read");
  if (user instanceof NextResponse) return user;
  if (!canOpenSection(user, "profiles")) return NextResponse.json({ error: sectionMessage("profiles") }, { status: 403 });
  const { id } = await ctx.params;
  const rec = await documentRecord(await getDb(), id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const html = recordHtml(
    teamRecordPage(rec, {
      kindLabel: DOCUMENT_KIND_LABELS[rec.kind as keyof typeof DOCUMENT_KIND_LABELS] ?? rec.kind,
      statusLabel: DOCUMENT_STATUS_LABELS[rec.status as keyof typeof DOCUMENT_STATUS_LABELS] ?? rec.status,
      contact: canSeeContact(user.role),
      files: can(user.role, "experts.cv_download"),
      mask: maskEmail,
    }),
  );
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
