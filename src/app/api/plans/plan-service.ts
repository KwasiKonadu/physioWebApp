// ============ Treatment Plans: shared transactional logic ============
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/server/api";

export type Tx = Prisma.TransactionClient;

/** Plan statuses that count as "currently governing treatment". */
export const PLAN_GOVERNING_STATUSES = ["ACTIVE", "UNDER_REVIEW"];

/** Episode statuses that softly allow plan creation (assessment exists ⇒ AWAITING_PLAN or later). */
export const PLANABLE_EPISODE_STATUSES = ["AWAITING_PLAN", "ACTIVE_TREATMENT", "UNDER_REVIEW", "ON_HOLD"];

// ---- input shapes (already validated & normalized by route zod schemas) ----
export interface ObjectiveInput {
  description: string;
  baseline?: string | null;
  target?: string | null;
  unit?: string | null;
  priority?: string | null;
  expectedDate?: Date | null;
  status?: string | null;
  notes?: string | null;
}

export interface MilestoneInput {
  description: string;
  objectiveIdx?: number | null;
  expectedDate?: Date | null;
  status?: string | null;
  notes?: string | null;
}

export interface InterventionInput {
  name: string;
  description?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  notes?: string | null;
}

export interface ScheduleInput {
  sessionsPerWeek?: number | null;
  expectedTotalSessions?: number | null;
  sessionDurationMin?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  reviewThresholdSessions?: number | null;
}

export interface PrecautionsInput {
  contraindications?: string | null;
  restrictions?: string | null;
  activitiesToAvoid?: string | null;
  specialPrecautions?: string | null;
  patientRecommendations?: string | null;
  referralInstructions?: string | null;
}

// ---- lookups ----

/** Find a plan scoped to the clinic; throws 404 when missing. */
export async function findPlan(id: string, clinicId: string) {
  const plan = await db.treatmentPlan.findFirst({ where: { id, clinicId } });
  if (!plan) throw new ApiError(404, "Treatment plan not found");
  return plan;
}

/** Load episode (clinic-scoped) and softly enforce the assessment-exists rule via status. */
export async function findPlanableEpisode(episodeId: string, clinicId: string) {
  const episode = await db.treatmentEpisode.findFirst({
    where: { id: episodeId, clinicId },
    include: { patient: { select: { firstName: true, lastName: true } } },
  });
  if (!episode) throw new ApiError(404, "Treatment episode not found");
  if (!PLANABLE_EPISODE_STATUSES.includes(episode.status)) {
    throw new ApiError(409, `Plans can only be created for episodes awaiting plan, in active treatment, under review or on hold (current: ${episode.status})`);
  }
  return episode;
}

export async function maxPlanVersion(tx: Tx, episodeId: string): Promise<number> {
  const agg = await tx.treatmentPlan.aggregate({ where: { episodeId }, _max: { version: true } });
  return agg._max.version ?? 0;
}

// ---- create / activate ----

/**
 * Create one plan version with nested objectives → milestones (objectiveIdx resolved
 * against the freshly-created objectives, in order) → interventions.
 */
export async function createPlanTx(tx: Tx, opts: {
  clinicId: string;
  episodeId: string;
  version: number;
  status: string;
  revisedFromId?: string | null;
  createdById?: string | null;
  schedule: ScheduleInput;
  precautions: PrecautionsInput;
  objectives: ObjectiveInput[];
  milestones: MilestoneInput[];
  interventions: InterventionInput[];
}) {
  const s = opts.schedule;
  const p = opts.precautions;
  const plan = await tx.treatmentPlan.create({
    data: {
      clinicId: opts.clinicId,
      episodeId: opts.episodeId,
      version: opts.version,
      status: opts.status,
      revisedFromId: opts.revisedFromId ?? null,
      createdById: opts.createdById ?? null,
      sessionsPerWeek: s.sessionsPerWeek ?? null,
      expectedTotalSessions: s.expectedTotalSessions ?? null,
      sessionDurationMin: s.sessionDurationMin ?? null,
      startDate: s.startDate ?? null,
      endDate: s.endDate ?? null,
      reviewThresholdSessions: s.reviewThresholdSessions ?? 15,
      contraindications: p.contraindications ?? null,
      restrictions: p.restrictions ?? null,
      activitiesToAvoid: p.activitiesToAvoid ?? null,
      specialPrecautions: p.specialPrecautions ?? null,
      patientRecommendations: p.patientRecommendations ?? null,
      referralInstructions: p.referralInstructions ?? null,
      activatedAt: opts.status === "ACTIVE" ? new Date() : null,
    },
  });

  const objectiveIds: string[] = [];
  for (const o of opts.objectives) {
    const created = await tx.planObjective.create({
      data: {
        planId: plan.id,
        description: o.description,
        baseline: o.baseline ?? null,
        target: o.target ?? null,
        unit: o.unit ?? null,
        priority: o.priority ?? null,
        expectedDate: o.expectedDate ?? null,
        status: o.status || "PENDING",
        notes: o.notes ?? null,
      },
    });
    objectiveIds.push(created.id);
  }

  for (const m of opts.milestones) {
    const objectiveId =
      m.objectiveIdx != null && m.objectiveIdx >= 0 && m.objectiveIdx < objectiveIds.length
        ? objectiveIds[m.objectiveIdx]
        : null;
    await tx.rehabilitationMilestone.create({
      data: {
        planId: plan.id,
        description: m.description,
        objectiveId,
        expectedDate: m.expectedDate ?? null,
        status: m.status || "PENDING",
        notes: m.notes ?? null,
      },
    });
  }

  for (const iv of opts.interventions) {
    await tx.planIntervention.create({
      data: {
        planId: plan.id,
        name: iv.name,
        description: iv.description ?? null,
        frequency: iv.frequency ?? null,
        duration: iv.duration ?? null,
        instructions: iv.instructions ?? null,
        notes: iv.notes ?? null,
      },
    });
  }

  return plan;
}

/**
 * Activation (Business Rule: ONE governing plan version per episode):
 * - plan → ACTIVE (+activatedAt)
 * - every other ACTIVE/UNDER_REVIEW plan of the episode → REVISED
 * - episode → ACTIVE_TREATMENT (review threshold synced with the plan)
 */
export async function activatePlanTx(tx: Tx, opts: { planId: string; clinicId: string }) {
  const plan = await tx.treatmentPlan.findFirst({
    where: { id: opts.planId, clinicId: opts.clinicId },
    include: { episode: { include: { patient: { select: { firstName: true, lastName: true } } } } },
  });
  if (!plan) throw new ApiError(404, "Treatment plan not found");
  if (!["DRAFT", "UNDER_REVIEW"].includes(plan.status)) {
    throw new ApiError(409, `Only draft or under-review plans can be activated (current: ${plan.status})`);
  }

  await tx.treatmentPlan.updateMany({
    where: { episodeId: plan.episodeId, id: { not: plan.id }, status: { in: PLAN_GOVERNING_STATUSES } },
    data: { status: "REVISED" },
  });

  const updated = await tx.treatmentPlan.update({
    where: { id: plan.id },
    data: { status: "ACTIVE", activatedAt: new Date() },
  });

  const episode = await tx.treatmentEpisode.update({
    where: { id: plan.episodeId },
    data: { status: "ACTIVE_TREATMENT", reviewThreshold: plan.reviewThresholdSessions },
  });

  return { plan: updated, episode, patient: plan.episode.patient };
}

// ---- detail shaping ----

const patientSelect = { id: true, patientCode: true, firstName: true, lastName: true, currentStatus: true } as const;
const therapistSelect = { id: true, staffCode: true, firstName: true, lastName: true, jobTitle: true } as const;
const episodeSelect = {
  id: true, title: true, status: true, episodeNumber: true, openedDate: true,
  totalCompletedSessions: true, sessionsSinceReview: true, reviewThreshold: true, reviewDue: true,
  patient: { select: patientSelect },
  therapist: { select: therapistSelect },
} as const;

const planDetailInclude = {
  objectives: { orderBy: { id: "asc" as const } },
  milestones: { orderBy: { id: "asc" as const } },
  interventions: { orderBy: { id: "asc" as const } },
  episode: { select: episodeSelect },
} satisfies Prisma.TreatmentPlanInclude;

/** Full plan detail incl. sibling version history of the same episode. */
export async function fetchPlanDetail(id: string, clinicId: string) {
  const plan = await db.treatmentPlan.findFirst({
    where: { id, clinicId },
    include: planDetailInclude,
  });
  if (!plan) throw new ApiError(404, "Treatment plan not found");
  const versions = await db.treatmentPlan.findMany({
    where: { episodeId: plan.episodeId },
    orderBy: { version: "asc" },
    select: { id: true, version: true, status: true, createdAt: true, activatedAt: true, revisedFromId: true },
  });
  return { ...plan, versions };
}

/** Summary shape used by the list endpoint. */
export function toPlanSummary(plan: {
  id: string; version: number; status: string; sessionsPerWeek: number | null;
  expectedTotalSessions: number | null; sessionDurationMin: number | null;
  startDate: Date | null; endDate: Date | null; reviewThresholdSessions: number;
  activatedAt: Date | null; revisedFromId: string | null; updatedAt: Date; createdAt: Date;
  episode: {
    id: string; title: string; status: string; totalCompletedSessions: number;
    sessionsSinceReview: number; reviewThreshold: number; reviewDue: boolean;
    patient: { id: string; patientCode: string; firstName: string; lastName: string };
    therapist: { id: string; staffCode: string; firstName: string; lastName: string } | null;
  };
  objectives: { status: string }[];
  milestones: unknown[];
  interventions: unknown[];
}) {
  return {
    id: plan.id,
    version: plan.version,
    status: plan.status,
    sessionsPerWeek: plan.sessionsPerWeek,
    expectedTotalSessions: plan.expectedTotalSessions,
    sessionDurationMin: plan.sessionDurationMin,
    startDate: plan.startDate,
    endDate: plan.endDate,
    reviewThresholdSessions: plan.reviewThresholdSessions,
    activatedAt: plan.activatedAt,
    revisedFromId: plan.revisedFromId,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    episode: {
      id: plan.episode.id,
      title: plan.episode.title,
      status: plan.episode.status,
      totalCompletedSessions: plan.episode.totalCompletedSessions,
      sessionsSinceReview: plan.episode.sessionsSinceReview,
      reviewThreshold: plan.episode.reviewThreshold,
      reviewDue: plan.episode.reviewDue,
      patient: plan.episode.patient,
      therapist: plan.episode.therapist,
    },
    objectivesTotal: plan.objectives.length,
    objectivesAchieved: plan.objectives.filter((o) => o.status === "ACHIEVED").length,
    milestonesCount: plan.milestones.length,
    interventionsCount: plan.interventions.length,
  };
}
