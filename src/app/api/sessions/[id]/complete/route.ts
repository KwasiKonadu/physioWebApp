// ============ API: Therapy session completion (transactional: status + episode counters + review flag + package deduction) ============
import { z } from "zod";
import { PERMS } from "@/lib/constants";
import {
  db, route, json, parseBody, ApiError, completeTherapySessionTx,
  requirePermission,
} from "@/server/api-exports";

const completeSchema = z.object({
  painLevel: z.number().int().min(0).max(10).nullish(),
  bloodPressure: z.string().max(40).nullish(),
  heartRate: z.number().int().min(0).max(300).nullish(),
  otherVitals: z.string().max(2000).nullish(),
  patientResponse: z.string().max(2000).nullish(),
  observations: z.string().max(4000).nullish(),
  notes: z.string().max(4000).nullish(),
  durationMin: z.number().int().min(1).max(600).nullish(),
  therapistSignature: z.string().max(120).nullish(),
  interventions: z.array(z.object({
    name: z.string().min(1, "Intervention name is required"),
    details: z.string().max(500).optional(),
  })).max(30).optional(),
});

const detailInclude = {
  episode: {
    select: {
      id: true,
      title: true,
      status: true,
      openedDate: true,
      sessionsSinceReview: true,
      reviewThreshold: true,
      reviewDue: true,
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
    },
  },
  patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true, paymentArrangement: true } },
  therapist: { select: { id: true, firstName: true, lastName: true } },
  interventions: true,
  appointment: { select: { id: true, date: true, startMin: true, endMin: true, status: true, purpose: true } },
};

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, completeSchema);

  const existing = await db.therapySession.findUnique({ where: { id } });
  if (!existing || existing.clinicId !== auth.clinicId) {
    throw new ApiError(404, "Therapy session not found");
  }
  if (existing.status === "COMPLETED") throw new ApiError(409, "Session is already completed");
  if (existing.status === "CANCELLED" || existing.status === "NO_SHOW") {
    throw new ApiError(409, "Cannot complete a cancelled/no-show session");
  }

  // Replace delivered interventions first (delete + recreate) in its own short transaction —
  // completeTherapySessionTx then runs its own transaction over the scalars + counters + deduction.
  if (body.interventions) {
    const rows = body.interventions.filter((i) => i.name.trim().length > 0);
    await db.$transaction(async (tx) => {
      await tx.sessionIntervention.deleteMany({ where: { sessionId: id } });
      if (rows.length) {
        await tx.sessionIntervention.createMany({
          data: rows.map((i) => ({ sessionId: id, name: i.name.trim(), details: i.details?.trim() || null })),
        });
      }
    });
  }

  const updates: Record<string, unknown> = {};
  if ("painLevel" in body) updates.painLevel = body.painLevel;
  if ("bloodPressure" in body) updates.bloodPressure = body.bloodPressure?.trim() || null;
  if ("heartRate" in body) updates.heartRate = body.heartRate;
  if ("otherVitals" in body) updates.otherVitals = body.otherVitals?.trim() || null;
  if ("patientResponse" in body) updates.patientResponse = body.patientResponse?.trim() || null;
  if ("observations" in body) updates.observations = body.observations?.trim() || null;
  if ("notes" in body) updates.notes = body.notes?.trim() || null;
  if ("durationMin" in body) updates.durationMin = body.durationMin;
  if ("therapistSignature" in body) updates.therapistSignature = body.therapistSignature?.trim() || null;

  const result = await completeTherapySessionTx({
    sessionId: id,
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    updates,
  });

  // Re-fetch the completed session + its package deduction ledger for immediate read-only display
  const session = await db.therapySession.findUnique({
    where: { id },
    include: detailInclude,
  });
  const packageTransactions = await db.packageTransaction.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "desc" },
    include: { patientPackage: { include: { package: { select: { name: true, sessions: true } } } } },
  });

  return json({
    session,
    reviewDue: result.reviewDue,
    packageInfo: result.packageInfo,
    sessionsSinceReview: result.sessionsSinceReview,
    threshold: result.threshold,
    packageTransactions,
  });
});
