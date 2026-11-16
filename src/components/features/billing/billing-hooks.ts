"use client";
// Billing: debounce, patient search, paged-query and stats hooks.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import type { ListResponse, PatientLite } from "./billing-types";

// ---- Debounce hook ----
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---- Patient search (tolerant of the patients module's response shape) ----
export function usePatientSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ["billing", "patient-search", query],
    enabled: enabled && query.trim().length >= 1,
    queryFn: async () => {
      try {
        const data = await apiFetch<{ items?: PatientLite[] } | PatientLite[]>(`/api/patients?search=${encodeURIComponent(query.trim())}&pageSize=8`);
        const items = Array.isArray(data) ? data : (data.items ?? []);
        return items;
      } catch {
        try {
          const data = await apiFetch<{ items?: PatientLite[] } | PatientLite[]>(`/api/patients?q=${encodeURIComponent(query.trim())}&pageSize=8`);
          const items = Array.isArray(data) ? data : (data.items ?? []);
          return items;
        } catch {
          toast.error("Patient directory is unavailable right now");
          return [];
        }
      }
    },
    staleTime: 30_000,
  });
}

/** Searchable patient selector used across billing dialogs. */

export function usePagedQuery<T>(key: (string | number | Record<string, string> | undefined)[], path: string, enabled = true) {
  return useQuery<ListResponse<T> & { stats?: Record<string, unknown> }>({
    queryKey: key,
    enabled,
    queryFn: () => apiFetch(path),
  });
}

export function useStats<T extends { stats?: Record<string, unknown> }>(query: { data?: T }) {
  return useMemo(() => (query.data?.stats || {}) as Record<string, never>, [query.data]);
}
