// Expert portal: documents to sign (NDA, consent, contractor agreement, ...). A template marked
// required_for_all is due from every expert until they sign it; anything the team sends one expert is
// an expert_documents row. A document is addressed by a "ref": t-<template id> for a required
// template the expert hasn't opened yet, d-<expert_documents id> for their own row.
//
// Signing: a text template is filled with the expert's details ({{placeholders}}), its "☐" lines
// become boxes to tick, and the text as signed is kept with its SHA-256. A PDF is signed by typing
// the name (the PDF's SHA-256 is kept) or by uploading a signed copy. Every expert-side function takes
// the expert id from the signed-in session (src/lib/auth/expert.ts), never from a form. The team's
// side (templates, sending, the records) and the Word (.docx) converter used by
// scripts/load-default-documents.ts are further down. Tested in tests/portal-documents.test.ts.
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import type { DB } from "@/db/client";
import { rowsOf } from "@/db/client";
import { documentTemplates, expertDetails, expertDocuments, expertFiles, experts } from "@/db/schema";
import { DOCUMENT_KINDS, isOneOf } from "@/lib/constants";
import { daysBetween, isIsoDate, todayIST } from "@/lib/crm/dates";
import { fmtDate } from "@/lib/format";
import { cleanLongText, cleanText, normalizeEmail, toInt } from "@/lib/normalize";
import { tooBig } from "@/lib/upload-limit";
import { actorEmail, logActivity, type Actor, type EntityType } from "./activity";
import { addTimeline } from "./applications";
import { getFileRow, readCv } from "./cv";
import { isUuid } from "./experts";

const PORTAL_EMAIL = "expert-portal";
const PORTAL_ACTOR: Actor = { email: PORTAL_EMAIL, role: "expert" };
const IST = "Asia/Kolkata";
const LIVE = ["sent", "signed"] as const;
const CONTACT = () => (process.env.PUBLIC_CONTACT_EMAIL || "hello@fynolabs.si").trim();
// Template changes are logged under their own entity type (not in EntityType's list yet).
const TEMPLATE_ENTITY: EntityType = "document_template";

/** The statement every expert ticks to sign. */
export const SIGN_CONSENT = "I have read this document and sign it electronically. This has the same effect as my handwritten signature (Information Technology Act, 2000).";

/** The link the team gives experts (the portal sends no email). */
export const PORTAL_DOCUMENTS_URL = "https://experts.fynolabs.si/me/documents";

/** For the template editor: how a text template is written. */
export const TEMPLATE_TEXT_HELP =
  "One paragraph per line. Start a line with # for a heading, or with ☐ for a box to tick (add “(optional)” to the line if it may stay empty). Filled in when signing: {{full_name}}, {{email}}, {{address}}, {{city}}, {{country}}, {{place}}, {{date}}, {{day}}, {{month}}, {{year}}, {{relation}}, {{parent_name}}, {{age}}.";

// ---------------------------------------------------------------- refs and the to-do list

export type DocRef = { kind: "t" | "d"; id: string };

export function parseRef(ref: string | null | undefined): DocRef | null {
  const m = /^([td])-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(String(ref ?? "").trim());
  return m ? { kind: m[1].toLowerCase() as "t" | "d", id: m[2].toLowerCase() } : null;
}

export type DocumentToSign = { ref: string; title: string; kind: string; dueOn: string | null };

/** What the expert still has to sign: required templates without a signed row, then rows sent to them. */
export async function documentsToSign(db: DB, expertId: string): Promise<DocumentToSign[]> {
  const [templates, rows] = await Promise.all([
    db
      .select({ id: documentTemplates.id, title: documentTemplates.title, kind: documentTemplates.kind })
      .from(documentTemplates)
      .where(and(eq(documentTemplates.requiredForAll, true), eq(documentTemplates.active, true)))
      .orderBy(asc(documentTemplates.position), asc(documentTemplates.createdAt)),
    db
      .select({ id: expertDocuments.id, title: expertDocuments.title, kind: expertDocuments.kind, status: expertDocuments.status, templateId: expertDocuments.templateId, dueOn: expertDocuments.dueOn })
      .from(expertDocuments)
      .where(and(eq(expertDocuments.expertId, expertId), inArray(expertDocuments.status, ["sent", "signed"])))
      .orderBy(asc(expertDocuments.createdAt)),
  ]);
  const handled = new Set(rows.map((r) => r.templateId).filter(Boolean));
  const fromTemplates = templates.filter((t) => !handled.has(t.id)).map((t) => ({ ref: `t-${t.id}`, title: t.title, kind: t.kind, dueOn: null }));
  const sent = rows.filter((r) => r.status === "sent").map((r) => ({ ref: `d-${r.id}`, title: r.title, kind: r.kind, dueOn: r.dueOn }));
  return [...fromTemplates, ...sent];
}

export async function documentsToSignCount(db: DB, expertId: string): Promise<number> {
  return (await documentsToSign(db, expertId)).length;
}

export type SignedListItem = { ref: string; title: string; kind: string; signedAt: Date | null };

/** The Documents page: what is left to sign, what is signed, and the progress. */
export async function ownDocuments(db: DB, expertId: string) {
  const [toSign, signedRows] = await Promise.all([
    documentsToSign(db, expertId),
    db
      .select({ id: expertDocuments.id, title: expertDocuments.title, kind: expertDocuments.kind, signedAt: expertDocuments.signedAt })
      .from(expertDocuments)
      .where(and(eq(expertDocuments.expertId, expertId), eq(expertDocuments.status, "signed")))
      .orderBy(desc(expertDocuments.signedAt), desc(expertDocuments.createdAt)),
  ]);
  const signed: SignedListItem[] = signedRows.map((r) => ({ ref: `d-${r.id}`, title: r.title, kind: r.kind, signedAt: r.signedAt }));
  return { toSign, signed, done: signed.length, total: toSign.length + signed.length };
}

// ---------------------------------------------------------------- dates

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** The signing date as the placeholders use it (India time): "26 November 2026", "26th", "November", "2026". */
export function signingDate(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "numeric", month: "long", year: "numeric" }).formatToParts(now).map((p) => [p.type, p.value]));
  const day = Number(parts.day);
  return { date: `${day} ${parts.month} ${parts.year}`, day: ordinal(day), month: parts.month as string, year: parts.year as string };
}

/** "26 Nov 2026" (India time). */
export const istDay = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: IST, day: "numeric", month: "short", year: "numeric" });

/** "26 Nov 2026, 14:05:33 IST". */
export const istDateTime = (d: Date) => `${d.toLocaleString("en-GB", { timeZone: IST, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })} IST`;

/** The line under a document still to sign: "To sign", "Due in 3 days", "Due today", "Overdue: due 24 Nov 2026". */
export function dueText(dueOn: string | null, today: string = todayIST()): string {
  if (!dueOn || !isIsoDate(dueOn)) return "To sign";
  const n = daysBetween(today, dueOn);
  if (n < 0) return `Overdue: due ${fmtDate(dueOn)}`;
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  return `Due in ${n} days`;
}

// ---------------------------------------------------------------- text templates: placeholders, boxes, blocks

const TOKEN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi;
const BOX = /^(\s*)([☐☑])/;

/** The {{placeholders}} a text uses, in order (lower case, each once). */
export function placeholdersIn(body: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const m of (body ?? "").matchAll(TOKEN)) seen.add(m[1].toLowerCase());
  return [...seen];
}

export type CheckLine = { index: number; text: string; optional: boolean };

/** The lines that start with a box (☐), numbered from 0: each one is a box to tick when signing. */
export function checkLines(body: string | null | undefined): CheckLine[] {
  const out: CheckLine[] = [];
  for (const line of (body ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const m = BOX.exec(line);
    if (!m) continue;
    const text = line.slice(m[0].length).trim();
    out.push({ index: out.length, text, optional: /\(optional\)/i.test(text) });
  }
  return out;
}

/** The text with every placeholder filled and the ticked boxes shown as ☑ (the others stay ☐). */
export function fillBody(body: string, values: Record<string, string>, ticked: ReadonlySet<number> = new Set()): string {
  let box = -1;
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      let out = line.replace(TOKEN, (_m, k: string) => {
        const v = values[k.toLowerCase()];
        return v != null && v !== "" ? v : "________";
      });
      if (BOX.test(line)) {
        box += 1;
        const on = ticked.has(box);
        out = out.replace(BOX, (_m, sp: string) => `${sp}${on ? "☑" : "☐"}`);
      }
      return out;
    })
    .join("\n");
}

export type BodySeg = string | { key: string };
export type BodyBlock =
  | { type: "heading"; label?: string; segs: BodySeg[] }
  | { type: "para"; label?: string; segs: BodySeg[] }
  | { type: "bullet"; segs: BodySeg[] }
  | { type: "check"; index: number; optional: boolean; ticked: boolean; segs: BodySeg[] }
  | { type: "gap" };

function segsOf(text: string): BodySeg[] {
  const out: BodySeg[] = [];
  let last = 0;
  const plain = (s: string) => s.replace(/\t+/g, " ");
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(plain(text.slice(last, at)));
    out.push({ key: m[1].toLowerCase() });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(plain(text.slice(last)));
  return out;
}

/**
 * A text template as readable blocks: "# " headings ("# 01<tab>Title" keeps the number apart),
 * numbered clauses ("1.1<tab>...", "(a)<tab>..."), bullets, boxes to tick, and gaps for blank lines.
 */
export function bodyBlocks(body: string | null | undefined): BodyBlock[] {
  const out: BodyBlock[] = [];
  let box = 0;
  for (const raw of (body ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      if (out.length && out[out.length - 1].type !== "gap") out.push({ type: "gap" });
      continue;
    }
    const t = line.trimStart();
    let m: RegExpExecArray | null;
    if ((m = /^([☐☑])\s*(.*)$/.exec(t))) {
      out.push({ type: "check", index: box++, ticked: m[1] === "☑", optional: /\(optional\)/i.test(m[2]), segs: segsOf(m[2]) });
    } else if ((m = /^#\s+(.*)$/.exec(t))) {
      const n = /^(\d{1,3})\t+(.*)$/.exec(m[1]);
      out.push(n ? { type: "heading", label: n[1], segs: segsOf(n[2]) } : { type: "heading", segs: segsOf(m[1]) });
    } else if ((m = /^[•·▪◦]\s*(.*)$/.exec(t)) || (m = /^[-–]\s+(.*)$/.exec(t))) {
      out.push({ type: "bullet", segs: segsOf(m[1]) });
    } else if ((m = /^(\S{1,8})\t+(.*)$/.exec(t))) {
      out.push({ type: "para", label: m[1], segs: segsOf(m[2]) });
    } else {
      out.push({ type: "para", segs: segsOf(t) });
    }
  }
  while (out.length && out[out.length - 1].type === "gap") out.pop();
  return out;
}

/** "parent_name" -> "Parent name". */
export const humanizeKey = (key: string) => key.replace(/_+/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());

// ---------------------------------------------------------------- the signer's details and the form

export type SignerProfile = {
  fullName: string;
  email: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
};

export async function signerProfile(db: DB, expertId: string): Promise<SignerProfile | null> {
  if (!isUuid(expertId)) return null;
  const [row] = await db
    .select({
      fullName: experts.fullName,
      email: experts.email,
      city: experts.city,
      region: experts.region,
      country: experts.country,
      addressLine1: expertDetails.addressLine1,
      addressLine2: expertDetails.addressLine2,
      postalCode: expertDetails.postalCode,
    })
    .from(experts)
    .leftJoin(expertDetails, eq(expertDetails.expertId, experts.id))
    .where(eq(experts.id, expertId))
    .limit(1);
  return row ?? null;
}

/** Their saved address as one line (only when the address lines are filled in). */
export function addressOf(p: SignerProfile): string {
  if (!p.addressLine1?.trim() && !p.addressLine2?.trim()) return "";
  return [p.addressLine1, p.addressLine2, p.city, [p.region, p.postalCode].filter((x) => x?.trim()).join(" "), p.country]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** What fills itself in: email, the signing date, and city / place / country when the profile has them. */
export function autoValues(p: SignerProfile, now: Date = new Date()): Record<string, string> {
  const d = signingDate(now);
  const v: Record<string, string> = { email: p.email ?? "", date: d.date, day: d.day, month: d.month, year: d.year };
  if (p.city?.trim()) {
    v.city = p.city.trim();
    v.place = p.city.trim();
  }
  if (p.country?.trim()) v.country = p.country.trim();
  return v;
}

export type SignField = {
  key: string;
  label: string;
  input: "text" | "select" | "number" | "textarea";
  value: string;
  maxLength: number;
  options?: { value: string; label: string }[];
  hint?: string;
  autoComplete?: string;
  min?: number;
  max?: number;
};

export const RELATIONS = [
  { value: "son", label: "Son" },
  { value: "daughter", label: "Daughter" },
  { value: "spouse", label: "Spouse" },
];

const AUTO_KEYS = new Set(["full_name", "email", "date", "day", "month", "year"]);
const FIELD_ORDER = ["relation", "parent_name", "age", "address", "city", "country"];
const FIELD_MISSING: Record<string, string> = {
  relation: "Choose son, daughter or spouse.",
  parent_name: "Type their full name.",
  age: "Add your age.",
  address: "Add your home address.",
  city: "Add your city.",
  country: "Add your country.",
};

function fieldFor(key: string, p: SignerProfile): SignField {
  switch (key) {
    case "relation":
      return { key, label: "Son, daughter or spouse of", input: "select", value: "", options: RELATIONS, maxLength: 20 };
    case "parent_name":
      return { key, label: "Father's, mother's or spouse's full name", input: "text", value: "", maxLength: 200, autoComplete: "off" };
    case "age":
      return { key, label: "Age", input: "number", value: "", maxLength: 3, min: 18, max: 100, hint: "In years." };
    case "address":
      return { key, label: "Home address", input: "textarea", value: addressOf(p), maxLength: 500, hint: "Your full address, with the PIN or postal code.", autoComplete: "street-address" };
    case "city":
      return { key, label: "City", input: "text", value: p.city ?? "", maxLength: 80, autoComplete: "address-level2" };
    case "country":
      return { key, label: "Country", input: "text", value: p.country ?? "", maxLength: 80, autoComplete: "country-name" };
    default:
      return { key, label: humanizeKey(key), input: "text", value: "", maxLength: 300 };
  }
}

/**
 * The details a text template needs that the profile can't fill: relation, parent's name, age and
 * address (prefilled when saved), city and country when the profile lacks them, and any other
 * placeholder the team used. The name is the signature field, so it isn't listed here.
 */
export function signFields(body: string | null | undefined, p: SignerProfile): SignField[] {
  const want = new Set<string>();
  for (const k of placeholdersIn(body)) {
    if (AUTO_KEYS.has(k)) continue;
    if (k === "place" || k === "city") {
      if (!p.city?.trim()) want.add("city");
      continue;
    }
    if (k === "country") {
      if (!p.country?.trim()) want.add("country");
      continue;
    }
    want.add(k);
  }
  const keys = [...FIELD_ORDER.filter((k) => want.has(k)), ...[...want].filter((k) => !FIELD_ORDER.includes(k))];
  return keys.map((k) => fieldFor(k, p));
}

/** Checks the typed details; returns the clean values (errors go into `errors`, keyed like the fields). */
function checkFields(fields: SignField[], raw: Record<string, string>, errors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = cleanText(String(raw[f.key] ?? "").replace(/[,\s]*\n[,\s]*/g, ", "), f.maxLength);
    if (!v) {
      errors[f.key] = FIELD_MISSING[f.key] ?? "Fill this in.";
      continue;
    }
    if (f.key === "relation") {
      const r = v.toLowerCase();
      if (!RELATIONS.some((x) => x.value === r)) errors[f.key] = FIELD_MISSING.relation;
      else out[f.key] = r;
    } else if (f.key === "age") {
      const n = toInt(v, 18, 100);
      if (n == null || !/^\d{1,3}$/.test(v)) errors[f.key] = "Your age in years (18 or over).";
      else out[f.key] = String(n);
    } else if (f.key === "parent_name" && (v.length < 2 || !/\p{L}/u.test(v))) {
      errors[f.key] = FIELD_MISSING.parent_name;
    } else if (f.key === "address" && v.length < 8) {
      errors[f.key] = "Type your full address, with the PIN code.";
    } else {
      out[f.key] = v;
    }
  }
  return out;
}

const validName = (s: string | null): s is string => Boolean(s && s.length >= 3 && /\p{L}/u.test(s));

// ---------------------------------------------------------------- one document, as the expert sees it

type TemplateRow = {
  id: string;
  title: string;
  kind: string;
  description: string | null;
  body: string | null;
  filename: string | null;
  mime: string | null;
  size: number | null;
  hasPdf: boolean;
  requiredForAll: boolean;
  active: boolean;
};

const templateCols = {
  id: documentTemplates.id,
  title: documentTemplates.title,
  kind: documentTemplates.kind,
  description: documentTemplates.description,
  body: documentTemplates.body,
  filename: documentTemplates.filename,
  mime: documentTemplates.mime,
  size: documentTemplates.size,
  hasPdf: sql<boolean>`(${documentTemplates.data} is not null)`,
  requiredForAll: documentTemplates.requiredForAll,
  active: documentTemplates.active,
};

async function templateRow(db: DB, id: string): Promise<TemplateRow | null> {
  if (!isUuid(id)) return null;
  const [t] = await db.select(templateCols).from(documentTemplates).where(eq(documentTemplates.id, id)).limit(1);
  return t ?? null;
}

async function templateBytes(db: DB, id: string): Promise<Uint8Array | null> {
  const [r] = rowsOf<{ b64: string }>(await db.execute(sql`select encode(data, 'base64') as b64 from hub.document_templates where id = ${id} and data is not null`));
  return r ? new Uint8Array(Buffer.from(r.b64, "base64")) : null;
}

type DocRow = typeof expertDocuments.$inferSelect;
type Found = { ref: string; row: DocRow | null; template: TemplateRow | null };

/** The expert's own row, or an active required template; a template they already have a row for points at that row. */
async function findDocument(db: DB, expertId: string, ref: string): Promise<Found | { redirect: string } | null> {
  const r = parseRef(ref);
  if (!r || !isUuid(expertId)) return null;
  if (r.kind === "t") {
    const [own] = await db
      .select({ id: expertDocuments.id })
      .from(expertDocuments)
      .where(and(eq(expertDocuments.expertId, expertId), eq(expertDocuments.templateId, r.id), inArray(expertDocuments.status, [...LIVE])))
      .orderBy(desc(expertDocuments.createdAt))
      .limit(1);
    if (own) return { redirect: `d-${own.id}` };
    const t = await templateRow(db, r.id);
    if (!t || !t.active || !t.requiredForAll) return null;
    return { ref: `t-${t.id}`, row: null, template: t };
  }
  const [row] = await db
    .select()
    .from(expertDocuments)
    .where(and(eq(expertDocuments.id, r.id), eq(expertDocuments.expertId, expertId), inArray(expertDocuments.status, [...LIVE])))
    .limit(1);
  if (!row) return null;
  return { ref: `d-${row.id}`, row, template: row.templateId ? await templateRow(db, row.templateId) : null };
}

export type DocFile = { id: string | null; filename: string; mime: string; size: number | null; pdf: boolean };

export type PortalDocument = {
  ref: string;
  /** The expert_documents row (null for a required template not signed yet). */
  id: string | null;
  templateId: string | null;
  title: string;
  kind: string;
  description: string | null;
  dueOn: string | null;
  status: "to_sign" | "signed";
  /** text: `body` holds the text to sign (or, once signed, the text as signed). pdf / file: see `original`. */
  format: "text" | "pdf" | "file" | "missing";
  body: string | null;
  /** The PDF (or other file) to sign: the one sent to them, or the template's PDF (id null). */
  original: DocFile | null;
  /** The signed copy they uploaded. */
  signedCopy: DocFile | null;
  signedAt: Date | null;
  signedName: string | null;
  /** The email they had when they signed (kept in the signing record). */
  signedEmail: string | null;
  signMethod: string | null;
  signedHash: string | null;
  signedIp: string | null;
};

const isPdfFile = (filename: string, mime: string | null) => mime === "application/pdf" || /\.pdf$/i.test(filename);

async function fileInfo(db: DB, fileId: string, expertId: string): Promise<DocFile | null> {
  const [f] = await db
    .select({ id: expertFiles.id, expertId: expertFiles.expertId, filename: expertFiles.filename, mime: expertFiles.mime, size: expertFiles.size })
    .from(expertFiles)
    .where(eq(expertFiles.id, fileId))
    .limit(1);
  if (!f || f.expertId !== expertId) return null;
  return { id: f.id, filename: f.filename, mime: f.mime, size: f.size, pdf: isPdfFile(f.filename, f.mime) };
}

async function describe(db: DB, expertId: string, found: Found): Promise<PortalDocument> {
  const { row, template: t } = found;
  const signed = row?.status === "signed";
  const fromRow = row?.fileId ? await fileInfo(db, row.fileId, expertId) : null;
  const original = fromRow ?? (t?.hasPdf ? { id: null, filename: t.filename ?? "document.pdf", mime: "application/pdf", size: t.size, pdf: true } : null);
  const signedCopy = row?.signedFileId ? await fileInfo(db, row.signedFileId, expertId) : null;
  let format: PortalDocument["format"] = "missing";
  let body: string | null = null;
  if (signed) {
    if (row?.signedBody) {
      format = "text";
      body = row.signedBody;
    } else if (original) format = original.pdf ? "pdf" : "file";
    else if (signedCopy) format = signedCopy.pdf ? "pdf" : "file";
  } else if (original) format = original.pdf ? "pdf" : "file";
  else if (t?.body?.trim()) {
    format = "text";
    body = t.body;
  }
  return {
    ref: found.ref,
    id: row?.id ?? null,
    templateId: row ? row.templateId : (t?.id ?? null),
    title: row?.title ?? t?.title ?? "Document",
    kind: row?.kind ?? t?.kind ?? "other",
    description: t?.description ?? null,
    dueOn: row?.dueOn ?? null,
    status: signed ? "signed" : "to_sign",
    format,
    body,
    original,
    signedCopy,
    signedAt: row?.signedAt ?? null,
    signedName: row?.signedName ?? null,
    signedEmail: row?.signedFields?.email || null,
    signMethod: row?.signMethod ?? null,
    signedHash: row?.signedHash ?? null,
    signedIp: row?.signedIp ?? null,
  };
}

/** One document for the signed-in expert, or { redirect } to its canonical ref, or null (not theirs / gone). */
export async function documentForExpert(db: DB, expertId: string, ref: string): Promise<PortalDocument | { redirect: string } | null> {
  const found = await findDocument(db, expertId, ref);
  if (!found || "redirect" in found) return found;
  return describe(db, expertId, found);
}

/** First time they open a document the team sent: remember when (for the team's record). */
export async function markViewed(db: DB, expertId: string, doc: PortalDocument): Promise<void> {
  if (!doc.id || doc.status !== "to_sign") return;
  const hit = await db
    .update(expertDocuments)
    .set({ viewedAt: new Date() })
    .where(and(eq(expertDocuments.id, doc.id), eq(expertDocuments.expertId, expertId), sql`${expertDocuments.viewedAt} is null`))
    .returning({ id: expertDocuments.id });
  if (hit.length) await logActivity(db, { entityType: "expert", entityId: expertId, actor: PORTAL_ACTOR, action: "document_viewed", detail: { documentId: doc.id } });
}

export type FileBytes = { filename: string; mime: string; bytes: Uint8Array };

async function readOwnFile(db: DB, expertId: string, fileId: string): Promise<FileBytes | null> {
  const row = await getFileRow(db, fileId);
  if (!row || row.expertId !== expertId) return null;
  const f = await readCv(db, row);
  return f ? { filename: f.filename, mime: f.mime, bytes: f.bytes } : null;
}

async function originalBytes(db: DB, expertId: string, doc: PortalDocument): Promise<FileBytes | null> {
  if (!doc.original) return null;
  if (doc.original.id) return readOwnFile(db, expertId, doc.original.id);
  if (!doc.templateId) return null;
  const bytes = await templateBytes(db, doc.templateId);
  return bytes ? { filename: doc.original.filename, mime: "application/pdf", bytes } : null;
}

/** The PDF (or file) of one of their documents: the original, or the signed copy they uploaded. */
export async function ownDocumentFile(db: DB, expertId: string, ref: string, which: "original" | "signed" = "original"): Promise<FileBytes | null> {
  const doc = await documentForExpert(db, expertId, ref);
  if (!doc || "redirect" in doc) return null;
  if (which === "signed") return doc.signedCopy?.id ? readOwnFile(db, expertId, doc.signedCopy.id) : null;
  return originalBytes(db, expertId, doc);
}

// ---------------------------------------------------------------- signing

export const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** The signer's address for the record: the first x-forwarded-for entry, else x-real-ip. */
export function clientIp(h: { get(name: string): string | null }): string | null {
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (first || h.get("x-real-ip")?.trim() || null)?.slice(0, 100) ?? null;
}

export type UploadFile = { filename: string; mime: string; bytes: Uint8Array };

/** Null when it is a PDF within the upload limit, else what to tell the person. */
export function checkPdf(f: UploadFile | null | undefined): string | null {
  if (!f || !f.bytes.byteLength) return "Choose a PDF file first.";
  const big = tooBig(f.bytes.byteLength);
  if (big) return big;
  const head = Buffer.from(f.bytes.subarray(0, 1024)).toString("latin1");
  if (!head.includes("%PDF-")) return "That isn't a PDF. Save it as a PDF and upload it again.";
  return null;
}

const pdfName = (name: string) => {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim().slice(0, 200) || "document.pdf";
  return /\.pdf$/i.test(clean) ? clean : `${clean}.pdf`;
};

async function saveDocumentFile(db: DB, expertId: string, file: UploadFile, by: string): Promise<string> {
  const b64 = Buffer.from(file.bytes).toString("base64");
  const [row] = await db
    .insert(expertFiles)
    .values({ expertId, kind: "document", filename: pdfName(file.filename), mime: "application/pdf", size: file.bytes.byteLength, storage: "upload", data: sql`decode(${b64}, 'base64')`, createdBy: by })
    .returning({ id: expertFiles.id });
  return row.id;
}

type SignedPatch = Pick<typeof expertDocuments.$inferInsert, "signMethod" | "signedName" | "signedIp" | "signedUserAgent" | "signedHash" | "signedBody" | "signedFields" | "signedFileId">;

/** Writes the signature: updates their sent row (only while it is still "sent"), or adds a row for a required template. */
async function writeSigned(db: DB, expertId: string, doc: PortalDocument, patch: SignedPatch, now: Date): Promise<string | null> {
  const common = { ...patch, status: "signed", signedAt: now, updatedAt: now, updatedBy: PORTAL_EMAIL };
  if (doc.id) {
    const hit = await db
      .update(expertDocuments)
      .set({ ...common, viewedAt: sql`coalesce(${expertDocuments.viewedAt}, ${now.toISOString()}::timestamptz)` })
      .where(and(eq(expertDocuments.id, doc.id), eq(expertDocuments.expertId, expertId), eq(expertDocuments.status, "sent")))
      .returning({ id: expertDocuments.id });
    return hit[0]?.id ?? null;
  }
  if (!doc.templateId) return null;
  // Someone may have signed (or the team sent it) in the meantime.
  const [other] = await db
    .select({ id: expertDocuments.id })
    .from(expertDocuments)
    .where(and(eq(expertDocuments.expertId, expertId), eq(expertDocuments.templateId, doc.templateId), inArray(expertDocuments.status, [...LIVE])))
    .limit(1);
  if (other) return null;
  const [row] = await db
    .insert(expertDocuments)
    .values({ expertId, kind: doc.kind, title: doc.title, templateId: doc.templateId, viewedAt: now, createdBy: PORTAL_EMAIL, createdAt: now, ...common })
    .returning({ id: expertDocuments.id });
  return row.id;
}

async function recordSigning(db: DB, expertId: string, id: string, doc: PortalDocument, method: "typed" | "upload") {
  await addTimeline(db, { expertId, kind: "document", summary: `${doc.title}: ${method === "upload" ? "signed copy uploaded" : "signed"} in the portal`, by: PORTAL_EMAIL });
  await logActivity(db, { entityType: "expert", entityId: expertId, actor: PORTAL_ACTOR, action: "document_signed", detail: { documentId: id, templateId: doc.templateId, method } });
}

export type SignInput = {
  name: string;
  /** The details typed in the form, by placeholder key (relation, parent_name, age, address, ...). */
  fields?: Record<string, string>;
  /** The boxes ticked (their index among the ☐ lines). */
  ticked?: number[];
  consent: boolean;
  ip?: string | null;
  userAgent?: string | null;
};
export type SignResult = { ok: true; ref: string; id: string } | { ok: false; message: string; errors: Record<string, string> };

const failed = (message: string): SignResult => ({ ok: false, message, errors: {} });

/** Signs one of their documents by typing their name (text templates: filled in, with the boxes ticked). */
export async function signDocument(db: DB, expertId: string, ref: string, input: SignInput, now: Date = new Date()): Promise<SignResult> {
  const doc = await documentForExpert(db, expertId, ref);
  if (!doc || "redirect" in doc) return failed("We couldn't find this document. Open it again from your Documents page.");
  if (doc.status === "signed") return failed("You've already signed this document.");
  if (doc.format === "missing") return failed(`This document isn't ready to sign yet. Write to ${CONTACT()} if you need it.`);
  const profile = await signerProfile(db, expertId);
  if (!profile) return failed("We couldn't find your profile. Sign out and in again.");

  const errors: Record<string, string> = {};
  const name = cleanText(input.name, 200);
  if (!validName(name)) errors.signedName = "Type your full legal name.";
  if (!input.consent) errors.consent = "Tick this box to sign.";
  const text = doc.format === "text" ? (doc.body ?? "") : null;
  const typed = text != null ? checkFields(signFields(text, profile), input.fields ?? {}, errors) : {};
  const boxes = text != null ? checkLines(text) : [];
  const ticked = new Set((input.ticked ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < boxes.length));
  for (const b of boxes) if (!b.optional && !ticked.has(b.index)) errors[`check_${b.index}`] = "Tick this box to sign.";
  if (Object.keys(errors).length || !name) return { ok: false, message: "Check the highlighted fields.", errors };

  const auto = autoValues(profile, now);
  const signedFields: Record<string, string> = { full_name: name, email: profile.email ?? "", date: auto.date, consent: "yes" };
  let signedBody: string | null = null;
  let hash: string;
  if (text != null) {
    const values: Record<string, string> = { ...auto, ...typed, full_name: name };
    if (typed.city) values.place = typed.city;
    signedBody = fillBody(text, values, ticked);
    hash = sha256(signedBody);
    Object.assign(signedFields, typed);
    for (const b of boxes) signedFields[`box_${b.index + 1}`] = ticked.has(b.index) ? "ticked" : "not ticked";
  } else {
    const file = await originalBytes(db, expertId, doc);
    if (!file) return failed(`The file for this document isn't available. Write to ${CONTACT()} and we'll fix it.`);
    hash = sha256(file.bytes);
    signedFields.file = file.filename;
  }
  const id = await writeSigned(
    db,
    expertId,
    doc,
    { signMethod: "typed", signedName: name, signedIp: cleanText(input.ip, 100), signedUserAgent: cleanText(input.userAgent, 500), signedHash: hash, signedBody, signedFields },
    now,
  );
  if (!id) return failed("This document changed in the meantime (signed or withdrawn). Open your Documents page again.");
  await recordSigning(db, expertId, id, doc, "typed");
  return { ok: true, ref: `d-${id}`, id };
}

/** For a PDF: instead of typing, they upload a copy they signed by hand (PDF, within the upload limit). */
export async function uploadSignedCopy(
  db: DB,
  expertId: string,
  ref: string,
  input: { name: string; file: UploadFile | null; ip?: string | null; userAgent?: string | null },
  now: Date = new Date(),
): Promise<{ ok: true; ref: string; id: string } | { ok: false; reason: string }> {
  const doc = await documentForExpert(db, expertId, ref);
  if (!doc || "redirect" in doc) return { ok: false, reason: "We couldn't find this document. Open it again from your Documents page." };
  if (doc.status === "signed") return { ok: false, reason: "You've already signed this document." };
  if (doc.format !== "pdf" && doc.format !== "file") return { ok: false, reason: "This document is signed on the page: type your name above." };
  const name = cleanText(input.name, 200);
  if (!validName(name)) return { ok: false, reason: "Type your full legal name." };
  const problem = checkPdf(input.file);
  if (problem || !input.file) return { ok: false, reason: problem ?? "Choose a PDF file first." };
  const profile = await signerProfile(db, expertId);
  const fileId = await saveDocumentFile(db, expertId, input.file, PORTAL_EMAIL);
  const id = await writeSigned(
    db,
    expertId,
    doc,
    {
      signMethod: "upload",
      signedFileId: fileId,
      signedName: name,
      signedIp: cleanText(input.ip, 100),
      signedUserAgent: cleanText(input.userAgent, 500),
      signedHash: sha256(input.file.bytes),
      signedBody: null,
      signedFields: { full_name: name, email: profile?.email ?? "", file: pdfName(input.file.filename) },
    },
    now,
  );
  if (!id) {
    await db.delete(expertFiles).where(eq(expertFiles.id, fileId));
    return { ok: false, reason: "This document changed in the meantime (signed or withdrawn). Open your Documents page again." };
  }
  await recordSigning(db, expertId, id, doc, "upload");
  return { ok: true, ref: `d-${id}`, id };
}

// ---------------------------------------------------------------- the printable record (expert and team)

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const segText = (segs: BodySeg[]) => segs.map((s) => (typeof s === "string" ? s : `{{${s.key}}}`)).join("");

function blocksHtml(blocks: BodyBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "gap") return `<div class="gap"></div>`;
      const text = esc(segText(b.segs));
      if (b.type === "heading") return `<h3>${b.label ? `<span class="num">${esc(b.label)}</span>` : ""}${text}</h3>`;
      if (b.type === "bullet") return `<p class="item"><span class="num">•</span><span>${text}</span></p>`;
      if (b.type === "check") return `<p class="item"><span class="box">${b.ticked ? "☑" : "☐"}</span><span>${text}</span></p>`;
      return b.label ? `<p class="item"><span class="num">${esc(b.label)}</span><span>${text}</span></p>` : `<p>${text}</p>`;
    })
    .join("\n");
}

export const SIGN_METHOD_LABELS: Record<string, string> = { typed: "Typed name (electronic signature)", upload: "Uploaded a signed copy" };

export type RecordPage = {
  title: string;
  subtitle: string;
  /** The text as signed (text documents). */
  body: string | null;
  links: { label: string; href: string }[];
  rows: { label: string; value: string; mono?: boolean }[];
  back?: { href: string; label: string } | null;
  notice?: string | null;
};

/** A plain, print-friendly HTML page: the signed text and the signature certificate. Every value is escaped. */
export function recordHtml(p: RecordPage): string {
  const rows = p.rows.map((r) => `<tr><th>${esc(r.label)}</th><td${r.mono ? ' class="mono"' : ""}>${esc(r.value || "–")}</td></tr>`).join("");
  const links = p.links.length ? `<p class="links">${p.links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join(" · ")}</p>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(p.title)} · signed record</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1f2937;font:15px/1.65 Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 24px 64px}
.top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:36px}
.brand{display:flex;align-items:center;gap:10px;color:#6b7280;font-size:14px}
.top a,.top button{font:inherit;font-size:13px;color:#111827;background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;cursor:pointer;text-decoration:none}
.top button{background:#205FF3;border-color:#205FF3;color:#fff}
h1{font-size:28px;font-weight:300;line-height:1.25;margin:0 0 6px;color:#111827}
.sub{margin:0 0 28px;color:#6b7280;font-size:14px}
.notice{border-left:2px solid #205FF3;background:#f5f7fb;padding:10px 14px;margin:0 0 24px;font-size:14px}
article p{margin:0 0 10px}
article h3{font-size:15px;font-weight:600;color:#111827;margin:22px 0 8px}
article h3 .num{margin-right:10px}
.item{display:grid;grid-template-columns:2.6rem 1fr}
.num{color:#9ca3af;font-variant-numeric:tabular-nums}
.box{font-size:16px;line-height:1.5}
.gap{height:6px}
.links{margin:24px 0 0}
.links a{color:#205FF3}
.cert{margin-top:40px;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;break-inside:avoid}
.cert h2{font-size:15px;font-weight:600;margin:0 0 10px;color:#111827}
.cert table{width:100%;border-collapse:collapse;font-size:13px}
.cert th{text-align:left;font-weight:400;color:#6b7280;padding:6px 18px 6px 0;vertical-align:top;white-space:nowrap;width:1%}
.cert td{padding:6px 0;vertical-align:top}
.cert td.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all}
.small{color:#6b7280;font-size:12px;margin:12px 0 0}
@media print{.noprint{display:none!important}main{padding:0}@page{margin:18mm 16mm}}
</style>
</head>
<body>
<main>
<div class="top">
<div class="brand"><img src="/brand/fynolabs-mark.svg" alt="" width="22" height="22"> FynoLabs · signed document</div>
<div class="noprint">${p.back ? `<a href="${esc(p.back.href)}">${esc(p.back.label)}</a> ` : ""}<button type="button" onclick="window.print()">Print or save as PDF</button></div>
</div>
<h1>${esc(p.title)}</h1>
<p class="sub">${esc(p.subtitle)}</p>
${p.notice ? `<p class="notice">${esc(p.notice)}</p>` : ""}
${p.body ? `<article>\n${blocksHtml(bodyBlocks(p.body))}\n</article>` : ""}
${links}
<section class="cert">
<h2>Signature certificate</h2>
<table>${rows}</table>
<p class="small">Signed electronically in the FynoLabs expert portal (Information Technology Act, 2000). The SHA-256 fingerprint identifies exactly what was signed: changing a single character changes it.</p>
</section>
</main>
</body>
</html>`;
}

const hashLabel = (method: string | null, hasText: boolean) => (method === "upload" ? "SHA-256 of the signed copy" : hasText ? "SHA-256 of the signed text" : "SHA-256 of the PDF");

/** The expert's own signed record (/me/documents/<ref>/print). */
export function expertRecordPage(doc: PortalDocument, email: string | null, kindLabel: string): RecordPage {
  const links: { label: string; href: string }[] = [];
  if (doc.format !== "text" && doc.original) links.push({ label: doc.original.pdf ? "Open the PDF" : "Download the document", href: `/api/me/documents/${doc.ref}` });
  if (doc.signedCopy) links.push({ label: "Your signed copy", href: `/api/me/documents/${doc.ref}?file=signed` });
  return {
    title: doc.title,
    subtitle: `${kindLabel} · ${doc.signedAt ? `Signed ${istDay(doc.signedAt)}` : "Signed"}`,
    body: doc.format === "text" ? doc.body : null,
    links,
    back: { href: `/me/documents/${doc.ref}`, label: "Back" },
    rows: [
      { label: "Document", value: doc.title },
      { label: "Signed by", value: doc.signedName ?? "" },
      { label: "Email", value: doc.signedEmail ?? email ?? "" },
      { label: "Signed at", value: doc.signedAt ? istDateTime(doc.signedAt) : "" },
      { label: "IP address", value: doc.signedIp ?? "" },
      { label: "Method", value: doc.signMethod ? (SIGN_METHOD_LABELS[doc.signMethod] ?? doc.signMethod) : "Recorded by the FynoLabs team" },
      { label: hashLabel(doc.signMethod, doc.format === "text"), value: doc.signedHash ?? "", mono: true },
      { label: "Record ID", value: doc.id ?? "", mono: true },
    ],
  };
}

// ---------------------------------------------------------------- the team's side: templates

export type TemplateListRow = {
  id: string;
  title: string;
  kind: string;
  description: string | null;
  requiredForAll: boolean;
  active: boolean;
  position: number;
  filename: string | null;
  size: number | null;
  hasPdf: boolean;
  hasBody: boolean;
  signed: number;
  waiting: number;
  updatedAt: Date;
};

/** Per template: how many experts signed it and how many have it waiting (sent). */
async function templateCounts(db: DB, templateId?: string): Promise<Map<string, { signed: number; waiting: number }>> {
  const rows = await db
    .select({ templateId: expertDocuments.templateId, status: expertDocuments.status, n: sql<number>`count(*)::int` })
    .from(expertDocuments)
    .where(and(templateId ? eq(expertDocuments.templateId, templateId) : isNotNull(expertDocuments.templateId), inArray(expertDocuments.status, ["sent", "signed"])))
    .groupBy(expertDocuments.templateId, expertDocuments.status);
  const out = new Map<string, { signed: number; waiting: number }>();
  for (const r of rows) {
    if (!r.templateId) continue;
    const c = out.get(r.templateId) ?? { signed: 0, waiting: 0 };
    if (r.status === "signed") c.signed += Number(r.n);
    else c.waiting += Number(r.n);
    out.set(r.templateId, c);
  }
  return out;
}

export async function listTemplates(db: DB): Promise<TemplateListRow[]> {
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: documentTemplates.id,
        title: documentTemplates.title,
        kind: documentTemplates.kind,
        description: documentTemplates.description,
        requiredForAll: documentTemplates.requiredForAll,
        active: documentTemplates.active,
        position: documentTemplates.position,
        filename: documentTemplates.filename,
        size: documentTemplates.size,
        hasPdf: sql<boolean>`(${documentTemplates.data} is not null)`,
        hasBody: sql<boolean>`(coalesce(length(${documentTemplates.body}), 0) > 0)`,
        updatedAt: documentTemplates.updatedAt,
      })
      .from(documentTemplates)
      .orderBy(asc(documentTemplates.position), asc(documentTemplates.createdAt)),
    templateCounts(db),
  ]);
  return rows.map((r) => ({ ...r, hasPdf: Boolean(r.hasPdf), hasBody: Boolean(r.hasBody), signed: counts.get(r.id)?.signed ?? 0, waiting: counts.get(r.id)?.waiting ?? 0 }));
}

export type TemplateDetail = TemplateRow & { position: number; signed: number };

export async function getTemplate(db: DB, id: string): Promise<TemplateDetail | null> {
  if (!isUuid(id)) return null;
  const [t] = await db
    .select({ ...templateCols, position: documentTemplates.position })
    .from(documentTemplates)
    .where(eq(documentTemplates.id, id))
    .limit(1);
  if (!t) return null;
  const counts = await templateCounts(db, t.id);
  return { ...t, hasPdf: Boolean(t.hasPdf), signed: counts.get(t.id)?.signed ?? 0 };
}

/** The PDF of a template (team only). */
export async function templatePdf(db: DB, id: string): Promise<FileBytes | null> {
  const t = await getTemplate(db, id);
  if (!t?.hasPdf) return null;
  const bytes = await templateBytes(db, id);
  return bytes ? { filename: t.filename ?? "document.pdf", mime: "application/pdf", bytes } : null;
}

export type TemplateInput = {
  id?: string | null;
  title: string;
  kind: string;
  description?: string | null;
  body?: string | null;
  requiredForAll: boolean;
  active: boolean;
  position?: string | number | null;
  /** A new PDF (replaces the one there). */
  pdf?: UploadFile | null;
  removePdf?: boolean;
};

/** Adds or changes a template: either text (with placeholders) or a PDF, never both. */
export async function saveTemplate(db: DB, actor: Actor, input: TemplateInput): Promise<{ ok: true; id: string; created: boolean } | { ok: false; reason: string }> {
  const title = cleanText(input.title, 200);
  if (!title) return { ok: false, reason: "Give the template a title." };
  if (!isOneOf(DOCUMENT_KINDS, input.kind)) return { ok: false, reason: "Pick what kind of document it is." };
  const existing = input.id ? await getTemplate(db, input.id) : null;
  if (input.id && !existing) return { ok: false, reason: "That template no longer exists." };
  const body = cleanLongText(input.body, 100_000);
  const newPdf = input.pdf && input.pdf.bytes.byteLength ? input.pdf : null;
  if (newPdf) {
    const problem = checkPdf(newPdf);
    if (problem) return { ok: false, reason: problem };
  }
  const pdfAfter = Boolean(newPdf) || (Boolean(existing?.hasPdf) && !input.removePdf);
  if (body && pdfAfter) return { ok: false, reason: "A template is either text or a PDF. Clear the text, or remove the PDF." };
  if (!body && !pdfAfter) return { ok: false, reason: "Add the text, or upload a PDF." };
  if (existing?.hasPdf && (newPdf || input.removePdf) && existing.signed > 0)
    return { ok: false, reason: "People have signed this PDF, so it stays as it is. For a new version, add a new template and turn this one off." };
  const [clash] = await db
    .select({ id: documentTemplates.id })
    .from(documentTemplates)
    .where(sql`lower(${documentTemplates.title}) = ${title.toLowerCase()}${existing ? sql` and ${documentTemplates.id} <> ${existing.id}` : sql``}`)
    .limit(1);
  if (clash) return { ok: false, reason: `There's already a template called “${title}”.` };
  const by = actorEmail(actor);
  const now = new Date();
  const fields = {
    title,
    kind: input.kind,
    description: cleanText(input.description, 300),
    body: body ?? null,
    requiredForAll: Boolean(input.requiredForAll),
    active: Boolean(input.active),
    position: toInt(input.position, 0, 999) ?? 0,
    updatedAt: now,
    updatedBy: by,
    ...(newPdf
      ? { filename: pdfName(newPdf.filename), mime: "application/pdf", size: newPdf.bytes.byteLength, data: sql`decode(${Buffer.from(newPdf.bytes).toString("base64")}, 'base64')` }
      : !pdfAfter
        ? { filename: null, mime: null, size: null, data: null }
        : {}),
  };
  let id: string;
  if (existing) {
    await db.update(documentTemplates).set(fields).where(eq(documentTemplates.id, existing.id));
    id = existing.id;
  } else {
    const [row] = await db.insert(documentTemplates).values({ ...fields, createdBy: by }).returning({ id: documentTemplates.id });
    id = row.id;
  }
  await logActivity(db, { entityType: TEMPLATE_ENTITY, entityId: id, actor, action: existing ? "document_template_updated" : "document_template_created", detail: { format: pdfAfter ? "pdf" : "text", requiredForAll: fields.requiredForAll, active: fields.active } });
  return { ok: true, id, created: !existing };
}

/** Deletes a template nobody has a row for; one with rows (sent or signed) is turned off instead. */
export async function deleteTemplate(db: DB, actor: Actor, id: string): Promise<{ ok: true; deleted: boolean; title: string } | { ok: false; reason: string }> {
  const t = await getTemplate(db, id);
  if (!t) return { ok: false, reason: "That template no longer exists." };
  const used = await db.$count(expertDocuments, eq(expertDocuments.templateId, t.id));
  if (used > 0) {
    await db.update(documentTemplates).set({ active: false, updatedAt: new Date(), updatedBy: actorEmail(actor) }).where(eq(documentTemplates.id, t.id));
    await logActivity(db, { entityType: TEMPLATE_ENTITY, entityId: t.id, actor, action: "document_template_turned_off", detail: { rows: used } });
    return { ok: true, deleted: false, title: t.title };
  }
  await db.delete(documentTemplates).where(eq(documentTemplates.id, t.id));
  await logActivity(db, { entityType: TEMPLATE_ENTITY, entityId: t.id, actor, action: "document_template_deleted" });
  return { ok: true, deleted: true, title: t.title };
}

/** Active templates, for the Send form. */
export async function templateChoices(db: DB) {
  return db
    .select({ id: documentTemplates.id, title: documentTemplates.title, kind: documentTemplates.kind, requiredForAll: documentTemplates.requiredForAll })
    .from(documentTemplates)
    .where(eq(documentTemplates.active, true))
    .orderBy(asc(documentTemplates.position), asc(documentTemplates.title));
}

// ---------------------------------------------------------------- the team's side: sending and records

export type SendInput = {
  email: string;
  templateId?: string | null;
  /** A PDF just for this expert (instead of a template). */
  pdf?: UploadFile | null;
  title?: string | null;
  kind?: string | null;
  dueOn?: string | null;
  /** For the team only (never shown to the expert). */
  note?: string | null;
};

/** Puts a document on one expert's Documents page (status "sent"). No email is sent. */
export async function sendDocument(
  db: DB,
  actor: Actor,
  input: SendInput,
  today: string = todayIST(),
): Promise<{ ok: true; id: string; expertId: string; expertName: string; title: string } | { ok: false; reason: string }> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, reason: "Type the expert's email address." };
  const [e] = await db.select({ id: experts.id, name: experts.fullName, status: experts.status }).from(experts).where(eq(experts.email, email)).limit(1);
  if (!e) return { ok: false, reason: `No expert has the email ${email}. Check it, or add them in Experts first.` };
  if (e.status === "do_not_contact") return { ok: false, reason: `${e.name} is marked do not contact.` };
  const pdf = input.pdf && input.pdf.bytes.byteLength ? input.pdf : null;
  const templateId = cleanText(input.templateId, 40);
  if (templateId && pdf) return { ok: false, reason: "Choose a template or upload a PDF, not both." };
  if (!templateId && !pdf) return { ok: false, reason: "Choose a template, or upload a PDF for them." };
  let dueOn: string | null = null;
  if (cleanText(input.dueOn, 20)) {
    dueOn = cleanText(input.dueOn, 20);
    if (!isIsoDate(dueOn)) return { ok: false, reason: "Pick the due date from the calendar." };
    if (dueOn < today) return { ok: false, reason: "The due date is in the past." };
  }
  const by = actorEmail(actor);
  const now = new Date();
  let title = cleanText(input.title, 200);
  let kind: string;
  let fileId: string | null = null;
  let tplId: string | null = null;
  if (templateId) {
    const t = await getTemplate(db, templateId);
    if (!t || !t.active) return { ok: false, reason: "Pick an active template." };
    if (!t.hasPdf && !t.body?.trim()) return { ok: false, reason: "That template has no text or PDF yet." };
    const [open] = await db
      .select({ status: expertDocuments.status, sentAt: expertDocuments.sentAt, signedAt: expertDocuments.signedAt })
      .from(expertDocuments)
      .where(and(eq(expertDocuments.expertId, e.id), eq(expertDocuments.templateId, t.id), inArray(expertDocuments.status, [...LIVE])))
      .orderBy(desc(expertDocuments.createdAt))
      .limit(1);
    if (open?.status === "sent") return { ok: false, reason: `${e.name} already has “${t.title}” to sign${open.sentAt ? ` (sent ${istDay(open.sentAt)})` : ""}.` };
    if (open?.status === "signed") return { ok: false, reason: `${e.name} signed “${t.title}”${open.signedAt ? ` on ${istDay(open.signedAt)}` : ""}.` };
    title = title ?? t.title;
    kind = t.kind;
    tplId = t.id;
  } else {
    const problem = checkPdf(pdf);
    if (problem) return { ok: false, reason: problem };
    if (!title) return { ok: false, reason: "Give the document a title (the expert sees it)." };
    kind = isOneOf(DOCUMENT_KINDS, input.kind) ? input.kind : "agreement";
    fileId = await saveDocumentFile(db, e.id, pdf!, by);
  }
  const [row] = await db
    .insert(expertDocuments)
    .values({ expertId: e.id, kind, title, status: "sent", templateId: tplId, fileId, sentTo: email, sentAt: now, dueOn, notes: cleanLongText(input.note, 2000), createdBy: by, updatedBy: by, createdAt: now, updatedAt: now })
    .returning({ id: expertDocuments.id });
  await addTimeline(db, { expertId: e.id, kind: "document", summary: `${title}: sent for signing in the portal`, by });
  await logActivity(db, { entityType: "expert", entityId: e.id, actor, action: "document_sent", detail: { documentId: row.id, templateId: tplId, via: "portal" } });
  return { ok: true, id: row.id, expertId: e.id, expertName: e.name, title };
}

export type SentRow = {
  id: string;
  title: string;
  kind: string;
  status: string;
  sentAt: Date | null;
  dueOn: string | null;
  viewedAt: Date | null;
  signedAt: Date | null;
  signMethod: string | null;
  templateId: string | null;
  createdAt: Date;
  expertId: string;
  expertName: string;
  expertEmail: string | null;
};

/** The latest documents sent to and signed by experts (newest first). */
export async function listSentDocuments(db: DB, limit = 200): Promise<SentRow[]> {
  return db
    .select({
      id: expertDocuments.id,
      title: expertDocuments.title,
      kind: expertDocuments.kind,
      status: expertDocuments.status,
      sentAt: expertDocuments.sentAt,
      dueOn: expertDocuments.dueOn,
      viewedAt: expertDocuments.viewedAt,
      signedAt: expertDocuments.signedAt,
      signMethod: expertDocuments.signMethod,
      templateId: expertDocuments.templateId,
      createdAt: expertDocuments.createdAt,
      expertId: experts.id,
      expertName: experts.fullName,
      expertEmail: experts.email,
    })
    .from(expertDocuments)
    .innerJoin(experts, eq(experts.id, expertDocuments.expertId))
    .where(inArray(expertDocuments.status, ["sent", "signed", "void"]))
    .orderBy(desc(sql`coalesce(${expertDocuments.signedAt}, ${expertDocuments.sentAt}, ${expertDocuments.createdAt})`))
    .limit(Math.min(Math.max(limit, 1), 500));
}

/** Counts for the admin page: waiting for a signature, signed, signed in the last 7 days. */
export async function documentStats(db: DB): Promise<{ waiting: number; signed: number; week: number }> {
  const [r] = rowsOf<{ waiting: number; signed: number; week: number }>(
    await db.execute(sql`
      select count(*) filter (where status = 'sent')::int as waiting,
             count(*) filter (where status = 'signed')::int as signed,
             count(*) filter (where status = 'signed' and signed_at > now() - interval '7 days')::int as week
      from hub.expert_documents`),
  );
  return { waiting: Number(r?.waiting ?? 0), signed: Number(r?.signed ?? 0), week: Number(r?.week ?? 0) };
}

export type DocumentRecord = DocRow & {
  expertName: string;
  expertEmail: string | null;
  templateTitle: string | null;
  templateHasPdf: boolean;
  fileName: string | null;
  signedFileName: string | null;
};

/** One expert_documents row with who it is for, for the team's record page. */
export async function documentRecord(db: DB, id: string): Promise<DocumentRecord | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ doc: expertDocuments, expertName: experts.fullName, expertEmail: experts.email, templateTitle: documentTemplates.title, templateHasPdf: sql<boolean>`(${documentTemplates.data} is not null)` })
    .from(expertDocuments)
    .innerJoin(experts, eq(experts.id, expertDocuments.expertId))
    .leftJoin(documentTemplates, eq(documentTemplates.id, expertDocuments.templateId))
    .where(eq(expertDocuments.id, id))
    .limit(1);
  if (!row) return null;
  const names = async (fid: string | null) => (fid ? ((await db.select({ n: expertFiles.filename }).from(expertFiles).where(eq(expertFiles.id, fid)).limit(1))[0]?.n ?? null) : null);
  return { ...row.doc, expertName: row.expertName, expertEmail: row.expertEmail, templateTitle: row.templateTitle, templateHasPdf: Boolean(row.templateHasPdf), fileName: await names(row.doc.fileId), signedFileName: await names(row.doc.signedFileId) };
}

/** The team's record page for one row. `contact`: may see email and IP; `files`: may open the files. */
export function teamRecordPage(r: DocumentRecord, opts: { kindLabel: string; statusLabel: string; contact: boolean; files: boolean; mask: (email: string | null) => string | null }): RecordPage {
  const links: { label: string; href: string }[] = [{ label: `${r.expertName}'s profile`, href: `/admin/experts/${r.expertId}?tab=documents` }];
  if (opts.files && r.fileId) links.push({ label: `Original: ${r.fileName ?? "file"}`, href: `/api/files/${r.fileId}` });
  if (!r.fileId && r.templateId && r.templateHasPdf) links.push({ label: "Original: the template's PDF", href: `/admin/documents/templates/${r.templateId}/pdf` });
  if (opts.files && r.signedFileId) links.push({ label: `Signed copy: ${r.signedFileName ?? "file"}`, href: `/api/files/${r.signedFileId}` });
  const signed = r.status === "signed";
  return {
    title: r.title,
    subtitle: `${opts.kindLabel} · ${r.expertName} · ${opts.statusLabel}`,
    body: r.signedBody,
    links,
    back: { href: "/admin/documents?tab=sent", label: "Documents" },
    notice: signed ? null : r.status === "sent" ? "Not signed yet." : r.status === "void" ? "Withdrawn." : "Not sent yet.",
    rows: [
      { label: "Document", value: r.templateTitle && r.templateTitle !== r.title ? `${r.title} (template: ${r.templateTitle})` : r.title },
      { label: "Expert", value: r.expertName },
      { label: "Email", value: (opts.contact ? r.expertEmail : opts.mask(r.expertEmail)) ?? "" },
      { label: "Sent", value: r.sentAt ? `${istDateTime(r.sentAt)}${r.createdBy ? ` by ${r.createdBy}` : ""}` : "" },
      { label: "Due", value: r.dueOn ? fmtDate(r.dueOn) : "" },
      { label: "First opened", value: r.viewedAt ? istDateTime(r.viewedAt) : "" },
      { label: "Signed by", value: r.signedName ?? "" },
      { label: "Signed at", value: r.signedAt ? istDateTime(r.signedAt) : "" },
      { label: "IP address", value: opts.contact ? (r.signedIp ?? "") : r.signedIp ? "Hidden for your role" : "" },
      { label: "Device", value: r.signedUserAgent ?? "" },
      { label: "Method", value: r.signMethod ? (SIGN_METHOD_LABELS[r.signMethod] ?? r.signMethod) : signed ? "Recorded by the team" : "" },
      { label: hashLabel(r.signMethod, Boolean(r.signedBody)), value: r.signedHash ?? "", mono: true },
      { label: "Record ID", value: r.id, mono: true },
    ],
  };
}

// ---------------------------------------------------------------- Word (.docx) templates to text

/** word/document.xml of a .docx (null when it isn't a Word file). */
export function docxDocumentXml(bytes: Uint8Array): string | null {
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
    const xml = files["word/document.xml"];
    return xml ? strFromU8(xml) : null;
  } catch {
    return null;
  }
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return XML_ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });

export type DocxPara = { text: string; bold: boolean };
export type DocxBlock = { kind: "p"; para: DocxPara } | { kind: "table"; rows: DocxPara[][][] };

/**
 * The paragraphs and tables of a document.xml body, in order: each paragraph's text (runs' <w:t>,
 * <w:tab/> as a tab, line breaks as new lines) and whether every run with text is bold. Paragraph
 * tab stops, deleted text, field codes and fallback copies of drawings are left out; a table inside
 * a table is flattened into its cell.
 */
export function docxBlocks(xml: string): DocxBlock[] {
  const at = xml.indexOf("<w:body");
  const src = at >= 0 ? xml.slice(at) : xml;
  const out: DocxBlock[] = [];
  const paras: { text: string; runs: number; bold: number }[] = [];
  const runs: { text: string; bold: boolean }[] = [];
  const tables: { rows: DocxPara[][][]; row: DocxPara[][] | null; cell: DocxPara[] | null }[] = [];
  let inText = false;
  let inRunProps = false;
  let inParaProps = 0;
  let skip = 0;
  const emit = (p: DocxPara) => {
    const t = tables[tables.length - 1];
    if (t?.cell) t.cell.push(p);
    else out.push({ kind: "p", para: p });
  };
  for (const m of src.matchAll(/<(\/?)([A-Za-z][\w.-]*:[\w.-]+|[A-Za-z][\w.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g)) {
    const [, close, tag, attrs, self, text] = m;
    if (text !== undefined) {
      if (inText && !skip && runs.length) runs[runs.length - 1].text += decodeXml(text);
      continue;
    }
    const closing = close === "/";
    const selfClosing = self === "/";
    if (tag === "mc:Fallback") {
      if (!selfClosing) skip += closing ? -1 : 1;
      continue;
    }
    if (skip > 0) continue;
    switch (tag) {
      case "w:p":
        if (selfClosing) emit({ text: "", bold: false });
        else if (!closing) paras.push({ text: "", runs: 0, bold: 0 });
        else {
          const p = paras.pop();
          if (p) emit({ text: p.text, bold: p.runs > 0 && p.bold === p.runs });
        }
        break;
      case "w:pPr":
        if (!selfClosing) inParaProps += closing ? -1 : 1;
        break;
      case "w:r":
        if (selfClosing) break;
        if (!closing) runs.push({ text: "", bold: false });
        else {
          const r = runs.pop();
          const p = paras[paras.length - 1];
          if (r && p) {
            p.text += r.text;
            if (r.text.trim()) {
              p.runs += 1;
              if (r.bold) p.bold += 1;
            }
          }
        }
        break;
      case "w:rPr":
        if (!selfClosing) inRunProps = !closing;
        break;
      case "w:b":
        if (inRunProps && !inParaProps && runs.length && !closing) runs[runs.length - 1].bold = !/w:val\s*=\s*["'](0|false|off)["']/i.test(attrs);
        break;
      case "w:t":
        if (!selfClosing) inText = !closing;
        break;
      case "w:tab":
        if (!inParaProps && runs.length && !closing) runs[runs.length - 1].text += "\t";
        break;
      case "w:br":
      case "w:cr":
        if (!inParaProps && runs.length && !closing && !/w:type\s*=\s*["'](page|column)["']/i.test(attrs)) runs[runs.length - 1].text += "\n";
        break;
      case "w:noBreakHyphen":
        if (runs.length && !closing) runs[runs.length - 1].text += "-";
        break;
      case "w:tbl":
        if (selfClosing) break;
        if (!closing) tables.push({ rows: [], row: null, cell: null });
        else {
          const t = tables.pop();
          const parent = tables[tables.length - 1];
          if (t && parent?.cell) for (const row of t.rows) for (const cell of row) parent.cell.push(...cell);
          else if (t) out.push({ kind: "table", rows: t.rows });
        }
        break;
      case "w:tr": {
        const t = tables[tables.length - 1];
        if (!t || selfClosing) break;
        if (!closing) t.row = [];
        else {
          if (t.row) t.rows.push(t.row);
          t.row = null;
        }
        break;
      }
      case "w:tc": {
        const t = tables[tables.length - 1];
        if (!t || selfClosing) break;
        if (!closing) t.cell = [];
        else {
          if (t.cell && t.row) t.row.push(t.cell);
          t.cell = null;
        }
        break;
      }
    }
  }
  return out;
}

/** The FynoLabs Word templates' [placeholders] and what they become. */
export const DOCX_PLACEHOLDERS: readonly (readonly [string, string])[] = [
  ["[Full name of individual]", "{{full_name}}"],
  ["[full name]", "{{full_name}}"],
  ["[son / daughter / spouse]", "{{relation}}"],
  ["[name of father / mother / spouse]", "{{parent_name}}"],
  ["[age]", "{{age}}"],
  ["[full residential address with PIN]", "{{address}}"],
  ["[email address]", "{{email}}"],
  ["[email]", "{{email}}"],
  ["[day]", "{{day}}"],
  ["[month]", "{{month}}"],
  ["[year]", "{{year}}"],
  ["[date]", "{{date}}"],
  ["[place]", "{{place}}"],
  ["[country, city]", "{{city}}, {{country}}"],
  ["[24]", "24"],
  ["[role]", "AI training, evaluation and related projects"],
  ["[name]", "Shakshi Patel"],
];

const isCapsLine = (s: string) => /[A-Z]{2}/.test(s) && !/[a-z]/.test(s) && !s.includes("[") && s.length <= 60;

/**
 * A Word template as a text template: one paragraph per line, headings (bold-only or capitals-only
 * short paragraphs) as "# ", tables as lines (a label | value row as "Label: value", other cells one
 * line each), the [placeholders] mapped, and the boxes in `optional` (0 = the first ☐) marked
 * "(optional)". `unmapped` lists any [bracketed] text left, to check by hand.
 */
export function docxToBody(xml: string, opts: { optional?: number[] } = {}): { body: string; unmapped: string[] } {
  const lines: string[] = [];
  const tidy = (s: string) => s.replace(/[^\S\t\n]+/g, " ").replace(/ *\t */g, "\t").trim();
  const push = (p: DocxPara) => {
    for (const piece of p.text.split("\n")) {
      const t = tidy(piece);
      if (!t) {
        lines.push("");
        continue;
      }
      const box = /^([☐☑])\s*(.*)$/.exec(t);
      if (box) lines.push(`${box[1]} ${box[2]}`);
      else if ((p.bold && t.length <= 120) || isCapsLine(t)) lines.push(`# ${t}`);
      else lines.push(t);
    }
  };
  for (const b of docxBlocks(xml)) {
    if (b.kind === "p") {
      push(b.para);
      continue;
    }
    // A table right under a heading stays with it; otherwise a blank line sets it apart.
    if (!/^# /.test(lines[lines.length - 1] ?? "")) lines.push("");
    for (const row of b.rows) {
      const cells = row.map((cell) => cell.filter((p) => tidy(p.text)));
      if (cells.every((c) => c.length <= 1)) {
        const parts = cells.filter((c) => c.length).map((c) => tidy(c[0].text));
        if (parts.length) lines.push(parts.join(": "));
      } else {
        for (const cell of cells) {
          for (const p of cell) push(p);
          lines.push("");
        }
      }
    }
    lines.push("");
  }
  let body = lines.join("\n");
  for (const [from, to] of DOCX_PLACEHOLDERS) body = body.split(from).join(to);
  // A blank signature line ("Signature: ______") becomes the typed name, so the signed copy shows it.
  body = body.replace(/Signature:[ \t]*_{3,}/g, "Signature: {{full_name}} (signed electronically)");
  if (opts.optional?.length) {
    let box = -1;
    body = body
      .split("\n")
      .map((line) => {
        if (!BOX.test(line)) return line;
        box += 1;
        return opts.optional!.includes(box) && !/\(optional\)/i.test(line) ? `${line} (optional)` : line;
      })
      .join("\n");
  }
  body = body.replace(/\n{3,}/g, "\n\n").trim();
  const unmapped = [...new Set(body.match(/\[[^\]\n]{1,80}\]/g) ?? [])];
  return { body, unmapped };
}

/** For scripts/load-default-documents.ts: adds a required template by title, or brings it up to date. */
export async function upsertDefaultTemplate(
  db: DB,
  actor: Actor,
  d: { title: string; kind: string; body: string; position: number; description?: string | null },
): Promise<{ status: "created" | "updated" | "unchanged" | "skipped"; id: string | null; reason?: string }> {
  const [t] = await db
    .select({ ...templateCols, position: documentTemplates.position })
    .from(documentTemplates)
    .where(sql`lower(${documentTemplates.title}) = ${d.title.toLowerCase()}`)
    .orderBy(asc(documentTemplates.createdAt))
    .limit(1);
  const by = actorEmail(actor);
  const now = new Date();
  if (!t) {
    const [row] = await db
      .insert(documentTemplates)
      .values({ title: d.title, kind: d.kind, description: d.description ?? null, body: d.body, requiredForAll: true, active: true, position: d.position, createdBy: by, updatedBy: by, createdAt: now, updatedAt: now })
      .returning({ id: documentTemplates.id });
    await logActivity(db, { entityType: TEMPLATE_ENTITY, entityId: row.id, actor, action: "document_template_created", detail: { format: "text", requiredForAll: true, via: "defaults" } });
    return { status: "created", id: row.id };
  }
  if (t.hasPdf) return { status: "skipped", id: t.id, reason: "it is a PDF template in the hub; change it in Admin, Documents" };
  const same = t.body === d.body && t.kind === d.kind && t.requiredForAll && t.active && t.position === d.position && (t.description || !d.description);
  if (same) return { status: "unchanged", id: t.id };
  await db
    .update(documentTemplates)
    .set({ body: d.body, kind: d.kind, requiredForAll: true, active: true, position: d.position, ...(t.description ? {} : { description: d.description ?? null }), updatedAt: now, updatedBy: by })
    .where(eq(documentTemplates.id, t.id));
  await logActivity(db, { entityType: TEMPLATE_ENTITY, entityId: t.id, actor, action: "document_template_updated", detail: { format: "text", requiredForAll: true, via: "defaults" } });
  return { status: "updated", id: t.id };
}
