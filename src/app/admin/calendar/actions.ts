"use server";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, returnPath, str } from "@/lib/crm/flash";
import { deleteEvent, markEventDone, saveEvent } from "@/lib/server/calendar";

const BACK = "/admin/calendar";

export async function saveCalendarEvent(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("calendar", "crm.edit");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const id = str(fd, "id") || null;
    const r = await saveEvent(
      db,
      id,
      {
        title: str(fd, "title"),
        kind: str(fd, "kind") || "call",
        status: str(fd, "status") || "planned",
        eventDate: str(fd, "eventDate") || null,
        startTime: str(fd, "startTime") || null,
        endTime: str(fd, "endTime") || null,
        companyId: str(fd, "companyId") || null,
        contactIds: fd.getAll("contactIds").map(String),
        teamMemberIds: fd.getAll("teamMemberIds").map(String),
        meetingUrl: str(fd, "meetingUrl") || null,
        notes: str(fd, "notes") || null,
        newPerson: { name: str(fd, "newName") || null, email: str(fd, "newEmail") || null },
      },
      user,
    );
    if (!r.ok) flash(back, "error", r.reason);
    const date = str(fd, "eventDate");
    flash(back, "ok", `${id ? "Event saved." : "Event added."}${r.logged ? " Logged on the account too." : ""}`, { edit: null, new: null, event: r.id, ...(date ? { date } : {}) });
  });
}

export async function markCalendarEventDone(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("calendar", "crm.edit");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const r = await markEventDone(db, str(fd, "id"), user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", r.logged ? "Marked done. Logged on the account too." : "Marked done.");
  });
}

export async function removeCalendarEvent(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("calendar", "crm.delete");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const r = await deleteEvent(db, str(fd, "id"), user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", "Event deleted.", { event: null, edit: null });
  });
}
