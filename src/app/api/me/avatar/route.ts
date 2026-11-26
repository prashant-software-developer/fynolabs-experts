import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { ownExpertId } from "@/lib/auth/expert";
import { ownAvatar } from "@/lib/server/portal-profile";

export const dynamic = "force-dynamic";

/** The signed-in expert's own profile picture (never anyone else's). */
export async function GET() {
  const id = await ownExpertId();
  if (!id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const file = await ownAvatar(await getDb(), id);
  if (!file) return NextResponse.json({ error: "No picture." }, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: { "Content-Type": file.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
