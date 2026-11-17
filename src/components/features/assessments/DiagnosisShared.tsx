"use client";
// Small helpers shared by the diagnoses list and its dialogs.

import { Badge } from "@/components/ui/badge";
import { labelize } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const severityTone: Record<string, string> = {
  MILD: "bg-sky-50 text-sky-700 border-sky-200",
  MODERATE: "bg-amber-50 text-amber-700 border-amber-200",
  SEVERE: "bg-rose-50 text-rose-700 border-rose-200",
};

export function severityBadge(sev?: string | null) {
  if (!sev) return <span className="text-xs text-muted-foreground">—</span>;
  return <Badge variant="outline" className={cn("font-medium", severityTone[sev] || "")}>{labelize(sev)}</Badge>;
}

export { Field } from "@/components/molecules/field";

export function DRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5 py-1 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:w-36">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{value === null || value === undefined || value === "" ? "—" : value}</dd>
    </div>
  );
}
