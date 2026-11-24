// Per-section access (hub.team_members.sections), on top of the role. Every admin module has a
// section key (the FynoLabs admin's module keys, so the access copied from it keeps working). A team
// member whose sections list is filled in only opens those sections (plus the ones everyone has,
// like My work); an empty list means the role decides; admins open everything.
// FynoLabs keys that open more than their own module count too: "leads" opens Accounts, Leads and
// Calendar, "contact" opens Messages, "dashboard" opens Analytics, and Campaigns (Send emails) ride
// on Send referrals, Job radar on Jobs, as they did there. Checked on the server for every page and
// action of these modules.
import { ensure, ForbiddenError, type Action, type Role } from "./permissions";

type SectionDef = { label: string; always?: boolean; fynolabs?: readonly string[] };

export const SECTIONS = {
  // CRM and operations.
  dashboard: { label: "Dashboard", fynolabs: ["dashboard"] },
  "my-work": { label: "My work", always: true },
  accounts: { label: "Accounts", fynolabs: ["leads"] },
  leads: { label: "Leads", fynolabs: ["leads"] },
  calendar: { label: "Calendar", fynolabs: ["leads"] },
  platforms: { label: "Platforms", fynolabs: ["platforms"] },
  projects: { label: "Projects", fynolabs: ["profiles", "posted-jobs", "leads"] },
  messages: { label: "Messages", fynolabs: ["contact"] },
  analytics: { label: "Analytics", fynolabs: ["dashboard"] },
  settings: { label: "Settings", fynolabs: ["settings"] },
  // Talent.
  profiles: { label: "Experts" },
  referrals: { label: "Send emails", fynolabs: ["send-referrals"] },
  "send-referrals": { label: "Send referrals" },
  "posted-jobs": { label: "Jobs", fynolabs: ["job-radar"] },
  "job-radar": { label: "Job radar" },
  fees: { label: "Fees" },
} as const satisfies Record<string, SectionDef>;

export type SectionKey = keyof typeof SECTIONS;
export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

export type SectionUser = { role: Role; sections?: readonly string[] | null; blocked?: boolean };
/** @deprecated name kept for the CRM screens. */
export type SectionSubject = SectionUser;

/** May this person open this section? */
export function canOpenSection(user: SectionUser, key: SectionKey): boolean {
  if (user.blocked) return false;
  if (user.role === "admin") return true;
  const def: SectionDef | undefined = SECTIONS[key];
  if (!def) return false;
  if (def.always) return true;
  const mine = (user.sections ?? []).map((s) => s.trim()).filter(Boolean);
  if (!mine.length) return true;
  return mine.includes(key) || (def.fynolabs ?? []).some((k) => mine.includes(k));
}

/** Every section this person may open (for the menu). */
export function openSections(user: SectionUser): Record<SectionKey, boolean> {
  return Object.fromEntries(SECTION_KEYS.map((k) => [k, canOpenSection(user, k)])) as Record<SectionKey, boolean>;
}
/** Same as openSections (the talent screens' name). */
export const sectionAccess = openSections;

export const sectionMessage = (key: SectionKey) => `You don't have access to ${SECTIONS[key].label}. Ask an admin to give you access in Team & access.`;

/** Throws a ForbiddenError (403) unless the person may open the section (and, when given, do the action). */
export function ensureSection(
  user: SectionUser & { email?: string; partnerIds?: readonly string[] },
  key: SectionKey,
  action?: Action,
  ctx?: { partnerId?: string | null },
): void {
  if (user.blocked) throw new ForbiddenError("inactive", "Your access to Expert Hub is turned off. Ask an admin to turn it back on.");
  if (!canOpenSection(user, key)) throw new ForbiddenError("inactive", sectionMessage(key));
  if (action) ensure({ email: user.email ?? "", role: user.role, partnerIds: user.partnerIds ?? [], blocked: user.blocked }, action, ctx);
}
