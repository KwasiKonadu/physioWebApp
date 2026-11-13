// ============ /api/discharges/[id] — discharge detail & draft/pending update ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit, parseJson,
  requireAuth, requirePermission,
} from "@/server/api-exports";
import { PERMS, DISCHARGE_REASONS, FOLLOW_UP_TYPES } from "@/lib/constants";
import { buildClinicalBaseline, ComparisonRow } from "@/app/api/reviews/_lib/baseline";

// GET: detail + recommendations + baseline snapshot (recomputed live)
export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;

  const discharge = await db.discharge.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: {
      patient: {
        select: { id: true, patientCode: true, firstName: true, middleName: true, lastName: true, phone: true, paymentArrangement: true, currentStatus: true },
      },
      episode: {
        select: {
          id: true, title: true, status: true, openedDate: true, closedDate: true,
          totalCompletedSessions: true, sessionsSinceReview: true, reviewThreshold: true,
        },
      },
      recommendations: { orderBy: { id: "asc" } },
    },
  });
  if (!discharge) throw new ApiError(404, "Discharge record not found");

  const baseline = await buildClinicalBaseline(discharge.episodeId, auth.clinicId);
  return json({
    discharge: { ...discharge, baselineComparison: parseJson<ComparisonRow[]>(discharge.baselineComparison, []) },
    baseline,
  });
});

const rowSchema = z.object({
  metric: z.string().min(1),
  baseline: z.string().max(200),
  current: z.string().max(200),
  change: z.string().max(200).optional(),
  direction: z.enum(["higher", "lower"]).optional(),
});

const recommendationSchema = z.object({
  exerciseName: z.string().min(1, "Exercise name is required"),
  instructions: z.string().max(2000).nullish(),
  frequency: z.string().max(200).nullish(),
  duration: z.string().max(200).nullish(),
  repetitions: z.string().max(200).nullish(),
  precautions: z.string().max(1000).nullish(),
  notes: z.string().max(1000).nullish(),
});

const patchSchema = z.object({
  action: z.enum(["submit", "back_to_draft"]).optional(),
  dischargeDate: z.string().optional(),
  reason: z.enum(DISCHARGE_REASONS).optional(),
  finalAssessment: z.string().max(5000).nullish(),
  baselineComparison: z.array(rowSchema).optional(),
  objectiveOutcomes: z.string().max(5000).nullish(),
  remainingLimitations: z.string().max(5000).nullish(),
  summary: z.string().max(5000).nullish(),
  followUpType: z.enum(FOLLOW_UP_TYPES).nullish(),
  followUpDetails: z.string().max(1000).nullish(),
  recommendations: z.array(recommendationSchema).optional(),
});

// PATCH: DRAFT | PENDING_SIGNOFF only; supports submit / back_to_draft transitions
export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const discharge = await db.discharge.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!discharge) throw new ApiError(404, "Discharge record not found");
  if (discharge.status === "COMPLETED") throw new ApiError(409, "Completed discharges are read-only and cannot be edited");

  const { action, dischargeDate, baselineComparison, recommendations, ...rest } = body;
  const data: Record<string, unknown> = { ...rest };
  if (dischargeDate) data.dischargeDate = new Date(dischargeDate);
  if (baselineComparison) data.baselineComparison = JSON.stringify(baselineComparison);
  if (action === "submit") data.status = "PENDING_SIGNOFF";
  if (action === "back_to_draft") data.status = "DRAFT";

  const updated = await db.$transaction(async (tx) => {
    const d = await tx.discharge.update({ where: { id }, data: data as never });
    if (recommendations) {
      await tx.dischargeRecommendation.deleteMany({ where: { dischargeId: id } });
      for (const rec of recommendations) {
        await tx.dischargeRecommendation.create({
          data: {
            dischargeId: id,
            exerciseName: rec.exerciseName,
            instructions: rec.instructions ?? null,
            frequency: rec.frequency ?? null,
            duration: rec.duration ?? null,
            repetitions: rec.repetitions ?? null,
            precautions: rec.precautions ?? null,
            notes: rec.notes ?? null,
          },
        });
      }
    }
    return d;
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "DISCHARGE_UPDATED",
    entityType: "Discharge",
    entityId: id,
    newValues: { fields: Object.keys(body), status: updated.status },
  });

  const saved = await db.discharge.findUnique({ where: { id }, include: { recommendations: { orderBy: { id: "asc" } } } });
  return json({ discharge: { ...saved, baselineComparison: parseJson<ComparisonRow[]>(saved?.baselineComparison ?? "[]", []) } });
});
