// The admin's Ctrl K search: people, accounts and jobs by name, for the sections the person may open.
// Names and one line of context only (no emails, no money).
import { NextResponse } from "next/server";
import { desc, ilike, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { experts, jobs, partners } from "@/db/schema";
import { apiGuard } from "@/lib/auth/api";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";

export const dynamic = "force-dynamic";

const LIMIT = 6;

export async function GET(req: Request) {
  const user = await apiGuard("experts.read");
  if (user instanceof NextResponse) return user;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ people: [], accounts: [], jobs: [] });
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const db = await getDb();
  const [people, accounts, jobRows] = await Promise.all([
    canOpenSection(user, "profiles")
      ? db.select({ id: experts.id, name: experts.fullName, sub: experts.headline }).from(experts).where(or(ilike(experts.fullName, like), ilike(experts.headline, like))).orderBy(desc(experts.updatedAt)).limit(LIMIT)
      : Promise.resolve([]),
    canOpenSection(user, "accounts") && can(user.role, "partners.read")
      ? db.select({ id: partners.id, name: partners.name, sub: partners.kind }).from(partners).where(ilike(partners.name, like)).orderBy(partners.name).limit(LIMIT)
      : Promise.resolve([]),
    canOpenSection(user, "posted-jobs") && can(user.role, "jobs.read")
      ? db.select({ id: jobs.id, name: jobs.title, sub: jobs.status }).from(jobs).where(ilike(jobs.title, like)).orderBy(desc(jobs.updatedAt)).limit(LIMIT)
      : Promise.resolve([]),
  ]);
  return NextResponse.json({
    people: people.map((p) => ({ id: p.id, name: p.name, sub: p.sub ?? "Expert", href: `/admin/experts/${p.id}` })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, sub: a.sub.replace(/_/g, " "), href: `/admin/accounts/${a.id}` })),
    jobs: jobRows.map((j) => ({ id: j.id, name: j.name, sub: j.sub, href: `/admin/jobs/${j.id}` })),
  });
}
