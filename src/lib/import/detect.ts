import { REGISTER_COLUMNS } from "./register";
import { crmColumnMap } from "./crm";

export type ImportKind = "register" | "admin_crm";

/** Guess the format from the header row. */
export function detectKind(headers: string[]): ImportKind | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const registerHits = REGISTER_COLUMNS.filter((c) => lower.includes(c.toLowerCase())).length;
  if (registerHits >= 6) return "register";
  const map = crmColumnMap(headers);
  if (Object.values(map).includes("name")) return "admin_crm";
  return null;
}
