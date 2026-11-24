"use server";
import { getDb } from "@/db/client";
import { bounce } from "@/lib/auth/guard";
import { authorizeIn } from "@/lib/auth/section-guard";
import { flash, optStr, returnPath, str } from "@/lib/crm/flash";
import { crmLabel } from "@/lib/crm/labels";
import { istInstant } from "@/lib/crm/dates";
import { createCompany, deleteCompany, getCompany, logCompanyActivity, myTeamMemberId, updateCompany, type CompanyInput } from "@/lib/server/companies";
import { createContact, linkContact } from "@/lib/server/contacts";

const BACK = "/admin/accounts";

/** The owner select: "tm:<id>", "other" (with a typed name) or "none". */
function ownerFrom(fd: FormData): string | undefined {
  if (!fd.has("owner")) return undefined;
  const o = str(fd, "owner");
  if (o === "other") return `name:${str(fd, "ownerName")}`;
  return o || "none";
}

export async function createAccount(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("accounts", "crm.edit");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const meId = await myTeamMemberId(db, user.email);
    const owner = ownerFrom(fd) ?? (meId ? `tm:${meId}` : "none");
    const r = await createCompany(db, { name: str(fd, "name"), kind: str(fd, "kind") || "data_partner", businessLine: str(fd, "businessLine") || "ai_training", stage: str(fd, "stage") || "researching", owner, website: optStr(fd, "website") }, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(`/admin/accounts/${r.id}`, "ok", "Account added.");
  });
}

export async function saveAccount(fd: FormData) {
  const id = str(fd, "id");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("accounts", "crm.edit");
    const db = await getDb();
    const back = returnPath(fd, `${BACK}/${id}`);
    const fields: (keyof CompanyInput)[] = ["name", "kind", "businessLine", "stage", "priority", "nextStep", "nextStepDue", "bestRoute", "website", "location", "platformId", "tags", "notes"];
    const input: CompanyInput = {};
    for (const f of fields) if (fd.has(f)) (input as Record<string, unknown>)[f] = str(fd, f);
    const owner = ownerFrom(fd);
    if (owner !== undefined) input.owner = owner;
    const r = await updateCompany(db, id, input, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", r.stageChanged ? `Account saved. Stage change logged in Activity.` : "Account saved.");
  });
}

/** Board and side panel: move to another stage. */
export async function setAccountStage(fd: FormData) {
  await bounce(BACK, async () => {
    const user = await authorizeIn("accounts", "crm.edit");
    const db = await getDb();
    const back = returnPath(fd, BACK);
    const r = await updateCompany(db, str(fd, "id"), { stage: str(fd, "stage") }, user);
    if (!r.ok) flash(back, "error", r.reason);
    const c = await getCompany(db, str(fd, "id"));
    flash(back, "ok", `${c?.name ?? "Account"}: ${crmLabel(str(fd, "stage"))}`);
  });
}

export async function logAccountActivity(fd: FormData) {
  const id = str(fd, "companyId");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("accounts", "crm.edit");
    const db = await getDb();
    const back = returnPath(fd, `${BACK}/${id}?tab=activity`);
    const date = str(fd, "date");
    const time = str(fd, "time");
    const happenedAt = date ? istInstant(date, time || null) : null;
    const r = await logCompanyActivity(db, { companyId: id, kind: str(fd, "kind") || "note", summary: str(fd, "summary"), detail: optStr(fd, "detail"), happenedAt, contactId: str(fd, "contactId") || null }, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", "Logged.", { log: null });
  });
}

export async function addPerson(fd: FormData) {
  const id = str(fd, "companyId");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("accounts", "crm.edit");
    const db = await getDb();
    const back = returnPath(fd, `${BACK}/${id}?tab=people`);
    const company = await getCompany(db, id);
    if (!company) flash(BACK, "error", "That account no longer exists.");
    const existing = str(fd, "contactId");
    if (existing) {
      const r = await linkContact(db, existing, id, user);
      if (!r.ok) flash(back, "error", r.reason);
      flash(back, "ok", "Linked to this account.", { add: null });
    }
    const r = await createContact(
      db,
      { name: str(fd, "name"), role: optStr(fd, "role"), email: optStr(fd, "email"), profileUrl: optStr(fd, "profileUrl"), companyId: id, kind: company!.kind === "client" ? "client" : "partner", stage: "new", source: "other" },
      user,
    );
    if (!r.ok) flash(back, "error", r.reason === "Add a name." ? "Add their name." : r.reason);
    flash(back, "ok", "Added to Leads, linked to this account.", { add: null });
  });
}

export async function unlinkPerson(fd: FormData) {
  const id = str(fd, "companyId");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("accounts", "crm.edit");
    const db = await getDb();
    const back = returnPath(fd, `${BACK}/${id}?tab=people`);
    const r = await linkContact(db, str(fd, "contactId"), null, user);
    if (!r.ok) flash(back, "error", r.reason);
    flash(back, "ok", "Unlinked. They stay in Leads.");
  });
}

export async function removeAccount(fd: FormData) {
  const id = str(fd, "id");
  await bounce(`${BACK}/${id}`, async () => {
    const user = await authorizeIn("accounts", "crm.delete");
    const db = await getDb();
    const c = await getCompany(db, id);
    const r = await deleteCompany(db, id, user);
    if (!r.ok) flash(returnPath(fd, `${BACK}/${id}`), "error", r.reason);
    flash(BACK, "ok", `${c?.name ?? "Account"} deleted.`);
  });
}
