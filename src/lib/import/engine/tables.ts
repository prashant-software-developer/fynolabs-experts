// Which Engine tables are copied into the replica schema `engine_copy`, and what is left out.
// Everything else in Engine (neon_auth.*, xdl_jobs_bundle*, xdl_jobs_settings, admin invites,
// xdl_crm_* and the non-expert tables) is never read.

export const REPLICA_SCHEMA = "engine_copy";
export const SOURCE_SCHEMA = "public";
export const SOURCE_PREFIX = "xdl_jobs_";

/** Login secrets on xdl_jobs_users: never copied (passwords, lockouts, one-time codes and their timers). */
export const LOGIN_SECRETS = [
  "password_hash",
  "pw_version",
  "failed_logins",
  "locked_until",
  "otp_sent_at",
  "reset_sent_at",
  "phone_code_hash",
  "phone_code_exp",
  "phone_code_tries",
  "phone_sends_day",
  "phone_sends_count",
  "phone_sent_at",
] as const;

export type EngineTable = {
  /** Name in engine_copy (the source is public.xdl_jobs_<name>). */
  name: string;
  /** Must exist in Engine (the copy stops otherwise). The others are copied when present. */
  required: boolean;
  /** Source columns never copied. */
  exclude: readonly string[];
  /** Columns added in the replica only. */
  extra: readonly { name: string; type: string }[];
  /** Key when the source table has no primary key. */
  naturalKey?: readonly string[];
  /** Columns holding a jobs-site user id / application id: rows of people deleted on request are left out. */
  userCols: readonly string[];
  appCols: readonly string[];
};

const t = (name: string, o: Partial<EngineTable> = {}): EngineTable => ({ name, required: false, exclude: [], extra: [], userCols: [], appCols: [], ...o });

/** In copy order (users first: the deleted-on-request filter needs them). */
export const ENGINE_TABLES: readonly EngineTable[] = [
  t("users", { required: true, exclude: LOGIN_SECRETS, userCols: ["id"] }),
  t("jobs", { required: true }),
  t("applications", { required: true, userCols: ["user_id"], appCols: ["id"] }),
  t("screenings", { required: true, naturalKey: ["application_id", "stage"], appCols: ["application_id"] }),
  // The bytes are stored once, in hub.expert_files; the replica keeps everything else plus that file's hub id.
  t("files", { required: true, exclude: ["data"], extra: [{ name: "hub_file_id", type: "uuid" }], userCols: ["user_id"] }),
  t("saved", { naturalKey: ["user_id", "job_id"], userCols: ["user_id"] }),
  t("interviews", { appCols: ["application_id"] }),
  t("assessments"),
  t("assessment_attempts", { appCols: ["application_id"] }),
  t("notifications", { userCols: ["user_id"] }),
  t("projects"),
  t("project_members", { naturalKey: ["project_id", "user_id"], userCols: ["user_id"] }),
  t("timesheets", { userCols: ["user_id"] }),
  t("earnings", { userCols: ["user_id"] }),
  t("payouts", { userCols: ["user_id"] }),
  t("commissions", { userCols: ["referrer_id", "referred_id"] }),
];

export const sourceTable = (name: string) => `${SOURCE_PREFIX}${name}`;
