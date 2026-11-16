"use client";
// ATOM: status badge — consistent tone mapping for every status enum in the system
import { Badge } from "@/components/ui/badge";
import { STATUS_TONE, labelize } from "@/lib/constants";
import { cn } from "@/lib/utils";

const toneClasses: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  teal: "bg-teal-50 text-teal-700 border-teal-200",
};

export function StatusBadge({ status, className, prefix }: { status?: string | null; className?: string; prefix?: string }) {
  const tone = STATUS_TONE[status || ""] || "neutral";
  return (
    <Badge variant="outline" className={cn(toneClasses[tone], className)}>
      {prefix ? `${prefix} ` : ""}
      {labelize(status)}
    </Badge>
  );
}
