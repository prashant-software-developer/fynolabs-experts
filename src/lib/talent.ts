// The talent and outreach screens' fixed lists, their FynoLabs wording, and the small rules behind
// them (stage changes, who may be emailed or referred, fee states, merge fields). Pure functions,
// tested in tests/talent-rules.test.ts. Values match the database checks in src/lib/constants.ts.
import {
  CAMPAIGN_STATUSES,
  DOCUMENT_KINDS,
  DOCUMENT_STATUSES,
  FEE_STATUSES,
  OUTREACH_STATUSES,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  RECIPIENT_STATUSES,
  REFERRAL_METHODS,
  REFERRAL_OUTCOMES,
  REJECT_REASONS,
  TEMPLATE_KINDS,
  type ExpertStatus,
  type PipelineStage,
} from "@/lib/constants";

export type Tone = "neutral" | "muted" | "info" | "progress" | "success" | "warning" | "danger" | "outline";

// ---------------------------------------------------------------- pipelines

/** The line a pipeline moves along (Rejected sits outside it), as the FynoLabs stage bar. */
export const PIPELINE_LINE: readonly PipelineStage[] = PIPELINE_STAGES.filter((s) => s !== "rejected");

export const stageLabel = (s: string | null | undefined): string => (s ? (PIPELINE_STAGE_LABELS[s as PipelineStage] ?? s) : "");

export const STAGE_TONE: Record<PipelineStage, Tone> = {
  new: "neutral",
  shortlisted: "info",
  referred: "progress",
  selected: "warning",
  documents: "warning",
  signed: "warning",
  active: "success",
  ended: "muted",
  rejected: "danger",
};

/** FynoLabs' board lanes (the experts board groups stages like this when "lanes" is picked). */
export const STAGE_LANES: { id: string; label: string; stages: PipelineStage[] }[] = [
  { id: "reviewing", label: "Reviewing", stages: ["new", "shortlisted", "referred"] },
  { id: "onboarding", label: "Onboarding", stages: ["selected", "documents", "signed"] },
  { id: "active", label: "Active", stages: ["active"] },
  { id: "closed", label: "Ended or rejected", stages: ["ended", "rejected"] },
];

export const REJECT_REASON_LABELS: Record<(typeof REJECT_REASONS)[number], string> = {
  not_eligible: "Doesn't meet the rules",
  skills: "Skills",
  experience: "Experience",
  location: "Location",
  availability: "Availability",
  rate: "Rate",
  no_response: "No response",
  not_interested: "Not interested",
  withdrew: "Withdrew",
  client_rejected: "Client said no",
  already_on_platform: "Already on the platform",
  duplicate: "Duplicate",
  other: "Other",
};

export const OUTREACH_LABELS: Record<(typeof OUTREACH_STATUSES)[number], string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  replied: "Replied",
  interested: "Interested",
  not_interested: "Not interested",
  no_response: "No response",
  applied: "Applied",
  unreachable: "Unreachable",
};

/** How a person first reached FynoLabs (experts.source_channel): "Came from". */
export const SOURCE_CHANNEL_LABELS: Record<string, string> = {
  talent_call: "Talent form",
  job: "Job application",
  manual: "Added by us",
  referral: "Referral",
  sourced: "Sourced by us",
  import: "Imported",
  agency: "From an agency",
  partner: "From a partner",
};

/** How a pipeline came in (applications.channel). */
export const APPLICATION_CHANNEL_LABELS: Record<string, string> = {
  applied: "Applied",
  sourced: "Sourced by us",
  import: "Imported",
  referral: "Referred by an expert",
  agency: "From an agency",
  partner: "From a partner",
  manual: "Added by us",
};

export const TIMELINE_KIND_LABELS: Record<string, string> = {
  note: "Note",
  email: "Email",
  stage: "Stage",
  application: "Application",
  document: "Document",
  referral: "Referral",
  history: "History",
  outreach: "Outreach",
  consent: "Consent",
  system: "System",
};

export const DOCUMENT_KIND_LABELS: Record<(typeof DOCUMENT_KINDS)[number], string> = { nda: "NDA", agreement: "Agreement", compliance: "Compliance", other: "Other" };
export const DOCUMENT_STATUS_LABELS: Record<(typeof DOCUMENT_STATUSES)[number], string> = { draft: "Not sent", sent: "Sent for signing", signed: "Signed", void: "Withdrawn" };
export const DOCUMENT_STATUS_TONE: Record<string, Tone> = { draft: "muted", sent: "warning", signed: "success", void: "muted" };

export type StageChangeInput = { from: PipelineStage; to: PipelineStage; rejectReason?: string | null; startedOn?: string | null; endedOn?: string | null; today: string };
export type StageChange =
  | { ok: true; patch: { stage: PipelineStage; rejectReason: string | null; startedOn?: string; endedOn?: string }; summary: string }
  | { ok: false; reason: string };

/**
 * What a stage change writes. Rejected needs a reason (FynoLabs' list); leaving Rejected clears it.
 * Active sets the contract start to today when empty; Ended sets the end to today (not before the
 * start) when empty. The summary is the timeline line ("<job>: <stage>", plus the reason).
 */
export function planStageChange(job: string, i: StageChangeInput): StageChange {
  if (!(PIPELINE_STAGES as readonly string[]).includes(i.to)) return { ok: false, reason: "Pick a stage." };
  const reason = i.rejectReason && (REJECT_REASONS as readonly string[]).includes(i.rejectReason) ? i.rejectReason : null;
  if (i.to === "rejected" && !reason) return { ok: false, reason: "Pick why they were rejected." };
  const patch: { stage: PipelineStage; rejectReason: string | null; startedOn?: string; endedOn?: string } = { stage: i.to, rejectReason: i.to === "rejected" ? reason : null };
  if (i.to === "active" && !i.startedOn) patch.startedOn = i.today;
  if (i.to === "ended" && !i.endedOn) {
    const start = i.startedOn ?? patch.startedOn ?? null;
    patch.endedOn = start && start > i.today ? start : i.today;
  }
  const title = job || "Job";
  const why = i.to === "rejected" && reason ? ` (${REJECT_REASON_LABELS[reason as keyof typeof REJECT_REASON_LABELS].toLowerCase()})` : "";
  return { ok: true, patch, summary: `${title}: ${stageLabel(i.to)}${why}` };
}

/**
 * The expert's status follows their pipelines (FynoLabs: "Expert status follows their jobs"), in the
 * hub's words: any pipeline Active -> placed; an applicant or a placed expert with none active ->
 * bench once a pipeline is past Applied (not rejected). Do not contact and inactive never change.
 */
export function expertStatusFromPipelines(current: ExpertStatus, stages: readonly string[]): ExpertStatus {
  if (current === "do_not_contact" || current === "inactive") return current;
  if (stages.includes("active")) return "placed";
  const moved = stages.some((s) => s !== "new" && s !== "rejected" && s !== "ended");
  if (current === "placed") return "bench";
  if ((current === "applicant" || current === "screening") && moved) return "bench";
  return current;
}

/** The most advanced pipeline still open; if none are open, the most advanced of all. */
export function leadingStage(stages: readonly string[]): PipelineStage | null {
  const rank = (s: string) => PIPELINE_LINE.indexOf(s as PipelineStage);
  const open = stages.filter((s) => s !== "ended" && s !== "rejected");
  const pick = (list: readonly string[]) => [...list].sort((a, b) => rank(b) - rank(a))[0];
  if (open.length) return pick(open) as PipelineStage;
  if (stages.includes("ended")) return "ended";
  return stages.length ? "rejected" : null;
}

// ---------------------------------------------------------------- campaigns

export const CAMPAIGN_STATUS_LABELS: Record<(typeof CAMPAIGN_STATUSES)[number], string> = { draft: "Draft", approved: "Approved", sending: "Sending", done: "Done", cancelled: "Cancelled" };
export const CAMPAIGN_STATUS_TONE: Record<string, Tone> = { draft: "muted", approved: "info", sending: "progress", done: "success", cancelled: "muted" };
export const RECIPIENT_STATUS_LABELS: Record<(typeof RECIPIENT_STATUSES)[number], string> = { pending: "To send", sent: "Sent", followed_up: "Followed up", skipped: "Skipped", failed: "Failed", stopped: "Stopped" };
export const RECIPIENT_STATUS_TONE: Record<string, Tone> = { pending: "info", sent: "success", followed_up: "success", skipped: "muted", failed: "danger", stopped: "muted" };
export const TEMPLATE_KIND_LABELS: Record<(typeof TEMPLATE_KINDS)[number], string> = {
  outreach: "Outreach",
  follow_up: "Follow-up",
  invite: "Invite",
  referral: "Referral",
  rejection: "Rejection",
  documents: "Documents",
  onboarding: "Onboarding",
  update: "Update",
  other: "Other",
};
export const CAMPAIGN_KINDS = ["outreach", "update"] as const;

export const MERGE_FIELDS = ["first_name", "name", "job_title", "project", "invite_link", "referral_link"] as const;
export type MergeValues = Partial<Record<(typeof MERGE_FIELDS)[number], string>>;

/** The preview's sample values (as the FynoLabs campaign sheet shows them). */
export const SAMPLE_MERGE: MergeValues = { first_name: "Alex", name: "Alex Rivera", job_title: "the role", project: "the project", invite_link: "https://fynolabs.si/…", referral_link: "https://…" };

/** {{first_name}} and friends; unknown fields become empty, as when the email is sent. */
export function renderMerge(text: string, values: MergeValues): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k: string) => (values as Record<string, string | undefined>)[k] ?? "");
}

export type RecipientCheck = { email: string | null; status: string; emailOptOut: boolean };

/**
 * Why someone can't get a bulk email, or null when they can. The first reason that applies wins:
 * no email, do not contact (on the record, or an address a do-not-contact record also uses),
 * unsubscribed (bulk-email opt-out), suppressed (bounced, complained or unsubscribed at the sender).
 */
export function recipientBlock(e: RecipientCheck, blocked: { suppressed: ReadonlyMap<string, string>; dncEmails: ReadonlySet<string> }): string | null {
  const email = (e.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return "no email";
  if (e.status === "do_not_contact" || blocked.dncEmails.has(email)) return "do not contact";
  if (e.emailOptOut) return "unsubscribed";
  const s = blocked.suppressed.get(email);
  if (s) return `suppressed (${s})`;
  return null;
}

/** "Skipped: 3 no email, 1 do not contact." */
export function skipSummary(reasons: readonly (string | null)[]): string | null {
  const n = new Map<string, number>();
  for (const r of reasons) if (r) n.set(r.replace(/ \(.*\)$/, ""), (n.get(r.replace(/ \(.*\)$/, "")) ?? 0) + 1);
  if (!n.size) return null;
  return `Skipped: ${[...n.entries()].map(([k, v]) => `${v} ${k}`).join(", ")}.`;
}

// ---------------------------------------------------------------- referrals

export const REFERRAL_METHOD_LABELS: Record<(typeof REFERRAL_METHODS)[number], string> = {
  email: "Referral email",
  link: "Sign-up link",
  agency_form: "Their recruitment form",
  profile_share: "Profile shared",
  intro: "Introduction",
  other: "Other",
};
export const REFERRAL_OUTCOME_LABELS: Record<(typeof REFERRAL_OUTCOMES)[number], string> = {
  sent: "Sent",
  needs_info: "Needs more information",
  in_review: "In review",
  signed_up: "Signed up",
  qualified: "Qualified",
  active: "Working",
  rejected: "Not a fit",
  already_member: "Already a member",
  churned: "Stopped working",
};
export const REFERRAL_OUTCOME_TONE: Record<string, Tone> = { sent: "muted", needs_info: "warning", in_review: "info", signed_up: "progress", qualified: "progress", active: "success", rejected: "danger", already_member: "muted", churned: "muted" };

/** Profile shares and introductions pass someone's details on: they need consent on record first. */
export const needsConsent = (method: string) => method === "profile_share" || method === "intro";
/** Methods that send the person a link: the link is required. */
export const needsLink = (method: string) => method === "email" || method === "link";

/** The timeline line of a referral, by method (as the FynoLabs database writes it). */
export function referralSummary(method: string, platform: string): string {
  switch (method) {
    case "email":
      return `Referral sent: ${platform}`;
    case "link":
      return `Referral link sent: ${platform}`;
    case "agency_form":
      return `Submitted to ${platform} through their form`;
    case "profile_share":
      return `Profile shared with ${platform}`;
    case "intro":
      return `Introduced to ${platform}`;
    default:
      return `Submitted to ${platform}`;
  }
}

export const outcomeSummary = (platform: string, outcome: string) => `${platform}: ${(REFERRAL_OUTCOME_LABELS[outcome as keyof typeof REFERRAL_OUTCOME_LABELS] ?? outcome).toLowerCase()}`;

/**
 * Where an outcome moves the linked pipeline (never backwards): working -> Active, stopped -> Ended,
 * not a fit -> Rejected (client said no), already a member -> Rejected (already on the platform),
 * anything else -> at least Proposed to client. null = leave it.
 */
export function pipelineForOutcome(outcome: string, current: PipelineStage): { stage: PipelineStage; rejectReason?: string } | null {
  const rank = (s: PipelineStage) => PIPELINE_LINE.indexOf(s);
  if (outcome === "active") return current === "active" ? null : { stage: "active" };
  if (outcome === "churned") return current === "ended" ? null : { stage: "ended" };
  if (outcome === "rejected") return current === "rejected" ? null : { stage: "rejected", rejectReason: "client_rejected" };
  if (outcome === "already_member") return current === "rejected" ? null : { stage: "rejected", rejectReason: "already_on_platform" };
  if (outcome === "sent") return null;
  if (current === "rejected" || current === "ended") return null;
  return rank(current) < rank("referred") ? { stage: "referred" } : null;
}

// ---------------------------------------------------------------- fees

export const FEE_STATUS_LABELS: Record<(typeof FEE_STATUSES)[number], string> = { expected: "Expected", invoiced: "Invoiced", paid: "Paid", void: "Void" };
export const FEE_STATUS_TONE: Record<string, Tone> = { expected: "info", invoiced: "warning", paid: "success", void: "muted" };

/** Allowed moves: expected -> invoiced / paid / void; invoiced -> paid / void; paid and void are final. */
export function feeMoveAllowed(from: string, to: string): boolean {
  if (from === "expected") return to === "invoiced" || to === "paid" || to === "void";
  if (from === "invoiced") return to === "paid" || to === "void";
  return false;
}

/** Today in India (UTC+5:30), as YYYY-MM-DD. */
export function todayIndia(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export const isOverdue = (f: { status: string; dueOn: string | null }, today: string) => f.status === "invoiced" && Boolean(f.dueOn) && (f.dueOn as string) < today;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "USD 1,200 · INR 40,000" (per currency, never mixed). */
export function moneyByCurrency(totals: ReadonlyMap<string, number> | Record<string, number>): string {
  const entries = totals instanceof Map ? [...totals.entries()] : Object.entries(totals);
  const shown = entries.filter(([, v]) => v);
  if (!shown.length) return "–";
  return shown.map(([c, v]) => `${c} ${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`).join(" · ");
}

// ---------------------------------------------------------------- job radar

export const RADAR_STATUSES = ["new", "approved", "discarded"] as const;
export const RADAR_STATUS_LABELS: Record<string, string> = { new: "New", approved: "Approved", discarded: "Discarded", published: "Published" };

/** Posted-job badges (FynoLabs AdminPostedJob). */
export const JOB_BADGES = ["Actively hiring", "Urgently hiring", "Few spots left", "New role"] as const;

/**
 * A radar role's link with the platform's referral query added (same site only); null when the
 * referral link carries its code in the path, or the hosts differ.
 */
export function withReferral(jobUrl: string, referralUrl: string | null | undefined): string | null {
  if (!referralUrl) return null;
  try {
    const job = new URL(jobUrl);
    const ref = new URL(referralUrl);
    const host = (h: string) => h.replace(/^www\./, "");
    if (host(job.hostname) !== host(ref.hostname) && !host(job.hostname).endsWith(`.${host(ref.hostname)}`) && !host(ref.hostname).endsWith(`.${host(job.hostname)}`)) return null;
    if (![...ref.searchParams.keys()].length) return null;
    for (const [k, v] of ref.searchParams) job.searchParams.set(k, v);
    return job.toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- inbound applications

/** An application still waiting for the team: not handled and still at Applied. */
export const isOpenInbound = (a: { handledAt: Date | string | null; stage: string }) => !a.handledAt && a.stage === "new";

// ---------------------------------------------------------------- small helpers

export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

export function isEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

/** Emails from pasted text (commas, spaces, new lines, "Name <email>"), lower case, unique. */
export function emailsFrom(text: string): string[] {
  const found = (text.match(/[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/g) ?? []).map((e) => e.toLowerCase());
  return [...new Set(found.filter(isEmail))];
}
