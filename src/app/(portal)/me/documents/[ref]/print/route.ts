// The signed copy as a plain, print-friendly page (no portal frame): the text as signed, or links to
// the PDFs, and the signature certificate. Only for the signed-in expert's own signed documents.
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { ownExpertId } from "@/lib/auth/expert";
import { getAccount } from "@/lib/auth/session";
import { documentForExpert, expertRecordPage, recordHtml, signerProfile } from "@/lib/server/portal-documents";
import { DOCUMENT_KIND_LABELS } from "@/lib/talent";

export const dynamic = "force-dynamic";

const page = (status: number, text: string) =>
  new NextResponse(`<!doctype html><meta charset="utf-8"><title>Document</title><body style="font:15px/1.6 system-ui,sans-serif;max-width:640px;margin:64px auto;padding:0 24px;color:#1f2937"><p>${text}</p><p><a href="/me/documents" style="color:#205FF3">Go to your documents</a></p></body>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });

export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const account = await getAccount();
  if (!account) return NextResponse.redirect(new URL(`/signin?callbackUrl=${encodeURIComponent(`/me/documents/${ref}/print`)}`, req.url));
  if (account.kind !== "expert") return page(403, "This page is for expert accounts.");
  const expertId = await ownExpertId();
  if (!expertId) return page(404, "We can't find this document.");
  const db = await getDb();
  const doc = await documentForExpert(db, expertId, ref);
  if (doc && "redirect" in doc) return NextResponse.redirect(new URL(`/me/documents/${doc.redirect}/print`, req.url));
  if (!doc) return page(404, "We can't find this document. It may have been withdrawn.");
  if (doc.status !== "signed") return NextResponse.redirect(new URL(`/me/documents/${doc.ref}`, req.url));
  const profile = await signerProfile(db, expertId);
  const kind = DOCUMENT_KIND_LABELS[doc.kind as keyof typeof DOCUMENT_KIND_LABELS] ?? "Document";
  return new NextResponse(recordHtml(expertRecordPage(doc, profile?.email ?? account.email, kind)), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
