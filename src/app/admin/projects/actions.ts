"use server";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, returnPath, str } from "@/lib/crm/flash";
import { createProject, deleteProject, getProject, linkJobs, saveDocuments, saveFeeRules, saveMembers, saveTracks, updateProject, type ProjectInput } from "@/lib/server/projects";

const BACK = "/admin/projects";

/** Rows of a list editor: fields named `<name>` repeated once per line, plus `remove` (the ids to drop). */
function rowsOf(fd: FormData, fields: string[]) {
  const cols = Object.fromEntries(fields.map((f) => [f, fd.getAll(f).map(String)]));
  const ids = fd.getAll("rowId").map(String);
  const remove = new Set(fd.getAll("remove").map(String));
  return ids.map((id, i) => ({ id: id || null, remove: Boolean(id) && remove.has(id), ...Object.fromEntries(fields.map((f) => [f, cols[f][i] ?? ""])) })) as ({ id: string | null; remove: boolean } & Record<string, string>)[];
}

export async function createProjectForm(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("projects", "projects.manage");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const r = await createProject(db, { code: str(fd, "code"), name: str(fd, "name"), kind: str(fd, "kind") || "referral", companyId: str(fd, "companyId") || null, targetCount: str(fd, "targetCount") || null, countries: str(fd, "countries") }, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(`${BACK}?view=${r.id}`, "ok", "Project added.");
  });
}

export async function saveProjectForm(fd: FormData) {
  const id = str(fd, "id");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("projects", "projects.manage");
    const db = await getDb();
    const back = returnPath(fd, `${BACK}/${id}?tab=details`);
    const input: ProjectInput = {};
    for (const k of ["name", "kind", "status", "companyId", "platformId", "ownerTeamMemberId", "targetCount", "startsOn", "endsOn", "countries", "referralUrl", "discord", "description", "notes", "rules"] as const)
      if (fd.has(k)) (input as Record<string, unknown>)[k] = str(fd, k);
    const r = await updateProject(db, id, input, user);
    if (!r.ok) flash(back, "error", r.reason);
    const p = await getProject(db, id);
    flash(back, "ok", `${p?.code ?? "Project"} saved.`);
  });
}

export async function saveTracksForm(fd: FormData) {
  const id = str(fd, "projectId");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("projects", "projects.manage");
    const db = await getDb();
    const back = returnPath(fd, `${BACK}/${id}?tab=tracks`);
    const r = await saveTracks(db, id, rowsOf(fd, ["name", "targetCount"]).map((x) => ({ id: x.id, remove: x.remove, name: x.name, targetCount: x.targetCount })), user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", "Tracks saved.", { edit: null });
  });
}

export async function saveTeamForm(fd: FormData) {
  const id = str(fd, "projectId");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("projects", "projects.manage");
    const db = await getDb();
    const back = returnPath(fd, `${BACK}/${id}?tab=team`);
    const rows = rowsOf(fd, ["teamMemberId", "role", "capacity", "active"]).map((x) => ({ id: x.id, remove: x.remove, teamMemberId: x.teamMemberId, role: x.role || "recruiter", capacity: x.capacity, active: x.active !== "paused" }));
    const r = await saveMembers(db, id, rows, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", "Team saved.", { edit: null });
  });
}

export async function saveDocumentsForm(fd: FormData) {
  const id = str(fd, "projectId");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("projects", "projects.manage");
    const db = await getDb();
    const back = returnPath(fd, `${BACK}/${id}?tab=documents`);
    const rows = rowsOf(fd, ["title", "kind", "requiredStage", "expiresAfterDays"]).map((x) => ({ id: x.id, remove: x.remove, title: x.title, kind: x.kind || "nda", requiredStage: x.requiredStage || "selected", expiresAfterDays: x.expiresAfterDays }));
    const r = await saveDocuments(db, id, rows, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", "Required documents saved.", { edit: null });
  });
}

export async function saveFeesForm(fd: FormData) {
  const id = str(fd, "projectId");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("projects", "projects.fees");
    const db = await getDb();
    const back = returnPath(fd, `${BACK}/${id}?tab=fees`);
    const rows = rowsOf(fd, ["trackId", "amount", "currency", "earnedAtStage", "paymentTermsDays", "active", "notes"]).map((x) => ({
      id: x.id,
      remove: x.remove,
      trackId: x.trackId || null,
      amount: x.amount,
      currency: x.currency || "USD",
      earnedAtStage: x.earnedAtStage || "active",
      paymentTermsDays: x.paymentTermsDays,
      active: x.active !== "off",
      notes: x.notes || null,
    }));
    const r = await saveFeeRules(db, id, rows, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", "Fee rules saved.", { edit: null });
  });
}

export async function linkRolesForm(fd: FormData) {
  const id = str(fd, "projectId");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("projects", "projects.manage");
    const db = await getDb();
    const back = returnPath(fd, `${BACK}/${id}?tab=roles`);
    const unlink = str(fd, "unlink") === "yes";
    const r = await linkJobs(db, unlink ? null : id, fd.getAll("jobIds").map(String), user);
    if (!r.ok) flash(back, "error", r.reason);
    const p = await getProject(db, id);
    flash(back, "ok", unlink ? "Role unlinked." : `${r.n} ${r.n === 1 ? "role" : "roles"} linked to ${p?.code ?? "the project"}.`, { edit: null });
  });
}

export async function removeProject(fd: FormData) {
  const id = str(fd, "id");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("projects", "crm.delete");
    const db = await getDb();
    const p = await getProject(db, id);
    const r = await deleteProject(db, id, user);
    if (!r.ok) flash(returnPath(fd, `${BACK}/${id}`), "error", r.reason);
    flash(BACK, "ok", `${p?.code ?? "Project"} deleted.`);
  });
}
