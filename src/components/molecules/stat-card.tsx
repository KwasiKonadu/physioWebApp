"use client";
// MOLECULE: KPI stat card used on dashboards and module overviews
import { Card, CardContent } from "@/components/ui/card";
import { AtomIcon } from "@/components/atoms/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: string;
  hint?: string;
  tone?: "navy" | "teal" | "amber" | "rose" | "sky" | "emerald";
  loading?: boolean;
  onClick?: () => void;
}

const toneMap: Record<string, string> = {
  navy: "bg-navy-50 text-navy-800",
  teal: "bg-teal-50 text-teal-700",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  sky: "bg-sky-50 text-sky-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

export function StatCard({ label, value, icon = "Activity", hint, tone = "navy", loading, onClick }: StatCardProps) {
  return (
    <Card
      className={cn("border shadow-sm", onClick && "cursor-pointer transition-shadow hover:shadow-md")}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneMap[tone])}>
          <AtomIcon name={icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium leading-tight text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-16" />
          ) : (
            <p className="truncate text-xl font-semibold text-foreground">{value}</p>
          )}
          {hint && !loading ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
