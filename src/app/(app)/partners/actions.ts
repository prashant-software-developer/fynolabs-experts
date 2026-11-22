"use server";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { partners } from "@/db/schema";
import { PARTNER_KINDS, isOneOf } from "@/lib/constants";
import { requireUser } from "@/lib/auth/session";
import { cleanLongText, cleanText } from "@/lib/normalize";
import { logActivity } from "@/lib/server/activity";
import { isUuid } from "@/lib/server/experts";

const go = (kind: "ok" | "error", msg: string) => redirect(`/partners?${kind}=${encodeURIComponent(msg)}`);

export async function savePartner(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  const name = cleanText(fd.get("name"), 120);
  const kind = String(fd.get("kind") ?? "");
  const websiteRaw = cleanText(fd.get("website"), 200);
  const website = websiteRaw ? (/^https?:\/\//i.test(websiteRaw) ? websiteRaw : `https://${websiteRaw}`) : null;
  const notes = cleanLongText(fd.get("notes"), 4000);
  if (!name) go("error", "Give the partner a name.");
  if (!isOneOf(PARTNER_KINDS, kind)) go("error", "Pick a partner type.");
  const db = await getDb();
  const [clash] = await db
    .select({ id: partners.id })
    .from(partners)
    .where(sql`lower(${partners.name}) = ${name!.toLowerCase()}${id && isUuid(id) ? sql` and ${partners.id} <> ${id}` : sql``}`)
    .limit(1);
  if (clash) go("error", `There's already a partner called "${name}".`);
  if (id && isUuid(id)) {
    await db.update(partners).set({ name: name!, kind, website, notes }).where(eq(partners.id, id));
    await logActivity(db, { entityType: "partner", entityId: id, actor: user.email, action: "updated" });
    go("ok", "Partner saved.");
  }
  const [row] = await db.insert(partners).values({ name: name!, kind, website, notes }).returning({ id: partners.id });
  await logActivity(db, { entityType: "partner", entityId: row.id, actor: user.email, action: "created" });
  go("ok", "Partner added.");
}
