// A document template's PDF, for the team (shown in the browser; ?download=1 to save it).
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { apiGuard } from "@/lib/auth/api";
import { canOpenSection, sectionMessage } from "@/lib/auth/sections";
import { attachmentHeader } from "@/lib/csv";
import { templatePdf } from "@/lib/server/portal-documents";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiGuard("experts.read");
  if (user instanceof NextResponse) return user;
  if (!canOpenSection(user, "profiles")) return NextResponse.json({ error: sectionMessage("profiles") }, { status: 403 });
  const { id } = await ctx.params;
  const file = await templatePdf(await getDb(), id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const disposition = attachmentHeader(file.filename);
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": new URL(req.url).searchParams.get("download") === "1" ? disposition : disposition.replace(/^attachment/, "inline"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
