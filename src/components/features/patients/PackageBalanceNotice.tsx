"use client";
// Warning-only package balance notice for PACKAGE-arrangement patients (never blocks anything).
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { AtomIcon } from "@/components/atoms/icon";
import { cn } from "@/lib/utils";

export interface PackageBalance {
  arrangement: string;
  state: "OK" | "LOW" | "EXPIRING" | "EXHAUSTED" | "EXPIRED" | "NONE";
  remaining: number;
  nextExpiry: string | null;
  packageName: string | null;
}

export function usePackageBalance(patientId: string | null | undefined) {
  return useQuery({
    queryKey: ["package-balance", patientId],
    queryFn: () => apiFetch<PackageBalance>(`/api/patients/${patientId}/package-balance`),
    enabled: !!patientId,
  });
}

export function PackageBalanceNotice({ patientId, className }: { patientId: string | null | undefined; className?: string }) {
  const { data } = usePackageBalance(patientId);
  if (!data || data.arrangement !== "PACKAGE") return null;

  const expiry = data.nextExpiry ? formatDate(data.nextExpiry) : null;
  const text: Record<PackageBalance["state"], string> = {
    OK: `${data.remaining} package session${data.remaining === 1 ? "" : "s"} remaining${expiry ? ` · valid until ${expiry}` : ""}.`,
    LOW: `Only ${data.remaining} package session${data.remaining === 1 ? "" : "s"} left${expiry ? ` (valid until ${expiry})` : ""}. Consider renewing.`,
    EXPIRING: `${data.remaining} sessions left but the package expires on ${expiry}.`,
    EXHAUSTED: "This patient's package is used up — no session will be deducted. Assign or renew a package.",
    EXPIRED: "This patient's package has expired — no session will be deducted. Assign or renew a package.",
    NONE: "This patient pays by package but has none assigned — no session will be deducted.",
  };
  const warn = data.state !== "OK";
  return (
    <div
      role={warn ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
        warn ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50/60 text-emerald-900",
        className,
      )}
    >
      <AtomIcon name={warn ? "AlertTriangle" : "Package"} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text[data.state]}</span>
    </div>
  );
}
