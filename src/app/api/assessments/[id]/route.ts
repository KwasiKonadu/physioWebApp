// ============ /api/assessments/[id]: detail + draft updates + completion + correction flow ============
import { Prisma } from "@prisma/client";
import {
  db, route, json, parseBody, getQuery, ApiError, audit, notify,
  requireAuth, requirePermission, syncPatientStatus,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import {
  str, assessmentPatchSchema, assessmentFields, romRows, strengthRows, functionalRows,
  completeAssessmentTx, markAssessmentInProgressTx, assertEpisodeOpen, resolveTherapistId,
  assessmentDetail, patientSelect, type AssessmentInput,
} from "../_shared";

// GET /api/assessments/:id — full detail with nested rows
export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  return json(await assessmentDetail(id, auth.clinicId));
});

// PATCH /api/assessments/:id
// - DRAFT: update fields / replace nested rows / complete
// - COMPLETED: immutable, except action="correct" with { reason } -> new DRAFT copy + audit trail
export const PATCH = route(async (req, ctx) => {
  const { id } = await ctx.params;
  const auth = requirePermission(req, PERMS.clinicalManage);
  const b = await parseBody(req, assessmentPatchSchema);

  const existing = await db.assessment.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { episode: { include: { patient: patientSelect } } },
  });
  if (!existing) throw new ApiError(404, "Assessment not found");

  // ---- Correction flow (completed assessments are immutable) ----
  if (existing.status === "COMPLETED") {
    if (b.action !== "correct") {
      throw new ApiError(409, "Completed assessments are immutable. Use action \"correct\" with a reason to start a correction draft.");
    }
    const reason = str(b.reason);
    if (!reason) throw new ApiError(400, "A reason is required to correct a completed assessment");

    const newId = await db.$transaction(async (tx) => {
      const old = await tx.assessment.findUnique({
        where: { id },
        include: { romMeasurements: true, strengthMeasurements: true, functionalItems: true },
      });
      if (!old || old.status !== "COMPLETED") throw new ApiError(409, "Assessment is no longer completed");
      const created = await tx.assessment.create({
        data: {
          clinicId: old.clinicId,
          episodeId: old.episodeId,
          therapistId: old.therapistId,
          assessmentDate: new Date(),
          status: "DRAFT",
          ...assessmentFields(old as unknown as Partial<AssessmentInput>, false),
          romMeasurements: { create: old.romMeasurements.map((r) => ({
            bodyPart: r.bodyPart, movement: r.movement, side: r.side,
            activeRom: r.activeRom, passiveRom: r.passiveRom, normalValue: r.normalValue, notes: r.notes,
          })) },
          strengthMeasurements: { create: old.strengthMeasurements.map((s) => ({
            bodyPart: s.bodyPart, muscleGroup: s.muscleGroup, side: s.side, grade: s.grade, notes: s.notes,
          })) },
          functionalItems: { create: old.functionalItems.map((f) => ({
            activity: f.activity, difficulty: f.difficulty, notes: f.notes,
          })) },
        } as Prisma.AssessmentUncheckedCreateInput,
      });
      return created.id;
    });

    await audit({
      clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
      action: "ASSESSMENT_CORRECTION", entityType: "Assessment", entityId: id,
      reason,
      newValues: { correctionDraftId: newId, originalAssessmentId: id, originalStatus: "COMPLETED" },
    });
    return json(await assessmentDetail(newId, auth.clinicId), 201);
  }

  // ---- Draft update / completion ----
  if (b.action === "correct") throw new ApiError(400, "action \"correct\" applies to completed assessments only");
  if (b.episodeId && b.episodeId !== existing.episodeId) {
    throw new ApiError(400, "An assessment cannot be moved to a different episode");
  }
  const completing = b.status === "COMPLETED";
  if (completing) assertEpisodeOpen(existing.episode.status);
  const therapistId = b.therapistId
    ? await resolveTherapistId(auth.clinicId, b.therapistId, auth.userId)
    : existing.therapistId;

  await db.$transaction(async (tx) => {
    const data = {
      ...assessmentFields(b, true),
      therapistId,
    } as Prisma.AssessmentUncheckedUpdateInput;
    if (completing) {
      data.status = "COMPLETED";
      data.completedAt = new Date();
    }
    if (b.rom) {
      await tx.romMeasurement.deleteMany({ where: { assessmentId: id } });
      const rows = romRows(b.rom);
      if (rows.length) data.romMeasurements = { create: rows };
    }
    if (b.strength) {
      await tx.strengthMeasurement.deleteMany({ where: { assessmentId: id } });
      const rows = strengthRows(b.strength);
      if (rows.length) data.strengthMeasurements = { create: rows };
    }
    if (b.functional) {
      await tx.functionalAssessmentItem.deleteMany({ where: { assessmentId: id } });
      const rows = functionalRows(b.functional);
      if (rows.length) data.functionalItems = { create: rows };
    }
    await tx.assessment.update({ where: { id }, data });

    if (completing) {
      await completeAssessmentTx(tx, id);
    } else {
      await markAssessmentInProgressTx(tx, existing.episodeId);
    }
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: completing ? "ASSESSMENT_COMPLETED" : "DRAFT_SAVED",
    entityType: "Assessment", entityId: id,
    previousValues: { status: existing.status },
    newValues: { status: completing ? "COMPLETED" : "DRAFT", episodeId: existing.episodeId, therapistId },
  });

  if (completing) {
    const pName = `${existing.episode.patient.firstName} ${existing.episode.patient.lastName}`;
    await notify({
      clinicId: auth.clinicId,
      audienceRole: "PHYSIOTHERAPIST",
      type: "ASSESSMENT_COMPLETED",
      title: "Assessment completed",
      message: `${auth.name} completed the assessment for ${pName} — "${existing.episode.title}". Episode is awaiting a treatment plan.`,
      entityType: "Assessment",
      entityId: id,
    });
  }
  await syncPatientStatus(existing.episode.patientId);

  return json(await assessmentDetail(id, auth.clinicId));
});
