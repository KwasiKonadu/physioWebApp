// ============ Treatment Plans: client API helpers ============
import { apiFetch } from "@/lib/api-client";
import type {
  EpisodeOptionDto, PatientOptionDto, PlanListResponse, TreatmentPlanDto,
} from "./types";

export type PlanListParams = {
  page?: number;
  pageSize?: number;
  status?: string;
  episodeId?: string;
  patientId?: string;
  search?: string;
}

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface CreatePlanPayload {
  episodeId: string;
  status: "DRAFT" | "ACTIVE";
  sessionsPerWeek?: number | null;
  expectedTotalSessions?: number | null;
  sessionDurationMin?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  reviewThresholdSessions?: number | null;
  objectives: Record<string, unknown>[];
  milestones: Record<string, unknown>[];
  interventions: Record<string, unknown>[];
  precautions?: Record<string, string | null>;
}

export const plansApi = {
  list: (params: PlanListParams = {}) => apiFetch<PlanListResponse>(`/api/plans${qs(params)}`),
  detail: (id: string) => apiFetch<TreatmentPlanDto>(`/api/plans/${id}`),
  create: (payload: CreatePlanPayload) => apiFetch<TreatmentPlanDto>("/api/plans", { method: "POST", json: payload }),
  update: (id: string, payload: Record<string, unknown>) => apiFetch<TreatmentPlanDto>(`/api/plans/${id}`, { method: "PATCH", json: payload }),
  activate: (id: string) => apiFetch<TreatmentPlanDto>(`/api/plans/${id}/activate`, { method: "POST" }),
  revise: (id: string, payload: Record<string, unknown>) => apiFetch<TreatmentPlanDto>(`/api/plans/${id}/revise`, { method: "POST", json: payload }),
  discontinue: (id: string, reason: string) => apiFetch<TreatmentPlanDto>(`/api/plans/${id}/discontinue`, { method: "POST", json: { reason } }),
};

/**
 * Patient search via the patients module API. The patients module is owned by another
 * agent — normalize the common response shapes defensively.
 */
export async function searchPatients(search: string): Promise<PatientOptionDto[]> {
  const res = await apiFetch<Record<string, unknown>>(`/api/patients${qs({ search, pageSize: 50, page: 1 })}`);
  const items =
    (res?.items as PatientOptionDto[] | undefined) ??
    ((res?.patient as { items?: PatientOptionDto[] } | undefined)?.items) ??
    ((res?.data as { items?: PatientOptionDto[] } | undefined)?.items) ??
    (Array.isArray(res) ? (res as PatientOptionDto[]) : []);
  return items || [];
}

/** Open episodes (not discharged/discontinued) for a patient, via the patients module API. */
export async function fetchPatientEpisodes(patientId: string): Promise<EpisodeOptionDto[]> {
  const res = await apiFetch<Record<string, unknown>>(`/api/patients/${patientId}`);
  const candidates: unknown[] = [
    res?.episodes,
    (res?.patient as Record<string, unknown> | undefined)?.episodes,
    (res?.data as Record<string, unknown> | undefined)?.episodes,
  ];
  const raw = candidates.find((c) => Array.isArray(c)) as EpisodeOptionDto[] | undefined;
  const episodes = raw || [];
  return episodes.filter((e) => !["DISCHARGED", "DISCONTINUED"].includes(e.status));
}
