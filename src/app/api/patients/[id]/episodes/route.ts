// ============ Patient episodes: open a new treatment episode ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit, requirePermission, getSetting, syncPatientStatus,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

// ---- helpers ----
const optStr = (max = 255) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().max(max).optional());

const createEpisodeSchema = z.object({
  title: z.string().trim().min(1, "Episode title is required").max(160),
  therapistId: optStr(64),
  branchId: optStr(64),
  notes: optStr(2000),
});

// POST /api/patients/[id]/episodes
export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, createEpisodeSchema);

  const patient = await db.patient.findFirst({
    where: { id, clinicId: auth.clinicId },
    select: { id: true, patientCode: true, firstName: true, lastName: true },
  });
  if (!patient) throw new ApiError(404, "Patient not found");

  // assigned therapist, when provided, must belong to this clinic
  if (body.therapistId) {
    const therapist = await db.staffProfile.findFirst({
      where: { id: body.therapistId, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!therapist) throw new ApiError(400, "Selected therapist is invalid");
  }

  const thresholdRaw = await getSetting(auth.clinicId, "reviewThreshold", "15");
  const reviewThreshold = Math.max(1, parseInt(thresholdRaw, 10) || 15);

  const episode = await db.$transaction(async (tx) => {
    const last = await tx.treatmentEpisode.findFirst({
      where: { patientId: id },
      orderBy: { episodeNumber: "desc" },
      select: { episodeNumber: true },
    });
    const episodeNumber = (last?.episodeNumber ?? 0) + 1;
    return tx.treatmentEpisode.create({
      data: {
        clinicId: auth.clinicId,
        patientId: id,
        episodeNumber,
        title: body.title,
        status: "AWAITING_ASSESSMENT",
        therapistId: body.therapistId ?? null,
        branchId: body.branchId ?? null,
        notes: body.notes ?? null,
        reviewThreshold,
      },
      include: { therapist: { select: { id: true, firstName: true, lastName: true } } },
    });
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "EPISODE_OPENED",
    entityType: "TreatmentEpisode",
    entityId: episode.id,
    newValues: {
      patientId: id,
      patientCode: patient.patientCode,
      episodeNumber: episode.episodeNumber,
      title: body.title,
      therapistId: body.therapistId ?? null,
      reviewThreshold,
    },
  });

  await syncPatientStatus(id);

  return json(episode, 201);
});
