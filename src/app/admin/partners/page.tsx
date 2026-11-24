import { redirect } from "next/navigation";
import { one, type SearchParams } from "@/lib/filters";

// Partners became Accounts (Phase 3b): the same companies, with the CRM. Old links keep working.
export default async function PartnersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const id = one(sp.edit) || one(sp.view);
  redirect(id ? `/admin/accounts?view=${encodeURIComponent(id)}` : "/admin/accounts");
}
