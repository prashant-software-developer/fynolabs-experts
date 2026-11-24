// Pipelines: one hub.applications row per person per job, with the FynoLabs admin's stages. Every
// change sets updated / created by, writes the expert's timeline (hub.expert_activities) and the
// audit log; the database trigger keeps applications.status in step with the stage.
import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { applications, experts, jobs, projects, projectTracks, teamMembers } from "@/db/schema";
import { EXPERT_STATUSES, PIPELINE_STAGES, isOneOf, type ExpertStatus, type PipelineStage } from "@/lib/constants";
import { cleanText, isoDate } from "@/lib/normalize";
import { expertStatusFromPipelines, planStageChange, stageLabel, todayIndia } from "@/lib/talent";
import { actorEmail, logActivity, type Actor } from "./activity";
import { addTimeline } from "./applications";
import { isUuid } from "./experts";

export const pipelineColumns = {
  id: applications.id,
  expertId: applications.expertId,
  jobId: applications.jobId,
  stage: applications.stage,
  status: applications.status,
  stageChangedAt: applications.stageChangedAt,
  startedOn: applications.startedOn,
  endedOn: applications.endedOn,
  ownerTeamMemberId: applications.ownerTeamMemberId,
  ownerName: applications.ownerName,
  trackId: applications.trackId,
  channel: applications.channel,
  nextAction: applications.nextAction,
  nextActionDue: applications.nextActionDue,
  rejectReason: applications.rejectReason,
  consentAt: applications.consentAt,
  consentVersion: applications.consentVersion,
  handledAt: applications.handledAt,
  createdAt: applications.createdAt,
  createdBy: applications.createdBy,
  jobTitle: jobs.title,
  jobStatus: jobs.status,
  jobVisibility: jobs.visibility,
  projectId: jobs.projectId,
  projectCode: projects.code,
  projectName: projects.name,
  trackName: projectTracks.name,
  ownerMemberName: sql<string | null>`coalesce(${teamMembers.name}, ${teamMembers.email})`,
};

/** Every pipeline of one expert, newest stage change first. */
export async function pipelinesOf(db: DB, expertId: string) {
  if (!isUuid(expertId)) return [];
  return db
    .select(pipelineColumns)
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(projects, eq(projects.id, jobs.projectId))
    .leftJoin(projectTracks, eq(projectTracks.id, applications.trackId))
    .leftJoin(teamMembers, eq(teamMembers.id, applications.ownerTeamMemberId))
    .where(eq(applications.expertId, expertId))
    .orderBy(desc(applications.stageChangedAt));
}
export type PipelineRow = Awaited<ReturnType<typeof pipelinesOf>>[number];

export async function getPipeline(db: DB, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ ...pipelineColumns, expertName: experts.fullName, expertStatus: experts.status })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(experts, eq(experts.id, applications.expertId))
    .leftJoin(projects, eq(projects.id, jobs.projectId))
    .leftJoin(projectTracks, eq(projectTracks.id, applications.trackId))
    .leftJoin(teamMembers, eq(teamMembers.id, applications.ownerTeamMemberId))
    .where(eq(applications.id, id))
    .limit(1);
  return row ?? null;
}

/** After a pipeline moves: the expert's status follows their pipelines (placed while one is Active). */
async function followExpertStatus(db: DB, actor: Actor, expertId: string): Promise<void> {
  const [e] = await db.select({ status: experts.status }).from(experts).where(eq(experts.id, expertId)).limit(1);
  if (!e || !isOneOf(EXPERT_STATUSES, e.status)) return;
  const stages = (await db.select({ stage: applications.stage }).from(applications).where(eq(applications.expertId, expertId))).map((r) => r.stage);
  const next = expertStatusFromPipelines(e.status as ExpertStatus, stages);
  const now = new Date();
  await db.update(experts).set({ lastActivityAt: now, ...(next !== e.status ? { status: next, updatedAt: now } : {}) }).where(eq(experts.id, expertId));
  if (next !== e.status) await logActivity(db, { entityType: "expert", entityId: expertId, actor, action: "status_changed", detail: { from: e.status, to: next, because: "pipeline" } });
}

export type StageResult = { ok: true; changed: boolean; summary?: string } | { ok: false; reason: string };

/**
 * Moves one pipeline to a stage. Rejected needs a reason; Active sets the contract start (today
 * when empty); Ended sets the end. Writes the timeline ("<job>: <stage>"), the audit log and the
 * expert's status, and adds an expected fee when the project has a rule for that stage.
 */
export async function setPipelineStage(
  db: DB,
  actor: Actor,
  id: string,
  input: { stage: string; rejectReason?: string | null; startedOn?: string | null; endedOn?: string | null; detail?: string | null },
): Promise<StageResult> {
  const p = await getPipeline(db, id);
  if (!p) return { ok: false, reason: "That pipeline no longer exists." };
  if (!isOneOf(PIPELINE_STAGES, input.stage)) return { ok: false, reason: "Pick a stage." };
  const startedOn = input.startedOn !== undefined ? isoDate(input.startedOn) : p.startedOn;
  const endedOn = input.endedOn !== undefined ? isoDate(input.endedOn) : p.endedOn;
  if (startedOn && endedOn && endedOn < startedOn) return { ok: false, reason: "The contract can't end before it starts." };
  if (input.stage === p.stage && (input.stage !== "rejected" || (input.rejectReason ?? p.rejectReason) === p.rejectReason) && startedOn === p.startedOn && endedOn === p.endedOn) return { ok: true, changed: false };
  const plan = planStageChange(p.jobTitle, { from: p.stage as PipelineStage, to: input.stage, rejectReason: input.rejectReason ?? (input.stage === "rejected" ? p.rejectReason : null), startedOn, endedOn, today: todayIndia() });
  if (!plan.ok) return plan;
  const by = actorEmail(actor);
  const now = new Date();
  const stageMoved = plan.patch.stage !== p.stage;
  await db
    .update(applications)
    .set({
      stage: plan.patch.stage,
      rejectReason: plan.patch.rejectReason,
      startedOn: plan.patch.startedOn ?? startedOn ?? null,
      endedOn: plan.patch.endedOn ?? endedOn ?? null,
      updatedAt: now,
    })
    .where(eq(applications.id, id));
  if (stageMoved || plan.patch.rejectReason !== p.rejectReason) {
    await addTimeline(db, { expertId: p.expertId, applicationId: id, kind: "stage", summary: plan.summary, detail: cleanText(input.detail, 2000), by });
  }
  await logActivity(db, { entityType: "application", entityId: id, actor, action: "stage_changed", detail: { jobId: p.jobId, from: p.stage, to: plan.patch.stage, ...(plan.patch.rejectReason ? { rejectReason: plan.patch.rejectReason } : {}) } });
  await followExpertStatus(db, actor, p.expertId);
  if (stageMoved) {
    const { ensureFeeForPipeline } = await import("./fees");
    await ensureFeeForPipeline(db, actor, id);
  }
  return { ok: true, changed: true, summary: plan.summary };
}

/** Owner, next action (+ due) and track of a pipeline. Logged; no timeline line (as FynoLabs). */
export async function updatePipeline(
  db: DB,
  actor: Actor,
  id: string,
  input: { ownerTeamMemberId?: string | null; nextAction?: string | null; nextActionDue?: string | null; trackId?: string | null },
): Promise<{ ok: true; changed: string[] } | { ok: false; reason: string }> {
  const p = await getPipeline(db, id);
  if (!p) return { ok: false, reason: "That pipeline no longer exists." };
  const patch: Partial<typeof applications.$inferInsert> = {};
  if (input.ownerTeamMemberId !== undefined) {
    const owner = input.ownerTeamMemberId && isUuid(input.ownerTeamMemberId) ? input.ownerTeamMemberId : null;
    if (owner) {
      const [m] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, owner)).limit(1);
      if (!m) return { ok: false, reason: "Pick someone on the team." };
    }
    if (owner !== p.ownerTeamMemberId) patch.ownerTeamMemberId = owner;
  }
  if (input.nextAction !== undefined) {
    const v = cleanText(input.nextAction, 300);
    if (v !== p.nextAction) {
      patch.nextAction = v;
      patch.nextActionAuto = false;
    }
  }
  if (input.nextActionDue !== undefined) {
    const v = isoDate(input.nextActionDue);
    if (input.nextActionDue && !v) return { ok: false, reason: "Pick a date for the next action." };
    if (v !== p.nextActionDue) patch.nextActionDue = v;
  }
  if (input.trackId !== undefined) {
    const t = input.trackId && isUuid(input.trackId) ? input.trackId : null;
    if (t) {
      const [track] = await db.select({ projectId: projectTracks.projectId }).from(projectTracks).where(eq(projectTracks.id, t)).limit(1);
      if (!track || track.projectId !== p.projectId) return { ok: false, reason: "That track belongs to another project." };
    }
    if (t !== p.trackId) patch.trackId = t;
  }
  const changed = Object.keys(patch);
  if (!changed.length) return { ok: true, changed };
  await db.update(applications).set({ ...patch, updatedAt: new Date() }).where(eq(applications.id, id));
  await logActivity(db, { entityType: "application", entityId: id, actor, action: "updated", detail: { jobId: p.jobId, fields: changed } });
  return { ok: true, changed };
}

/**
 * Adds an expert to a job (a pipeline at Applied or Shortlisted, "Added by us"). Do-not-contact
 * people are never added; someone already on the job is left as they are.
 */
export async function addToJob(db: DB, actor: Actor, input: { expertIds: string[]; jobId: string; stage?: string }) {
  const stage: PipelineStage = input.stage === "shortlisted" ? "shortlisted" : "new";
  if (!isUuid(input.jobId)) return { ok: false as const, reason: "Pick a job." };
  const [job] = await db.select({ id: jobs.id, title: jobs.title }).from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
  if (!job) return { ok: false as const, reason: "That job no longer exists." };
  const ids = [...new Set(input.expertIds.filter(isUuid))].slice(0, 2000);
  if (!ids.length) return { ok: false as const, reason: "Tick at least one expert." };
  const people = await db.select({ id: experts.id, status: experts.status }).from(experts).where(inArray(experts.id, ids));
  const already = new Set((await db.select({ e: applications.expertId }).from(applications).where(and(eq(applications.jobId, job.id), inArray(applications.expertId, ids)))).map((r) => r.e));
  const by = actorEmail(actor);
  let added = 0;
  let skipped = 0;
  for (const e of people) {
    if (e.status === "do_not_contact") {
      skipped++;
      continue;
    }
    if (already.has(e.id)) continue;
    const now = new Date();
    const [row] = await db
      .insert(applications)
      .values({ jobId: job.id, expertId: e.id, status: "new", stage, channel: "manual", answers: {}, source: { ref: "hub" }, createdBy: by, createdAt: now, updatedAt: now, stageChangedAt: now })
      .onConflictDoNothing()
      .returning({ id: applications.id });
    if (!row) continue;
    added++;
    await addTimeline(db, { expertId: e.id, applicationId: row.id, kind: "application", summary: `Added to ${job.title}${stage === "shortlisted" ? " (Shortlisted)" : ""}`, by });
    await logActivity(db, { entityType: "application", entityId: row.id, actor, action: "created", detail: { jobId: job.id, stage, channel: "manual" } });
    await db.update(experts).set({ lastActivityAt: now }).where(eq(experts.id, e.id));
  }
  return { ok: true as const, added, already: already.size, skipped, jobTitle: job.title };
}

// ---------------------------------------------------------------- the pipeline board

export type BoardFilters = { expertWhere?: SQL; jobId?: string; projectId?: string; trackId?: string; ownerTeamMemberId?: string | "none" };

/** One column per stage, one card per pipeline (person + job), most recent stage change first. */
export async function pipelineBoard(db: DB, f: BoardFilters, opts: { perColumn: number }) {
  const conds: SQL[] = [];
  if (f.expertWhere) conds.push(f.expertWhere);
  if (f.jobId && isUuid(f.jobId)) conds.push(eq(applications.jobId, f.jobId));
  if (f.projectId && isUuid(f.projectId)) conds.push(eq(jobs.projectId, f.projectId));
  if (f.trackId && isUuid(f.trackId)) conds.push(eq(applications.trackId, f.trackId));
  if (f.ownerTeamMemberId === "none") conds.push(sql`${applications.ownerTeamMemberId} is null`);
  else if (f.ownerTeamMemberId && isUuid(f.ownerTeamMemberId)) conds.push(eq(applications.ownerTeamMemberId, f.ownerTeamMemberId));
  const where = conds.length ? and(...conds) : undefined;
  const counts = await db
    .select({ stage: applications.stage, n: count() })
    .from(applications)
    .innerJoin(experts, eq(experts.id, applications.expertId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(where)
    .groupBy(applications.stage);
  const byStage = new Map(counts.map((c) => [c.stage, Number(c.n)]));
  const cards = {
    id: applications.id,
    expertId: applications.expertId,
    expertName: experts.fullName,
    headline: experts.headline,
    expertStatus: experts.status,
    jobId: applications.jobId,
    jobTitle: jobs.title,
    stage: applications.stage,
    stageChangedAt: applications.stageChangedAt,
    rejectReason: applications.rejectReason,
    nextAction: applications.nextAction,
    nextActionDue: applications.nextActionDue,
    ownerName: sql<string | null>`coalesce(${teamMembers.name}, ${teamMembers.email})`,
    projectCode: projects.code,
    trackName: projectTracks.name,
  };
  return Promise.all(
    PIPELINE_STAGES.map(async (stage) => {
      const total = byStage.get(stage) ?? 0;
      const rows = total
        ? await db
            .select(cards)
            .from(applications)
            .innerJoin(experts, eq(experts.id, applications.expertId))
            .innerJoin(jobs, eq(jobs.id, applications.jobId))
            .leftJoin(projects, eq(projects.id, jobs.projectId))
            .leftJoin(projectTracks, eq(projectTracks.id, applications.trackId))
            .leftJoin(teamMembers, eq(teamMembers.id, applications.ownerTeamMemberId))
            .where(where ? and(where, eq(applications.stage, stage)) : eq(applications.stage, stage))
            .orderBy(desc(applications.stageChangedAt))
            .limit(opts.perColumn)
        : [];
      return { stage, label: stageLabel(stage), total, rows };
    }),
  );
}
export type BoardColumn = Awaited<ReturnType<typeof pipelineBoard>>[number];

/** The Experts page tiles: everyone, applicants to review, pipelines in onboarding, pipelines active. */
export async function talentStats(db: DB) {
  const [[e], [a], stages] = await Promise.all([
    db.select({ n: count() }).from(experts),
    db.select({ n: count() }).from(experts).where(eq(experts.status, "applicant")),
    db.select({ stage: applications.stage, n: count() }).from(applications).where(inArray(applications.stage, ["selected", "documents", "signed", "active"])).groupBy(applications.stage),
  ]);
  const by = new Map(stages.map((s) => [s.stage, Number(s.n)]));
  return { experts: Number(e.n), applicants: Number(a.n), onboarding: (by.get("selected") ?? 0) + (by.get("documents") ?? 0) + (by.get("signed") ?? 0), active: by.get("active") ?? 0 };
}

// ---------------------------------------------------------------- pickers

/** Jobs for pickers (title, status, project code), open ones first. */
export async function jobOptions(db: DB) {
  return db
    .select({ id: jobs.id, title: jobs.title, status: jobs.status, visibility: jobs.visibility, projectCode: projects.code })
    .from(jobs)
    .leftJoin(projects, eq(projects.id, jobs.projectId))
    .orderBy(sql`case ${jobs.status} when 'open' then 0 when 'paused' then 1 when 'draft' then 2 else 3 end`, asc(jobs.title))
    .limit(1000);
}

export async function projectOptions(db: DB) {
  return db.select({ id: projects.id, code: projects.code, name: projects.name, status: projects.status, companyId: projects.companyId, platformId: projects.platformId, referralUrl: projects.referralUrl }).from(projects).orderBy(asc(projects.code)).limit(500);
}

export async function trackOptions(db: DB, projectId?: string | null) {
  const q = db.select({ id: projectTracks.id, name: projectTracks.name, projectId: projectTracks.projectId, projectCode: projects.code }).from(projectTracks).innerJoin(projects, eq(projects.id, projectTracks.projectId));
  return (projectId && isUuid(projectId) ? q.where(eq(projectTracks.projectId, projectId)) : q).orderBy(asc(projects.code), asc(projectTracks.position)).limit(1000);
}

/** Team members who can own people and pipelines (active first). */
export async function ownerOptions(db: DB) {
  return db.select({ id: teamMembers.id, name: sql<string>`coalesce(${teamMembers.name}, ${teamMembers.email})`, email: teamMembers.email, active: teamMembers.active }).from(teamMembers).orderBy(desc(teamMembers.active), asc(teamMembers.email));
}
