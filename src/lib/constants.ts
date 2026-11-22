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

export const SOURCES = ["jobs_site", "admin_crm", "register", "partner", "manual"] as const;
export type Source = (typeof SOURCES)[number];

export const PARTNER_KINDS = ["data_partner", "frontier_lab", "expert_platform", "agency", "other"] as const;
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

export const FILE_STORAGE = ["jobs_db", "upload"] as const;

export const DEGREE_LEVELS = ["bachelors", "masters", "phd"] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

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
  data_partner: "AI data partner",
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
