"use client";
// ONE shared fetch of the clinic's therapists (/api/staff?therapists=true). Every module reads this same
// cache entry (via `select`), so moving between pages never refetches the list.
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface TherapistOption {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  employmentStatus?: string;
}

export const therapistsQueryOptions = queryOptions({
  queryKey: ["staff", "therapists"],
  queryFn: async (): Promise<TherapistOption[]> => {
    const res = await apiFetch<{ items?: TherapistOption[] }>("/api/staff?therapists=true");
    return (res.items ?? []).filter((s) => s && s.id);
  },
  staleTime: 5 * 60_000,
  retry: false,
});

export function useTherapistOptions<T = TherapistOption[]>(select?: (items: TherapistOption[]) => T, enabled = true) {
  return useQuery({ ...therapistsQueryOptions, select, enabled });
}

export const therapistFullName = (t: { firstName: string; lastName: string }) => `${t.firstName} ${t.lastName}`.trim();
