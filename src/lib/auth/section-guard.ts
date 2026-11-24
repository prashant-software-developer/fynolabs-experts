// The one guard for the section-gated modules (CRM, operations and talent): the person may open the
// section (hub.team_members.sections) AND, when given, their role may do the action. Pages call
// requireSection() (and show NoAccess / SectionBlocked when it says no); server actions call
// authorizeIn(), which throws a ForbiddenError (bounce() turns it into the reason on the page).
import type { Action } from "./permissions";
import { canOpenSection, ensureSection, type SectionKey } from "./sections";
import { requireUser, type CurrentUser } from "./session";

export async function authorizeIn(section: SectionKey, action?: Action, ctx?: { partnerId?: string | null }): Promise<CurrentUser> {
  const user = await requireUser();
  ensureSection(user, section, action, ctx);
  return user;
}

/** The signed-in team member and whether they may open the section. */
export async function requireSection(section: SectionKey): Promise<{ user: CurrentUser; allowed: boolean }> {
  const user = await requireUser();
  return { user, allowed: canOpenSection(user, section) };
}
