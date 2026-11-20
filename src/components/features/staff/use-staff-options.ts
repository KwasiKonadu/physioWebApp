// ONE shared fetch of all staff (up to 200) for pickers, the salaries tab and the users tab.
// Only fetched while `enabled`; every consumer reads the same cache entry.
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { StaffListResponse } from "./StaffPage";

export function useAllStaff(enabled = true) {
  return useQuery({
    queryKey: ["staff", "all"],
    enabled,
    queryFn: () => apiFetch<StaffListResponse>("/api/staff?pageSize=200"),
    staleTime: 60_000,
  });
}

export function useStaffOptions(enabled: boolean) {
  const { data } = useAllStaff(enabled);
  return data?.items ?? [];
}
