// All staff (id + name) for pickers; only fetched while `enabled`.
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function useStaffOptions(enabled: boolean) {
  const { data } = useQuery({
    queryKey: ["staff", "options"],
    enabled,
    queryFn: () => apiFetch<{ items: { id: string; name: string }[] }>("/api/staff?pageSize=200"),
  });
  return data?.items ?? [];
}
