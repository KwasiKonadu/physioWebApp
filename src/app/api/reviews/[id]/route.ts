// ============ /api/reviews/[id] — review detail (with baseline snapshot) & draft update ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit, parseJson,
  requireAuth, requirePermission,
} from "@/server/api-exports";
import { PERMS, REVIEW_DECISIONS, REVIEW_RESULT_STATUSES } from "@/lib/constants";
import { buildClinicalBaseline, ComparisonRow } from "../_lib/baseline";

const ctx = { params: Promise<Record<string, string>> };

// GET: full detail — review + baseline + plan objectives/milestones + diagnosis + previous reviews
export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;

  const review = await db.progressReview.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: {
      episode: {
        select: {
          id: true, title: true, status: true, totalCompletedSessions: true, sessionsSinceReview: true,
          reviewThreshold: true, reviewDue: true,
          patient: { select: { id: true, patientCode: true, firstName: true, middleName: true, lastName: true, phone: true } },
          therapist: { select: { firstName: true, lastName: true } },
        },
      },
      plan: { select: { id: true, version: true, status: true } },
      objectiveResults: { orderBy: { id: "asc" } },
    },
  });
  if (!review) throw new ApiError(404, "Progress review not found");

  const [baseline, previousReviews] = await Promise.all([
    buildClinicalBaseline(review.episodeId, auth.clinicId),
    db.progressReview.findMany({
      where: { episodeId: review.episodeId, clinicId: auth.clinicId, id: { not: review.id }, status: "COMPLETED" },
      orderBy: { reviewDate: "desc" },
      select: { id: true, reviewDate: true, decision: true, status: true, triggerSessions: true, painCurrent: true },
      take: 10,
    }),
  ]);

  return json({
    review: { ...review, comparison: parseJson<ComparisonRow[]>(review.comparison, []) },
    baseline,
    previousReviews,
  });
});

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

const patchSchema = z.object({
  reviewDate: z.string().optional(),
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
  decision: z.enum(REVIEW_DECISIONS).nullish(),
  decisionNotes: z.string().max(4000).nullish(),
  objectiveResults: z.array(objectiveResultSchema).optional(),
});

// PATCH: DRAFT only — completed reviews are immutable (Business Rule: historical preservation)
export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const review = await db.progressReview.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!review) throw new ApiError(404, "Progress review not found");
  if (review.status === "COMPLETED") throw new ApiError(409, "Completed reviews are read-only and cannot be edited");

  const { reviewDate, comparison, objectiveResults, ...rest } = body;
  const data: Record<string, unknown> = { ...rest };
  if (reviewDate) data.reviewDate = new Date(reviewDate);
  if (comparison) data.comparison = JSON.stringify(comparison);

  const updated = await db.$transaction(async (tx) => {
    const r = await tx.progressReview.update({ where: { id }, data: data as never });
    if (objectiveResults) {
      await tx.reviewObjectiveResult.deleteMany({ where: { reviewId: id } });
      for (const res of objectiveResults) {
        await tx.reviewObjectiveResult.create({
          data: {
            reviewId: id,
            objectiveId: res.objectiveId,
            objectiveDescription: res.objectiveDescription,
            baseline: res.baseline ?? null,
            target: res.target ?? null,
            current: res.current ?? null,
            result: res.result,
            notes: res.notes ?? null,
          },
        });
      }
    }
    return r;
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "REVIEW_UPDATED",
    entityType: "ProgressReview",
    entityId: id,
    newValues: { fields: Object.keys(body) },
  });

  const saved = await db.progressReview.findUnique({ where: { id }, include: { objectiveResults: { orderBy: { id: "asc" } } } });
  return json({ review: { ...saved, comparison: parseJson<ComparisonRow[]>(saved?.comparison ?? "[]", []) } });
});
