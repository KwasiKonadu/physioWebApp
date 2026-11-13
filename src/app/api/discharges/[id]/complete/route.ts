// ============ /api/discharges/[id]/complete — sign & complete a discharge ============
// Calls completeDischargeTx (closes the episode: DISCHARGED + closedDate), then syncs the
// patient's current status (patient is NOT deactivated — Business Rule 15) and notifies reception.
// Outstanding payments do NOT block discharge (Business Rule 16).
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit, notify, parseJson,
  requirePermission, completeDischargeTx, syncPatientStatus,
} from "@/server/api-exports";
import { PERMS, DISCHARGE_REASONS, FOLLOW_UP_TYPES, labelize } from "@/lib/constants";
import { ComparisonRow } from "@/app/api/reviews/_lib/baseline";

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

const completeSchema = z.object({
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
  therapistSignature: z.string().min(2, "Therapist signature is required"),
});

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, completeSchema);

  const discharge = await db.discharge.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { patient: { select: { firstName: true, lastName: true } } },
  });
  if (!discharge) throw new ApiError(404, "Discharge record not found");
  if (discharge.status === "COMPLETED") throw new ApiError(409, "Discharge already completed");

  const { recommendations, baselineComparison, dischargeDate, ...rest } = body;
  const updates: Record<string, unknown> = {
    ...rest,
    ...(dischargeDate ? { dischargeDate: new Date(dischargeDate) } : {}),
    ...(baselineComparison ? { baselineComparison: JSON.stringify(baselineComparison) } : {}),
  };

  const result = await completeDischargeTx({
    dischargeId: id,
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    updates,
  });

  // Recommendations are stored outside the tx payload — replace after completion if provided
  if (recommendations) {
    await db.$transaction(async (tx) => {
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
    });
  }

  // Patient status sync: episode closed → patient DISCHARGED (never deactivated)
  const patientStatus = await syncPatientStatus(discharge.patientId);

  await notify({
    clinicId: auth.clinicId,
    audienceRole: "RECEPTIONIST",
    type: "DISCHARGE_COMPLETED",
    title: "Discharge completed",
    message: `${discharge.patient.firstName} ${discharge.patient.lastName} has been discharged (${labelize(result.discharge.reason)}) — treatment episode closed. Patient status: ${labelize(patientStatus)}.`,
    entityType: "Discharge",
    entityId: id,
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "DISCHARGE_COMPLETED",
    entityType: "Discharge",
    entityId: id,
    newValues: { patientStatus },
  });

  const [finalDischarge, episode] = await Promise.all([
    db.discharge.findUnique({ where: { id }, include: { recommendations: { orderBy: { id: "asc" } } } }),
    db.treatmentEpisode.findUnique({ where: { id: discharge.episodeId } }),
  ]);

  return json({
    discharge: { ...finalDischarge, baselineComparison: parseJson<ComparisonRow[]>(finalDischarge?.baselineComparison ?? "[]", []) },
    episode,
  });
});
