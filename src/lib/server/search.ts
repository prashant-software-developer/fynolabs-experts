// The admin's Ctrl K search (the FynoLabs admin's GlobalSearch): experts, accounts, leads, posted jobs,
// platforms and messages, each with a title and one line of context. Only the sections the person may
// open are searched. Emails are masked for people who may not see contact details (and are then not
// searched either); no money fields are read.
import { desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { contacts, experts, jobs, messages, partners, platforms } from "@/db/schema";
import { can, canSeeContact, maskEmail, type Role } from "@/lib/auth/permissions";
import { canOpenSection, type SectionUser } from "@/lib/auth/sections";

export type SearchHit = { id: string; title: string; hint: string | null; href: string };
export type SearchResults = { experts: SearchHit[]; accounts: SearchHit[]; leads: SearchHit[]; jobs: SearchHit[]; platforms: SearchHit[]; messages: SearchHit[] };
export const EMPTY_RESULTS: SearchResults = { experts: [], accounts: [], leads: [], jobs: [], platforms: [], messages: [] };

/** Until something is typed: a few of each. Once typing: everything that matches, up to this many a section. */
export const SEARCH_IDLE_LIMIT = 4;
export const SEARCH_LIMIT = 50;

const join = (...parts: (string | null | undefined)[]) => parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ") || null;
const words = (v: string | null | undefined) => (v ?? "").replace(/_/g, " ");

export async function searchAdmin(db: DB, user: SectionUser & { role: Role }, query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, 80);
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const limit = q ? SEARCH_LIMIT : SEARCH_IDLE_LIMIT;
  const contact = canSeeContact(user.role);
  const email = (v: string | null | undefined) => (contact ? v : maskEmail(v));
  const match = (...cols: (SQL | undefined)[]) => (q ? or(...cols.filter((c): c is SQL => Boolean(c))) : undefined);
  const none = Promise.resolve([] as never[]);
  const crm = can(user.role, "crm.read");

  const [expertRows, accountRows, leadRows, jobRows, platformRows, messageRows] = await Promise.all([
    canOpenSection(user, "profiles") && can(user.role, "experts.read")
      ? db
          .select({ id: experts.id, name: experts.fullName, email: experts.email, headline: experts.headline })
          .from(experts)
          .where(match(ilike(experts.fullName, like), ilike(experts.headline, like), contact ? ilike(experts.email, like) : undefined))
          .orderBy(experts.fullName)
          .limit(limit)
      : none,
    canOpenSection(user, "accounts") && can(user.role, "partners.read")
      ? db
          .select({ id: partners.id, name: partners.name, domain: partners.domain, stage: partners.stage })
          .from(partners)
          .where(match(ilike(partners.name, like), ilike(partners.domain, like)))
          .orderBy(partners.name)
          .limit(limit)
      : none,
    canOpenSection(user, "leads") && crm
      ? db
          .select({ id: contacts.id, name: contacts.name, company: contacts.company, role: contacts.role, email: contacts.email })
          .from(contacts)
          .where(match(ilike(contacts.name, like), ilike(contacts.company, like), ilike(contacts.role, like), contact ? ilike(contacts.email, like) : undefined))
          .orderBy(contacts.name)
          .limit(limit)
      : none,
    canOpenSection(user, "posted-jobs") && can(user.role, "jobs.read")
      ? db
          .select({ id: jobs.id, title: jobs.title, status: jobs.status, company: partners.name })
          .from(jobs)
          .leftJoin(partners, eq(partners.id, jobs.partnerId))
          .where(match(ilike(jobs.title, like), can(user.role, "partners.read") ? ilike(partners.name, like) : undefined))
          .orderBy(desc(jobs.createdAt))
          .limit(limit)
      : none,
    canOpenSection(user, "platforms") && crm
      ? db
          .select({ id: platforms.id, name: platforms.name, domain: platforms.domain, kind: platforms.kind })
          .from(platforms)
          .where(match(ilike(platforms.name, like), ilike(platforms.domain, like)))
          .orderBy(platforms.name)
          .limit(limit)
      : none,
    canOpenSection(user, "messages") && can(user.role, "messages.read")
      ? db
          .select({ id: messages.id, name: messages.name, email: messages.email, message: messages.message })
          .from(messages)
          .where(match(ilike(messages.name, like), ilike(messages.message, like), contact ? ilike(messages.email, like) : undefined))
          .orderBy(desc(messages.createdAt))
          .limit(limit)
      : none,
  ]);

  return {
    experts: expertRows.map((r) => ({ id: r.id, title: r.name, hint: join(email(r.email), r.headline), href: `/admin/experts/${r.id}` })),
    accounts: accountRows.map((r) => ({ id: r.id, title: r.name, hint: join(r.domain, words(r.stage)), href: `/admin/accounts/${r.id}` })),
    leads: leadRows.map((r) => ({ id: r.id, title: r.name, hint: join(r.role, r.company, email(r.email)), href: `/admin/leads?view=${r.id}` })),
    jobs: jobRows.map((r) => ({ id: r.id, title: r.title, hint: join(can(user.role, "partners.read") ? r.company : null, words(r.status)), href: `/admin/jobs/${r.id}` })),
    platforms: platformRows.map((r) => ({ id: r.id, title: r.name, hint: join(r.domain, words(r.kind)), href: `/admin/platforms/${r.id}` })),
    messages: messageRows.map((r) => ({ id: r.id, title: r.name, hint: join(email(r.email), (r.message ?? "").replace(/\s+/g, " ").slice(0, 80)), href: `/admin/messages?view=${r.id}` })),
  };
}
