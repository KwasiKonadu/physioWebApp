// ============ /api/plans/[id] — detail & draft update ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit,
  requireAuth, requirePermission,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { fetchPlanDetail, findPlan, createPlanChildrenTx, type ObjectiveInput, type MilestoneInput, type InterventionInput } from "../plan-service";

// same lenient transforms as collection route
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

const patchSchema = z.object({
  sessionsPerWeek: optInt, expectedTotalSessions: optInt, sessionDurationMin: optInt,
  startDate: optDate, endDate: optDate, reviewThresholdSessions: optInt,
  contraindications: optStr, restrictions: optStr, activitiesToAvoid: optStr,
  specialPrecautions: optStr, patientRecommendations: optStr, referralInstructions: optStr,
  objectives: z.array(objectiveSchema).max(30).optional(),
  milestones: z.array(milestoneSchema).max(30).optional(),
  interventions: z.array(interventionSchema).max(30).optional(),
  status: z.string().optional(), // rejected below — status changes go through /activate
}).refine((b) => !b.status || b.status === "DRAFT", { message: "Plan status changes happen via the activate action" });

// ---- GET /api/plans/[id] — full detail incl. version history ----
export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  const detail = await fetchPlanDetail(id, auth.clinicId);
  return json(detail);
});

// ---- PATCH /api/plans/[id] — update a DRAFT plan (scalars + optional nested replacement) ----
export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const existing = await findPlan(id, auth.clinicId);
  if (existing.status !== "DRAFT") {
    throw new ApiError(409, `Only draft plans can be edited (current: ${existing.status})`);
  }

  await db.$transaction(async (tx) => {
    // undefined fields are treated as "no change" by Prisma
    await tx.treatmentPlan.update({
      where: { id },
      data: {
        sessionsPerWeek: body.sessionsPerWeek,
        expectedTotalSessions: body.expectedTotalSessions,
        sessionDurationMin: body.sessionDurationMin,
        startDate: body.startDate,
        endDate: body.endDate,
        reviewThresholdSessions: body.reviewThresholdSessions ?? undefined, // non-nullable: null ⇒ no change
        contraindications: body.contraindications,
        restrictions: body.restrictions,
        activitiesToAvoid: body.activitiesToAvoid,
        specialPrecautions: body.specialPrecautions,
        patientRecommendations: body.patientRecommendations,
        referralInstructions: body.referralInstructions,
      },
    });

    // replace nested collections when provided
    if (body.objectives || body.milestones || body.interventions) {
      await tx.planObjective.deleteMany({ where: { planId: id } });
      await tx.rehabilitationMilestone.deleteMany({ where: { planId: id } });
      await tx.planIntervention.deleteMany({ where: { planId: id } });

      await createPlanChildrenTx(tx, id, {
        objectives: (body.objectives || []) as ObjectiveInput[],
        milestones: (body.milestones || []) as MilestoneInput[],
        interventions: (body.interventions || []) as InterventionInput[],
      });
    }
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "PLAN_UPDATED", entityType: "TreatmentPlan", entityId: id,
    newValues: { sections: Object.keys(body) },
  });

  const detail = await fetchPlanDetail(id, auth.clinicId);
  return json(detail);
});
