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
  recruiter: "Experts, requirements, jobs and applicants, matching and submissions. No money.",
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
  | "jobs.read"
  | "jobs.manage"
  | "jobs.rate_note"
  | "applications.read"
  | "applications.manage"
  | "applications.export"
  | "views.save"
  | "views.share"
  | "views.manage_any"
  // Talent and outreach screens (Phase 3b): campaigns, referrals, groups, fees, job radar.
  | "campaigns.manage"
  | "campaigns.approve"
  | "referrals.manage"
  | "groups.manage"
  | "groups.delete"
  | "fees.manage"
  | "radar.manage"
  // CRM and operations (Phase 3b): companies, contacts, calendar, platforms, projects, messages, analytics.
  | "crm.read"
  | "crm.edit"
  | "crm.delete"
  | "platforms.manage"
  | "projects.manage"
  | "projects.fees"
  | "messages.read"
  | "messages.manage"
  | "analytics.read";

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
  "jobs.read": ALL,
  "jobs.manage": AR, // create, edit, build the form, publish, invite
  "jobs.rate_note": AF, // a job's internal rate note is money
  "applications.read": ALL, // contact details masked for viewers
  "applications.manage": AR, // status, notes, bulk status
  "applications.export": AR,
  "views.save": ALL, // personal saved views are a preference, not a record change
  "views.share": ["admin", "recruiter", "pod_lead", "finance"],
  "views.manage_any": A,
  // Reading these screens needs no extra right (experts.read / jobs.read; fees need money.read).
  "campaigns.manage": AR, // templates, prepare a campaign, cancel it
  "campaigns.approve": AR, // approve a prepared draft (as in the FynoLabs admin: whoever may send)
  "referrals.manage": AR, // record referrals, change outcomes
  "groups.manage": AR, // create, rename, add and remove members
  "groups.delete": A,
  "fees.manage": AF, // mark fees invoiced / paid / void, fee rules
  "radar.manage": AR, // approve, discard, restore; publishing also needs jobs.manage
  // CRM and operations (Phase 3b). Contact details stay masked for viewers; fee rules are money.
  "crm.read": ALL, // companies, contacts, calendar, my work
  "crm.edit": AR, // add and edit companies and contacts, change stages, log activity, calendar events
  "crm.delete": A, // delete companies, contacts, events, platforms, projects, messages
  "platforms.manage": AR,
  "projects.manage": AR, // projects, tracks, team, required documents
  "projects.fees": AF, // a project's fee rules (money)
  "messages.read": ALL, // sender email masked for viewers
  "messages.manage": AR, // mark handled, reply drafts, replies
  "analytics.read": ALL,
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
  "jobs.read": "see jobs",
  "jobs.manage": "create or change jobs",
  "jobs.rate_note": "see rate notes",
  "applications.read": "see applications",
  "applications.manage": "change applications",
  "applications.export": "export applicants",
  "views.save": "save views",
  "views.share": "share views",
  "views.manage_any": "change other people's views",
  "campaigns.manage": "prepare emails to experts",
  "campaigns.approve": "approve emails to experts",
  "referrals.manage": "record referrals",
  "groups.manage": "change groups",
  "groups.delete": "delete groups",
  "fees.manage": "change fees",
  "radar.manage": "change job radar roles",
  "crm.read": "see accounts and contacts",
  "crm.edit": "change accounts, contacts or the calendar",
  "crm.delete": "delete records",
  "platforms.manage": "add or edit platforms",
  "projects.manage": "add or edit projects",
  "projects.fees": "change fee rules",
  "messages.read": "see messages",
  "messages.manage": "handle or answer messages",
  "analytics.read": "see analytics",
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

// ---------- Money columns (every table) ----------

/**
 * Columns that are money: only roles with money.read (admins and finance) ever get them. "*" means
 * the whole table is money (none of its rows go to other roles). The FynoLabs tables brought pay,
 * fees, commissions and earnings (23 Nov 2026); they are listed here so every screen uses one rule.
 */
export const MONEY_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  experts: ["rateExpectationUsd", "rate_expectation_usd"],
  applications: ["rateExpectationUsd", "rate_expectation_usd"],
  requirements: ["rateNote", "rate_note"],
  jobs: ["internalRateNote", "internal_rate_note", "payUnit", "pay_unit"],
  placements: ["rateToExpert", "rate_to_expert", "rateFromPartner", "rate_from_partner", "earnedByExpert", "earned_by_expert", "revenue"],
  engagements: ["commissionPercent", "commission_percent"],
  radar_listings: ["payMin", "pay_min", "payMax", "pay_max", "payPeriod", "pay_period"],
  expert_payout: ["*"],
  project_fee_rules: ["*"],
  referral_fees: ["*"],
  monthly_earnings: ["*"],
};

export const isMoneyTable = (table: string) => MONEY_COLUMNS[table]?.includes("*") ?? false;

/** The row as a role may see it: money columns set to null (or no row at all for a money-only table). */
export function withoutMoney<T extends Record<string, unknown>>(role: Role, table: string, row: T): T | null {
  if (canSeeMoney(role)) return row;
  const cols = MONEY_COLUMNS[table] ?? [];
  if (cols.includes("*")) return null;
  const out: Record<string, unknown> = { ...row };
  for (const c of cols) if (c in out) out[c] = null;
  return out as T;
}

/** Many rows: money-only tables give an empty list to roles without money rights. */
export function rowsWithoutMoney<T extends Record<string, unknown>>(role: Role, table: string, rows: T[]): T[] {
  return rows.map((r) => withoutMoney(role, table, r)).filter((r): r is T => r !== null);
}

// ---------- Files ----------

/** Tax forms (copied from the old jobs site) are money: admins and finance. CVs and attachments: CV download rights. */
export function fileDownloadAction(kind: string): Action {
  return kind === "tax" ? "money.read" : "experts.cv_download";
}

/** The files a role may even see listed (tax forms only for money roles). */
export function visibleFiles<T extends { kind: string }>(role: Role, files: T[]): T[] {
  return canSeeMoney(role) ? files : files.filter((f) => f.kind !== "tax");
}

// ---------- Saved views ----------

export function canSeeView(user: { email: string }, view: { ownerEmail: string; shared: boolean }): boolean {
  return view.shared || view.ownerEmail === user.email;
}

export function canManageView(user: { email: string; role: Role }, view: { ownerEmail: string }): boolean {
  return view.ownerEmail === user.email || can(user.role, "views.manage_any");
}
