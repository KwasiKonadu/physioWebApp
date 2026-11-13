// ============ /api/plans/[id]/discontinue — retire a plan (episode falls back to AWAITING_PLAN if unmanaged) ============
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requirePermission, syncPatientStatus } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { findPlan, PLAN_GOVERNING_STATUSES } from "../../plan-service";

const discontinueSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required to discontinue a plan"),
});

// ---- POST /api/plans/[id]/discontinue ----
export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const { reason } = await parseBody(req, discontinueSchema);

  const plan = await findPlan(id, auth.clinicId);
  if (!["DRAFT", "ACTIVE", "UNDER_REVIEW"].includes(plan.status)) {
    throw new ApiError(409, `A ${plan.status} plan cannot be discontinued`);
  }
  const wasGoverning = PLAN_GOVERNING_STATUSES.includes(plan.status);

  const updated = await db.$transaction(async (tx) => {
    const p = await tx.treatmentPlan.update({
      where: { id: plan.id },
      data: { status: "DISCONTINUED" },
    });

    // if the episode loses its last governing plan, fall back to AWAITING_PLAN
    if (wasGoverning) {
      const remaining = await tx.treatmentPlan.count({
        where: { episodeId: plan.episodeId, id: { not: plan.id }, status: { in: PLAN_GOVERNING_STATUSES } },
      });
      if (remaining === 0) {
        const episode = await tx.treatmentEpisode.findUnique({
          where: { id: plan.episodeId },
          select: { status: true, patientId: true },
        });
        if (episode && ["ACTIVE_TREATMENT", "UNDER_REVIEW"].includes(episode.status)) {
          await tx.treatmentEpisode.update({ where: { id: plan.episodeId }, data: { status: "AWAITING_PLAN" } });
        }
      }
    }
    return p;
  });

  if (wasGoverning) {
    const episode = await db.treatmentEpisode.findUnique({ where: { id: plan.episodeId }, select: { patientId: true } });
    if (episode) await syncPatientStatus(episode.patientId);
  }

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "PLAN_DISCONTINUED", entityType: "TreatmentPlan", entityId: plan.id,
    reason,
    previousValues: { status: plan.status, version: plan.version },
    newValues: { status: "DISCONTINUED" },
  });

  return json(updated);
});
