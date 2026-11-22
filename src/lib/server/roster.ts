import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { experts, submissions } from "@/db/schema";
import { planRoster, type RosterInput } from "@/lib/roster";
import { currentCv, filesFor } from "./experts";

/** Everyone on a requirement, with their current CV, ready for planRoster(). */
export async function rosterFor(db: DB, requirementId: string) {
  const rows = await db
    .select({
      sub: { id: submissions.id, status: submissions.status, partnerNote: submissions.partnerNote },
      expert: {
        id: experts.id,
        fullName: experts.fullName,
        email: experts.email,
        country: experts.country,
        city: experts.city,
        phone: experts.phone,
        yearsExperience: experts.yearsExperience,
        linkedinUrl: experts.linkedinUrl,
        cvConsent: experts.cvConsent,
        cvRef: experts.cvRef,
      },
    })
    .from(submissions)
    .innerJoin(experts, eq(experts.id, submissions.expertId))
    .where(eq(submissions.requirementId, requirementId));
  const items: RosterInput[] = [];
  const fileByExpert = new Map<string, { id: string; filename: string; kind: string; storage: string; externalRef: string | null; expertId: string; mime: string }>();
  for (const r of rows) {
    // CVs only: never an attachment or a tax form, even as the fallback.
    const files = (await filesFor(db, r.expert.id)).filter((f) => f.kind === "cv");
    const cv = currentCv(r.expert.cvRef, files);
    if (cv) fileByExpert.set(r.expert.id, cv);
    items.push({
      submissionId: r.sub.id,
      status: r.sub.status,
      partnerNote: r.sub.partnerNote,
      expert: r.expert,
      cv: cv ? { fileId: cv.id, filename: cv.filename } : null,
    });
  }
  return { plan: planRoster(items), fileByExpert };
}

