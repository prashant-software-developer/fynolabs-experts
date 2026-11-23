// CV storage. Two kinds of file, one way to read them:
//  - jobs_db: the CV someone uploaded on the jobs site. The bytes stay in public.xdl_jobs_files
//    (read only); we keep a pointer. Downloading streams it from there.
//  - upload:  a CV a team member uploaded here. Stored as bytea in hub.expert_files.data.
//  - fynolabs: a CV or document from the FynoLabs admin. The bytes are in fynolabs_copy.storage_objects
//    (copied by npm run sync:fynolabs, stored once); external_ref is "fynolabs:<bucket>/<path>".
// To move uploads to object storage later (S3, R2, Vercel Blob), change saveUploadedCv/readCv only.
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { rowsOf } from "@/db/client";
import { expertFiles, experts } from "@/db/schema";
import { actorEmail, logActivity, type Actor } from "./activity";

export const MAX_CV_BYTES = 10 * 1024 * 1024;
export const CV_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "text/plain": ".txt",
  "application/rtf": ".rtf",
};

export type CvFile = { filename: string; mime: string; bytes: Uint8Array };

type FileRow = { id: string; expertId: string; kind: string; storage: string; externalRef: string | null; filename: string; mime: string };

export async function getFileRow(db: DB, fileId: string): Promise<FileRow | null> {
  const [row] = await db
    .select({
      id: expertFiles.id,
      expertId: expertFiles.expertId,
      kind: expertFiles.kind,
      storage: expertFiles.storage,
      externalRef: expertFiles.externalRef,
      filename: expertFiles.filename,
      mime: expertFiles.mime,
    })
    .from(expertFiles)
    .where(eq(expertFiles.id, fileId))
    .limit(1);
  return row ?? null;
}

export async function readCv(db: DB, file: FileRow): Promise<CvFile | null> {
  if (file.storage === "jobs_db") {
    const ref = Number(file.externalRef);
    if (!Number.isInteger(ref)) return null;
    // Read only. Checks the file still belongs to the jobs-site user this expert was synced from.
    const res = await db.execute(sql`
      select f.filename, f.mime, encode(f.data, 'base64') as b64
      from public.xdl_jobs_files f
      join hub.expert_sources s on s.source = 'jobs_site' and s.external_id = f.user_id::text
      where f.id = ${ref} and s.expert_id = ${file.expertId}
      limit 1`);
    const [r] = rowsOf<{ filename: string; mime: string; b64: string }>(res);
    return r ? { filename: r.filename, mime: r.mime, bytes: Buffer.from(r.b64, "base64") } : null;
  }
  if (file.storage === "fynolabs") {
    const ref = file.externalRef ?? "";
    const m = /^fynolabs:([^/]+)\/(.+)$/.exec(ref);
    if (!m) return null;
    const res = await db.execute(sql`select encode(data, 'base64') as b64 from fynolabs_copy.storage_objects where bucket = ${m[1]} and name = ${m[2]} and data is not null limit 1`);
    const [r] = rowsOf<{ b64: string }>(res);
    return r ? { filename: file.filename, mime: file.mime, bytes: Buffer.from(r.b64, "base64") } : null;
  }
  const res = await db.execute(sql`select encode(data, 'base64') as b64 from hub.expert_files where id = ${file.id} and data is not null`);
  const [r] = rowsOf<{ b64: string }>(res);
  return r ? { filename: file.filename, mime: file.mime, bytes: Buffer.from(r.b64, "base64") } : null;
}

export function checkCvUpload(file: { name: string; type: string; size: number }): string | null {
  if (!file.size) return "Choose a file first.";
  if (file.size > MAX_CV_BYTES) return "CVs can be up to 10 MB.";
  const okType = CV_TYPES[file.type] || /\.(pdf|docx?|txt|rtf)$/i.test(file.name);
  if (!okType) return "Upload a PDF, Word document or text file.";
  return null;
}

export async function saveUploadedCv(db: DB, expertId: string, file: CvFile, actor: Actor): Promise<string> {
  const b64 = Buffer.from(file.bytes).toString("base64");
  const [row] = await db
    .insert(expertFiles)
    .values({
      expertId,
      kind: "cv",
      filename: file.filename.slice(0, 200),
      mime: file.mime || "application/octet-stream",
      size: file.bytes.byteLength,
      storage: "upload",
      data: sql`decode(${b64}, 'base64')`,
      createdBy: actorEmail(actor),
    })
    .returning({ id: expertFiles.id });
  await db.update(experts).set({ cvRef: `upload:${row.id}`, updatedAt: new Date() }).where(eq(experts.id, expertId));
  await logActivity(db, { entityType: "expert", entityId: expertId, actor, action: "cv_uploaded", detail: { size: file.bytes.byteLength } });
  return row.id;
}

/** Links a jobs-site resume (by its id) to an expert without copying the bytes. */
export async function linkJobsCv(
  db: DB,
  expertId: string,
  f: { id: number; filename: string; mime: string; size: number; createdAt: Date | null },
): Promise<boolean> {
  const ref = String(f.id);
  const [existing] = await db
    .select({ id: expertFiles.id })
    .from(expertFiles)
    .where(and(eq(expertFiles.expertId, expertId), eq(expertFiles.storage, "jobs_db"), eq(expertFiles.externalRef, ref)))
    .limit(1);
  if (existing) return false;
  await db.insert(expertFiles).values({
    expertId,
    kind: "cv",
    filename: f.filename.slice(0, 200),
    mime: f.mime,
    size: f.size,
    storage: "jobs_db",
    externalRef: ref,
    createdBy: "jobs-site sync",
    ...(f.createdAt ? { createdAt: f.createdAt } : {}),
  });
  return true;
}

/**
 * Copies a jobs-site resume's bytes from a separate (read-only) database into hub.expert_files.
 * external_ref "jobs:<id>" remembers which file it was, so re-running copies nothing twice. It
 * becomes the current CV unless the current one was uploaded in the hub by someone.
 */
export async function copyJobsCv(db: DB, source: DB, expertId: string, f: { id: number; filename: string; mime: string; createdAt: Date | null }): Promise<boolean> {
  const ref = `jobs:${f.id}`;
  const [existing] = await db
    .select({ id: expertFiles.id })
    .from(expertFiles)
    .where(and(eq(expertFiles.expertId, expertId), eq(expertFiles.externalRef, ref)))
    .limit(1);
  let fileId = existing?.id ?? null;
  let copied = false;
  if (!fileId) {
    const [r] = rowsOf<{ b64: string; size: number }>(await source.execute(sql`select encode(data, 'base64') as b64, size from public.xdl_jobs_files where id = ${f.id} limit 1`));
    if (!r) return false;
    const [row] = await db
      .insert(expertFiles)
      .values({
        expertId,
        kind: "cv",
        filename: f.filename.slice(0, 200),
        mime: f.mime,
        size: Buffer.from(r.b64, "base64").byteLength,
        storage: "upload",
        externalRef: ref,
        data: sql`decode(${r.b64}, 'base64')`,
        createdBy: "jobs-site import",
        ...(f.createdAt ? { createdAt: f.createdAt } : {}),
      })
      .returning({ id: expertFiles.id });
    fileId = row.id;
    copied = true;
  }
  // Current CV: replace nothing a person uploaded here; older jobs-site copies or pointers may be replaced.
  const updated = await db
    .update(experts)
    .set({ cvRef: `upload:${fileId}` })
    .where(
      sql`${experts.id} = ${expertId} and ${experts.cvRef} is distinct from ${`upload:${fileId}`} and (
        ${experts.cvRef} is null or ${experts.cvRef} like 'jobs:file:%' or ${experts.cvRef} in (
          select 'upload:' || ef.id from hub.expert_files ef where ef.expert_id = ${expertId} and ef.external_ref like 'jobs:%'))`,
    )
    .returning({ id: experts.id });
  return copied || updated.length > 0;
}
