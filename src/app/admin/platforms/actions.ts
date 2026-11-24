"use server";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, returnPath, str } from "@/lib/crm/flash";
import { deletePlatform, getPlatform, savePlatform } from "@/lib/server/platforms";

const BACK = "/admin/platforms";
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

export async function savePlatformForm(fd: FormData) {
  const id = str(fd, "id") || null;
  await bounce(id ? `${BACK}/${id}` : `${BACK}/new`, async () => {
    const user = await authorizeIn("platforms", "platforms.manage");
    const db = await getDb();
    const back = returnPath(fd, id ? `${BACK}/${id}` : `${BACK}/new`);
    // Logo: an uploaded image (kept small, as a data URL), a typed address, or "remove".
    let logoUrl: string | null | undefined = undefined;
    const file = fd.get("logo");
    if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
      if (!LOGO_TYPES.includes(file.type)) flash(back, "error", "The logo must be a PNG, JPG, WebP, GIF or SVG image.");
      if (file.size > 200_000) flash(back, "error", "The logo is too big (200 KB at most).");
      logoUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    } else if (str(fd, "removeLogo") === "yes") logoUrl = null;
    else if (fd.has("logoUrl")) logoUrl = str(fd, "logoUrl") || (id ? (await getPlatform(db, id))?.logoUrl ?? null : null);
    const labels = fd.getAll("refLabel").map(String);
    const urls = fd.getAll("refUrl").map(String);
    const r = await savePlatform(
      db,
      id,
      {
        name: str(fd, "name"),
        kind: str(fd, "kind") || "platform",
        domain: str(fd, "domain") || null,
        websiteUrl: str(fd, "websiteUrl") || null,
        jobsUrl: str(fd, "jobsUrl") || null,
        referralUrl: str(fd, "referralUrl") || null,
        status: str(fd, "status") || "active",
        notes: str(fd, "notes") || null,
        logoUrl,
        referenceLinks: urls.map((url, i) => ({ label: labels[i] ?? "", url })),
      },
      user,
    );
    if (!r.ok) flash(back, "error", r.reason);
    flash(`${BACK}/${r.id}`, "ok", "Saved.");
  });
}

export async function removePlatform(fd: FormData) {
  const id = str(fd, "id");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("platforms", "crm.delete");
    const db = await getDb();
    const r = await deletePlatform(db, id, user);
    if (!r.ok) flash(returnPath(fd, `${BACK}/${id}`), "error", r.reason);
    flash(BACK, "ok", "Platform deleted.");
  });
}
