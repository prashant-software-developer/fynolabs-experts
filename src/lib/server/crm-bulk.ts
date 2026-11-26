// Bulk changes from the Accounts and Leads lists (ticked rows + the bulk bar). Each record goes
// through the same single-record functions the pages use (updateCompany, deleteCompany,
// updateContact, deleteContact), so the checks, the stage activity and the activity log are the same
// as when it is changed on its own. Permissions are checked by the server actions that call these.
import type { DB } from "@/db/client";
import { COMPANY_PRIORITIES, COMPANY_STAGES, CONTACT_KINDS, CONTACT_STAGES, isOneOf } from "@/lib/constants";
import type { Actor } from "./activity";
import { cleanTags, deleteCompany, getCompany, updateCompany, type CompanyInput } from "./companies";
import { deleteContact, getContact, updateContact, type ContactInput } from "./contacts";
import { isUuid } from "./experts";

export const BULK_LIMIT = 500;

export type BulkResult = { ok: true; changed: number; unchanged: number; skipped: { id: string; name: string; reason: string }[] } | { ok: false; reason: string };

/** Ticked ids: real ids only, each once, at most BULK_LIMIT. */
export function cleanIds(raw: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const id = String(r ?? "").trim();
    if (isUuid(id) && !out.includes(id)) out.push(id);
    if (out.length >= BULK_LIMIT) break;
  }
  return out;
}

export type AccountBulkOp =
  | { op: "stage"; stage: string }
  | { op: "owner"; owner: string }
  | { op: "priority"; priority: string }
  | { op: "add_tags" | "remove_tags"; tags: string }
  | { op: "delete" };

export async function bulkAccounts(db: DB, rawIds: readonly unknown[], change: AccountBulkOp, actor: Actor): Promise<BulkResult> {
  const ids = cleanIds(rawIds);
  if (!ids.length) return { ok: false, reason: "Tick at least one account." };
  if (change.op === "stage" && !isOneOf(COMPANY_STAGES, change.stage)) return { ok: false, reason: "Pick a stage." };
  if (change.op === "priority" && !isOneOf(COMPANY_PRIORITIES, change.priority)) return { ok: false, reason: "Pick a priority." };
  if (change.op === "owner" && !change.owner) return { ok: false, reason: "Pick an owner." };
  const tags = change.op === "add_tags" || change.op === "remove_tags" ? cleanTags(change.tags) : [];
  if ((change.op === "add_tags" || change.op === "remove_tags") && !tags.length) return { ok: false, reason: "Type at least one tag." };

  let changed = 0;
  let unchanged = 0;
  const skipped: { id: string; name: string; reason: string }[] = [];
  for (const id of ids) {
    const current = await getCompany(db, id);
    if (!current) {
      skipped.push({ id, name: "Unknown", reason: "That account no longer exists." });
      continue;
    }
    if (change.op === "delete") {
      const r = await deleteCompany(db, id, actor);
      if (r.ok) changed++;
      else skipped.push({ id, name: current.name, reason: r.reason });
      continue;
    }
    let input: CompanyInput;
    let same: boolean;
    if (change.op === "stage") [input, same] = [{ stage: change.stage }, current.stage === change.stage];
    else if (change.op === "owner") [input, same] = [{ owner: change.owner }, sameOwner(current, change.owner)];
    else if (change.op === "priority") [input, same] = [{ priority: change.priority }, current.priority === change.priority];
    else {
      const next = change.op === "add_tags" ? [...current.tags, ...tags.filter((t) => !current.tags.includes(t))] : current.tags.filter((t) => !tags.includes(t));
      [input, same] = [{ tags: next }, next.length === current.tags.length];
    }
    if (same) {
      unchanged++;
      continue;
    }
    const r = await updateCompany(db, id, input, actor);
    if (r.ok) changed++;
    else skipped.push({ id, name: current.name, reason: r.reason });
  }
  return { ok: true, changed, unchanged, skipped };
}

/** Whether an owner choice ("tm:<id>", "name:<typed>", "none") is who already owns it. */
function sameOwner(c: { ownerTeamMemberId: string | null; ownerName: string | null }, owner: string): boolean {
  if (owner === "none") return !c.ownerTeamMemberId && !c.ownerName;
  if (owner.startsWith("tm:")) return c.ownerTeamMemberId === owner.slice(3);
  if (owner.startsWith("name:")) return !c.ownerTeamMemberId && (c.ownerName ?? "").toLowerCase() === owner.slice(5).trim().toLowerCase();
  return false;
}

export type LeadBulkOp =
  | { op: "stage"; stage: string }
  | { op: "kind"; kind: string }
  | { op: "follow_up"; date: string | null }
  | { op: "account"; companyId: string | null }
  | { op: "delete" };

export async function bulkLeads(db: DB, rawIds: readonly unknown[], change: LeadBulkOp, actor: Actor): Promise<BulkResult> {
  const ids = cleanIds(rawIds);
  if (!ids.length) return { ok: false, reason: "Tick at least one lead." };
  if (change.op === "stage" && !isOneOf(CONTACT_STAGES, change.stage)) return { ok: false, reason: "Pick a stage." };
  if (change.op === "kind" && !isOneOf(CONTACT_KINDS, change.kind)) return { ok: false, reason: "Pick a type." };
  if (change.op === "account" && change.companyId) {
    const c = await getCompany(db, change.companyId);
    if (!c) return { ok: false, reason: "That account no longer exists." };
  }

  let changed = 0;
  let unchanged = 0;
  const skipped: { id: string; name: string; reason: string }[] = [];
  for (const id of ids) {
    const current = await getContact(db, id);
    if (!current) {
      skipped.push({ id, name: "Unknown", reason: "That person no longer exists." });
      continue;
    }
    if (change.op === "delete") {
      const r = await deleteContact(db, id, actor);
      if (r.ok) changed++;
      else skipped.push({ id, name: current.name, reason: r.reason });
      continue;
    }
    let input: ContactInput;
    let same: boolean;
    if (change.op === "stage") [input, same] = [{ stage: change.stage }, current.stage === change.stage];
    else if (change.op === "kind") [input, same] = [{ kind: change.kind }, current.kind === change.kind];
    else if (change.op === "follow_up") [input, same] = [{ nextFollowUp: change.date }, (current.nextFollowUp ?? null) === (change.date || null)];
    else [input, same] = [{ companyId: change.companyId }, (current.companyId ?? null) === (change.companyId || null)];
    if (same) {
      unchanged++;
      continue;
    }
    const r = await updateContact(db, id, input, actor);
    if (r.ok) changed++;
    else skipped.push({ id, name: current.name, reason: r.reason });
  }
  return { ok: true, changed, unchanged, skipped };
}

/** "3 changed, 1 already so, 1 skipped (Acme: has placements…)" for the flash message. */
export function bulkSummary(r: Extract<BulkResult, { ok: true }>, verb = "changed"): string {
  const parts = [`${r.changed} ${verb}`];
  if (r.unchanged) parts.push(`${r.unchanged} already so`);
  if (r.skipped.length) parts.push(`${r.skipped.length} skipped (${r.skipped.slice(0, 2).map((s) => `${s.name}: ${s.reason}`).join("; ")}${r.skipped.length > 2 ? "; …" : ""})`);
  return `${parts.join(", ")}.`;
}
