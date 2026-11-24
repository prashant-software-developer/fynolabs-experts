// The admin's Ctrl K search: experts, accounts, leads, posted jobs, platforms and messages, for the
// sections the person may open (src/lib/server/search.ts). Emails are masked for viewers; no money.
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { apiGuard } from "@/lib/auth/api";
import { searchAdmin } from "@/lib/server/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await apiGuard("experts.read");
  if (user instanceof NextResponse) return user;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json(await searchAdmin(await getDb(), user, q));
}
