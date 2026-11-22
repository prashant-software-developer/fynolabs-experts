import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { ownExpertId } from "@/lib/auth/expert";
import { getAccount } from "@/lib/auth/session";
import { exportOwnData } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

/** "Download my data": the signed-in expert's own data as JSON. Nobody else's, ever. */
export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (account.kind !== "expert") return NextResponse.json({ error: "This is for expert accounts." }, { status: 403 });
  const id = await ownExpertId();
  if (!id) return NextResponse.json({ error: "No profile for this account." }, { status: 404 });
  const data = await exportOwnData(await getDb(), id);
  if (!data) return NextResponse.json({ error: "No profile for this account." }, { status: 404 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-fynolabs-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
