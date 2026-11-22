"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { authorize, isForbidden } from "@/lib/auth/guard";
import type { Action } from "@/lib/auth/permissions";
import type { ImportKind } from "@/lib/import/detect";
import { applyCsv, previewCsv, type CsvPreview } from "@/lib/server/csv-import";
import { syncJobsSite, type JobsSyncResult } from "@/lib/server/jobs-sync";

const MAX_TEXT = 8 * 1024 * 1024;
const kindOf = (k: string): ImportKind | "auto" => (k === "register" || k === "admin_crm" ? k : "auto");
const matchOf = (m: string): "review" | "merge" => (m === "merge" ? "merge" : "review");

/** The guard, as a result the import panels can show (they call these actions directly). */
async function allowed(action: Action) {
  try {
    return { user: await authorize(action), message: null };
  } catch (e) {
    if (isForbidden(e)) return { user: null, message: e.message };
    throw e;
  }
}

export async function runJobsSync(dryRun: boolean): Promise<JobsSyncResult> {
  const { user, message } = await allowed("imports.jobs");
  if (!user) return { ok: false, message: message! };
  const db = await getDb();
  const res = await syncJobsSite(db, user, { dryRun });
  if (!dryRun) revalidatePath("/experts");
  return res;
}

export async function previewCsvImport(kind: string, text: string, nameMatch: string): Promise<CsvPreview> {
  const { user, message } = await allowed("imports.csv");
  if (!user) return { ok: false, message: message! };
  if (text.length > MAX_TEXT) return { ok: false, message: "That file is too big (8 MB max)." };
  const db = await getDb();
  return previewCsv(db, text, kindOf(kind), matchOf(nameMatch));
}

export async function applyCsvImport(kind: string, text: string, nameMatch: string) {
  const { user, message } = await allowed("imports.csv");
  if (!user) return { ok: false as const, message: message! };
  if (text.length > MAX_TEXT) return { ok: false as const, message: "That file is too big (8 MB max)." };
  const db = await getDb();
  const res = await applyCsv(db, text, kindOf(kind), matchOf(nameMatch), user);
  revalidatePath("/experts");
  return res;
}
