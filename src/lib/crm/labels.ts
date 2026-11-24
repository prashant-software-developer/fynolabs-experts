// The CRM's fixed lists with the FynoLabs admin's wording (Accounts, Leads, Calendar, Platforms,
// Projects), and the small rules around them: stage order, board lanes, due-date state. Pure.
import { COMPANY_STAGES, CONTACT_STAGES, label } from "@/lib/constants";

export type CompanyStage = (typeof COMPANY_STAGES)[number];
export type ContactStage = (typeof CONTACT_STAGES)[number];

const WORDS: Record<string, string> = {
  // companies
  researching: "Researching",
  researched: "Researched",
  drafted: "Drafted",
  contacted: "Contacted",
  talking: "Talking",
  pilot: "Pilot",
  on_hold: "On hold",
  dropped: "Dropped",
  ai_training: "AI Training",
  product: "Product Studio",
  both: "Both",
  high: "High",
  normal: "Normal",
  low: "Low",
  // company activities
  note: "Note",
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  linkedin: "LinkedIn",
  stage: "Stage change",
  task: "Task",
  // contacts
  replied: "Replied",
  proposal: "Proposal sent",
  won: "Won",
  lost: "Lost",
  website: "Website",
  event: "Event",
  // calendar
  follow_up: "Follow-up",
  deadline: "Deadline",
  post: "Post",
  planned: "Planned",
  waiting: "Waiting",
  done: "Done",
  cancelled: "Cancelled",
  // platforms
  platform: "Platform",
  // projects
  managed: "Managed",
  bench: "Bench",
  internal: "Internal",
  lead: "Lead",
  recruiter: "Recruiter",
  screener: "Screener",
  viewer: "Viewer",
  nda: "NDA",
  agreement: "Agreement",
  compliance: "Compliance",
  // referral outcomes
  sent: "Sent",
  needs_info: "Needs info",
  in_review: "In review",
  signed_up: "Signed up",
  qualified: "Qualified",
  already_member: "Already a member",
  churned: "Churned",
};

/** A CRM value's label. Context matters for a few words ("call" is "Call booked" for a contact). */
export function crmLabel(value: string | null | undefined, ctx?: "contact" | "platform_status" | "calendar"): string {
  if (!value) return "";
  if (ctx === "contact" && value === "call") return "Call booked";
  if (ctx === "contact" && value === "new") return "New";
  if (ctx === "platform_status" && value === "inactive") return "Not working with";
  if (ctx === "calendar" && value === "call") return "Call";
  return WORDS[value] ?? label(value);
}

export const PROJECT_KIND_HINTS: Record<string, string> = {
  referral: "The partner hires and pays a referral fee",
  managed: "We contract the experts and deliver the work",
  agency: "Someone else places them",
  bench: "Our own pool for managed work",
  internal: "Our own hiring",
};

export const PROJECT_ROLE_HINTS: Record<string, string> = {
  lead: "Owns the targets and the partner",
  recruiter: "Finds, adds and works people",
  screener: "Reviews new people",
  viewer: "Sees the project",
};

export const PLATFORM_KINDS = ["platform", "agency", "both"] as const;
export const PLATFORM_STATUSES = ["active", "paused", "inactive"] as const;

// ---------- Company stages ----------

/** Researching → Active: the 7 steps of the stage bar. On hold and Dropped are "parked". */
export const STAGE_STEPS: readonly CompanyStage[] = ["researching", "researched", "drafted", "contacted", "talking", "pilot", "active"];
export const PARKED: readonly CompanyStage[] = ["on_hold", "dropped"];
export const isParked = (stage: string) => (PARKED as readonly string[]).includes(stage);

export type StageGroup = "early" | "talks" | "won" | "parked";
export function stageGroup(stage: string): StageGroup {
  if (stage === "contacted" || stage === "talking") return "talks";
  if (stage === "pilot" || stage === "active") return "won";
  if (isParked(stage)) return "parked";
  return "early";
}

/** The table's order: live conversations first, then the rest of the pipeline, then parked. */
export const STAGE_SORT: readonly CompanyStage[] = ["talking", "pilot", "contacted", "drafted", "researched", "researching", "active", "on_hold", "dropped"];
export const stageRank = (stage: string) => {
  const i = (STAGE_SORT as readonly string[]).indexOf(stage);
  return i < 0 ? STAGE_SORT.length : i;
};

export type Lane = { key: string; label: string; stages: readonly CompanyStage[]; dropTo: CompanyStage };
export const COMPANY_LANES: readonly Lane[] = [
  { key: "not_contacted", label: "Not contacted", stages: ["researching", "researched", "drafted"], dropTo: "drafted" },
  { key: "contacted", label: "Contacted", stages: ["contacted"], dropTo: "contacted" },
  { key: "talking", label: "Talking", stages: ["talking"], dropTo: "talking" },
  { key: "won", label: "Pilot & active", stages: ["pilot", "active"], dropTo: "pilot" },
  { key: "parked", label: "Parked", stages: ["on_hold", "dropped"], dropTo: "on_hold" },
];

export const COMPANY_TABS = ["pipeline", "due", "parked", "all"] as const;
export type CompanyTab = (typeof COMPANY_TABS)[number];
export const COMPANY_TAB_LABELS: Record<CompanyTab, string> = { pipeline: "Pipeline", due: "Due now", parked: "Parked", all: "All" };

// ---------- Contact stages ----------

export const CONTACT_STEPS: readonly ContactStage[] = ["new", "contacted", "replied", "call", "proposal", "won"];
export const CONTACT_OPEN: readonly ContactStage[] = ["new", "contacted", "replied", "call", "proposal"];
export const CONTACT_TABS = ["open", "won", "lost", "all"] as const;
export type ContactTab = (typeof CONTACT_TABS)[number];
export const CONTACT_TAB_LABELS: Record<ContactTab, string> = { open: "Open", won: "Won", lost: "Lost", all: "All" };

// ---------- Due dates ----------

export type DueState = "overdue" | "today" | "soon" | "later";

/**
 * Where a due date stands against today (India time, "YYYY-MM-DD"): none without a date or for a
 * dropped company; overdue before today; today; soon within 3 days; later after that.
 */
export function dueState(due: string | null | undefined, today: string, stage?: string | null): DueState | null {
  if (!due || stage === "dropped") return null;
  if (due < today) return "overdue";
  if (due === today) return "today";
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days <= 3 ? "soon" : "later";
}

export const isDueNow = (due: string | null | undefined, today: string, stage?: string | null) => {
  const s = dueState(due, today, stage);
  return s === "overdue" || s === "today";
};

/** "acme.com" from a website, for logos and duplicate checks. */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const s = url.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** A web address with its scheme, or null. */
export function webUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^(javascript|data|vbscript):/i.test(s)) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
