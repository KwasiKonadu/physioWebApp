// ============ /api/discharges — list discharge records; initiate a discharge ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit,
  requireAuth, requirePermission,
} from "@/server/api-exports";
import { PERMS, DISCHARGE_REASONS, DISCHARGE_STATUSES } from "@/lib/constants";
import { buildClinicalBaseline } from "@/app/api/reviews/_lib/baseline";

// GET: params: patientId?, episodeId?, status?, page, pageSize
export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(100, Math.max(1, getQueryInt(req, "pageSize", 10)));
  const patientId = getQuery(req, "patientId");
  const episodeId = getQuery(req, "episodeId");
  const status = getQuery(req, "status");

  const where = {
    clinicId: auth.clinicId,
    ...(patientId ? { patientId } : {}),
    ...(episodeId ? { episodeId } : {}),
    ...(status && (DISCHARGE_STATUSES as readonly string[]).includes(status) ? { status } : {}),
  };

  const [items, total, draftCount, pendingCount, completedCount] = await Promise.all([
    db.discharge.findMany({
      where,
      orderBy: { dischargeDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
        episode: { select: { id: true, title: true, status: true } },
      },
    }),
    db.discharge.count({ where }),
    db.discharge.count({ where: { clinicId: auth.clinicId, status: "DRAFT" } }),
    db.discharge.count({ where: { clinicId: auth.clinicId, status: "PENDING_SIGNOFF" } }),
    db.discharge.count({ where: { clinicId: auth.clinicId, status: "COMPLETED" } }),
  ]);

  return json({
    items, total, page, pageSize,
    stats: { draft: draftCount, pending: pendingCount, completed: completedCount },
  });
});

// POST: initiate a discharge record (therapist-led; outstanding payments never block)
const initiateSchema = z.object({
  episodeId: z.string().min(1, "episodeId is required"),
  reason: z.enum(DISCHARGE_REASONS, { message: "A discharge reason is required" }),
  dischargeDate: z.string().optional(),
  finalAssessment: z.string().max(5000).optional(),
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const body = await parseBody(req, initiateSchema);

  const episode = await db.treatmentEpisode.findFirst({
    where: { id: body.episodeId, clinicId: auth.clinicId },
  });
  if (!episode) throw new ApiError(404, "Treatment episode not found");
  if (["DISCHARGED", "DISCONTINUED"].includes(episode.status)) {
    throw new ApiError(409, "This episode is already closed — a discharge record cannot be started");
  }

  const therapistId =
    episode.therapistId ||
    (await db.staffProfile.findFirst({ where: { clinicId: auth.clinicId, userId: auth.userId }, select: { id: true } }))?.id;
  if (!therapistId) throw new ApiError(400, "Episode has no assigned therapist — assign a therapist before discharge");

  const baseline = await buildClinicalBaseline(episode.id, auth.clinicId);
  const discharge = await db.discharge.create({
    data: {
      clinicId: auth.clinicId,
      episodeId: episode.id,
      patientId: episode.patientId,
      therapistId,
      dischargeDate: body.dischargeDate ? new Date(body.dischargeDate) : new Date(),
      status: "DRAFT",
      reason: body.reason,
      finalAssessment: body.finalAssessment ?? null,
      baselineComparison: JSON.stringify(baseline.comparison),
    },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "DISCHARGE_INITIATED",
    entityType: "Discharge",
    entityId: discharge.id,
    newValues: { episodeId: episode.id, reason: body.reason },
  });

  return json({ discharge, baseline }, 201);
});
