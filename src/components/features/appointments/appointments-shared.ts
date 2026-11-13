"use client";
// ============ Appointments feature: shared types, tones & data hooks ============
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { APPOINTMENT_STATUSES, labelize } from "@/lib/constants";

export interface AppointmentPatientDto {
  id?: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

export interface AppointmentDto {
  id: string;
  clinicId?: string;
  patientId: string;
  episodeId: string | null;
  therapistId: string;
  branchId?: string | null;
  date: string;
  startMin: number;
  endMin: number;
  purpose: string | null;
  notes: string | null;
  status: string;
  walkIn: boolean;
  createdAt?: string;
  patient: AppointmentPatientDto;
  therapist: { id?: string; firstName: string; lastName: string; jobTitle?: string | null; professionalDesignation?: string | null } | null;
  episode: { id: string; title: string; status?: string } | null;
  sessions: { id: string; status: string; date?: string; timeMin?: number | null; durationMin?: number | null }[];
}

export interface AppointmentsResponse {
  items: AppointmentDto[];
  total: number;
  page: number;
  pageSize: number;
  meta?: { view: string; rangeStart: string; rangeEnd: string };
}

export interface TherapistOption {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  isTherapist?: boolean;
  staffRole?: string;
}

// ---- Calendar block tones per status (spec mapping) ----
export const STATUS_BLOCK_TONE: Record<string, { block: string; dot: string; chip: string }> = {
  SCHEDULED: { block: "bg-sky-50 border-sky-300 hover:bg-sky-100", dot: "bg-sky-500", chip: "text-sky-800" },
  CONFIRMED: { block: "bg-teal-50 border-teal-400 hover:bg-teal-100", dot: "bg-teal-600", chip: "text-teal-800" },
  COMPLETED: { block: "bg-emerald-50 border-emerald-300 hover:bg-emerald-100", dot: "bg-emerald-500", chip: "text-emerald-800" },
  CANCELLED: { block: "bg-slate-100 border-slate-300 hover:bg-slate-200/60", dot: "bg-slate-400", chip: "text-slate-500" },
  NO_SHOW: { block: "bg-rose-50 border-rose-300 hover:bg-rose-100", dot: "bg-rose-500", chip: "text-rose-800" },
  ATTENDED_NO_TREATMENT: { block: "bg-amber-50 border-amber-300 hover:bg-amber-100", dot: "bg-amber-500", chip: "text-amber-800" },
  RESCHEDULED: { block: "bg-amber-50 border-amber-300 hover:bg-amber-100", dot: "bg-amber-500", chip: "text-amber-800" },
};

export function statusTone(status?: string | null) {
  return STATUS_BLOCK_TONE[status || ""] || STATUS_BLOCK_TONE.CANCELLED;
}

export function statusLabel(status?: string | null): string {
  return labelize(status);
}

// ---- Calendar grid geometry ----
export const GRID_START_MIN = 7 * 60; // 07:00
export const GRID_END_MIN = 19 * 60; // 19:00
export const HOUR_HEIGHT = 48; // px per hour

// ---- Queries ----
export function useAppointments(params: { view: string; date: string; therapistId?: string; status?: string }) {
  const qs = new URLSearchParams({ view: params.view, date: params.date });
  if (params.therapistId) qs.set("therapistId", params.therapistId);
  if (params.status) qs.set("status", params.status);
  return useQuery<AppointmentsResponse>({
    queryKey: ["appointments", params.view, params.date, params.therapistId || "", params.status || ""],
    queryFn: () => apiFetch<AppointmentsResponse>(`/api/appointments?${qs.toString()}`),
  });
}

export function useAppointmentDetail(id: string | null) {
  return useQuery<{ appointment: AppointmentDto }>({
    queryKey: ["appointment", id],
    queryFn: () => apiFetch<{ appointment: AppointmentDto }>(`/api/appointments/${id}`),
    enabled: !!id,
  });
}

/**
 * Therapist list for filters/booking. Uses the permission-free /api/staff?therapists=true
 * shortcut so receptionists (no staffView permission) can still book appointments;
 * degrade gracefully to an empty list instead of breaking the page.
 */
export function useTherapists() {
  return useQuery<TherapistOption[]>({
    queryKey: ["appointments-therapists"],
    queryFn: async () => {
      try {
        const res = await apiFetch<unknown>("/api/staff?therapists=true");
        const arr: Record<string, unknown>[] = Array.isArray(res)
          ? res
          : ((res as { items?: Record<string, unknown>[] })?.items ?? []);
        // The endpoint already filters to isTherapist=true; accept rows regardless of
        // which flag fields were selected so short selects still map correctly.
        return arr
          .filter((s) => s && s.id)
          .map((s) => ({
            id: String(s.id),
            firstName: String(s.firstName ?? ""),
            lastName: String(s.lastName ?? ""),
            jobTitle: (s.jobTitle as string) ?? null,
          }));
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ---- Mutations ----
export function useAppointmentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown>; successMsg?: string }) =>
      apiFetch<{ appointment: AppointmentDto }>(`/api/appointments/${id}`, { method: "PATCH", json: body }),
    onSuccess: (_data, vars) => {
      if (vars.successMsg) toast.success(vars.successMsg);
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["appointment"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message || "Action failed"),
  });
}

export interface StartSessionResponse {
  session: { id: string; status: string };
  existing: boolean;
}

export function useStartSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<StartSessionResponse>(`/api/appointments/${id}/start-session`, { method: "POST" }),
    onSuccess: (data) => {
      toast.success(data.existing ? "Session already exists — opening it" : "Therapy session created");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["appointment"] });
      qc.invalidateQueries({ queryKey: ["therapy-sessions"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not start session"),
  });
}

// ---- Status option list for filters ----
export const APPOINTMENT_STATUS_OPTIONS = APPOINTMENT_STATUSES.map((s) => ({ value: s, label: labelize(s) }));
