// Documents in the expert portal (src/lib/server/portal-documents.ts): what each expert still has to
// sign, filling a text template and its boxes, typed signing (required templates and documents the
// team sent), signing a PDF, uploading a signed copy, nobody reaching someone else's document, the
// team's templates and sending, the printable record, and the Word (.docx) converter. The converter
// is tested on a small made-up .docx built in memory: the real templates never come into the repo.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import type { PGlite } from "@electric-sql/pglite";
import { openTestDb } from "./fixtures/db";
import type { DB } from "@/db/client";
import { activity, documentTemplates, expertActivities, expertDetails, expertDocuments, expertFiles, experts } from "@/db/schema";
import {
  bodyBlocks,
  checkLines,
  clientIp,
  deleteTemplate,
  documentForExpert,
  documentRecord,
  documentsToSign,
  docxDocumentXml,
  docxToBody,
  dueText,
  expertRecordPage,
  fillBody,
  listSentDocuments,
  listTemplates,
  markViewed,
  ownDocumentFile,
  ownDocuments,
  parseRef,
  placeholdersIn,
  recordHtml,
  saveTemplate,
  sendDocument,
  sha256,
  signDocument,
  signerProfile,
  signFields,
  signingDate,
  teamRecordPage,
  upsertDefaultTemplate,
  uploadSignedCopy,
  type PortalDocument,
} from "@/lib/server/portal-documents";
import { maskEmail } from "@/lib/auth/permissions";
import { openLocalDbWithClient } from "@/db/local/open";

let db: DB;
let client: PGlite;
const TEAM = { email: "rhea.recruiter@example.com", role: "recruiter" };
// 26 Nov 2026, 15:00 in India.
const NOW = new Date("2026-11-26T09:30:00Z");
const pdfBytes = (label: string) => strToU8(`%PDF-1.4\n% ${label}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const pdf = (label: string, filename = `${label}.pdf`) => ({ filename, mime: "application/pdf", bytes: pdfBytes(label) });

const NDA_TEXT = [
  "# Test NDA",
  "Made on this {{day}} day of {{month}}, {{year}}.",
  "{{full_name}}, {{relation}} of {{parent_name}}, aged about {{age}} years, residing at {{address}}, email {{email}}.",
  "1.1\tKeep it secret.",
  "☐ I agree to keep it secret.",
  "☐ I'd like the newsletter. (optional)",
  "Date: {{date}} · Place: {{place}} · Country: {{country}}",
].join("\n");

let asha: string;
let ben: string;
let ndaId: string;
let pdfTplId: string;
let extraId: string;

const docOf = async (expertId: string, ref: string) => {
  const d = await documentForExpert(db, expertId, ref);
  if (!d || "redirect" in d) throw new Error(`no document for ${ref}`);
  return d;
};

beforeAll(async () => {
  ({ db, client } = await openTestDb());
  [{ id: asha }] = await db.insert(experts).values({ fullName: "Asha Rao", email: "asha.rao@example.org", city: "Lucknow", region: "Uttar Pradesh", country: "India" }).returning({ id: experts.id });
  [{ id: ben }] = await db.insert(experts).values({ fullName: "Ben Example", email: "ben.example@example.org" }).returning({ id: experts.id });
  await db.insert(expertDetails).values({ expertId: asha, addressLine1: "12 MG Road", postalCode: "226012" });
  const nda = await saveTemplate(db, TEAM, { title: "Test NDA", kind: "nda", body: NDA_TEXT, requiredForAll: true, active: true, position: 0 });
  const p = await saveTemplate(db, TEAM, { title: "Test PDF agreement", kind: "agreement", pdf: pdf("template"), requiredForAll: true, active: true, position: 1 });
  const extra = await saveTemplate(db, TEAM, { title: "Project rules", kind: "compliance", body: "# Project rules\nBe kind, {{full_name}}.\n☐ I will be kind.", requiredForAll: false, active: true, position: 2 });
  await saveTemplate(db, TEAM, { title: "Old consent", kind: "compliance", body: "Old text", requiredForAll: true, active: false });
  if (!nda.ok || !p.ok || !extra.ok) throw new Error("templates not saved");
  ndaId = nda.id;
  pdfTplId = p.id;
  extraId = extra.id;
});
afterAll(async () => {
  await client.close();
});

describe("refs, dates and the text helpers", () => {
  it("reads t- and d- refs and nothing else", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(parseRef(`t-${id}`)).toEqual({ kind: "t", id });
    expect(parseRef(`D-${id.toUpperCase()}`)).toEqual({ kind: "d", id });
    expect(parseRef(id)).toBeNull();
    expect(parseRef(`x-${id}`)).toBeNull();
    expect(parseRef("t-1; drop table")).toBeNull();
  });

  it("dates the signature in India time and words the due line", () => {
    expect(signingDate(NOW)).toEqual({ date: "26 November 2026", day: "26th", month: "November", year: "2026" });
    expect(signingDate(new Date("2026-11-30T20:00:00Z")).date).toBe("1 December 2026");
    expect(["1", "2", "3", "4", "11", "12", "13", "21", "22", "23", "31"].map((d) => signingDate(new Date(`2026-12-${d.padStart(2, "0")}T06:00:00Z`)).day)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"]);
    expect(dueText(null, "2026-11-26")).toBe("To sign");
    expect(dueText("2026-11-29", "2026-11-26")).toBe("Due in 3 days");
    expect(dueText("2026-11-27", "2026-11-26")).toBe("Due tomorrow");
    expect(dueText("2026-11-26", "2026-11-26")).toBe("Due today");
    expect(dueText("2026-11-24", "2026-11-26")).toBe("Overdue: due 24 Nov 2026");
  });

  it("finds placeholders and boxes, fills them, and splits the text into blocks", () => {
    expect(placeholdersIn(NDA_TEXT)).toEqual(["day", "month", "year", "full_name", "relation", "parent_name", "age", "address", "email", "date", "place", "country"]);
    expect(checkLines(NDA_TEXT)).toEqual([
      { index: 0, text: "I agree to keep it secret.", optional: false },
      { index: 1, text: "I'd like the newsletter. (optional)", optional: true },
    ]);
    const filled = fillBody("Hi {{ Full_Name }}, {{missing}}.\n☐ One\n☐ Two", { full_name: "Asha" }, new Set([1]));
    expect(filled).toBe("Hi Asha, ________.\n☐ One\n☑ Two");
    const blocks = bodyBlocks("# 01\tTitle\n\nPlain {{age}}\n1.1\tClause\n•\tPoint\n☑ Ticked (optional)\n\n");
    expect(blocks).toEqual([
      { type: "heading", label: "01", segs: ["Title"] },
      { type: "gap" },
      { type: "para", segs: ["Plain ", { key: "age" }] },
      { type: "para", label: "1.1", segs: ["Clause"] },
      { type: "bullet", segs: ["Point"] },
      { type: "check", index: 0, ticked: true, optional: true, segs: ["Ticked (optional)"] },
    ]);
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "x-real-ip": "10.0.0.9" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("what an expert has to sign", () => {
  it("lists the active templates every expert signs (not the inactive or optional ones)", async () => {
    const todo = await documentsToSign(db, asha);
    expect(todo).toEqual([
      { ref: `t-${ndaId}`, title: "Test NDA", kind: "nda", dueOn: null },
      { ref: `t-${pdfTplId}`, title: "Test PDF agreement", kind: "agreement", dueOn: null },
    ]);
    expect(await ownDocuments(db, asha)).toMatchObject({ done: 0, total: 2, signed: [] });
    // A template only some experts get can't be opened by ref; a made-up ref finds nothing.
    expect(await documentForExpert(db, asha, `t-${extraId}`)).toBeNull();
    expect(await documentForExpert(db, asha, "t-0f8fad5b-d9cb-469f-a165-70867728950e")).toBeNull();
  });

  it("asks only for what the profile can't fill, with the saved address prefilled", async () => {
    const a = (await signerProfile(db, asha))!;
    const fields = signFields(NDA_TEXT, a);
    expect(fields.map((f) => f.key)).toEqual(["relation", "parent_name", "age", "address"]);
    expect(fields.find((f) => f.key === "address")?.value).toBe("12 MG Road, Lucknow, Uttar Pradesh 226012, India");
    expect(fields.find((f) => f.key === "relation")?.options?.map((o) => o.value)).toEqual(["son", "daughter", "spouse"]);
    // No city or country on Ben's profile: both are asked ({{place}} is the city).
    const b = (await signerProfile(db, ben))!;
    expect(signFields(NDA_TEXT, b).map((f) => f.key)).toEqual(["relation", "parent_name", "age", "address", "city", "country"]);
    expect(signFields("Hello {{full_name}}, team {{team_name}}", b).map((f) => [f.key, f.label])).toEqual([["team_name", "Team name"]]);
  });
});

describe("typed signing", () => {
  it("checks every field and box, then signs a required template with the filled text and its fingerprint", async () => {
    const ref = `t-${ndaId}`;
    const bad = await signDocument(db, asha, ref, { name: "A", fields: { relation: "cousin", age: "12" }, ticked: [1], consent: false }, NOW);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    // The saved address only prefills the form: the form has to send it.
    expect(Object.keys(bad.errors).sort()).toEqual(["address", "age", "check_0", "consent", "parent_name", "relation", "signedName"]);
    expect(await db.$count(expertDocuments, eq(expertDocuments.expertId, asha))).toBe(0);

    const res = await signDocument(
      db,
      asha,
      ref,
      { name: "  Asha   Rao ", fields: { relation: "Daughter", parent_name: "Meera Rao", age: "31", address: "12 MG Road,\nLucknow 226012" }, ticked: [0], consent: true, ip: "203.0.113.7", userAgent: "Vitest browser" },
      NOW,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [row] = await db.select().from(expertDocuments).where(eq(expertDocuments.id, res.id));
    expect(row).toMatchObject({ expertId: asha, templateId: ndaId, kind: "nda", title: "Test NDA", status: "signed", signMethod: "typed", signedName: "Asha Rao", signedIp: "203.0.113.7", signedUserAgent: "Vitest browser", createdBy: "expert-portal" });
    expect(row.signedAt?.toISOString()).toBe(NOW.toISOString());
    expect(row.signedBody).toBe(
      [
        "# Test NDA",
        "Made on this 26th day of November, 2026.",
        "Asha Rao, daughter of Meera Rao, aged about 31 years, residing at 12 MG Road, Lucknow 226012, email asha.rao@example.org.",
        "1.1\tKeep it secret.",
        "☑ I agree to keep it secret.",
        "☐ I'd like the newsletter. (optional)",
        "Date: 26 November 2026 · Place: Lucknow · Country: India",
      ].join("\n"),
    );
    expect(row.signedHash).toBe(sha256(row.signedBody!));
    expect(row.signedFields).toMatchObject({ full_name: "Asha Rao", email: "asha.rao@example.org", relation: "daughter", parent_name: "Meera Rao", age: "31", box_1: "ticked", box_2: "not ticked", consent: "yes", date: "26 November 2026" });

    // Done: off the to-do list, on the signed list, and the old ref points at the signed copy.
    expect((await documentsToSign(db, asha)).map((d) => d.ref)).toEqual([`t-${pdfTplId}`]);
    expect(await ownDocuments(db, asha)).toMatchObject({ done: 1, total: 2, signed: [{ ref: `d-${res.id}`, title: "Test NDA" }] });
    expect(await documentForExpert(db, asha, ref)).toEqual({ redirect: `d-${res.id}` });
    const doc = await docOf(asha, `d-${res.id}`);
    expect(doc).toMatchObject({ status: "signed", format: "text", body: row.signedBody, signedName: "Asha Rao", signedEmail: "asha.rao@example.org" });
    expect(await signDocument(db, asha, `d-${res.id}`, { name: "Asha Rao", consent: true }, NOW)).toMatchObject({ ok: false, message: expect.stringMatching(/already signed/) });
    // The timeline and the audit log know, without personal data in the log.
    expect(await db.$count(expertActivities, and(eq(expertActivities.expertId, asha), eq(expertActivities.kind, "document")))).toBe(1);
    const [log] = await db.select().from(activity).where(and(eq(activity.entityId, asha), eq(activity.action, "document_signed")));
    expect(log.detail).toEqual({ documentId: res.id, templateId: ndaId, method: "typed" });
  });

  it("signs a PDF by typed name, keeping the PDF's fingerprint, and serves the PDF only to its expert", async () => {
    const ref = `t-${pdfTplId}`;
    const file = await ownDocumentFile(db, ben, ref);
    expect(file && Buffer.from(file.bytes).toString()).toBe(Buffer.from(pdfBytes("template")).toString());
    const res = await signDocument(db, ben, ref, { name: "Ben Example", consent: true, ip: "198.51.100.4" }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [row] = await db.select().from(expertDocuments).where(eq(expertDocuments.id, res.id));
    expect(row).toMatchObject({ status: "signed", signMethod: "typed", signedBody: null, signedHash: sha256(pdfBytes("template")), signedFields: { full_name: "Ben Example", file: "template.pdf" } });
    // Asha can open the template (it's for every expert) but never Ben's signed row.
    expect(await ownDocumentFile(db, asha, ref)).not.toBeNull();
    expect(await ownDocumentFile(db, asha, `d-${res.id}`)).toBeNull();
    expect(await documentForExpert(db, asha, `d-${res.id}`)).toBeNull();
  });
});

describe("documents the team sends", () => {
  let sentId: string;

  it("puts a template on one expert's page as sent, and refuses a duplicate, an unknown email or no content", async () => {
    expect(await sendDocument(db, TEAM, { email: "nobody@example.org", templateId: extraId }, "2026-11-26")).toMatchObject({ ok: false, reason: expect.stringMatching(/No expert/) });
    expect(await sendDocument(db, TEAM, { email: "asha.rao@example.org" }, "2026-11-26")).toMatchObject({ ok: false });
    expect(await sendDocument(db, TEAM, { email: "asha.rao@example.org", templateId: extraId, dueOn: "2026-11-01" }, "2026-11-26")).toMatchObject({ ok: false, reason: expect.stringMatching(/past/) });
    const res = await sendDocument(db, TEAM, { email: " Asha.Rao@Example.org ", templateId: extraId, dueOn: "2026-11-29", note: "For the kindness pilot" }, "2026-11-26");
    expect(res).toMatchObject({ ok: true, expertId: asha, expertName: "Asha Rao", title: "Project rules" });
    if (!res.ok) return;
    sentId = res.id;
    const [row] = await db.select().from(expertDocuments).where(eq(expertDocuments.id, res.id));
    expect(row).toMatchObject({ status: "sent", templateId: extraId, kind: "compliance", sentTo: "asha.rao@example.org", dueOn: "2026-11-29", notes: "For the kindness pilot", createdBy: TEAM.email });
    expect(row.sentAt).toBeInstanceOf(Date);
    expect(await documentsToSign(db, asha)).toContainEqual({ ref: `d-${res.id}`, title: "Project rules", kind: "compliance", dueOn: "2026-11-29" });
    expect(await sendDocument(db, TEAM, { email: "asha.rao@example.org", templateId: extraId }, "2026-11-26")).toMatchObject({ ok: false, reason: expect.stringMatching(/already has/) });
    const listed = await listSentDocuments(db);
    expect(listed.find((r) => r.id === res.id)).toMatchObject({ expertName: "Asha Rao", expertEmail: "asha.rao@example.org", status: "sent" });
    // The team's note is never part of what the expert sees.
    expect(JSON.stringify(await docOf(asha, `d-${res.id}`))).not.toContain("kindness pilot");
  });

  it("lets only that expert open and sign it (typed, d- ref), and records when they first opened it", async () => {
    const ref = `d-${sentId}`;
    expect(await documentForExpert(db, ben, ref)).toBeNull();
    expect(await signDocument(db, ben, ref, { name: "Ben Example", ticked: [0], consent: true }, NOW)).toMatchObject({ ok: false });
    expect(await uploadSignedCopy(db, ben, ref, { name: "Ben Example", file: pdf("sneaky") }, NOW)).toMatchObject({ ok: false });
    const [still] = await db.select().from(expertDocuments).where(eq(expertDocuments.id, sentId));
    expect(still.status).toBe("sent");

    const doc = await docOf(asha, ref);
    expect(doc).toMatchObject({ status: "to_sign", format: "text", dueOn: "2026-11-29" });
    await markViewed(db, asha, doc);
    const [seen] = await db.select().from(expertDocuments).where(eq(expertDocuments.id, sentId));
    expect(seen.viewedAt).toBeInstanceOf(Date);

    expect(await signDocument(db, asha, ref, { name: "Asha Rao", consent: true }, NOW)).toMatchObject({ ok: false, errors: { check_0: expect.any(String) } });
    const res = await signDocument(db, asha, ref, { name: "Asha Rao", ticked: [0], consent: true }, NOW);
    expect(res).toMatchObject({ ok: true, ref });
    const [row] = await db.select().from(expertDocuments).where(eq(expertDocuments.id, sentId));
    expect(row).toMatchObject({ status: "signed", signMethod: "typed", signedBody: "# Project rules\nBe kind, Asha Rao.\n☑ I will be kind.", viewedAt: seen.viewedAt });
  });

  it("sends a PDF just for one expert, who uploads a signed copy instead of typing", async () => {
    expect(await sendDocument(db, TEAM, { email: "ben.example@example.org", pdf: pdf("offer") }, "2026-11-26")).toMatchObject({ ok: false, reason: expect.stringMatching(/title/) });
    expect(await sendDocument(db, TEAM, { email: "ben.example@example.org", pdf: { filename: "x.pdf", mime: "application/pdf", bytes: strToU8("not a pdf") }, title: "Offer" }, "2026-11-26")).toMatchObject({ ok: false });
    const sent = await sendDocument(db, TEAM, { email: "ben.example@example.org", pdf: pdf("offer", "Offer letter"), title: "Offer letter", kind: "agreement" }, "2026-11-26");
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    const ref = `d-${sent.id}`;
    const doc = await docOf(ben, ref);
    expect(doc).toMatchObject({ format: "pdf", original: { filename: "Offer letter.pdf", pdf: true } });
    const [file] = await db.select({ kind: expertFiles.kind, expertId: expertFiles.expertId }).from(expertFiles).where(eq(expertFiles.id, doc.original!.id!));
    expect(file).toEqual({ kind: "document", expertId: ben });

    expect(await uploadSignedCopy(db, ben, ref, { name: "Ben Example", file: { filename: "signed.docx", mime: "application/msword", bytes: strToU8("PK not a pdf") } }, NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/PDF/) });
    expect(await uploadSignedCopy(db, ben, ref, { name: "", file: pdf("signed") }, NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/name/) });
    const up = await uploadSignedCopy(db, ben, ref, { name: "Ben Example", file: pdf("signed", "scan"), ip: "198.51.100.4", userAgent: "Phone" }, NOW);
    expect(up).toMatchObject({ ok: true, ref });
    const [row] = await db.select().from(expertDocuments).where(eq(expertDocuments.id, sent.id));
    expect(row).toMatchObject({ status: "signed", signMethod: "upload", signedName: "Ben Example", signedHash: sha256(pdfBytes("signed")), signedIp: "198.51.100.4" });
    const [copy] = await db.select({ kind: expertFiles.kind, filename: expertFiles.filename, createdBy: expertFiles.createdBy }).from(expertFiles).where(eq(expertFiles.id, row.signedFileId!));
    expect(copy).toEqual({ kind: "document", filename: "scan.pdf", createdBy: "expert-portal" });
    const back = await ownDocumentFile(db, ben, ref, "signed");
    expect(back && Buffer.from(back.bytes).toString()).toBe(Buffer.from(pdfBytes("signed")).toString());
    expect(await ownDocumentFile(db, asha, ref, "signed")).toBeNull();
    // A text document is signed on the page, not by upload.
    expect(await uploadSignedCopy(db, asha, `t-${ndaId}`, { name: "Asha Rao", file: pdf("x") }, NOW)).toMatchObject({ ok: false });
  });
});

describe("the printable record", () => {
  it("shows the signed text and the certificate, every value escaped", () => {
    const doc: PortalDocument = {
      ref: "d-0f8fad5b-d9cb-469f-a165-70867728950e",
      id: "0f8fad5b-d9cb-469f-a165-70867728950e",
      templateId: null,
      title: "NDA <b>",
      kind: "nda",
      description: null,
      dueOn: null,
      status: "signed",
      format: "text",
      body: "# Heading\n☑ I agree & sign",
      original: null,
      signedCopy: null,
      signedAt: NOW,
      signedName: "<script>alert(1)</script>",
      signedEmail: "asha.rao@example.org",
      signMethod: "typed",
      signedHash: "ab".repeat(32),
      signedIp: "203.0.113.7",
    };
    const html = recordHtml(expertRecordPage(doc, "other@example.org", "NDA"));
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("NDA &lt;b&gt;");
    expect(html).toContain("<h3>Heading</h3>");
    expect(html).toContain("I agree &amp; sign");
    expect(html).toContain("26 Nov 2026, 15:00:00 IST");
    expect(html).toContain("asha.rao@example.org");
    expect(html).toContain("203.0.113.7");
    expect(html).toContain("SHA-256 of the signed text");
    expect(html).toContain("Typed name (electronic signature)");
  });

  it("gives the team the record, with email, IP and file links only for roles allowed to see them", async () => {
    const [up] = await db.select({ id: expertDocuments.id, signedFileId: expertDocuments.signedFileId, fileId: expertDocuments.fileId }).from(expertDocuments).where(and(eq(expertDocuments.expertId, ben), eq(expertDocuments.signMethod, "upload")));
    const rec = (await documentRecord(db, up.id))!;
    expect(rec).toMatchObject({ expertName: "Ben Example", title: "Offer letter", fileName: "Offer letter.pdf", signedFileName: "scan.pdf", status: "signed" });
    const opts = { kindLabel: "Agreement", statusLabel: "Signed", mask: maskEmail };
    const viewer = recordHtml(teamRecordPage(rec, { ...opts, contact: false, files: false }));
    expect(viewer).toContain("b•••@example.org");
    expect(viewer).not.toContain("ben.example@example.org");
    expect(viewer).not.toContain("198.51.100.4");
    expect(viewer).toContain("Hidden for your role");
    expect(viewer).not.toContain("/api/files/");
    expect(viewer).toContain("SHA-256 of the signed copy");
    const admin = recordHtml(teamRecordPage(rec, { ...opts, contact: true, files: true }));
    expect(admin).toContain("ben.example@example.org");
    expect(admin).toContain("198.51.100.4");
    expect(admin).toContain(`/api/files/${up.fileId}`);
    expect(admin).toContain(`/api/files/${up.signedFileId}`);
    expect(admin).toContain("Uploaded a signed copy");
    // A PDF template signed by typing: the original is the template's PDF (team route), no file of their own.
    const [typed] = await db.select({ id: expertDocuments.id }).from(expertDocuments).where(and(eq(expertDocuments.expertId, ben), eq(expertDocuments.templateId, pdfTplId)));
    const pdfRec = (await documentRecord(db, typed.id))!;
    expect(recordHtml(teamRecordPage(pdfRec, { ...opts, contact: true, files: true }))).toContain(`/admin/documents/templates/${pdfTplId}/pdf`);
    expect(await documentRecord(db, "not-a-uuid")).toBeNull();
  });
});

describe("templates (team)", () => {
  it("is text or a PDF (never both, never neither), with unique titles; a signed PDF stays as it is", async () => {
    expect(await saveTemplate(db, TEAM, { title: "Both", kind: "nda", body: "Text", pdf: pdf("both"), requiredForAll: false, active: true })).toMatchObject({ ok: false, reason: expect.stringMatching(/either text or a PDF/) });
    expect(await saveTemplate(db, TEAM, { title: "Neither", kind: "nda", body: "  ", requiredForAll: false, active: true })).toMatchObject({ ok: false });
    expect(await saveTemplate(db, TEAM, { title: "test nda", kind: "nda", body: "Again", requiredForAll: false, active: true })).toMatchObject({ ok: false, reason: expect.stringMatching(/already a template/) });
    expect(await saveTemplate(db, TEAM, { title: "Bad kind", kind: "poem", body: "x", requiredForAll: false, active: true })).toMatchObject({ ok: false });
    expect(await saveTemplate(db, TEAM, { id: pdfTplId, title: "Test PDF agreement", kind: "agreement", pdf: pdf("v2"), requiredForAll: true, active: true })).toMatchObject({ ok: false, reason: expect.stringMatching(/signed this PDF/) });
    // Editing a signed text template is fine: signed copies keep their own text.
    expect(await saveTemplate(db, TEAM, { id: ndaId, title: "Test NDA", kind: "nda", body: `${NDA_TEXT}\nNew line.`, requiredForAll: true, active: true, position: 0 })).toMatchObject({ ok: true, created: false });
    const [signedNda] = await db.select().from(expertDocuments).where(and(eq(expertDocuments.templateId, ndaId), eq(expertDocuments.expertId, asha)));
    expect(signedNda.signedBody).not.toContain("New line.");
    const list = await listTemplates(db);
    expect(list.find((t) => t.id === ndaId)).toMatchObject({ signed: 1, waiting: 0, hasBody: true, hasPdf: false, requiredForAll: true });
    expect(list.find((t) => t.id === pdfTplId)).toMatchObject({ signed: 1, hasPdf: true, filename: "template.pdf" });
  });

  it("deletes an unused template, and turns off one that has copies", async () => {
    const tmp = await saveTemplate(db, TEAM, { title: "Scratch", kind: "other", body: "x", requiredForAll: false, active: true });
    if (!tmp.ok) throw new Error("not saved");
    expect(await deleteTemplate(db, TEAM, tmp.id)).toMatchObject({ ok: true, deleted: true });
    expect(await db.$count(documentTemplates, eq(documentTemplates.id, tmp.id))).toBe(0);
    expect(await deleteTemplate(db, TEAM, ndaId)).toMatchObject({ ok: true, deleted: false });
    const [nda] = await db.select({ active: documentTemplates.active }).from(documentTemplates).where(eq(documentTemplates.id, ndaId));
    expect(nda.active).toBe(false);
    // Turned off: no longer asked of anyone, but signed copies stay where they are.
    expect((await documentsToSign(db, ben)).map((d) => d.ref)).not.toContain(`t-${ndaId}`);
    expect((await ownDocuments(db, asha)).signed.map((d) => d.title)).toContain("Test NDA");
  });

  it("loads a default template by title: added, then unchanged, then brought up to date", async () => {
    const d = { title: "Profile sharing consent", kind: "compliance", body: "# Consent\n☐ I agree.", position: 1, description: "What we may share." };
    expect(await upsertDefaultTemplate(db, "cli:test", d)).toMatchObject({ status: "created" });
    expect(await upsertDefaultTemplate(db, "cli:test", d)).toMatchObject({ status: "unchanged" });
    expect(await upsertDefaultTemplate(db, "cli:test", { ...d, body: "# Consent\n☐ I agree. Now longer." })).toMatchObject({ status: "updated" });
    const [t] = await db.select().from(documentTemplates).where(eq(documentTemplates.title, "Profile sharing consent"));
    expect(t).toMatchObject({ kind: "compliance", requiredForAll: true, active: true, position: 1, description: "What we may share.", body: "# Consent\n☐ I agree. Now longer." });
  });
});

describe("Word (.docx) templates to text", () => {
  const r = (t: string, bold = false) => `<w:r>${bold ? "<w:rPr><w:b/><w:bCs/></w:rPr>" : ""}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  // Every paragraph carries a tab stop in its properties, which must not become text.
  const p = (...runs: string[]) => `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="1160"/></w:tabs><w:rPr><w:b/></w:rPr></w:pPr>${runs.join("")}</w:p>`;
  const tc = (...paras: string[]) => `<w:tc><w:tcPr/>${paras.join("")}</w:tc>`;
  const tr = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><w:body>
${p(r("Test Agreement", true))}
${p(r("Made on this "), r("[day]"), r(" day of "), r("[mo"), r("nth]"), r(", "), r("[year]"))}
${p(r("BETWEEN"))}
${p(r("[Full name of individual]", true), r(", "), r("[son / daughter / spouse]"), r(" of "), r("[name of father / mother / spouse]"), r(", aged about "), r("[age]"), r(" years, residing at "), r("[full residential address with PIN]"), r(", email "), r("[email address]"), r(" &amp; more"))}
${p(r("1.1"), "<w:r><w:tab/></w:r>", r("Clause with a "), r("[mystery]"), "<w:del><w:r><w:delText>deleted words</w:delText></w:r></w:del>", "<w:r><mc:AlternateContent><mc:Choice><w:t>!</w:t></mc:Choice><mc:Fallback><w:t>FALLBACK</w:t></mc:Fallback></mc:AlternateContent></w:r>")}
${p(`<w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>Not bold, not a heading</w:t></w:r>`)}
<w:tbl><w:tblPr/>${tr(tc(p(r("Full name"))), tc(p(r("[full name]"))))}${tr(tc(p(r("Country and city"))), tc(p(r("[country, city]"))))}${tr(tc(p(r("Retention"))), tc(p(r("[24] months"))))}</w:tbl>
${p(r("☐  I agree to the first thing."))}
${p(r("☐  I agree to the second thing."))}
${p(r("Signature: ________      Date: "), r("[date]"))}
<w:tbl>${tr(tc(p(r("FOR FYNOLABS")), "<w:p/>", p(r("[name], Proprietor")), p(r("Date: "), r("[date]"))), tc(p(r("RECIPIENT")), p(r("Name: "), r("[full name]")), p(r("Place: "), r("[place]"))))}</w:tbl>
<w:p/>
<w:sectPr/></w:body></w:document>`;

  it("reads word/document.xml out of a .docx, and refuses other files", () => {
    const docx = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8(xml) });
    expect(docxDocumentXml(docx)).toBe(xml);
    expect(docxDocumentXml(strToU8("plain text, not a zip"))).toBeNull();
    expect(docxDocumentXml(zipSync({ "other.xml": strToU8("<x/>") }))).toBeNull();
  });

  it("maps the placeholders, keeps headings, clauses, tables and boxes, and marks the optional box", () => {
    const { body, unmapped } = docxToBody(xml, { optional: [1] });
    expect(body).toBe(
      [
        "# Test Agreement",
        "Made on this {{day}} day of {{month}}, {{year}}",
        "# BETWEEN",
        "{{full_name}}, {{relation}} of {{parent_name}}, aged about {{age}} years, residing at {{address}}, email {{email}} & more",
        "1.1\tClause with a [mystery]!",
        "Not bold, not a heading",
        "",
        "Full name: {{full_name}}",
        "Country and city: {{city}}, {{country}}",
        "Retention: 24 months",
        "",
        "☐ I agree to the first thing.",
        "☐ I agree to the second thing. (optional)",
        "Signature: {{full_name}} (signed electronically) Date: {{date}}",
        "",
        "# FOR FYNOLABS",
        "Shakshi Patel, Proprietor",
        "Date: {{date}}",
        "",
        "# RECIPIENT",
        "Name: {{full_name}}",
        "Place: {{place}}",
      ].join("\n"),
    );
    expect(unmapped).toEqual(["[mystery]"]);
    expect(checkLines(body).map((c) => c.optional)).toEqual([false, true]);
    expect(placeholdersIn(body)).toEqual(["day", "month", "year", "full_name", "relation", "parent_name", "age", "address", "email", "city", "country", "date", "place"]);
  });
});

describe("npm run docs:defaults (scripts/load-default-documents.ts)", () => {
  // Two made-up Word files with the real templates' names, in a temporary folder, and a local PGlite
  // folder as the database (the test-only HUB_TEST_DB switch): never the real templates or .env.local.
  const tmp = mkdtempSync(path.join(os.tmpdir(), "docs-defaults-"));
  const words = path.join(tmp, "Templates");
  const dbDir = path.join(tmp, "db");
  const cli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const para = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const docx = (...paras: string[]) =>
    zipSync({ "word/document.xml": strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.map(para).join("")}</w:body></w:document>`) });
  const run = (args: string[], env: Record<string, string> = {}) => {
    const r = spawnSync(process.execPath, [cli, "scripts/load-default-documents.ts", ...args], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "", HOME: tmp, DATABASE_URL: "", CONFIRM_DB: "", HUB_TEST_DB: "pglite", HUB_TEST_DB_DIR: dbDir, ...env } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 120_000,
    });
    return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
  };
  beforeAll(() => {
    mkdirSync(words, { recursive: true });
    writeFileSync(path.join(words, "2 - Non-Disclosure Agreement.docx"), docx("Between FynoLabs and [Full name of individual], aged [age].", "Place: [place]"));
    writeFileSync(path.join(words, "4 - Candidate consent (profile sharing).docx"), docx("Full name: [full name]", "☐ I agree.", "☐ I also agree."));
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("by default loads the portal's own NDA and Data Submission and Ownership Agreement (no GSTIN in them)", () => {
    const dry = run(["--dry-run"]);
    expect(dry.code).toBe(0);
    expect(dry.out).toContain("Non-Disclosure Agreement (nda");
    expect(dry.out).toContain("Data Submission and Ownership Agreement (agreement");
    expect(dry.out).toContain("Contractor: {{full_name}}");
    expect(dry.out).not.toMatch(/GSTIN|09[A-Z]{5}\d{4}[A-Z]/);
  });

  it("prints the converted text on a dry run, refuses without CONFIRM_DB, then adds both templates (and says so on a re-run)", async () => {
    const dry = run(["--dry-run", "--from-word", "--dir", words]);
    expect(dry.code).toBe(0);
    expect(dry.out).toContain("Between FynoLabs and {{full_name}}, aged {{age}}.");
    expect(dry.out).toContain("☐ I also agree. (optional)");
    expect(dry.out).toMatch(/Dry run: nothing was written/);
    expect(run(["--from-word", "--dir", path.join(tmp, "nowhere")]).out).toMatch(/Can't find/);
    const refused = run(["--from-word", "--dir", words]);
    expect(refused.code).toBe(1);
    expect(refused.out).toMatch(/Refusing: set CONFIRM_DB=yes/);
    const ok = run(["--from-word", "--dir", words], { CONFIRM_DB: "yes" });
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/Non-Disclosure Agreement: added/);
    expect(ok.out).toMatch(/Profile sharing consent: added/);
    expect(run(["--from-word", "--dir", words], { CONFIRM_DB: "yes" }).out).toMatch(/Non-Disclosure Agreement: already up to date/);
    const local = await openLocalDbWithClient({ dataDir: dbDir });
    try {
      const rows = await local.db.select().from(documentTemplates).orderBy(documentTemplates.position);
      expect(rows.map((t) => [t.title, t.kind, t.requiredForAll, t.active, t.position])).toEqual([
        ["Non-Disclosure Agreement", "nda", true, true, 0],
        ["Profile sharing consent", "compliance", true, true, 1],
      ]);
      expect(rows[1].body).toBe("Full name: {{full_name}}\n☐ I agree.\n☐ I also agree. (optional)");
    } finally {
      await local.client.close();
    }
  });
});
