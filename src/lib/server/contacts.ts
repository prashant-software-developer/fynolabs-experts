// Contacts (FynoLabs "Leads"): the people at companies. Viewers get the email masked.
import { asc, desc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { contacts, partners } from "@/db/schema";
import { CONTACT_KINDS, CONTACT_SOURCES, CONTACT_STAGES, isOneOf } from "@/lib/constants";
import { canSeeContact, maskEmail, type Role } from "@/lib/auth/permissions";
import { CONTACT_OPEN, CONTACT_TABS, type ContactTab } from "@/lib/crm/labels";
import { cleanLongText, cleanText, isoDate, normalizeEmail } from "@/lib/normalize";
import { logActivity, actorEmail, type Actor } from "./activity";
import type { Result } from "./companies";
import { isUuid } from "./experts";

export type ContactRow = {
  id: string;
  name: string;
  companyId: string | null;
  companyName: string | null;
  companyKind: string | null;
  company: string | null;
  role: string | null;
  kind: string;
  stage: string;
  source: string;
  sourceUrl: string | null;
  profileUrl: string | null;
  email: string | null;
  nextFollowUp: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const cols = {
  id: contacts.id,
  name: contacts.name,
  companyId: contacts.companyId,
  companyName: partners.name,
  companyKind: partners.kind,
  company: contacts.company,
  role: contacts.role,
  kind: contacts.kind,
  stage: contacts.stage,
  source: contacts.source,
  sourceUrl: contacts.sourceUrl,
  profileUrl: contacts.profileUrl,
  email: contacts.email,
  nextFollowUp: contacts.nextFollowUp,
  notes: contacts.notes,
  createdBy: contacts.createdBy,
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
};

/** A contact as a role may see it: the email masked without contact rights. */
export function visibleContact<T extends { email: string | null }>(role: Role, c: T): T {
  return canSeeContact(role) ? c : { ...c, email: maskEmail(c.email) };
}

export async function allContacts(db: DB): Promise<ContactRow[]> {
  return db.select(cols).from(contacts).leftJoin(partners, eq(partners.id, contacts.companyId)).orderBy(desc(contacts.updatedAt));
}

export async function contactsAt(db: DB, companyId: string): Promise<ContactRow[]> {
  if (!isUuid(companyId)) return [];
  return db.select(cols).from(contacts).leftJoin(partners, eq(partners.id, contacts.companyId)).where(eq(contacts.companyId, companyId)).orderBy(asc(contacts.name));
}

export async function getContact(db: DB, id: string): Promise<ContactRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select(cols).from(contacts).leftJoin(partners, eq(partners.id, contacts.companyId)).where(eq(contacts.id, id)).limit(1);
  return row ?? null;
}

// ---------- Filters (pure) ----------

export type ContactFilters = { tab: ContactTab; q: string; kind: string; stage: string; source: string; company: string; followUp: "" | "due" | "set" | "none" };

export function parseContactFilters(sp: Record<string, string | string[] | undefined>): ContactFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
  const tab = one(sp.tab);
  const fu = one(sp.followUp);
  return {
    tab: isOneOf(CONTACT_TABS, tab) ? tab : "open",
    q: one(sp.q).slice(0, 200),
    kind: isOneOf(CONTACT_KINDS, one(sp.kind)) ? one(sp.kind) : "",
    stage: isOneOf(CONTACT_STAGES, one(sp.stage)) ? one(sp.stage) : "",
    source: isOneOf(CONTACT_SOURCES, one(sp.source)) ? one(sp.source) : "",
    company: one(sp.company) === "none" || isUuid(one(sp.company)) ? one(sp.company) : "",
    followUp: fu === "due" || fu === "set" || fu === "none" ? fu : "",
  };
}

const tabMatch = (c: ContactRow, tab: ContactTab) => (tab === "all" ? true : tab === "won" ? c.stage === "won" : tab === "lost" ? c.stage === "lost" : (CONTACT_OPEN as readonly string[]).includes(c.stage));

export function contactView(all: ContactRow[], f: ContactFilters, today: string, opts: { searchEmail: boolean }) {
  const needle = f.q.toLowerCase();
  const base = all.filter(
    (c) =>
      (!f.kind || c.kind === f.kind) &&
      (!f.source || c.source === f.source) &&
      (!f.company || (f.company === "none" ? !c.companyId : c.companyId === f.company)) &&
      (f.followUp === "" ||
        (f.followUp === "due" ? Boolean(c.nextFollowUp && c.nextFollowUp <= today) && (CONTACT_OPEN as readonly string[]).includes(c.stage) : f.followUp === "set" ? Boolean(c.nextFollowUp) : !c.nextFollowUp)) &&
      (!needle || [c.name, c.company, c.companyName, c.role, c.notes, opts.searchEmail ? c.email : null].some((v) => (v ?? "").toLowerCase().includes(needle))),
  );
  const withStage = base.filter((c) => !f.stage || c.stage === f.stage);
  const counts = Object.fromEntries(CONTACT_TABS.map((t) => [t, withStage.filter((c) => tabMatch(c, t)).length])) as Record<ContactTab, number>;
  const rows = withStage.filter((c) => tabMatch(c, f.tab));
  const month = today.slice(0, 7);
  const stats = {
    open: all.filter((c) => (CONTACT_OPEN as readonly string[]).includes(c.stage)).length,
    calls: all.filter((c) => c.stage === "call").length,
    wonThisMonth: all.filter((c) => c.stage === "won" && c.updatedAt.toISOString().slice(0, 7) === month).length,
    followUpsDue: all.filter((c) => c.nextFollowUp && c.nextFollowUp <= today && (CONTACT_OPEN as readonly string[]).includes(c.stage)).length,
  };
  return { rows, counts, stats };
}

// ---------- Writes ----------

export type ContactInput = Partial<{
  name: string;
  companyId: string | null;
  company: string | null;
  role: string | null;
  email: string | null;
  kind: string;
  stage: string;
  source: string;
  profileUrl: string | null;
  sourceUrl: string | null;
  nextFollowUp: string | null;
  notes: string | null;
}>;

const url = (raw: string | null | undefined) => {
  const s = cleanText(raw, 500);
  if (!s) return null;
  if (/^(javascript|data|vbscript):/i.test(s)) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

async function contactValues(db: DB, input: ContactInput): Promise<Result<{ values: Partial<typeof contacts.$inferInsert> }>> {
  const v: Partial<typeof contacts.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = cleanText(input.name, 160);
    if (!name) return { ok: false, reason: "Add a name." };
    v.name = name;
  }
  if (input.companyId !== undefined) {
    if (input.companyId) {
      if (!isUuid(input.companyId)) return { ok: false, reason: "Pick an account from the list." };
      const [c] = await db.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.id, input.companyId)).limit(1);
      if (!c) return { ok: false, reason: "That account no longer exists." };
      v.companyId = c.id;
      v.company = c.name; // picking an account sets the company text to its name
    } else {
      v.companyId = null; // "No account": the company text stays as it was
    }
  }
  if (input.company !== undefined && v.company === undefined) v.company = cleanText(input.company, 160);
  if (input.role !== undefined) v.role = cleanText(input.role, 160);
  if (input.email !== undefined) {
    const raw = cleanText(input.email, 254);
    const email = raw ? normalizeEmail(raw) : null;
    if (raw && !email) return { ok: false, reason: "That email address doesn't look right." };
    v.email = email;
  }
  if (input.kind !== undefined) {
    if (!isOneOf(CONTACT_KINDS, input.kind)) return { ok: false, reason: "Pick a type." };
    v.kind = input.kind;
  }
  if (input.stage !== undefined) {
    if (!isOneOf(CONTACT_STAGES, input.stage)) return { ok: false, reason: "Pick a stage." };
    v.stage = input.stage;
  }
  if (input.source !== undefined) {
    if (!isOneOf(CONTACT_SOURCES, input.source)) return { ok: false, reason: "Pick a source." };
    v.source = input.source;
  }
  if (input.profileUrl !== undefined) v.profileUrl = url(input.profileUrl);
  if (input.sourceUrl !== undefined) v.sourceUrl = url(input.sourceUrl);
  if (input.nextFollowUp !== undefined) {
    const d = input.nextFollowUp ? isoDate(input.nextFollowUp) : null;
    if (input.nextFollowUp && !d) return { ok: false, reason: "The follow-up date isn't a date." };
    v.nextFollowUp = d;
  }
  if (input.notes !== undefined) v.notes = cleanLongText(input.notes, 8000);
  return { ok: true, values: v };
}

export async function createContact(db: DB, input: ContactInput & { name: string }, actor: Actor): Promise<Result> {
  const checked = await contactValues(db, { kind: "client", stage: "new", source: "linkedin", ...input });
  if (!checked.ok) return checked;
  const email = actorEmail(actor);
  const [row] = await db
    .insert(contacts)
    .values({ ...checked.values, name: checked.values.name!, createdBy: email, updatedBy: email })
    .returning({ id: contacts.id });
  await logActivity(db, { entityType: "contact", entityId: row.id, actor, action: "created" });
  return { ok: true, id: row.id };
}

export async function updateContact(db: DB, id: string, input: ContactInput, actor: Actor): Promise<Result> {
  const current = await getContact(db, id);
  if (!current) return { ok: false, reason: "That person no longer exists." };
  const checked = await contactValues(db, input);
  if (!checked.ok) return checked;
  const fields = Object.keys(checked.values);
  await db
    .update(contacts)
    .set({ ...checked.values, updatedAt: new Date(), updatedBy: actorEmail(actor) })
    .where(eq(contacts.id, id));
  await logActivity(db, { entityType: "contact", entityId: id, actor, action: input.stage && input.stage !== current.stage ? "stage_changed" : "updated", detail: { fields } });
  return { ok: true, id };
}

export async function deleteContact(db: DB, id: string, actor: Actor): Promise<Result> {
  const current = await getContact(db, id);
  if (!current) return { ok: false, reason: "That person no longer exists." };
  await db.delete(contacts).where(eq(contacts.id, id));
  await logActivity(db, { entityType: "contact", entityId: id, actor, action: "deleted" });
  return { ok: true, id };
}

/** Links an existing contact to a company (its company text becomes the company's name). */
export async function linkContact(db: DB, contactId: string, companyId: string | null, actor: Actor): Promise<Result> {
  return updateContact(db, contactId, { companyId }, actor);
}

/** The contacts to pick from (calendar, activity log), a company's people first. */
export async function contactChoices(db: DB, companyId?: string | null) {
  return db
    .select({ id: contacts.id, name: contacts.name, companyId: contacts.companyId, company: contacts.company })
    .from(contacts)
    .orderBy(companyId && isUuid(companyId) ? sql`case when ${contacts.companyId} = ${companyId} then 0 else 1 end` : sql`1`, asc(contacts.name))
    .limit(1000);
}
