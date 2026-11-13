// ============ /api/diagnoses/[id]: detail + revise (supersede) + provisional minor update ============
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit,
  requireAuth, requirePermission, parseJson,
} from "@/server/api-exports";
import { PERMS, DIAGNOSIS_CATEGORIES, SEVERITIES, SIDES } from "@/lib/constants";
import { str, resolveTherapistId, staffNames, patientSelect } from "../../assessments/_shared";

interface HistoryEntry { date: string; from: string; justification: string; by: string }

const dxPatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("revise"),
    title: z.string().min(2).optional(),
    category: z.string().optional(),
    bodyPart: z.string().nullish(),
    affectedSide: z.string().nullish(),
    severity: z.string().nullish(),
    explanation: z.string().nullish(),
    provisional: z.boolean().optional(),
    therapistId: z.string().optional(),
    justification: z.string().min(3, "A justification is required to revise a diagnosis"),
  }),
  z.object({
    action: z.literal("update"),
    title: z.string().min(2).optional(),
    category: z.string().optional(),
    bodyPart: z.string().nullish(),
    affectedSide: z.string().nullish(),
    severity: z.string().nullish(),
    explanation: z.string().nullish(),
    provisional: z.boolean().optional(),
    justification: z.string().nullish(),
  }),
]);

function validateEnumFields(b: { category?: string; severity?: string | null; affectedSide?: string | null }) {
  if (b.category !== undefined && !(DIAGNOSIS_CATEGORIES as readonly string[]).includes(b.category)) {
    throw new ApiError(400, `Invalid category — expected one of: ${DIAGNOSIS_CATEGORIES.join(", ")}`);
  }
  if (b.severity && !(SEVERITIES as readonly string[]).includes(b.severity)) {
    throw new ApiError(400, `Invalid severity — expected one of: ${SEVERITIES.join(", ")}`);
  }
  if (b.affectedSide && !(SIDES as readonly string[]).includes(b.affectedSide)) {
    throw new ApiError(400, `Invalid affected side — expected one of: ${SIDES.join(", ")}`);
  }
}

// GET /api/diagnoses/:id
export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  const dx = await db.diagnosis.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { episode: { include: { patient: patientSelect } } },
  });
  if (!dx) throw new ApiError(404, "Diagnosis not found");
  const names = await staffNames(auth.clinicId, [dx.therapistId]);
  return json({ ...dx, therapistName: names.get(dx.therapistId) || null });
});

// PATCH /api/diagnoses/:id
// - action "revise": supersede the active record and create a new ACTIVE one (justification required)
// - action "update": minor edits allowed only while the diagnosis is provisional
export const PATCH = route(async (req, ctx) => {
  const { id } = await ctx.params;
  const auth = requirePermission(req, PERMS.clinicalManage);
  const b = await parseBody(req, dxPatchSchema);

  const old = await db.diagnosis.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { episode: { include: { patient: patientSelect } } },
  });
  if (!old) throw new ApiError(404, "Diagnosis not found");
  validateEnumFields(b);

  const history = parseJson<HistoryEntry[]>(old.changeHistory, []);

  if (b.action === "revise") {
    const justification = b.justification.trim();
    const therapistId = b.therapistId
      ? await resolveTherapistId(auth.clinicId, b.therapistId, auth.userId)
      : old.therapistId;

    const created = await db.$transaction(async (tx) => {
      await tx.diagnosis.update({
        where: { id },
        data: {
          status: "SUPERSEDED",
          changeHistory: JSON.stringify([
            ...history,
            { date: new Date().toISOString(), from: old.title, justification, by: auth.name },
          ] satisfies HistoryEntry[]),
        },
      });
      return tx.diagnosis.create({
        data: {
          clinicId: old.clinicId,
          episodeId: old.episodeId,
          title: b.title !== undefined ? b.title.trim() : old.title,
          category: b.category !== undefined ? b.category : old.category,
          bodyPart: b.bodyPart !== undefined ? str(b.bodyPart) : old.bodyPart,
          affectedSide: b.affectedSide !== undefined ? str(b.affectedSide) : old.affectedSide,
          severity: b.severity !== undefined ? str(b.severity) : old.severity,
          explanation: b.explanation !== undefined ? str(b.explanation) : old.explanation,
          provisional: b.provisional !== undefined ? b.provisional : old.provisional,
          diagnosisDate: new Date(),
          therapistId,
          status: "ACTIVE",
          changeHistory: "[]",
        },
      });
    });

    await audit({
      clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
      action: "DIAGNOSIS_REVISED", entityType: "Diagnosis", entityId: id,
      reason: justification,
      previousValues: { id: old.id, title: old.title, status: old.status },
      newValues: { revisedToId: created.id, revisedTitle: created.title, episodeId: old.episodeId },
    });

    const names = await staffNames(auth.clinicId, [created.therapistId]);
    return json({ ...created, episode: old.episode, therapistName: names.get(created.therapistId) || null }, 201);
  }

  // action "update" — provisional diagnoses only
  if (!old.provisional) {
    throw new ApiError(409, "Only provisional diagnoses can be edited directly. Use action \"revise\" to record a formal change.");
  }

  const data: Prisma.DiagnosisUncheckedUpdateInput = {};
  if (b.title !== undefined) data.title = b.title.trim();
  if (b.category !== undefined) data.category = b.category;
  if (b.bodyPart !== undefined) data.bodyPart = str(b.bodyPart);
  if (b.affectedSide !== undefined) data.affectedSide = str(b.affectedSide);
  if (b.severity !== undefined) data.severity = str(b.severity);
  if (b.explanation !== undefined) data.explanation = str(b.explanation);
  if (b.provisional !== undefined) data.provisional = b.provisional;
  data.changeHistory = JSON.stringify([
    ...history,
    { date: new Date().toISOString(), from: old.title, justification: str(b.justification) || "Minor update to provisional diagnosis", by: auth.name },
  ] satisfies HistoryEntry[]);

  const updated = await db.diagnosis.update({ where: { id }, data });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "DIAGNOSIS_UPDATED", entityType: "Diagnosis", entityId: id,
    previousValues: { title: old.title, severity: old.severity, provisional: old.provisional },
    newValues: { title: updated.title, severity: updated.severity, provisional: updated.provisional },
  });

  const names = await staffNames(auth.clinicId, [updated.therapistId]);
  return json({ ...updated, episode: old.episode, therapistName: names.get(updated.therapistId) || null });
});

// DELETE is intentionally not allowed — diagnoses are superseded via PATCH action "revise"
export const DELETE = route(async () => {
  throw new ApiError(405, "Diagnosis records cannot be deleted. Revise the diagnosis instead to preserve the clinical audit trail.");
});
