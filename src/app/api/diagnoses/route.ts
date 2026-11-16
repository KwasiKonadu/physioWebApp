// ============ /api/diagnoses: list + create clinical diagnoses ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit,
  requireAuth, requirePermission, tokenizedSearchAnd,
} from "@/server/api-exports";
import { PERMS, DIAGNOSIS_CATEGORIES, SEVERITIES, SIDES } from "@/lib/constants";
import { str, resolveTherapistId, staffNames, patientSelect } from "../assessments/_shared";

const dxCreateSchema = z.object({
  episodeId: z.string().min(1, "episodeId is required"),
  title: z.string().min(2, "Diagnosis title is required"),
  category: z.string().min(1, "Category is required"),
  bodyPart: z.string().nullish(),
  affectedSide: z.string().nullish(),
  severity: z.string().nullish(),
  explanation: z.string().nullish(),
  provisional: z.boolean().optional(),
  diagnosisDate: z.string().nullish(),
  therapistId: z.string().optional(),
});

// GET /api/diagnoses?episodeId&patientId&status&category&search&page&pageSize
export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const episodeId = getQuery(req, "episodeId");
  const patientId = getQuery(req, "patientId");
  const status = getQuery(req, "status");
  const category = getQuery(req, "category");
  const search = getQuery(req, "search");
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 20), 100);

  const where = {
    clinicId: auth.clinicId,
    ...(episodeId ? { episodeId } : {}),
    ...(patientId ? { episode: { patientId } } : {}),
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(search ? {
      AND: tokenizedSearchAnd(search, (t) => [
        { title: { contains: t, mode: "insensitive" } },
        { episode: { title: { contains: t, mode: "insensitive" } } },
        { episode: { patient: { OR: [
          { firstName: { contains: t, mode: "insensitive" } },
          { middleName: { contains: t, mode: "insensitive" } },
          { lastName: { contains: t, mode: "insensitive" } },
          { patientCode: { contains: t, mode: "insensitive" } },
        ] } } },
      ]),
    } : {}),
  };

  const [rows, total] = await Promise.all([
    db.diagnosis.findMany({
      where,
      orderBy: [{ diagnosisDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { episode: { include: { patient: patientSelect } } },
    }),
    db.diagnosis.count({ where }),
  ]);

  const names = await staffNames(auth.clinicId, rows.map((r) => r.therapistId));
  const items = rows.map((r) => ({ ...r, therapistName: names.get(r.therapistId) || null }));
  return json({ items, total, page, pageSize });
});

// POST /api/diagnoses — create a new ACTIVE diagnosis (multiple diagnoses may coexist on an episode)
export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const b = await parseBody(req, dxCreateSchema);

  if (!(DIAGNOSIS_CATEGORIES as readonly string[]).includes(b.category)) {
    throw new ApiError(400, `Invalid category — expected one of: ${DIAGNOSIS_CATEGORIES.join(", ")}`);
  }
  if (b.severity && !(SEVERITIES as readonly string[]).includes(b.severity)) {
    throw new ApiError(400, `Invalid severity — expected one of: ${SEVERITIES.join(", ")}`);
  }
  if (b.affectedSide && !(SIDES as readonly string[]).includes(b.affectedSide)) {
    throw new ApiError(400, `Invalid affected side — expected one of: ${SIDES.join(", ")}`);
  }

  const episode = await db.treatmentEpisode.findFirst({
    where: { id: b.episodeId, clinicId: auth.clinicId },
    include: { patient: patientSelect },
  });
  if (!episode) throw new ApiError(404, "Treatment episode not found");
  const therapistId = await resolveTherapistId(auth.clinicId, b.therapistId, auth.userId);

  const created = await db.diagnosis.create({
    data: {
      clinicId: auth.clinicId,
      episodeId: b.episodeId,
      title: b.title.trim(),
      category: b.category,
      bodyPart: str(b.bodyPart),
      affectedSide: str(b.affectedSide),
      severity: str(b.severity),
      explanation: str(b.explanation),
      provisional: b.provisional ?? false,
      diagnosisDate: b.diagnosisDate ? new Date(b.diagnosisDate) : new Date(),
      therapistId,
      status: "ACTIVE",
      changeHistory: "[]",
    },
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "DIAGNOSIS_ADDED", entityType: "Diagnosis", entityId: created.id,
    newValues: { title: created.title, category: created.category, episodeId: created.episodeId, provisional: created.provisional },
  });

  const names = await staffNames(auth.clinicId, [created.therapistId]);
  return json({ ...created, episode, therapistName: names.get(created.therapistId) || null }, 201);
});
