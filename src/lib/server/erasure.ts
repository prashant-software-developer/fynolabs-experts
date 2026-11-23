// People deleted on request: the hub keeps a SHA-256 of their email (hub.erasures.email_sha256);
// erasures copied from the FynoLabs admin only have an MD5 (email_md5). Both are checked everywhere
// a person could come back (job forms, sign-up, imports, the copies).
import { createHash } from "node:crypto";
import { or, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { erasures } from "@/db/schema";
import { emailHash } from "@/lib/normalize";

export const emailMd5 = (email: string) => createHash("md5").update(email.trim().toLowerCase()).digest("hex");

export async function isErasedEmail(db: DB, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: erasures.id })
    .from(erasures)
    .where(or(eq(erasures.emailSha256, emailHash(email)), eq(erasures.emailMd5, emailMd5(email))))
    .limit(1);
  return Boolean(row);
}
