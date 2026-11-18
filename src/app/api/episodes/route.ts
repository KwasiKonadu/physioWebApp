// ============ Episodes: list (used by pickers, e.g. the New session dialog) ============
import {
  db, route, json, getQuery, getQueryInt, requireAuth,
} from "@/server/api-exports";

// GET /api/episodes?patientId=&status=&pageSize=
export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const patientId = getQuery(req, "patientId");
  const status = getQuery(req, "status");
  const pageSize = Math.min(100, Math.max(1, getQueryInt(req, "pageSize", 50)));

  const items = await db.treatmentEpisode.findMany({
    where: {
      clinicId: auth.clinicId,
      ...(patientId ? { patientId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ openedDate: "desc" }],
    take: pageSize,
    select: {
      id: true, title: true, status: true, episodeNumber: true, therapistId: true,
      patientId: true, openedDate: true,
    },
  });
  return json({ items });
});
