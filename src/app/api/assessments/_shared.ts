// ============ Assessments module: internal helpers shared by route handlers (not a route) ============
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, ApiError } from "@/server/api-exports";

// ---- Normalizers (SQLite: trim, empty strings -> null) ----
export function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function clampInt(v: unknown, min: number, max: number): number | null {
  const n = num(v);
  return n === null ? null : Math.min(max, Math.max(min, Math.round(n)));
}

// ---- Input schema (POST create + PATCH draft update share the same shape) ----
export const assessmentInputSchema = z.object({
  episodeId: z.string().min(1, "episodeId is required"),
  therapistId: z.string().min(1).optional(),
  status: z.enum(["DRAFT", "COMPLETED"]).optional(),
  assessmentDate: z.string().optional(),
  // Presenting complaint
  primaryComplaint: z.string().nullish(),
  bodyPart: z.string().nullish(),
  affectedSide: z.string().nullish(),
  duration: z.string().nullish(),
  onset: z.string().nullish(),
  cause: z.string().nullish(),
  aggravating: z.string().nullish(),
  relieving: z.string().nullish(),
  previousTreatment: z.string().nullish(),
  additionalHistory: z.string().nullish(),
  // Pain assessment
  painCurrent: z.number().nullish(),
  painWorst: z.number().nullish(),
  painLowest: z.number().nullish(),
  painLocation: z.string().nullish(),
  painType: z.string().nullish(),
  painFrequency: z.string().nullish(),
  painNotes: z.string().nullish(),
  // Physical examination — observation
  posture: z.string().nullish(),
  swelling: z.string().nullish(),
  deformity: z.string().nullish(),
  skinCondition: z.string().nullish(),
  muscleWasting: z.string().nullish(),
  gait: z.string().nullish(),
  // Vitals
  bloodPressure: z.string().nullish(),
  heartRate: z.number().nullish(),
  respiratoryRate: z.number().nullish(),
  temperature: z.number().nullish(),
  oxygenSaturation: z.number().nullish(),
  weightKg: z.number().nullish(),
  heightCm: z.number().nullish(),
  // Clinical findings
  clinicalFindings: z.string().nullish(),
  impairments: z.string().nullish(),
  functionalLimitations: z.string().nullish(),
  clinicalImpression: z.string().nullish(),
  precautions: z.string().nullish(),
  additionalNotes: z.string().nullish(),
  therapistSignature: z.string().nullish(),
  // Nested measurement rows
  rom: z.array(z.object({
    bodyPart: z.string().min(1, "ROM: body part is required"),
    movement: z.string().min(1, "ROM: movement is required"),
    side: z.string().min(1, "ROM: side is required"),
    activeRom: z.union([z.number(), z.string()]).nullish(),
    passiveRom: z.union([z.number(), z.string()]).nullish(),
    normalValue: z.union([z.number(), z.string()]).nullish(),
    notes: z.string().nullish(),
  })).optional(),
  strength: z.array(z.object({
    bodyPart: z.string().min(1, "Strength: body part is required"),
    muscleGroup: z.string().min(1, "Strength: muscle group is required"),
    side: z.string().min(1, "Strength: side is required"),
    grade: z.union([z.number(), z.string()]),
    notes: z.string().nullish(),
  })).optional(),
  functional: z.array(z.object({
    activity: z.string().min(1, "Functional: activity is required"),
    difficulty: z.union([z.number(), z.string()]),
    notes: z.string().nullish(),
  })).optional(),
});
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

/** PATCH: everything optional + correction controls (action/reason). */
export const assessmentPatchSchema = assessmentInputSchema.partial().extend({
  action: z.string().optional(),
  reason: z.string().nullish(),
});

// ---- Scalar field mapping (partial=true only emits provided keys — never nulls out data) ----
const TEXT_FIELDS = [
  "primaryComplaint", "bodyPart", "affectedSide", "duration", "onset", "cause",
  "aggravating", "relieving", "previousTreatment", "additionalHistory",
  "painLocation", "painType", "painFrequency", "painNotes",
  "posture", "swelling", "deformity", "skinCondition", "muscleWasting", "gait",
  "bloodPressure",
  "clinicalFindings", "impairments", "functionalLimitations", "clinicalImpression",
  "precautions", "additionalNotes", "therapistSignature",
] as const;
const PAIN_FIELDS = ["painCurrent", "painWorst", "painLowest"] as const;
const VITAL_INT_FIELDS = ["heartRate", "respiratoryRate", "oxygenSaturation"] as const;
const VITAL_FLOAT_FIELDS = ["temperature", "weightKg", "heightCm"] as const;

export function assessmentFields(b: Partial<AssessmentInput>, partial: boolean): Record<string, unknown> {
  const src = b as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (!partial || src[key] !== undefined) out[key] = value;
  };
  for (const f of TEXT_FIELDS) set(f, str(src[f]));
  for (const f of PAIN_FIELDS) set(f, clampInt(src[f], 0, 10));
  for (const f of VITAL_INT_FIELDS) set(f, clampInt(src[f], 0, 999));
  for (const f of VITAL_FLOAT_FIELDS) set(f, num(src[f]));
  return out;
}

// ---- Nested row mappers (drop incomplete rows; coerce numeric strings) ----
export function romRows(rows: AssessmentInput["rom"]) {
  return (rows || []).map((r) => ({
    bodyPart: (r.bodyPart || "").trim(),
    movement: (r.movement || "").trim(),
    side: (r.side || "").trim(),
    activeRom: num(r.activeRom),
    passiveRom: num(r.passiveRom),
    normalValue: num(r.normalValue),
    notes: str(r.notes),
  })).filter((r) => r.bodyPart && r.movement && r.side);
}

export function strengthRows(rows: AssessmentInput["strength"]) {
  return (rows || []).map((r) => ({
    bodyPart: (r.bodyPart || "").trim(),
    muscleGroup: (r.muscleGroup || "").trim(),
    side: (r.side || "").trim(),
    grade: clampInt(r.grade, 0, 5) ?? 0,
    notes: str(r.notes),
  })).filter((r) => r.bodyPart && r.muscleGroup && r.side);
}

export function functionalRows(rows: AssessmentInput["functional"]) {
  return (rows || []).map((r) => ({
    activity: (r.activity || "").trim(),
    difficulty: clampInt(r.difficulty, 0, 4) ?? 0,
    notes: str(r.notes),
  })).filter((r) => r.activity);
}

// ---- Episode lifecycle helpers (forward-only transitions) ----
const COMPLETION_SOURCE_STATUSES = ["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS"];

export function assertEpisodeOpen(status: string) {
  if (status === "DISCHARGED" || status === "DISCONTINUED") {
    throw new ApiError(409, `This episode is ${status.toLowerCase().replace(/_/g, " ")} — assessments can no longer be created or completed`);
  }
}

/**
 * Complete an assessment inside a transaction:
 * - marks COMPLETED with completedAt (idempotent)
 * - moves episode AWAITING_ASSESSMENT / ASSESSMENT_IN_PROGRESS -> AWAITING_PLAN (never downgrades other statuses)
 */
export async function completeAssessmentTx(tx: Prisma.TransactionClient, assessmentId: string) {
  const a = await tx.assessment.findUnique({
    where: { id: assessmentId },
    include: { episode: { include: { patient: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  if (!a) throw new ApiError(404, "Assessment not found");
  await tx.assessment.update({ where: { id: assessmentId }, data: { status: "COMPLETED", completedAt: new Date() } });
  let episodeMoved = false;
  if (COMPLETION_SOURCE_STATUSES.includes(a.episode.status)) {
    await tx.treatmentEpisode.update({ where: { id: a.episodeId }, data: { status: "AWAITING_PLAN" } });
    episodeMoved = true;
  }
  return {
    episodeMoved,
    patientId: a.episode.patientId,
    patientName: `${a.episode.patient.firstName} ${a.episode.patient.lastName}`,
    episodeTitle: a.episode.title,
    therapistId: a.therapistId,
  };
}

/** Draft saved on an AWAITING_ASSESSMENT episode -> ASSESSMENT_IN_PROGRESS (forward-only). */
export async function markAssessmentInProgressTx(tx: Prisma.TransactionClient, episodeId: string) {
  const ep = await tx.treatmentEpisode.findUnique({ where: { id: episodeId } });
  if (ep && ep.status === "AWAITING_ASSESSMENT") {
    await tx.treatmentEpisode.update({ where: { id: ep.id }, data: { status: "ASSESSMENT_IN_PROGRESS" } });
    return { moved: true, patientId: ep.patientId };
  }
  return { moved: false, patientId: ep?.patientId ?? null };
}

// ---- Therapist resolution (body value wins; fallback to the auth user's staff profile) ----
export async function resolveTherapistId(clinicId: string, therapistId: string | undefined, userId?: string): Promise<string> {
  if (therapistId) {
    const s = await db.staffProfile.findFirst({ where: { id: therapistId, clinicId }, select: { id: true } });
    if (!s) throw new ApiError(400, "Selected therapist not found in this clinic");
    return s.id;
  }
  if (userId) {
    const s = await db.staffProfile.findFirst({ where: { clinicId, userId, isTherapist: true }, select: { id: true } });
    if (s) return s.id;
  }
  throw new ApiError(400, "therapistId is required");
}

// ---- Shared selects & enrichment ----
export const patientSelect = { select: { id: true, patientCode: true, firstName: true, lastName: true, currentStatus: true } } as const;

export async function staffNames(clinicId: string, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = await db.staffProfile.findMany({
    where: { id: { in: uniq }, clinicId },
    select: { id: true, firstName: true, lastName: true },
  });
  return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName}`]));
}

/** Full assessment detail: nested rows + episode (patient) + therapist profile. */
export async function assessmentDetail(id: string, clinicId: string) {
  const a = await db.assessment.findFirst({
    where: { id, clinicId },
    include: {
      episode: {
        include: {
          patient: patientSelect,
          therapist: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      romMeasurements: true,
      strengthMeasurements: true,
      functionalItems: true,
    },
  });
  if (!a) throw new ApiError(404, "Assessment not found");
  const therapist = await db.staffProfile.findUnique({
    where: { id: a.therapistId },
    select: { id: true, firstName: true, lastName: true, jobTitle: true },
  });
  return { ...a, therapist };
}
