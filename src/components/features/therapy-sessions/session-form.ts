// Session documentation: types, form schema and payload helpers.
import { z } from "zod";
import { PLAN_INTERVENTIONS } from "@/lib/constants";
export const CUSTOM = "__custom__";
export const UNSET = "__none__";
export const EDITABLE_STATUSES = ["PLANNED", "IN_PROGRESS"];

// ---- Vitals ----
export type VitalPhase = "START" | "END";
export interface SessionVital { id?: string; phase: VitalPhase; name: string; value: string; unit: string | null }

/** Selectable vital signs (name, unit, input hint). "Other" lets the user type any name. */
export const VITAL_TYPES = [
  { name: "Blood pressure", unit: "mmHg", hint: "e.g. 120/80" },
  { name: "Heart rate", unit: "bpm", hint: "e.g. 72" },
  { name: "Respiratory rate", unit: "breaths/min", hint: "e.g. 16" },
  { name: "SpO₂", unit: "%", hint: "e.g. 98" },
  { name: "Temperature", unit: "°C", hint: "e.g. 36.8" },
  { name: "Blood glucose", unit: "mmol/L", hint: "e.g. 5.4" },
  { name: "Weight", unit: "kg", hint: "e.g. 70" },
] as const;
export const OTHER_VITAL = "__other__";

// ---- Types ----
export interface SessionDetail {
  id: string;
  episodeId: string;
  patientId: string;
  therapistId: string;
  appointmentId: string | null;
  date: string;
  timeMin: number | null;
  durationMin: number | null;
  status: string;
  painLevel: number | null;
  painLevelEnd: number | null;
  vitals: SessionVital[];
  patientResponse: string | null;
  observations: string | null;
  notes: string | null;
  therapistSignature: string | null;
  completedAt: string | null;
  updatedAt: string;
  episode: {
    id: string;
    title: string;
    status: string;
    sessionsSinceReview: number;
    reviewThreshold: number;
    reviewDue: boolean;
    patient: { id: string; patientCode: string; firstName: string; lastName: string };
  };
  patient: { id: string; patientCode: string; firstName: string; lastName: string; phone?: string | null; paymentArrangement?: string | null };
  therapist: { id?: string; firstName: string; lastName: string } | null;
  interventions: { id: string; name: string; details: string | null }[];
  appointment: { id: string; date: string; startMin: number; endMin?: number; status?: string; purpose?: string | null } | null;
}

export interface PackageTx {
  id: string;
  type: string;
  sessions: number;
  description: string | null;
  createdAt: string;
  patientPackage?: {
    totalSessions: number;
    usedSessions: number;
    package?: { name?: string; sessions?: number } | null;
  } | null;
}

export interface DetailResponse {
  session: SessionDetail;
  packageTransactions: PackageTx[];
}

export interface CompleteResponse {
  session: SessionDetail;
  reviewDue: boolean;
  packageInfo: { deducted: boolean; remaining?: number | null };
  sessionsSinceReview: number;
  threshold: number;
  packageTransactions: PackageTx[];
}

// ---- Documentation form helpers ----
export const formSchema = z.object({
  painLevel: z.number().min(0).max(10).nullable(),
  painLevelEnd: z.number().min(0).max(10).nullable(),
  vitals: z.array(z.object({
    phase: z.enum(["START", "END"]),
    name: z.string().min(1).max(60),
    value: z.string().min(1).max(40),
    unit: z.string().max(20).nullable(),
  })).max(40),
  patientResponse: z.string().max(2000),
  observations: z.string().max(4000),
  notes: z.string().max(4000),
  durationMin: z.string().max(5).refine((v) => v === "" || /^\d+$/.test(v), "Duration must be a number"),
  therapistSignature: z.string().max(120),
  interventions: z.array(z.object({
    preset: z.string().min(1),
    customName: z.string().max(120),
    details: z.string().max(500),
  })).max(30),
});

export type FormValues = z.infer<typeof formSchema>;

export function buildDefaults(session: SessionDetail): FormValues {
  return {
    painLevel: session.painLevel ?? null,
    painLevelEnd: session.painLevelEnd ?? null,
    vitals: (session.vitals ?? []).map((v) => ({ phase: v.phase, name: v.name, value: v.value, unit: v.unit })),
    patientResponse: session.patientResponse ?? "",
    observations: session.observations ?? "",
    notes: session.notes ?? "",
    durationMin: session.durationMin !== null && session.durationMin !== undefined ? String(session.durationMin) : "",
    therapistSignature: session.therapistSignature ?? "",
    interventions: session.interventions.length
      ? session.interventions.map((i) => ({
          preset: (PLAN_INTERVENTIONS as readonly string[]).includes(i.name) ? i.name : CUSTOM,
          customName: (PLAN_INTERVENTIONS as readonly string[]).includes(i.name) ? "" : i.name,
          details: i.details ?? "",
        }))
      : [{ preset: UNSET, customName: "", details: "" }],
  };
}

export function rowsFrom(values: FormValues) {
  return values.interventions
    .map((r) => ({
      name: r.preset === CUSTOM ? r.customName.trim() : r.preset === UNSET ? "" : r.preset,
      details: r.details.trim() || undefined,
    }))
    .filter((r) => r.name.length > 0);
}

export function payloadFrom(values: FormValues): Record<string, unknown> {
  return {
    painLevel: values.painLevel,
    painLevelEnd: values.painLevelEnd,
    vitals: values.vitals.map((v) => ({ phase: v.phase, name: v.name.trim(), value: v.value.trim(), unit: v.unit?.trim() || null })),
    patientResponse: values.patientResponse.trim() || null,
    observations: values.observations.trim() || null,
    notes: values.notes.trim() || null,
    durationMin: values.durationMin.trim() === "" ? null : Number(values.durationMin),
    therapistSignature: values.therapistSignature.trim() || null,
    interventions: rowsFrom(values),
  };
}
