"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/session";
import type { ImportKind } from "@/lib/import/detect";
import { applyCsv, previewCsv, type CsvPreview } from "@/lib/server/csv-import";
import { syncJobsSite, type JobsSyncResult } from "@/lib/server/jobs-sync";

const MAX_TEXT = 8 * 1024 * 1024;
const kindOf = (k: string): ImportKind | "auto" => (k === "register" || k === "admin_crm" ? k : "auto");
const matchOf = (m: string): "review" | "merge" => (m === "merge" ? "merge" : "review");

export async function runJobsSync(dryRun: boolean): Promise<JobsSyncResult> {
  const user = await requireUser();
  const db = await getDb();
  const res = await syncJobsSite(db, user.email, { dryRun });
  if (!dryRun) revalidatePath("/experts");
  return res;
}

export async function previewCsvImport(kind: string, text: string, nameMatch: string): Promise<CsvPreview> {
  await requireUser();
  if (text.length > MAX_TEXT) return { ok: false, message: "That file is too big (8 MB max)." };
  const db = await getDb();
  return previewCsv(db, text, kindOf(kind), matchOf(nameMatch));
}

export async function applyCsvImport(kind: string, text: string, nameMatch: string) {
  const user = await requireUser();
  if (text.length > MAX_TEXT) return { ok: false as const, message: "That file is too big (8 MB max)." };
  const db = await getDb();
  const res = await applyCsv(db, text, kindOf(kind), matchOf(nameMatch), user.email);
  revalidatePath("/experts");
  return res;
}
