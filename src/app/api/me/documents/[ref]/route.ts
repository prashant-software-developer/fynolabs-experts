import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { ownExpertId } from "@/lib/auth/expert";
import { getAccount } from "@/lib/auth/session";
import { attachmentHeader } from "@/lib/csv";
import { ownDocumentFile } from "@/lib/server/portal-documents";

export const dynamic = "force-dynamic";

/**
 * The PDF (or file) of one of the signed-in expert's documents: ?file=signed for the signed copy they
 * uploaded, ?download=1 to save it instead of showing it. Only their own documents, or an active
 * template every expert signs. Framed by the document page, so it may be shown in a frame of this site.
 */
export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (account.kind !== "expert") return NextResponse.json({ error: "This is for expert accounts." }, { status: 403 });
  const expertId = await ownExpertId();
  if (!expertId) return NextResponse.json({ error: "No profile for this account." }, { status: 404 });
  const { ref } = await ctx.params;
  const url = new URL(req.url);
  const file = await ownDocumentFile(await getDb(), expertId, ref, url.searchParams.get("file") === "signed" ? "signed" : "original");
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = file.mime === "application/pdf" || /\.pdf$/i.test(file.filename);
  const inline = pdf && url.searchParams.get("download") !== "1";
  const disposition = attachmentHeader(file.filename);
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": pdf ? "application/pdf" : file.mime || "application/octet-stream",
      "Content-Disposition": inline ? disposition.replace(/^attachment/, "inline") : disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // The site sends X-Frame-Options: DENY everywhere; frame-ancestors (which browsers prefer) lets
      // the document page show this PDF in its frame, and nothing else.
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
