"use client";
// ============ Patients module: shared types + query hooks ============
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

// ---- DTOs ----
export interface PatientListItem {
  id: string;
  patientCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone: string;
  email?: string | null;
  photoUrl?: string | null;
  paymentArrangement: string;
  currentStatus: string;
  createdAt: string;
  assignedTherapist: { id: string | null; name: string } | null;
  activeEpisodes: number;
  activeEpisodeTitle: string | null;
}

export interface PatientListResponse {
  items: PatientListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DuplicateMatch {
  id: string;
  patientCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  phone: string;
  dateOfBirth?: string | null;
  currentStatus: string;
}

export interface StaffRef {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
}

export interface EmergencyContactDto {
  id: string;
  patientId: string;
  fullName: string;
  relationship: string;
  phone: string;
  altPhone?: string | null;
  address?: string | null;
  isNextOfKin: boolean;
}

export interface MedicalHistoryDto {
  id: string;
  patientId: string;
  type: string;
  name: string;
  details?: string | null;
}

export interface ConsentDto {
  id: string;
  treatmentConsent: boolean;
  dataConsent: boolean;
  signatureName?: string | null;
  consentDate?: string | null;
  guardianName?: string | null;
  guardianRelationship?: string | null;
  documentRef?: string | null;
  createdAt: string;
}

export interface ReferralDto {
  id: string;
  source: string;
  referrerName?: string | null;
  referrerContact?: string | null;
  referralDate?: string | null;
  letterRef?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface InsuranceDto {
  id: string;
  providerId: string;
  membershipNumber: string;
  policyNumber?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  principalMember?: string | null;
  relationshipToPrincipal?: string | null;
  documentRef?: string | null;
  status: string;
  provider?: { id: string; name: string; code?: string; coveragePercent?: number } | null;
}

export interface EpisodeDto {
  id: string;
  patientId: string;
  episodeNumber: number;
  title: string;
  status: string;
  openedDate: string;
  closedDate?: string | null;
  therapistId?: string | null;
  branchId?: string | null;
  totalCompletedSessions: number;
  sessionsSinceReview: number;
  reviewThreshold: number;
  reviewDue: boolean;
  notes?: string | null;
  holdHistory: { date: string; reason: string; notes?: string }[];
  therapist?: { id: string; firstName: string; lastName: string } | null;
  _count?: { sessions: number; assessments: number; plans: number; reviews: number; appointments: number; diagnoses: number };
}

export interface AppointmentDto {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  purpose?: string | null;
  notes?: string | null;
  status: string;
  episode?: { id: string; title: string; episodeNumber: number } | null;
  therapist?: { id: string; firstName: string; lastName: string } | null;
}

export interface PatientPackageDto {
  id: string;
  packageId: string;
  purchaseDate: string;
  expiryDate: string;
  totalSessions: number;
  usedSessions: number;
  amountPaidCents: number;
  status: string;
  package: { id: string; name: string; sessions: number; priceCents: number };
  _count?: { transactions: number };
}

export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  status: string;
  arrangement: string;
  totalCents: number;
  paidCents: number;
  issuedAt: string;
  dueDate?: string | null;
  episodeId?: string | null;
}

export interface PatientDto {
  id: string;
  clinicId: string;
  branchId?: string | null;
  patientCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone: string;
  altPhone?: string | null;
  email?: string | null;
  address?: string | null;
  occupation?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  photoUrl?: string | null;
  paymentArrangement: string;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
  assignedTherapist?: StaffRef | null;
}

export interface PatientBundle {
  patient: PatientDto;
  emergencyContacts: EmergencyContactDto[];
  medicalHistory: MedicalHistoryDto[];
  consents: ConsentDto[];
  referrals: ReferralDto[];
  insurances: InsuranceDto[];
  episodes: EpisodeDto[];
  appointments: AppointmentDto[];
  patientPackages: PatientPackageDto[];
  invoices: InvoiceDto[];
  stats: {
    episodes: number;
    openEpisodes: number;
    sessions: number;
    sessionsCompleted: number;
    assessments: number;
    activePackages: number;
  };
}

export interface Option {
  id: string;
  name: string;
}

// ---- list params ----
export interface PatientListParams {
  search: string;
  status: string;
  arrangement: string;
  therapistId: string;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) q.set(k, String(v));
  });
  return q.toString();
}

// ---- hooks ----
export function usePatientList(params: PatientListParams) {
  return useQuery({
    queryKey: ["patients", params],
    queryFn: () => apiFetch<PatientListResponse>(`/api/patients?${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

export function usePatient(patientId: string | null) {
  return useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => apiFetch<PatientBundle>(`/api/patients/${patientId}`),
    enabled: !!patientId,
  });
}

export function useDuplicates(params: { phone: string; firstName: string; lastName: string; dob: string }, enabled: boolean) {
  return useQuery({
    queryKey: ["patient-duplicates", params],
    queryFn: () => apiFetch<{ items: DuplicateMatch[] }>(`/api/patients/duplicates?${buildQuery({ ...params })}`),
    enabled,
  });
}

/** Lightweight therapist options. The staff API belongs to another module — degrade to [] on failure. */
export function useTherapists() {
  return useQuery({
    queryKey: ["therapists-options"],
    queryFn: async (): Promise<Option[]> => {
      try {
        const data = await apiFetch<{ items?: Record<string, unknown>[] } | Record<string, unknown>[]>("/api/staff?therapists=true");
        const list = Array.isArray(data) ? data : (data.items ?? []);
        return list
          .map((s) => {
            const id = typeof s?.id === "string" ? s.id : "";
            const name =
              [s?.firstName, s?.lastName].filter((v) => typeof v === "string" && v).join(" ") ||
              (typeof s?.name === "string" ? s.name : "");
            return { id, name };
          })
          .filter((t) => t.id && t.name);
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Insurance provider options. Billing module owns that API — degrade to [] on failure. */
export function useInsuranceProviders() {
  return useQuery({
    queryKey: ["insurance-provider-options"],
    queryFn: async (): Promise<Option[]> => {
      try {
        const data = await apiFetch<{ items?: Record<string, unknown>[] } | Record<string, unknown>[]>("/api/insurance/providers");
        const list = Array.isArray(data) ? data : (data.items ?? []);
        return list
          .map((p) => {
            const id = typeof p?.id === "string" ? p.id : "";
            const name = typeof p?.name === "string" ? p.name : "";
            return { id, name };
          })
          .filter((p) => p.id && p.name);
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Debounce a rapidly changing value (search inputs, duplicate checks). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
