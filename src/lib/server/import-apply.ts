// Writes an import plan to the database (creates and fills empty fields), with activity rows.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { erasures, expertSources, experts } from "@/db/schema";
import { buildIndex, type ExistingExpert, type ImportPlan, type PlanRow } from "@/lib/import/plan";
import type { ExpertDraft } from "@/lib/import/types";
import { logActivity } from "./activity";

export async function loadIndex(db: DB) {
  const [rows, srcs, erased] = await Promise.all([
    db
      .select({
        id: experts.id,
        fullName: experts.fullName,
        email: experts.email,
        linkedinUrl: experts.linkedinUrl,
        phone: experts.phone,
        country: experts.country,
        region: experts.region,
        city: experts.city,
        headline: experts.headline,
        domain: experts.domain,
        skills: experts.skills,
        languages: experts.languages,
        yearsExperience: experts.yearsExperience,
        highestDegree: experts.highestDegree,
        fieldOfStudy: experts.fieldOfStudy,
        university: experts.university,
        hoursPerWeek: experts.hoursPerWeek,
        rateExpectationUsd: experts.rateExpectationUsd,
        status: experts.status,
        cvConsent: experts.cvConsent,
        notes: experts.notes,
        tags: experts.tags,
      })
      .from(experts),
    db.select({ source: expertSources.source, externalId: expertSources.externalId, expertId: expertSources.expertId }).from(expertSources),
    db.select({ emailSha256: erasures.emailSha256, source: erasures.source, externalId: erasures.externalId }).from(erasures),
  ]);
  return buildIndex(rows as ExistingExpert[], srcs, erased);
}

function definedFields(d: Partial<ExpertDraft>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export type ApplyResult = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  duplicates: number;
  /** row number -> expert id, for follow-up work such as linking CVs. */
  expertByRow: Map<number, string>;
};

export async function applyPlan(db: DB, plan: ImportPlan, actor: string): Promise<ApplyResult> {
  const result: ApplyResult = { created: 0, updated: 0, unchanged: 0, skipped: 0, duplicates: 0, expertByRow: new Map() };
  const now = new Date();
  const touchedSources: { source: string; externalId: string }[] = [];

  for (const r of plan.rows) {
    if (r.action === "skip") {
      result.skipped++;
      continue;
    }
    if (r.action === "duplicate") {
      result.duplicates++;
      continue;
    }
    if (r.action === "create") {
      const values = definedFields(r.draft);
      if (values.cvConsent && values.cvConsent !== "unknown") values.cvConsentAt = now;
      const [row] = await db
        .insert(experts)
        .values({ ...(values as { fullName: string }), primarySource: r.source, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .returning({ id: experts.id });
      if (!row) {
        result.duplicates++;
        continue;
      }
      result.created++;
      result.expertByRow.set(r.row, row.id);
      if (r.externalId) await upsertSource(db, row.id, r, now);
      await logActivity(db, { entityType: "expert", entityId: row.id, actor, action: "created", detail: { source: r.source } });
      continue;
    }
    // update / unchanged
    const id = r.expertId!;
    result.expertByRow.set(r.row, id);
    if (r.action === "update") {
      const patch = definedFields(r.patch);
      if (patch.cvConsent) patch.cvConsentAt = now;
      await db.update(experts).set({ ...patch, updatedAt: now }).where(eq(experts.id, id));
      result.updated++;
      await logActivity(db, { entityType: "expert", entityId: id, actor, action: "updated_by_import", detail: { source: r.source, fields: Object.keys(r.patch) } });
    } else {
      result.unchanged++;
    }
    if (r.externalId) {
      if (r.matchedBy === "source") touchedSources.push({ source: r.source, externalId: r.externalId });
      else await upsertSource(db, id, r, now);
    }
  }
  // One statement to refresh "last synced" on everyone we matched by an earlier import.
  for (const source of new Set(touchedSources.map((t) => t.source))) {
    const ids = touchedSources.filter((t) => t.source === source).map((t) => t.externalId);
    for (let i = 0; i < ids.length; i += 500) {
      await db
        .update(expertSources)
        .set({ lastSyncedAt: now })
        .where(and(eq(expertSources.source, source), inArray(expertSources.externalId, ids.slice(i, i + 500))));
    }
  }
  return result;
}

async function upsertSource(db: DB, expertId: string, r: PlanRow, now: Date) {
  await db
    .insert(expertSources)
    .values({ expertId, source: r.source, externalId: r.externalId!, lastSyncedAt: now })
    .onConflictDoUpdate({
      target: [expertSources.source, expertSources.externalId],
      set: { lastSyncedAt: now, expertId: sql`${expertSources.expertId}` },
    });
}

export { buildIndex };
