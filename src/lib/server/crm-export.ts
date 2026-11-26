// CSV exports of the Accounts and Leads lists (the ticked rows, or the whole filtered list). Lead
// emails go out masked for roles that can't see contact details, as on the page.
import type { Role } from "@/lib/auth/permissions";
import { label } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import { crmLabel } from "@/lib/crm/labels";
import { ownerLabel, type CompanyRow } from "./companies";
import { visibleContact, type ContactRow } from "./contacts";

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/** Keeps the rows whose id was ticked (all of them when nothing was), in the list's order. */
export function pickRows<T extends { id: string }>(rows: T[], ids: readonly string[]): T[] {
  if (!ids.length) return rows;
  const want = new Set(ids);
  return rows.filter((r) => want.has(r.id));
}

export function accountsCsv(rows: CompanyRow[]): string {
  return toCsv(
    ["Account", "Type", "Business line", "Stage", "Priority", "Owner", "Next step", "Due", "Best route", "Website", "Location", "Tags", "People", "Last activity", "Added", "Updated"],
    rows.map((c) => [
      c.name,
      label(c.kind),
      crmLabel(c.businessLine),
      crmLabel(c.stage),
      label(c.priority),
      ownerLabel(c),
      c.nextStep,
      c.nextStepDue,
      c.bestRoute,
      c.website,
      c.location,
      c.tags.join(", "),
      c.people,
      day(c.lastActivityAt),
      day(c.createdAt),
      day(c.updatedAt),
    ]),
  );
}

export function leadsCsv(rows: ContactRow[], role: Role): string {
  return toCsv(
    ["Name", "Role", "Account", "Type", "Stage", "Source", "Email", "Profile", "Next follow-up", "Added", "Updated"],
    rows.map((raw) => {
      const c = visibleContact(role, raw);
      return [c.name, c.role, c.companyName ?? c.company, crmLabel(c.kind), crmLabel(c.stage, "contact"), crmLabel(c.source), c.email, c.profileUrl, c.nextFollowUp, day(c.createdAt), day(c.updatedAt)];
    }),
  );
}

/** ids from ?ids=a,b,c (or repeated ?ids=). */
export function idsParam(sp: URLSearchParams): string[] {
  return sp
    .getAll("ids")
    .flatMap((v) => v.split(","))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2000);
}
