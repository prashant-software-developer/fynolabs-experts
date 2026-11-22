import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { teamMembers } from "@/db/schema";
import { accountKind } from "@/lib/auth/account";

/** Team or expert, for the sign-in cookie. Any hub.team_members row (active or not) means team. */
export async function accountKindFor(email: string): Promise<"team" | "expert"> {
  const db = await getDb();
  const [m] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.email, email.toLowerCase())).limit(1);
  return accountKind({ email, hasTeamRow: Boolean(m) });
}
