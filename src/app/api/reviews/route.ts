// ============ /api/reviews — list progress reviews + due episodes; initiate a review ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit,
  requireAuth, requirePermission,
} from "@/server/api-exports";
import { PERMS, REVIEW_STATUSES } from "@/lib/constants";
import { buildClinicalBaseline } from "./_lib/baseline";

// GET: params: episodeId?, patientId?, status?, page, pageSize
export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(100, Math.max(1, getQueryInt(req, "pageSize", 10)));
  const episodeId = getQuery(req, "episodeId");
  const patientId = getQuery(req, "patientId");
  const status = getQuery(req, "status");

  const where = {
    clinicId: auth.clinicId,
    ...(episodeId ? { episodeId } : {}),
    ...(status && (REVIEW_STATUSES as readonly string[]).includes(status) ? { status } : {}),
    ...(patientId ? { episode: { patientId } } : {}),
  };

  const [items, total, draftCount, completedCount] = await Promise.all([
    db.progressReview.findMany({
      where,
      orderBy: { reviewDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        episode: {
          select: {
            id: true, title: true, status: true,
            patient: { select: { patientCode: true, firstName: true, lastName: true } },
            therapist: { select: { firstName: true, lastName: true } },
          },
        },
        plan: { select: { version: true, status: true } },
      },
    }),
    db.progressReview.count({ where }),
    db.progressReview.count({ where: { clinicId: auth.clinicId, status: "DRAFT" } }),
    db.progressReview.count({
      where: { clinicId: auth.clinicId, status: "COMPLETED", completedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  // Due episodes: reviewDue flag OR active-treatment threshold reached
  const candidates = await db.treatmentEpisode.findMany({
    where: {
      clinicId: auth.clinicId,
      status: { in: ["ACTIVE_TREATMENT", "UNDER_REVIEW", "ON_HOLD", "AWAITING_PLAN", "ASSESSMENT_IN_PROGRESS"] },
      OR: [{ reviewDue: true }, { status: "ACTIVE_TREATMENT" }],
    },
    orderBy: { openedDate: "asc" },
    include: {
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
      therapist: { select: { firstName: true, lastName: true } },
    },
  });
  const due = candidates.filter(
    (e) => e.reviewDue || (e.status === "ACTIVE_TREATMENT" && e.sessionsSinceReview >= e.reviewThreshold)
  );
  const episodeIds = due.map((e) => e.id);
  const recentReviews = episodeIds.length
    ? await db.progressReview.findMany({
        where: { episodeId: { in: episodeIds } },
        orderBy: { reviewDate: "desc" },
        select: { id: true, episodeId: true, reviewDate: true, status: true },
      })
    : [];
  const lastByEpisode = new Map<string, { id: string; reviewDate: Date; status: string }>();
  const draftByEpisode = new Map<string, string>();
  for (const r of recentReviews) {
    if (!lastByEpisode.has(r.episodeId)) lastByEpisode.set(r.episodeId, { id: r.id, reviewDate: r.reviewDate, status: r.status });
    if (r.status === "DRAFT" && !draftByEpisode.has(r.episodeId)) draftByEpisode.set(r.episodeId, r.id);
  }

  const dueEpisodes = due.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    patient: e.patient,
    therapist: e.therapist,
    totalCompletedSessions: e.totalCompletedSessions,
    sessionsSinceReview: e.sessionsSinceReview,
    reviewThreshold: e.reviewThreshold,
    reviewDue: e.reviewDue,
    lastReviewDate: lastByEpisode.get(e.id)?.reviewDate ?? null,
    draftReviewId: draftByEpisode.get(e.id) ?? null,
  }));

  return json({
    items, total, page, pageSize,
    dueEpisodes,
    stats: { due: dueEpisodes.length, draft: draftCount, completed: completedCount },
  });
});

// POST: initiate a review (threshold-triggered or early)
const initiateSchema = z.object({
  episodeId: z.string().min(1, "episodeId is required"),
  triggerSessions: z.number().int().min(0).optional(),
  reviewDate: z.string().optional(),
  early: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const body = await parseBody(req, initiateSchema);

  const episode = await db.treatmentEpisode.findFirst({
    where: { id: body.episodeId, clinicId: auth.clinicId },
    include: { plans: { orderBy: { version: "desc" }, take: 1, select: { id: true } } },
  });
  if (!episode) throw new ApiError(404, "Treatment episode not found");
  if (["DISCHARGED", "DISCONTINUED"].includes(episode.status)) {
    throw new ApiError(409, "Cannot start a review on a closed episode");
  }

  const baseline = await buildClinicalBaseline(episode.id, auth.clinicId);
  const review = await db.progressReview.create({
    data: {
      clinicId: auth.clinicId,
      episodeId: episode.id,
      planId: episode.plans[0]?.id ?? null,
      triggerSessions: body.triggerSessions ?? episode.sessionsSinceReview,
      reviewDate: body.reviewDate ? new Date(body.reviewDate) : new Date(),
      status: "DRAFT",
      comparison: JSON.stringify(baseline.comparison),
    },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "REVIEW_INITIATED",
    entityType: "ProgressReview",
    entityId: review.id,
    newValues: { episodeId: episode.id, triggerSessions: review.triggerSessions, early: body.early || false, reason: body.reason || null },
  });

  return json({ review, baseline }, 201);
});
