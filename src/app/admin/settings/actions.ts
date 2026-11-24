"use server";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, str } from "@/lib/crm/flash";
import { REPLY_KEYS, saveReplySettings } from "@/lib/server/reply-settings";

export async function saveEmailReplySettings(fd: FormData) {
  await bounce("/admin/settings", async () => {
    const user = await authorizeIn("settings", "settings.manage");
    const db = await getDb();
    const input = Object.fromEntries(REPLY_KEYS.filter((k) => fd.has(k)).map((k) => [k, str(fd, k)]));
    const changed = await saveReplySettings(db, input, user);
    flash("/admin/settings", "ok", changed.length ? "Settings saved." : "Nothing changed.");
  });
}
