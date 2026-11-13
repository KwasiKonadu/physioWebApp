// ============ /api/plans/[id]/revise — branch a new draft version from a governing plan ============
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { createPlanTx, findPlan, maxPlanVersion, type InterventionInput, type MilestoneInput, type ObjectiveInput } from "../../plan-service";

const optInt = z.union([z.number(), z.string(), z.null()]).optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && Number.isInteger(v) && v > 0), "Must be a positive whole number");
const optDate = z.union([z.string(), z.null()]).optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), "Invalid date");
const optStr = z.union([z.string(), z.null()]).optional()
  .transform((v) => (v === undefined || v === null || v.trim() === "" ? null : v.trim()));

const objectiveSchema = z.object({
  description: z.string().min(1, "Objective description is required"),
  baseline: optStr, target: optStr, unit: optStr,
  priority: z.union([z.literal("HIGH"), z.literal("MEDIUM"), z.literal("LOW"), z.null()]).optional(),
  expectedDate: optDate, status: z.string().optional(), notes: optStr,
});
const milestoneSchema = z.object({
  description: z.string().min(1, "Milestone description is required"),
  objectiveIdx: optInt, expectedDate: optDate, status: z.string().optional(), notes: optStr,
});
const interventionSchema = z.object({
  name: z.string().min(1, "Intervention name is required"),
  description: optStr, frequency: optStr, duration: optStr, instructions: optStr, notes: optStr,
});

const scheduleObjectSchema = z.object({
  sessionsPerWeek: optInt, expectedTotalSessions: optInt, sessionDurationMin: optInt,
  startDate: optDate, endDate: optDate, reviewThresholdSessions: optInt,
});
const scheduleSchema = scheduleObjectSchema.optional();

const precautionsObjectSchema = z.object({
  contraindications: optStr, restrictions: optStr, activitiesToAvoid: optStr,
  specialPrecautions: optStr, patientRecommendations: optStr, referralInstructions: optStr,
});
const precautionsSchema = precautionsObjectSchema.optional();

const reviseSchema = z.object({
  objectives: z.array(objectiveSchema).max(30).optional(),
  milestones: z.array(milestoneSchema).max(30).optional(),
  interventions: z.array(interventionSchema).max(30).optional(),
  schedule: scheduleSchema,
  precautions: precautionsSchema,
  changeReason: z.string().trim().min(1, "A change reason is required when revising a plan"),
});

// ---- POST /api/plans/[id]/revise — new DRAFT version (max+1) copied from source; source untouched ----
export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, reviseSchema);

  const source = await findPlan(id, auth.clinicId);
  if (!["ACTIVE", "UNDER_REVIEW"].includes(source.status)) {
    throw new ApiError(409, `Only active or under-review plans can be revised (current: ${source.status})`);
  }

  const src = await db.treatmentPlan.findUnique({
    where: { id: source.id },
    include: {
      objectives: { orderBy: { id: "asc" as const } },
      milestones: { orderBy: { id: "asc" as const } },
      interventions: { orderBy: { id: "asc" as const } },
    },
  });
  if (!src) throw new ApiError(404, "Treatment plan not found");

  // resolve overrides (explicit values win, otherwise carry the source forward)
  const sch = body.schedule || ({} as z.infer<typeof scheduleObjectSchema>);
  const prec = body.precautions || ({} as z.infer<typeof precautionsObjectSchema>);
  const schedule = {
    sessionsPerWeek: sch.sessionsPerWeek !== undefined ? sch.sessionsPerWeek : src.sessionsPerWeek,
    expectedTotalSessions: sch.expectedTotalSessions !== undefined ? sch.expectedTotalSessions : src.expectedTotalSessions,
    sessionDurationMin: sch.sessionDurationMin !== undefined ? sch.sessionDurationMin : src.sessionDurationMin,
    startDate: sch.startDate !== undefined ? sch.startDate : src.startDate,
    endDate: sch.endDate !== undefined ? sch.endDate : src.endDate,
    reviewThresholdSessions: sch.reviewThresholdSessions !== undefined ? sch.reviewThresholdSessions : src.reviewThresholdSessions,
  };
  const precautions = {
    contraindications: prec.contraindications !== undefined ? prec.contraindications : src.contraindications,
    restrictions: prec.restrictions !== undefined ? prec.restrictions : src.restrictions,
    activitiesToAvoid: prec.activitiesToAvoid !== undefined ? prec.activitiesToAvoid : src.activitiesToAvoid,
    specialPrecautions: prec.specialPrecautions !== undefined ? prec.specialPrecautions : src.specialPrecautions,
    patientRecommendations: prec.patientRecommendations !== undefined ? prec.patientRecommendations : src.patientRecommendations,
    referralInstructions: prec.referralInstructions !== undefined ? prec.referralInstructions : src.referralInstructions,
  };

  // objectives: provided or copied (including live status/notes)
  const srcObjectiveIds = src.objectives.map((o) => o.id);
  const objectives: ObjectiveInput[] = (body.objectives ?? src.objectives.map((o) => ({
    description: o.description, baseline: o.baseline, target: o.target, unit: o.unit,
    priority: o.priority as "HIGH" | "MEDIUM" | "LOW" | null,
    expectedDate: o.expectedDate, status: o.status, notes: o.notes,
  }))) as ObjectiveInput[];

  // milestones: provided (objectiveIdx) or copied with objective links remapped by position
  const milestones: MilestoneInput[] = (body.milestones ?? src.milestones.map((m) => ({
    description: m.description,
    objectiveIdx: m.objectiveId ? srcObjectiveIds.indexOf(m.objectiveId) : null,
    expectedDate: m.expectedDate, status: m.status, notes: m.notes,
  }))) as MilestoneInput[];

  const interventions: InterventionInput[] = (body.interventions ?? src.interventions.map((iv) => ({
    name: iv.name, description: iv.description, frequency: iv.frequency,
    duration: iv.duration, instructions: iv.instructions, notes: iv.notes,
  }))) as InterventionInput[];

  const newPlan = await db.$transaction(async (tx) => {
    const version = (await maxPlanVersion(tx, source.episodeId)) + 1;
    return createPlanTx(tx, {
      clinicId: auth.clinicId,
      episodeId: source.episodeId,
      version,
      status: "DRAFT",
      revisedFromId: source.id,
      createdById: auth.userId,
      schedule,
      precautions,
      objectives,
      milestones,
      interventions,
    });
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "PLAN_REVISED", entityType: "TreatmentPlan", entityId: source.id,
    reason: body.changeReason,
    previousValues: { id: source.id, version: source.version, status: source.status },
    newValues: { newPlanId: newPlan.id, newVersion: newPlan.version, changeReason: body.changeReason },
  });

  const detail = await db.treatmentPlan.findUnique({
    where: { id: newPlan.id },
    include: {
      objectives: true, milestones: true, interventions: true,
      episode: { select: { id: true, title: true, status: true, patient: true } },
    },
  });
  if (!detail) throw new ApiError(500, "Revision failed");
  return json(detail, 201);
});
