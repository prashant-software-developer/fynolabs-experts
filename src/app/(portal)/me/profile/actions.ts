"use server";
// Profile actions. The expert id always comes from the signed-in session (ownExpertId), never from
// the form. Each form names its section; the answer comes back next to that section (?s=...#...).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { ownExpertId } from "@/lib/auth/expert";
import { checkCvUpload } from "@/lib/server/cv";
import { uploadOwnCv } from "@/lib/server/portal";
import { removeAvatar, saveAvailability, saveAvatar, saveCommunications, saveLinks, saveListItem, saveLocation, savePersonal, savePreferences, saveSkills, type SaveResult } from "@/lib/server/portal-profile";

const SECTIONS = {
  personal: { tab: "resume", run: savePersonal },
  skills: { tab: "resume", run: saveSkills },
  links: { tab: "resume", run: saveLinks },
  item: { tab: "resume", run: saveListItem },
  location: { tab: "location", run: saveLocation },
  availability: { tab: "availability", run: saveAvailability },
  preferences: { tab: "preferences", run: savePreferences },
  communications: { tab: "communications", run: saveCommunications },
} as const;

function back(tab: string, anchor: string, res: SaveResult): never {
  const q = new URLSearchParams({ tab, s: anchor, [res.ok ? "ok" : "error"]: res.ok ? res.message : res.error });
  redirect(`/me/profile?${q.toString()}#${anchor}`);
}

async function me(): Promise<string> {
  const id = await ownExpertId();
  if (!id) redirect("/signin?callbackUrl=/me/profile");
  return id;
}

export async function saveProfileSection(fd: FormData) {
  const section = String(fd.get("section") ?? "") as keyof typeof SECTIONS;
  const def = SECTIONS[section];
  if (!def) redirect("/me/profile");
  const id = await me();
  const res = await def.run(await getDb(), id, fd);
  revalidatePath("/me", "layout");
  const anchor = section === "item" ? String(fd.get("list") ?? "resume") : section;
  back(def.tab, anchor, res);
}

export async function uploadMyCvFromProfile(fd: FormData) {
  const id = await me();
  const file = fd.get("file");
  let res: SaveResult;
  if (!(file instanceof File) || !file.size) res = { ok: false, error: "Choose a file first." };
  else {
    const problem = checkCvUpload(file);
    if (problem) res = { ok: false, error: problem };
    else {
      await uploadOwnCv(await getDb(), id, { filename: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
      res = { ok: true, message: "CV uploaded. It's now the one we use." };
    }
  }
  revalidatePath("/me", "layout");
  back("resume", "cv", res);
}

export async function uploadMyAvatar(fd: FormData) {
  const id = await me();
  const file = fd.get("file");
  const res =
    file instanceof File && file.size
      ? await saveAvatar(await getDb(), id, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) })
      : ({ ok: false, error: "Choose a picture first." } as const);
  revalidatePath("/me", "layout");
  back("account", "avatar", res);
}

export async function removeMyAvatar() {
  const id = await me();
  const res = await removeAvatar(await getDb(), id);
  revalidatePath("/me", "layout");
  back("account", "avatar", res);
}
