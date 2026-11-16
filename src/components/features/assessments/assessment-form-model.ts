// Assessment form: value types, section list, presets, and payload / validation helpers.
import { BODY_PARTS } from "@/lib/constants";
import * as API from "./assessments-api";

// ===================== types =====================
export interface RomFormRow { bodyPart: string; movement: string; side: string; activeRom: string; passiveRom: string; normalValue: string; notes: string }
export interface StrengthFormRow { bodyPart: string; muscleGroup: string; side: string; grade: string; notes: string }
export interface FunctionalFormRow { activity: string; difficulty: string; notes: string }

export interface FormValues {
  primaryComplaint: string; bodyPart: string; bodyPartCustom: string; affectedSide: string;
  duration: string; onset: string; cause: string; aggravating: string; relieving: string;
  previousTreatment: string; additionalHistory: string;
  painCurrent?: number; painWorst?: number; painLowest?: number;
  painLocation: string; painType: string; painFrequency: string; painNotes: string;
  posture: string; swelling: string; deformity: string; skinCondition: string; muscleWasting: string; gait: string;
  rom: RomFormRow[]; strength: StrengthFormRow[]; functional: FunctionalFormRow[];
  bloodPressure: string; heartRate: string; respiratoryRate: string; temperature: string;
  oxygenSaturation: string; weightKg: string; heightCm: string;
  clinicalFindings: string; impairments: string; functionalLimitations: string;
  clinicalImpression: string; precautions: string; additionalNotes: string; therapistSignature: string;
}

export const EMPTY_FORM: FormValues = {
  primaryComplaint: "", bodyPart: "", bodyPartCustom: "", affectedSide: "",
  duration: "", onset: "", cause: "", aggravating: "", relieving: "",
  previousTreatment: "", additionalHistory: "",
  painLocation: "", painType: "", painFrequency: "", painNotes: "",
  posture: "", swelling: "", deformity: "", skinCondition: "", muscleWasting: "", gait: "",
  rom: [], strength: [], functional: [],
  bloodPressure: "", heartRate: "", respiratoryRate: "", temperature: "", oxygenSaturation: "", weightKg: "", heightCm: "",
  clinicalFindings: "", impairments: "", functionalLimitations: "", clinicalImpression: "",
  precautions: "", additionalNotes: "", therapistSignature: "",
};

export const SECTIONS = [
  { key: "visit", label: "Visit info", icon: "CalendarDays" },
  { key: "complaint", label: "Presenting complaint", icon: "MessageSquareText" },
  { key: "pain", label: "Pain assessment", icon: "Activity" },
  { key: "exam", label: "Physical examination", icon: "Stethoscope" },
  { key: "functional", label: "Functional assessment", icon: "Accessibility" },
  { key: "vitals", label: "Vital signs", icon: "HeartPulse" },
  { key: "findings", label: "Clinical findings", icon: "ClipboardCheck" },
  { key: "review", label: "Review & complete", icon: "ListChecks" },
] as const;

// Standard (AAOS-style) normal ranges in degrees, used for quick-add sets and auto-filling "Normal"
export const ROM_PRESETS: Record<string, [string, number][]> = {
  "Cervical spine": [["Flexion", 45], ["Extension", 45], ["Lateral flexion", 45], ["Rotation", 80]],
  "Lumbar spine": [["Flexion", 60], ["Extension", 25], ["Lateral flexion", 25], ["Rotation", 30]],
  Shoulder: [["Flexion", 180], ["Extension", 60], ["Abduction", 180], ["Internal rotation", 70], ["External rotation", 90]],
  Elbow: [["Flexion", 150], ["Extension", 0], ["Supination", 80], ["Pronation", 80]],
  "Wrist/Hand": [["Flexion", 80], ["Extension", 70], ["Radial deviation", 20], ["Ulnar deviation", 30]],
  Hip: [["Flexion", 120], ["Extension", 30], ["Abduction", 45], ["Adduction", 30], ["Internal rotation", 45], ["External rotation", 45]],
  Knee: [["Flexion", 135], ["Extension", 0]],
  "Ankle/Foot": [["Dorsiflexion", 20], ["Plantarflexion", 50], ["Inversion", 35], ["Eversion", 15]],
};

export const MRC_GRADES = ["0", "1", "2", "3", "4", "5"] as const;
export const MRC_LABELS: Record<string, string> = {
  "0": "0 — No contraction", "1": "1 — Flicker/trace", "2": "2 — Active, gravity eliminated",
  "3": "3 — Active against gravity", "4": "4 — Active against resistance", "5": "5 — Normal power",
};

export function toFormValues(d: API.AssessmentDetail): FormValues {
  const bodyInList = (BODY_PARTS as readonly string[]).includes(d.bodyPart || "");
  const s = (v?: number | string | null) => (v === null || v === undefined ? "" : String(v));
  return {
    primaryComplaint: d.primaryComplaint || "",
    bodyPart: d.bodyPart ? (bodyInList ? d.bodyPart : "Other") : "",
    bodyPartCustom: bodyInList ? "" : (d.bodyPart || ""),
    affectedSide: d.affectedSide || "",
    duration: d.duration || "", onset: d.onset || "", cause: d.cause || "",
    aggravating: d.aggravating || "", relieving: d.relieving || "",
    previousTreatment: d.previousTreatment || "", additionalHistory: d.additionalHistory || "",
    painCurrent: d.painCurrent ?? undefined, painWorst: d.painWorst ?? undefined, painLowest: d.painLowest ?? undefined,
    painLocation: d.painLocation || "", painType: d.painType || "", painFrequency: d.painFrequency || "", painNotes: d.painNotes || "",
    posture: d.posture || "", swelling: d.swelling || "", deformity: d.deformity || "",
    skinCondition: d.skinCondition || "", muscleWasting: d.muscleWasting || "", gait: d.gait || "",
    rom: (d.romMeasurements || []).map((r) => ({
      bodyPart: r.bodyPart, movement: r.movement, side: r.side,
      activeRom: s(r.activeRom), passiveRom: s(r.passiveRom), normalValue: s(r.normalValue), notes: r.notes || "",
    })),
    strength: (d.strengthMeasurements || []).map((r) => ({
      bodyPart: r.bodyPart, muscleGroup: r.muscleGroup, side: r.side, grade: s(r.grade), notes: r.notes || "",
    })),
    functional: (d.functionalItems || []).map((r) => ({
      activity: r.activity, difficulty: s(r.difficulty), notes: r.notes || "",
    })),
    bloodPressure: d.bloodPressure || "",
    heartRate: s(d.heartRate), respiratoryRate: s(d.respiratoryRate), temperature: s(d.temperature),
    oxygenSaturation: s(d.oxygenSaturation), weightKg: s(d.weightKg), heightCm: s(d.heightCm),
    clinicalFindings: d.clinicalFindings || "", impairments: d.impairments || "",
    functionalLimitations: d.functionalLimitations || "", clinicalImpression: d.clinicalImpression || "",
    precautions: d.precautions || "", additionalNotes: d.additionalNotes || "", therapistSignature: d.therapistSignature || "",
  };
}

export function numOrNull(v?: string | null): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function buildPayload(v: FormValues, opts: { episodeId: string; therapistId: string; status: "DRAFT" | "COMPLETED" }): Record<string, unknown> {
  const bodyPart = v.bodyPart === "Other" ? (v.bodyPartCustom.trim() || null) : (v.bodyPart || null);
  return {
    episodeId: opts.episodeId,
    therapistId: opts.therapistId,
    status: opts.status,
    primaryComplaint: v.primaryComplaint.trim() || null,
    bodyPart,
    affectedSide: v.affectedSide || null,
    duration: v.duration.trim() || null,
    onset: v.onset || null,
    cause: v.cause.trim() || null,
    aggravating: v.aggravating.trim() || null,
    relieving: v.relieving.trim() || null,
    previousTreatment: v.previousTreatment.trim() || null,
    additionalHistory: v.additionalHistory.trim() || null,
    painCurrent: v.painCurrent ?? null,
    painWorst: v.painWorst ?? null,
    painLowest: v.painLowest ?? null,
    painLocation: v.painLocation.trim() || null,
    painType: v.painType.trim() || null,
    painFrequency: v.painFrequency.trim() || null,
    painNotes: v.painNotes.trim() || null,
    posture: v.posture.trim() || null,
    swelling: v.swelling.trim() || null,
    deformity: v.deformity.trim() || null,
    skinCondition: v.skinCondition.trim() || null,
    muscleWasting: v.muscleWasting.trim() || null,
    gait: v.gait.trim() || null,
    bloodPressure: v.bloodPressure.trim() || null,
    heartRate: numOrNull(v.heartRate),
    respiratoryRate: numOrNull(v.respiratoryRate),
    temperature: numOrNull(v.temperature),
    oxygenSaturation: numOrNull(v.oxygenSaturation),
    weightKg: numOrNull(v.weightKg),
    heightCm: numOrNull(v.heightCm),
    clinicalFindings: v.clinicalFindings.trim() || null,
    impairments: v.impairments.trim() || null,
    functionalLimitations: v.functionalLimitations.trim() || null,
    clinicalImpression: v.clinicalImpression.trim() || null,
    precautions: v.precautions.trim() || null,
    additionalNotes: v.additionalNotes.trim() || null,
    therapistSignature: v.therapistSignature.trim() || null,
    rom: (v.rom || [])
      .filter((r) => r.bodyPart.trim() && r.movement.trim() && r.side)
      .map((r) => ({
        bodyPart: r.bodyPart.trim(), movement: r.movement.trim(), side: r.side,
        activeRom: numOrNull(r.activeRom), passiveRom: numOrNull(r.passiveRom), normalValue: numOrNull(r.normalValue),
        notes: r.notes.trim() || null,
      })),
    strength: (v.strength || [])
      .filter((r) => r.bodyPart.trim() && r.muscleGroup.trim() && r.side)
      .map((r) => ({
        bodyPart: r.bodyPart.trim(), muscleGroup: r.muscleGroup.trim(), side: r.side,
        grade: Number(r.grade || 0), notes: r.notes.trim() || null,
      })),
    functional: (v.functional || [])
      .filter((r) => r.activity.trim())
      .map((r) => ({ activity: r.activity.trim(), difficulty: Number(r.difficulty || 0), notes: r.notes.trim() || null })),
  };
}

export function validateForComplete(v: FormValues): { section: number; message: string } | null {
  if (!v.primaryComplaint.trim()) return { section: 1, message: "Primary complaint is required to complete an assessment" };
  if (v.bodyPart === "Other" && !v.bodyPartCustom.trim()) return { section: 1, message: "Enter the custom body part" };
  const romIdx = (v.rom || []).findIndex((r) => (r.bodyPart || r.movement || r.side || r.activeRom || r.passiveRom || r.normalValue) && (!r.bodyPart || !r.movement || !r.side));
  if (romIdx >= 0) return { section: 3, message: `ROM row ${romIdx + 1}: body part, movement and side are required (or clear the row)` };
  const strIdx = (v.strength || []).findIndex((r) => (r.bodyPart || r.muscleGroup || r.notes) && (!r.bodyPart || !r.muscleGroup || !r.side));
  if (strIdx >= 0) return { section: 3, message: `Muscle strength row ${strIdx + 1}: body part, muscle group and side are required` };
  const fnIdx = (v.functional || []).findIndex((r) => !r.activity && r.notes);
  if (fnIdx >= 0) return { section: 4, message: `Functional row ${fnIdx + 1}: choose an activity (or clear the row)` };
  return null;
}
