// Who may do what. One table for the whole app: pages, server actions and API routes all ask
// `can()` (or `ensure()`, which throws). Pure functions, safe to import anywhere and fully tested.

export const ROLES = ["admin", "recruiter", "pod_lead", "finance", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  recruiter: "Recruiter",
  pod_lead: "Pod lead",
  finance: "Finance",
  viewer: "Viewer",
};

export const ROLE_SUMMARY: Record<Role, string> = {
  admin: "Everything, plus team & access, imports, delete on request and partners.",
  recruiter: "Experts, requirements, matching and submissions. No money.",
  pod_lead: "Reads experts and requirements. Submissions and placements for their partners only; updates hours, tasks and status. No money.",
  finance: "Reads experts, requirements and submissions. Full placements with money, and the placements export.",
  viewer: "Read only. No money, contact details masked, no exports.",
};

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export const roleLabel = (r: Role | string | null | undefined): string => (isRole(r) ? ROLE_LABELS[r] : (r ?? ""));

export type Action =
  | "experts.read"
  | "experts.create"
  | "experts.edit"
  | "experts.notes"
  | "experts.cv_upload"
  | "experts.cv_download"
  | "experts.delete"
  | "experts.export"
  | "experts.contact"
  | "requirements.read"
  | "requirements.create"
  | "requirements.edit"
  | "requirements.rate_note"
  | "matching.shortlist"
  | "submissions.read"
  | "submissions.update"
  | "roster.export"
  | "placements.read"
  | "placements.create"
  | "placements.edit"
  | "placements.progress"
  | "placements.export"
  | "money.read"
  | "imports.csv"
  | "imports.jobs"
  | "partners.read"
  | "partners.manage"
  | "team.manage"
  | "settings.manage"
  | "views.save"
  | "views.share"
  | "views.manage_any";

const ALL = ROLES;
const A: Role[] = ["admin"];
const AR: Role[] = ["admin", "recruiter"];
const AF: Role[] = ["admin", "finance"];

/** The matrix. Pod-lead rights on SCOPED actions only hold for partners in their scope. */
export const MATRIX: Record<Action, readonly Role[]> = {
  "experts.read": ALL,
  "experts.create": AR,
  "experts.edit": AR, // profile fields, status, CV consent
  "experts.notes": AR,
  "experts.cv_upload": AR,
  "experts.cv_download": ["admin", "recruiter", "pod_lead"],
  "experts.delete": A, // delete / forget on request
  "experts.export": AR,
  "experts.contact": ["admin", "recruiter", "pod_lead", "finance"], // unmasked email and phone
  "requirements.read": ALL,
  "requirements.create": AR,
  "requirements.edit": AR,
  "requirements.rate_note": ["admin", "recruiter", "finance"],
  "matching.shortlist": AR, // shortlist from matches, "Add to requirement"
  "submissions.read": ALL,
  "submissions.update": ["admin", "recruiter", "pod_lead"],
  "roster.export": AR,
  "placements.read": ALL,
  "placements.create": AF,
  "placements.edit": AF, // every field, money included
  "placements.progress": ["admin", "finance", "pod_lead"], // hours, tasks, status
  "placements.export": AF,
  "money.read": AF, // rate expectation, placement rates, earned, revenue, margin, totals
  "imports.csv": AR,
  "imports.jobs": A,
  "partners.read": ALL,
  "partners.manage": A,
  "team.manage": A,
  "settings.manage": A,
  "views.save": ALL, // personal saved views are a preference, not a record change
  "views.share": ["admin", "recruiter", "pod_lead", "finance"],
  "views.manage_any": A,
};

/** Actions a pod lead only has for the partners in their scope. */
export const SCOPED_ACTIONS: ReadonlySet<Action> = new Set<Action>(["submissions.read", "submissions.update", "placements.read", "placements.progress"]);

export const ACTION_LABELS: Record<Action, string> = {
  "experts.read": "see experts",
  "experts.create": "add experts",
  "experts.edit": "edit experts",
  "experts.notes": "add notes",
  "experts.cv_upload": "upload CVs",
  "experts.cv_download": "download CVs",
  "experts.delete": "delete experts",
  "experts.export": "export experts",
  "experts.contact": "see contact details",
  "requirements.read": "see requirements",
  "requirements.create": "add requirements",
  "requirements.edit": "edit requirements",
  "requirements.rate_note": "see rate notes",
  "matching.shortlist": "shortlist experts",
  "submissions.read": "see these submissions",
  "submissions.update": "change submissions",
  "roster.export": "export rosters",
  "placements.read": "see these placements",
  "placements.create": "create placements",
  "placements.edit": "edit placements",
  "placements.progress": "update placements",
  "placements.export": "export placements",
  "money.read": "see money",
  "imports.csv": "import spreadsheets",
  "imports.jobs": "run the jobs-site sync",
  "partners.read": "see partners",
  "partners.manage": "add or edit partners",
  "team.manage": "manage team & access",
  "settings.manage": "change settings",
  "views.save": "save views",
  "views.share": "share views",
  "views.manage_any": "change other people's views",
};

export type PermissionCtx = {
  /** The partner the record belongs to (submission's requirement partner, placement partner). */
  partnerId?: string | null;
  /** The signed-in user's partner scope (pod leads). */
  partnerIds?: readonly string[];
};

/**
 * Can this role do this? For a pod lead and a scoped action: when ctx.partnerId is given, it must be
 * in ctx.partnerIds; without a partnerId the answer means "for some partners", and lists are
 * filtered with partnerScope().
 */
export function can(role: Role, action: Action, ctx?: PermissionCtx): boolean {
  if (!isRole(role)) return false;
  const allowed = MATRIX[action];
  if (!allowed || !allowed.includes(role)) return false;
  if (role === "pod_lead" && SCOPED_ACTIONS.has(action) && ctx && ctx.partnerId !== undefined) {
    return Boolean(ctx.partnerId) && (ctx.partnerIds ?? []).includes(ctx.partnerId as string);
  }
  return true;
}

/** The partners whose submissions and placements this user may see: null = all of them. */
export function partnerScope(user: { role: Role; partnerIds: readonly string[] }): string[] | null {
  return user.role === "pod_lead" ? [...user.partnerIds] : null;
}

export class ForbiddenError extends Error {
  readonly status = 403;
  readonly action: Action | "inactive";
  constructor(action: Action | "inactive", message: string) {
    super(message);
    this.name = "ForbiddenError";
    this.action = action;
  }
}

export function isForbidden(e: unknown): e is ForbiddenError {
  return e instanceof ForbiddenError || (typeof e === "object" && e !== null && (e as { name?: string }).name === "ForbiddenError");
}

export function forbiddenMessage(role: Role, action: Action, scoped = false): string {
  if (scoped) return `This belongs to a partner outside your pods, so you can't ${ACTION_LABELS[action]}.`;
  return `${ROLE_LABELS[role] ?? role} access can't ${ACTION_LABELS[action]}. Ask an admin if you need this.`;
}

export type Subject = { email: string; role: Role; partnerIds: readonly string[]; blocked?: boolean };

/** Throws a ForbiddenError (403) unless the user may do this. Every guard ends here. */
export function ensure(user: Subject, action: Action, ctx?: { partnerId?: string | null }): void {
  if (user.blocked) throw new ForbiddenError("inactive", "Your access to Expert Hub is turned off. Ask an admin to turn it back on.");
  if (!can(user.role, action, { ...ctx, partnerIds: user.partnerIds })) {
    const scoped = user.role === "pod_lead" && SCOPED_ACTIONS.has(action) && MATRIX[action].includes("pod_lead");
    throw new ForbiddenError(action, forbiddenMessage(user.role, action, scoped));
  }
}

// ---------- Field visibility ----------

export const canSeeMoney = (role: Role) => can(role, "money.read");
export const canSeeContact = (role: Role) => can(role, "experts.contact");

/** "asha.example@example.com" -> "a•••@example.com". */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return email ?? null;
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

/** "+91 98765 54085" -> "+91 ••••• •4085": the country code and the last 4 digits stay. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return phone ?? null;
  const s = phone.trim();
  let prefix = "";
  let rest = s;
  const cc = s.match(/^\+\d{1,3}(?=[\s-])/);
  if (cc) {
    prefix = cc[0];
    rest = s.slice(prefix.length);
  }
  const total = (rest.match(/\d/g) ?? []).length;
  if (total === 0) return "•••";
  let seen = 0;
  const masked = rest.replace(/\d/g, (d) => {
    seen += 1;
    return seen > total - 4 ? d : "•";
  });
  return prefix + masked;
}

/**
 * The copy of an expert record a role may see: money removed, and without contact rights email and
 * phone masked (LinkedIn stays). Run on the server before anything is rendered or sent.
 */
export function visibleExpert<T extends { email?: string | null; phone?: string | null; rateExpectationUsd?: number | null }>(role: Role, e: T): T {
  const out = { ...e };
  if (!canSeeMoney(role) && "rateExpectationUsd" in out) out.rateExpectationUsd = null;
  if (!canSeeContact(role)) {
    if ("email" in out) out.email = maskEmail(out.email);
    if ("phone" in out) out.phone = maskPhone(out.phone);
  }
  return out;
}

// ---------- Saved views ----------

export function canSeeView(user: { email: string }, view: { ownerEmail: string; shared: boolean }): boolean {
  return view.shared || view.ownerEmail === user.email;
}

export function canManageView(user: { email: string; role: Role }, view: { ownerEmail: string }): boolean {
  return view.ownerEmail === user.email || can(user.role, "views.manage_any");
}
