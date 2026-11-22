"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { authorize, bounce } from "@/lib/auth/guard";
import { addMember, updateMember, type TeamResult } from "@/lib/server/team";

const BASE = "/settings/team";
const go = (res: TeamResult, ok: string): never => {
  revalidatePath(BASE);
  if (!res.ok) redirect(`${BASE}?error=${encodeURIComponent(res.reason)}`);
  const msg = res.changed ? ok : "No changes.";
  redirect(`${BASE}?ok=${encodeURIComponent(res.warning ? `${msg} ${res.warning}` : msg)}`);
};

export async function addTeamMember(fd: FormData) {
  await bounce(BASE, async () => {
    const user = await authorize("team.manage");
    const db = await getDb();
    const res = await addMember(db, user, { email: fd.get("email"), name: fd.get("name"), role: fd.get("role"), partnerIds: fd.getAll("partnerIds") });
    go(res, "Team member added.");
  });
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
    go(await updateMember(db, user, String(fd.get("id") ?? ""), { active }), active ? "Access turned back on." : "Access turned off.");
  });
}
