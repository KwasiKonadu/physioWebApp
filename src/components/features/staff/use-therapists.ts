"use client";
// Shared hook: minimal therapist options from /api/staff?therapists=true
// Shape contract (consumed by several modules): { items: [{ id, firstName, lastName, jobTitle }] }
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface TherapistOption {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
}

export function useTherapists() {
  return useQuery({
    queryKey: ["staff", "therapists"],
    queryFn: () => apiFetch<{ items: TherapistOption[] }>("/api/staff?therapists=true"),
    staleTime: 60_000,
  });
}
