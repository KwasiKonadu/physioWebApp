// ============ /api/reviews/[id]/complete — sign & complete a progress review ============
// Calls completeProgressReviewTx: sets COMPLETED, stores objective results (updating
// PlanObjective statuses), resets the episode review cycle (sessionsSinceReview=0, reviewDue=false).
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, notify,
  requirePermission, completeProgressReviewTx,
} from "@/server/api-exports";
import { PERMS, REVIEW_DECISIONS, REVIEW_RESULT_STATUSES, labelize } from "@/lib/constants";

const rowSchema = z.object({
  metric: z.string().min(1),
  baseline: z.string().max(200),
  current: z.string().max(200),
  change: z.string().max(200).optional(),
  direction: z.enum(["higher", "lower"]).optional(),
});

const objectiveResultSchema = z.object({
  objectiveId: z.string().min(1, "objectiveId is required"),
  objectiveDescription: z.string().min(1, "objectiveDescription is required"),
  baseline: z.string().max(300).nullish(),
  target: z.string().max(300).nullish(),
  current: z.string().max(300).nullish(),
  result: z.enum(REVIEW_RESULT_STATUSES),
  notes: z.string().max(1000).nullish(),
});

const completeSchema = z.object({
  painCurrent: z.number().int().min(0).max(10).nullish(),
  painWorst: z.number().int().min(0).max(10).nullish(),
  romSummary: z.string().max(4000).nullish(),
  strengthSummary: z.string().max(4000).nullish(),
  functionalSummary: z.string().max(4000).nullish(),
  vitals: z.string().max(1000).nullish(),
  newFindings: z.string().max(4000).nullish(),
  comparison: z.array(rowSchema).optional(),
  improvements: z.string().max(4000).nullish(),
  deterioration: z.string().max(4000).nullish(),
  patientResponse: z.string().max(4000).nullish(),
  observations: z.string().max(4000).nullish(),
  recommendations: z.string().max(4000).nullish(),
  decision: z.enum(REVIEW_DECISIONS, { message: "A review decision is required" }),
  decisionNotes: z.string().max(4000).nullish(),
  therapistSignature: z.string().min(2, "Therapist signature is required"),
  objectiveResults: z.array(objectiveResultSchema).optional(),
});

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, completeSchema);

  const review = await db.progressReview.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { episode: { include: { patient: { select: { firstName: true, lastName: true } } } } },
  });
  if (!review) throw new ApiError(404, "Progress review not found");
  if (review.status === "COMPLETED") throw new ApiError(409, "Review already completed");

  const { comparison, objectiveResults, decisionNotes, ...rest } = body;
  const updates: Record<string, unknown> = {
    ...rest,
    decisionNotes: decisionNotes ?? null,
    ...(comparison ? { comparison: JSON.stringify(comparison) } : {}),
  };

  // Draft objective results (saved via PATCH) are replaced by the final signed set
  if (objectiveResults) {
    await db.reviewObjectiveResult.deleteMany({ where: { reviewId: id } });
  }

  const result = await completeProgressReviewTx({
    reviewId: id,
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    updates,
    objectiveResults: objectiveResults?.map((r) => ({
      objectiveId: r.objectiveId,
      objectiveDescription: r.objectiveDescription,
      baseline: r.baseline ?? undefined,
      target: r.target ?? undefined,
      current: r.current ?? undefined,
      result: r.result,
      notes: r.notes ?? undefined,
    })),
  });

  await notify({
    clinicId: auth.clinicId,
    audienceRole: "PHYSIOTHERAPIST",
    type: "PROGRESS_REVIEW_COMPLETED",
    title: "Progress review completed",
    message: `${review.episode.patient.firstName} ${review.episode.patient.lastName} — review completed with decision: ${labelize(body.decision)}. Review counter reset.`,
    entityType: "ProgressReview",
    entityId: id,
  });

  return json({ review: result.review, episode: result.episode });
});
