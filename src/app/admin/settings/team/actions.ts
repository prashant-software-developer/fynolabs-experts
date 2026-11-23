"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { authorize, bounce, isForbidden } from "@/lib/auth/guard";
import { addMember, resetMemberPassword, updateMember, type TeamResult } from "@/lib/server/team";

const BASE = "/admin/settings/team";
const go = (res: TeamResult, ok: string): never => {
  revalidatePath(BASE);
  if (!res.ok) redirect(`${BASE}?error=${encodeURIComponent(res.reason)}`);
  const msg = res.changed ? ok : "No changes.";
  redirect(`${BASE}?ok=${encodeURIComponent(res.warning ? `${msg} ${res.warning}` : msg)}`);
};

/** What the add / reset forms show: the temporary password comes back once, in this answer only. */
export type TempPasswordState = { error?: string; email?: string; tempPassword?: string; note?: string; values?: Record<string, string> };

export async function addTeamMember(_prev: TempPasswordState, fd: FormData): Promise<TempPasswordState> {
  const values = { email: String(fd.get("email") ?? ""), name: String(fd.get("name") ?? ""), role: String(fd.get("role") ?? "") };
  try {
    const user = await authorize("team.manage");
    const db = await getDb();
    const res = await addMember(db, user, { email: fd.get("email"), name: fd.get("name"), role: fd.get("role"), partnerIds: fd.getAll("partnerIds") });
    revalidatePath(BASE);
    if (!res.ok) return { error: res.reason, values };
    return { email: values.email.trim().toLowerCase(), tempPassword: res.tempPassword, note: res.note };
  } catch (e) {
    if (isForbidden(e)) return { error: e.message, values };
    throw e;
  }
}

export async function resetTeamPassword(_prev: TempPasswordState, fd: FormData): Promise<TempPasswordState> {
  try {
    const user = await authorize("team.manage");
    const db = await getDb();
    const res = await resetMemberPassword(db, user, String(fd.get("id") ?? ""));
    revalidatePath(BASE);
    if (!res.ok) return { error: res.reason };
    return { email: String(fd.get("email") ?? ""), tempPassword: res.tempPassword };
  } catch (e) {
    if (isForbidden(e)) return { error: e.message };
    throw e;
  }
}

export async function changeTeamRole(fd: FormData) {
  await bounce(BASE, async () => {
    const user = await authorize("team.manage");
    const db = await getDb();
    go(await updateMember(db, user, String(fd.get("id") ?? ""), { role: fd.get("role") }), "Role changed.");
  });
}

export async function setTeamScope(fd: FormData) {
  await bounce(BASE, async () => {
    const user = await authorize("team.manage");
    const db = await getDb();
    go(await updateMember(db, user, String(fd.get("id") ?? ""), { partnerIds: fd.getAll("partnerIds") }), "Partner scope saved.");
  });
}

export async function setTeamActive(fd: FormData) {
  await bounce(BASE, async () => {
    const user = await authorize("team.manage");
    const db = await getDb();
    const active = fd.get("active") === "yes";
    go(await updateMember(db, user, String(fd.get("id") ?? ""), { active }), active ? "Access turned back on." : "Access turned off. Their sessions have ended.");
  });
}
