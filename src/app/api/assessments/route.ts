// ============ /api/assessments: list + create clinical assessments ============
import { Prisma } from "@prisma/client";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit, notify,
  requireAuth, requirePermission, syncPatientStatus, tokenizedSearchAnd,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import {
  assessmentInputSchema, assessmentFields, romRows, strengthRows, functionalRows,
  completeAssessmentTx, markAssessmentInProgressTx, assertEpisodeOpen, resolveTherapistId,
  assessmentDetail, staffNames, patientSelect,
} from "./_shared";

// GET /api/assessments?episodeId&patientId&status&search&page&pageSize
export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const episodeId = getQuery(req, "episodeId");
  const patientId = getQuery(req, "patientId");
  const status = getQuery(req, "status");
  const search = getQuery(req, "search");
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 20), 100);

  const where: Prisma.AssessmentWhereInput = {
    clinicId: auth.clinicId,
    ...(episodeId ? { episodeId } : {}),
    ...(patientId ? { episode: { patientId } } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      AND: tokenizedSearchAnd(search, (t) => [
        { episode: { title: { contains: t } } },
        { episode: { patient: { OR: [
          { firstName: { contains: t } },
          { middleName: { contains: t } },
          { lastName: { contains: t } },
          { patientCode: { contains: t } },
        ] } } },
        { primaryComplaint: { contains: t } },
      ]),
    } : {}),
  };

  const [rows, total] = await Promise.all([
    db.assessment.findMany({
      where,
      orderBy: { assessmentDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        episode: { include: { patient: patientSelect } },
        _count: { select: { romMeasurements: true, strengthMeasurements: true, functionalItems: true } },
      },
    }),
    db.assessment.count({ where }),
  ]);

  const names = await staffNames(auth.clinicId, rows.map((r) => r.therapistId));
  const items = rows.map((r) => ({ ...r, therapistName: names.get(r.therapistId) || null }));
  return json({ items, total, page, pageSize });
});

// POST /api/assessments — create DRAFT or COMPLETED assessment with nested measurement rows
export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const b = await parseBody(req, assessmentInputSchema);

  const episode = await db.treatmentEpisode.findFirst({
    where: { id: b.episodeId, clinicId: auth.clinicId },
    include: { patient: patientSelect },
  });
  if (!episode) throw new ApiError(404, "Treatment episode not found");
  assertEpisodeOpen(episode.status);
  const therapistId = await resolveTherapistId(auth.clinicId, b.therapistId, auth.userId);
  const status = b.status || "DRAFT";

  const result = await db.$transaction(async (tx) => {
    const created = await tx.assessment.create({
      data: {
        clinicId: auth.clinicId,
        episodeId: b.episodeId,
        therapistId,
        assessmentDate: b.assessmentDate ? new Date(b.assessmentDate) : new Date(),
        status,
        ...(status === "COMPLETED" ? { completedAt: new Date() } : {}),
        ...assessmentFields(b, false),
        ...(romRows(b.rom).length ? { romMeasurements: { create: romRows(b.rom) } } : {}),
        ...(strengthRows(b.strength).length ? { strengthMeasurements: { create: strengthRows(b.strength) } } : {}),
        ...(functionalRows(b.functional).length ? { functionalItems: { create: functionalRows(b.functional) } } : {}),
      } as Prisma.AssessmentUncheckedCreateInput,
    });

    if (status === "COMPLETED") {
      const completion = await completeAssessmentTx(tx, created.id);
      return { id: created.id, completion };
    }
    await markAssessmentInProgressTx(tx, b.episodeId);
    return { id: created.id, completion: null };
  });

  if (status === "COMPLETED" && result.completion) {
    const c = result.completion;
    await audit({
      clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
      action: "ASSESSMENT_COMPLETED", entityType: "Assessment", entityId: result.id,
      previousValues: { episodeStatus: episode.status },
      newValues: { status: "COMPLETED", episodeId: b.episodeId, therapistId },
    });
    await notify({
      clinicId: auth.clinicId,
      audienceRole: "PHYSIOTHERAPIST",
      type: "ASSESSMENT_COMPLETED",
      title: "Assessment completed",
      message: `${auth.name} completed the assessment for ${c.patientName} — "${c.episodeTitle}". Episode is awaiting a treatment plan.`,
      entityType: "Assessment",
      entityId: result.id,
    });
  } else {
    await audit({
      clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
      action: "DRAFT_SAVED", entityType: "Assessment", entityId: result.id,
      newValues: { status: "DRAFT", episodeId: b.episodeId, therapistId },
    });
  }
  await syncPatientStatus(episode.patientId);

  const detail = await assessmentDetail(result.id, auth.clinicId);
  return json(detail, 201);
});
