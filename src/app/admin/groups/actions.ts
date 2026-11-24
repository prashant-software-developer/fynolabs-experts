"use server";
// Groups (lists of people a referral or campaign goes to). Experts module + groups.manage; deleting
// a group is for admins.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { ids, returnPath, str, withFlash } from "@/lib/action-flash";
import { addGroupMembers, createGroup, deleteGroup, removeGroupMembers, updateGroup } from "@/lib/server/referrals";

export async function newGroup(fd: FormData) {
  await bounce("/admin/groups", async () => {
    const user = await authorizeIn("profiles", "groups.manage");
    const db = await getDb();
    const res = await createGroup(db, user, str(fd, "name") || "Untitled group");
    redirect(withFlash(`/admin/groups/${res.id}`, "ok", "Group created. Add people below."));
  });
}

export async function saveGroup(fd: FormData) {
  const id = str(fd, "id");
  const back = returnPath(fd, `/admin/groups/${id}`);
  await bounce(back, async () => {
    const user = await authorizeIn("profiles", "groups.manage");
    const db = await getDb();
    const res = await updateGroup(db, user, id, { name: str(fd, "name"), status: str(fd, "status") });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    revalidatePath("/admin/groups");
    redirect(withFlash(back, "ok", res.changed ? "Group saved." : "No change."));
  });
}

export async function removeGroup(fd: FormData) {
  const id = str(fd, "id");
  await bounce(`/admin/groups/${id}`, async () => {
    const user = await authorizeIn("profiles", "groups.delete");
    const db = await getDb();
    const res = await deleteGroup(db, user, id);
    if (!res.ok) redirect(withFlash(`/admin/groups/${id}`, "error", res.reason));
    redirect(withFlash("/admin/groups", "ok", "Group deleted. The experts stay as they are."));
  });
}

export async function addMembers(fd: FormData) {
  const id = str(fd, "id");
  const back = returnPath(fd, `/admin/groups/${id}`);
  await bounce(back, async () => {
    const user = await authorizeIn("profiles", "groups.manage");
    const db = await getDb();
    const res = await addGroupMembers(db, user, id, { emailsText: str(fd, "emails"), expertIds: ids(fd, "expertIds") });
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash(back, "ok", `${res.added} added${res.already ? `, ${res.already} already in the group` : ""}${res.noEmail ? `, ${res.noEmail} without an email left out` : ""}.`));
  });
}

export async function removeMembers(fd: FormData) {
  const id = str(fd, "id");
  const back = returnPath(fd, `/admin/groups/${id}`);
  await bounce(back, async () => {
    const user = await authorizeIn("profiles", "groups.manage");
    const db = await getDb();
    const res = await removeGroupMembers(db, user, id, ids(fd));
    if (!res.ok) redirect(withFlash(back, "error", res.reason));
    redirect(withFlash(back, "ok", `${res.removed} removed.`));
  });
}
