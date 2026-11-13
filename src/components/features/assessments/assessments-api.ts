"use client";
// ============ Assessments module: typed client API helpers + shared hooks ============
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export interface ListRes<T> { items: T[]; total: number; page: number; pageSize: number }

export interface PatientLite {
  id: string; patientCode?: string | null; firstName?: string | null; lastName?: string | null;
  currentStatus?: string | null; phone?: string | null;
}
export interface EpisodeLite {
  id: string; title?: string | null; status?: string | null; episodeNumber?: number;
  openedDate?: string | null; patient?: PatientLite | null; therapist?: { firstName?: string; lastName?: string } | null;
}
export interface StaffLite {
  id: string; firstName: string; lastName: string; jobTitle?: string | null;
  isTherapist?: boolean; employmentStatus?: string; staffRole?: string;
}

export interface RomRow {
  id?: string;
  bodyPart: string; movement: string; side: string;
  activeRom?: number | string | null; passiveRom?: number | string | null;
  normalValue?: number | string | null; notes?: string | null;
}
export interface StrengthRow { id?: string; bodyPart: string; muscleGroup: string; side: string; grade?: number | string; notes?: string | null }
export interface FunctionalRow { id?: string; activity: string; difficulty?: number | string; notes?: string | null }

export interface TherapistInfo { id?: string; firstName?: string | null; lastName?: string | null; jobTitle?: string | null }

export interface AssessmentListItem {
  id: string; episodeId: string; therapistId: string; assessmentDate: string; status: string;
  primaryComplaint?: string | null; bodyPart?: string | null; affectedSide?: string | null;
  painCurrent?: number | null; painWorst?: number | null; painLowest?: number | null;
  completedAt?: string | null; createdAt?: string;
  episode?: EpisodeLite | null;
  therapist?: TherapistInfo | null;
  therapistName?: string | null;
  _count?: { romMeasurements?: number; strengthMeasurements?: number; functionalItems?: number };
}

export interface AssessmentDetail extends AssessmentListItem {
  duration?: string | null; onset?: string | null; cause?: string | null;
  aggravating?: string | null; relieving?: string | null;
  previousTreatment?: string | null; additionalHistory?: string | null;
  painLocation?: string | null; painType?: string | null; painFrequency?: string | null; painNotes?: string | null;
  posture?: string | null; swelling?: string | null; deformity?: string | null;
  skinCondition?: string | null; muscleWasting?: string | null; gait?: string | null;
  bloodPressure?: string | null; heartRate?: number | null; respiratoryRate?: number | null;
  temperature?: number | null; oxygenSaturation?: number | null; weightKg?: number | null; heightCm?: number | null;
  clinicalFindings?: string | null; impairments?: string | null; functionalLimitations?: string | null;
  clinicalImpression?: string | null; precautions?: string | null; additionalNotes?: string | null;
  therapistSignature?: string | null;
  romMeasurements?: RomRow[]; strengthMeasurements?: StrengthRow[]; functionalItems?: FunctionalRow[];
}

export interface DiagnosisChangeEntry { date: string; from: string; justification: string; by: string }

export interface DiagnosisListItem {
  id: string; episodeId: string; title: string; category: string;
  bodyPart?: string | null; affectedSide?: string | null; severity?: string | null;
  explanation?: string | null; provisional: boolean; diagnosisDate: string; status: string;
  therapistId: string; changeHistory?: string | null; createdAt?: string;
  episode?: EpisodeLite | null;
  therapistName?: string | null;
}

// ---- querystring builder ----
function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---- assessments ----
export function fetchAssessments(params: {
  episodeId?: string; patientId?: string; status?: string; search?: string; page?: number; pageSize?: number;
}): Promise<ListRes<AssessmentListItem>> {
  return apiFetch<ListRes<AssessmentListItem>>(`/api/assessments${qs(params)}`);
}
export function fetchAssessment(id: string): Promise<AssessmentDetail> {
  return apiFetch<AssessmentDetail>(`/api/assessments/${id}`);
}
export function createAssessment(body: Record<string, unknown>): Promise<AssessmentDetail> {
  return apiFetch<AssessmentDetail>("/api/assessments", { method: "POST", json: body });
}
export function updateAssessment(id: string, body: Record<string, unknown>): Promise<AssessmentDetail> {
  return apiFetch<AssessmentDetail>(`/api/assessments/${id}`, { method: "PATCH", json: body });
}

// ---- diagnoses ----
export function fetchDiagnoses(params: {
  episodeId?: string; patientId?: string; status?: string; category?: string; search?: string; page?: number; pageSize?: number;
}): Promise<ListRes<DiagnosisListItem>> {
  return apiFetch<ListRes<DiagnosisListItem>>(`/api/diagnoses${qs(params)}`);
}
export function createDiagnosis(body: Record<string, unknown>): Promise<DiagnosisListItem> {
  return apiFetch<DiagnosisListItem>("/api/diagnoses", { method: "POST", json: body });
}
export function updateDiagnosis(id: string, body: Record<string, unknown>): Promise<DiagnosisListItem> {
  return apiFetch<DiagnosisListItem>(`/api/diagnoses/${id}`, { method: "PATCH", json: body });
}
export function parseHistory(raw?: string | null): DiagnosisChangeEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as DiagnosisChangeEntry[]) : [];
  } catch {
    return [];
  }
}

// ---- cross-module endpoints (owned by other agents — defensively parsed, never throw) ----
function extractItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const p = payload as Record<string, unknown> | null | undefined;
  if (!p) return [];
  const arr = p.items ?? p.patients ?? p.staff ?? p.episodes ?? p.data;
  return Array.isArray(arr) ? (arr as T[]) : [];
}

export async function searchPatients(search: string): Promise<PatientLite[]> {
  try {
    const res = await apiFetch<unknown>(`/api/patients${qs({ search, page: 1, pageSize: 20 })}`);
    return extractItems<PatientLite>(res);
  } catch {
    return [];
  }
}

export interface PatientBundle { patient: PatientLite; episodes: EpisodeLite[] }

export async function fetchPatientBundle(patientId: string): Promise<PatientBundle | null> {
  try {
    const res = await apiFetch<Record<string, unknown>>(`/api/patients/${patientId}`);
    const root = (res ?? {}) as Record<string, unknown>;
    const maybePatient = (root.patient ?? root) as Record<string, unknown>;
    const rawEps = root.episodes ?? maybePatient?.episodes ?? [];
    const episodes = Array.isArray(rawEps) ? (rawEps as EpisodeLite[]) : [];
    const patient: PatientLite = {
      id: (maybePatient?.id as string) || patientId,
      patientCode: (maybePatient?.patientCode as string) ?? null,
      firstName: (maybePatient?.firstName as string) ?? "",
      lastName: (maybePatient?.lastName as string) ?? "",
      currentStatus: (maybePatient?.currentStatus as string) ?? null,
      phone: (maybePatient?.phone as string) ?? null,
    };
    return { patient, episodes };
  } catch {
    return null;
  }
}

export async function fetchTherapists(): Promise<StaffLite[]> {
  try {
    const res = await apiFetch<unknown>(`/api/staff${qs({ pageSize: 100 })}`);
    const items = extractItems<StaffLite>(res);
    return items.filter((s) => {
      const isTherapist = s.isTherapist ?? (s.staffRole ? s.staffRole === "PHYSIOTHERAPIST" : true);
      return isTherapist && (s.employmentStatus || "ACTIVE") === "ACTIVE";
    });
  } catch {
    return [];
  }
}

// Episode statuses that accept new assessments / diagnoses
export const OPEN_EPISODE_STATUSES = [
  "AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "AWAITING_PLAN", "ACTIVE_TREATMENT", "ON_HOLD", "UNDER_REVIEW",
];

// ---- small debounce hook ----
export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
