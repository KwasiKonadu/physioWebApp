// ============ /api/reviews/episodes — episode picker for starting (early) reviews ============
import { db, route, json, getQuery, requireAuth, tokenizedSearchAnd } from "@/server/api-exports";
import { Prisma } from "@prisma/client";

const OPEN_STATUSES = ["ACTIVE_TREATMENT", "UNDER_REVIEW", "ON_HOLD", "AWAITING_PLAN", "ASSESSMENT_IN_PROGRESS"];

export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const q = getQuery(req, "q");
  const patientId = getQuery(req, "patientId");
  const episodeId = getQuery(req, "episodeId");

  const where: Prisma.TreatmentEpisodeWhereInput = {
    clinicId: auth.clinicId,
    status: { in: OPEN_STATUSES },
    ...(patientId ? { patientId } : {}),
    ...(episodeId ? { id: episodeId } : {}),
    ...(q
      ? {
          AND: tokenizedSearchAnd(q, (t) => [
            { title: { contains: t } },
            { patient: { OR: [
              { firstName: { contains: t } },
              { middleName: { contains: t } },
              { lastName: { contains: t } },
              { patientCode: { contains: t } },
            ] } },
          ]),
        }
      : {}),
  };

  const items = await db.treatmentEpisode.findMany({
    where,
    orderBy: { openedDate: "desc" },
    take: 20,
    include: {
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
      therapist: { select: { firstName: true, lastName: true } },
    },
  });

  return json({
    items: items.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      openedDate: e.openedDate,
      totalCompletedSessions: e.totalCompletedSessions,
      sessionsSinceReview: e.sessionsSinceReview,
      reviewThreshold: e.reviewThreshold,
      reviewDue: e.reviewDue,
      patient: e.patient,
      therapist: e.therapist,
    })),
  });
});
