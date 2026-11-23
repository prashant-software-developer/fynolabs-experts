// Every fixed list the app uses, in one place. Database check constraints use the same values.

export const DOMAINS = [
  "Software",
  "Mathematics",
  "Physics",
  "Biology",
  "Chemistry",
  "Medicine",
  "Finance",
  "Law",
  "Languages",
  "Security",
  "Data science",
  "Other",
] as const;
export type Domain = (typeof DOMAINS)[number];

export const EXPERT_STATUSES = [
  "applicant",
  "screening",
  "bench",
  "submitted",
  "placed",
  "inactive",
  "do_not_contact",
] as const;
export type ExpertStatus = (typeof EXPERT_STATUSES)[number];

export const AVAILABILITY = ["available", "limited", "busy", "unavailable"] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const CV_CONSENT = ["unknown", "yes", "no"] as const;
export type CvConsent = (typeof CV_CONSENT)[number];

export const SOURCES = ["jobs_site", "admin_crm", "register", "partner", "manual", "job_form", "portal"] as const;
export type Source = (typeof SOURCES)[number];

/**
 * What kind of company a partner (company) record is. The first five are the hub's own; the rest
 * came with the FynoLabs admin's accounts (23 Nov 2026): partner -> data_partner, marketplace ->
 * expert_platform, the others as they are.
 */
export const PARTNER_KINDS = ["data_partner", "frontier_lab", "expert_platform", "agency", "staffing", "talent_source", "trainer_gig", "client", "other"] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export const REQUIREMENT_STATUSES = ["open", "filling", "filled", "closed"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const SUBMISSION_STATUSES = [
  "shortlisted",
  "consent_requested",
  "submitted",
  "partner_review",
  "approved",
  "rejected",
  "active",
  "ended",
  "withdrawn",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const PLACEMENT_STATUSES = ["active", "paused", "ended"] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

export const PLACEMENT_BASIS = ["hourly", "per_task"] as const;
export type PlacementBasis = (typeof PLACEMENT_BASIS)[number];

/** jobs_db: bytes on the old jobs site; upload: bytes in hub.expert_files; fynolabs: bytes in fynolabs_copy.storage_objects. */
export const FILE_STORAGE = ["jobs_db", "upload", "fynolabs"] as const;

export const DEGREE_LEVELS = ["bachelors", "masters", "phd"] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

export const JOB_STATUSES = ["draft", "open", "paused", "closed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_VISIBILITY = ["public", "unlisted", "internal"] as const;
export type JobVisibility = (typeof JOB_VISIBILITY)[number];

export const EMPLOYMENT_TYPES = ["contract", "part_time", "full_time", "freelance"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const APPLICATION_STATUSES = ["new", "reviewing", "shortlisted", "submitted_to_partner", "rejected", "hired", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * The pipeline: one per person per job, the same stages as the FynoLabs admin (job_applications.status),
 * for every application (public job forms, the Engine copy and the FynoLabs sync alike).
 */
export const PIPELINE_STAGES = ["new", "shortlisted", "referred", "selected", "documents", "signed", "active", "ended", "rejected"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  new: "Applied",
  shortlisted: "Shortlisted",
  referred: "Proposed to client",
  selected: "Selected",
  documents: "Documents sent",
  signed: "Signed",
  active: "Active",
  ended: "Ended",
  rejected: "Rejected",
};

/** The application status that goes with a stage (the database trigger keeps the two in step). */
export function statusForStage(stage: PipelineStage): ApplicationStatus {
  switch (stage) {
    case "new":
      return "new";
    case "shortlisted":
      return "shortlisted";
    case "referred":
      return "submitted_to_partner";
    case "rejected":
      return "rejected";
    default:
      return "hired";
  }
}

/** The stage that goes with an application status (reviewing is still Applied; withdrawn is Rejected). */
export function stageForStatus(status: ApplicationStatus): PipelineStage {
  switch (status) {
    case "shortlisted":
      return "shortlisted";
    case "submitted_to_partner":
      return "referred";
    case "hired":
      return "selected";
    case "rejected":
    case "withdrawn":
      return "rejected";
    default:
      return "new";
  }
}

export const REJECT_REASONS = ["not_eligible", "skills", "experience", "location", "availability", "rate", "no_response", "not_interested", "withdrew", "client_rejected", "already_on_platform", "duplicate", "other"] as const;

/** Companies (hub.partners), contacts and the rest of the FynoLabs admin's lists, as FynoLabs has them. */
export const COMPANY_STAGES = ["researching", "researched", "drafted", "contacted", "talking", "pilot", "active", "on_hold", "dropped"] as const;
export const COMPANY_PRIORITIES = ["high", "normal", "low"] as const;
export const BUSINESS_LINES = ["ai_training", "product", "both"] as const;
export const COMPANY_ACTIVITY_KINDS = ["note", "email", "call", "meeting", "linkedin", "stage", "task"] as const;
export const CONTACT_KINDS = ["client", "partner", "talent"] as const;
export const CONTACT_STAGES = ["new", "contacted", "replied", "call", "proposal", "won", "lost"] as const;
export const CONTACT_SOURCES = ["linkedin", "referral", "website", "email", "event", "other"] as const;
export const CALENDAR_KINDS = ["call", "meeting", "follow_up", "deadline", "task", "post"] as const;
export const CALENDAR_STATUSES = ["planned", "waiting", "done", "cancelled"] as const;
/** Calendar times are India time, as in the FynoLabs admin. */
export const CALENDAR_TIMEZONE = "Asia/Kolkata";
export const EXPERT_ACTIVITY_KINDS = ["note", "email", "stage", "application", "document", "referral", "history", "outreach", "consent", "system"] as const;
export const DOCUMENT_KINDS = ["nda", "agreement", "compliance", "other"] as const;
export const DOCUMENT_STATUSES = ["draft", "sent", "signed", "void"] as const;
export const OUTREACH_STATUSES = ["not_contacted", "contacted", "replied", "interested", "not_interested", "no_response", "applied", "unreachable"] as const;
export const SENIORITY = ["junior", "mid", "senior", "lead", "executive"] as const;
/** How a person first reached FynoLabs (talent_profiles.source), kept on the expert as source_channel. */
export const SOURCE_CHANNELS = ["talent_call", "job", "manual", "referral", "sourced", "import", "agency", "partner"] as const;
/** How an application came in (job_applications.source). */
export const APPLICATION_CHANNELS = ["applied", "sourced", "import", "referral", "agency", "partner", "manual"] as const;
export const PROJECT_KINDS = ["referral", "managed", "agency", "bench", "internal"] as const;
export const PROJECT_STATUSES = ["planned", "active", "paused", "closed"] as const;
export const PROJECT_ROLES = ["lead", "recruiter", "screener", "viewer"] as const;
export const DOCUMENT_STAGES = ["referred", "selected", "documents", "signed", "active"] as const;
export const REFERRAL_METHODS = ["email", "link", "agency_form", "profile_share", "intro", "other"] as const;
export const REFERRAL_OUTCOMES = ["sent", "needs_info", "in_review", "signed_up", "qualified", "active", "rejected", "already_member", "churned"] as const;
export const FEE_STATUSES = ["expected", "invoiced", "paid", "void"] as const;
export const LINK_CHANNELS = ["linkedin", "x", "instagram", "threads", "reddit", "youtube", "whatsapp", "discord", "email", "website", "partner", "other"] as const;
export const CAMPAIGN_STATUSES = ["draft", "approved", "sending", "done", "cancelled"] as const;
export const RECIPIENT_STATUSES = ["pending", "sent", "followed_up", "skipped", "failed", "stopped"] as const;
export const TEMPLATE_KINDS = ["outreach", "follow_up", "invite", "referral", "rejection", "documents", "onboarding", "update", "other"] as const;
export const VISIT_SOURCES = ["linkedin", "direct", "google", "other"] as const;

/** What an expert sees for their own application (internal wording stays internal). */
export const APPLICATION_STATUS_FOR_EXPERT: Record<ApplicationStatus, string> = {
  new: "Received",
  reviewing: "In review",
  shortlisted: "Shortlisted",
  submitted_to_partner: "Profile shared for the role",
  rejected: "Not selected this time",
  hired: "Selected",
  withdrawn: "Withdrawn",
};

/** The public company label a job gets unless the team types another one. Never a client's name. */
export const DEFAULT_COMPANY_LABEL = "AI data partner (via FynoLabs)";

const LABELS: Record<string, string> = {
  applicant: "Applicant",
  screening: "Screening",
  bench: "Bench",
  submitted: "Submitted",
  placed: "Placed",
  inactive: "Inactive",
  do_not_contact: "Do not contact",
  available: "Available",
  limited: "Limited",
  busy: "Busy",
  unavailable: "Unavailable",
  unknown: "Unknown",
  yes: "Yes",
  no: "No",
  jobs_site: "Jobs site",
  admin_crm: "Admin CRM",
  register: "Talent register",
  partner: "Partner",
  manual: "Manual",
  job_form: "Job form",
  portal: "Expert portal",
  draft: "Draft",
  public: "Public",
  unlisted: "Unlisted",
  internal: "Internal",
  contract: "Contract",
  part_time: "Part-time",
  full_time: "Full-time",
  freelance: "Freelance",
  new: "New",
  reviewing: "Reviewing",
  submitted_to_partner: "Submitted to partner",
  hired: "Hired",
  data_partner: "AI data partner",
  staffing: "Staffing firm",
  talent_source: "Talent source",
  trainer_gig: "Trainer gig",
  client: "Client",
  referred: "Proposed to client",
  selected: "Selected",
  documents: "Documents sent",
  signed: "Signed",
  fynolabs: "FynoLabs admin",
  frontier_lab: "Frontier lab",
  expert_platform: "Expert platform",
  agency: "Agency",
  other: "Other",
  open: "Open",
  filling: "Filling",
  filled: "Filled",
  closed: "Closed",
  shortlisted: "Shortlisted",
  consent_requested: "Consent requested",
  partner_review: "Partner review",
  approved: "Approved",
  rejected: "Rejected",
  active: "Active",
  ended: "Ended",
  withdrawn: "Withdrawn",
  paused: "Paused",
  hourly: "Hourly",
  per_task: "Per task",
  bachelors: "Bachelor's",
  masters: "Master's",
  phd: "PhD",
};

/** Human label for any enum value above ("do_not_contact" -> "Do not contact"). */
export function label(value: string | null | undefined): string {
  if (!value) return "";
  return LABELS[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Submission statuses that mean the partner has (or will) see the expert's details. */
export const SENT_TO_PARTNER: readonly SubmissionStatus[] = ["submitted", "partner_review", "approved", "active"];

/** Submission statuses that count as a filled slot. */
export const FILLS_SLOT: readonly SubmissionStatus[] = ["approved", "active"];

/** Submission statuses still in play (shown in the roster export). */
export const OPEN_SUBMISSION: readonly SubmissionStatus[] = [
  "shortlisted",
  "consent_requested",
  "submitted",
  "partner_review",
  "approved",
  "active",
];

export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}
