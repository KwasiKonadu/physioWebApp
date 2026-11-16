// ============ /api/discharges/episodes — episode picker for initiating discharges ============
import { db, route, json, getQuery, requireAuth, tokenizedSearchAnd } from "@/server/api-exports";
import { Prisma } from "@prisma/client";

// Open statuses only — closed (DISCHARGED / DISCONTINUED) episodes cannot be discharged
const OPEN_STATUSES = ["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "AWAITING_PLAN", "ACTIVE_TREATMENT", "ON_HOLD", "UNDER_REVIEW"];

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
            { title: { contains: t, mode: "insensitive" } },
            { patient: { OR: [
              { firstName: { contains: t, mode: "insensitive" } },
              { middleName: { contains: t, mode: "insensitive" } },
              { lastName: { contains: t, mode: "insensitive" } },
              { patientCode: { contains: t, mode: "insensitive" } },
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
