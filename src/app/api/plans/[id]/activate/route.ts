// ============ /api/plans/[id]/activate — make this version the governing plan ============
import { db, route, json, ApiError, audit, notify, requirePermission, syncPatientStatus } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { activatePlanTx } from "../../plan-service";

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;

  const { plan, episode, patient } = await db.$transaction(async (tx) =>
    activatePlanTx(tx, { planId: id, clinicId: auth.clinicId })
  );

  await syncPatientStatus(episode.patientId);
  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "PLAN_ACTIVATED", entityType: "TreatmentPlan", entityId: plan.id,
    newValues: { version: plan.version, status: "ACTIVE", activatedAt: plan.activatedAt, episodeId: plan.episodeId },
  });
  await notify({
    clinicId: auth.clinicId, audienceRole: "PHYSIOTHERAPIST",
    type: "PLAN_ACTIVATED", title: "Treatment plan activated",
    message: `v${plan.version} plan activated for ${patient.firstName} ${patient.lastName} — episode is now in active treatment.`,
    entityType: "TreatmentPlan", entityId: plan.id,
  });

  const detail = await db.treatmentPlan.findUnique({
    where: { id: plan.id },
    include: {
      objectives: true, milestones: true, interventions: true,
      episode: { select: { id: true, title: true, status: true, patient: true } },
    },
  });
  if (!detail) throw new ApiError(500, "Activation failed");
  return json(detail);
});
