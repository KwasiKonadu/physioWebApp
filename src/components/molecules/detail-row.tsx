"use client";
// MOLECULE: detail row — label/value pair used in profile & record views
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  className?: string;
}) {
  // container query: label sits beside the value only when this cell is wide enough, otherwise it stacks
  return (
    <div className={cn("@container min-w-0 py-1.5", className)}>
      <div className="flex flex-col gap-0.5 @sm:flex-row @sm:items-baseline @sm:gap-3">
        <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground @sm:w-40">{label}</dt>
        <dd className="min-w-0 flex-1 wrap-break-word text-sm text-foreground">{value ?? "—"}</dd>
      </div>
    </div>
  );
}

export function DetailGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-8", cols === 1 && "grid-cols-1", cols === 2 && "grid-cols-1 md:grid-cols-2", cols === 3 && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3")}>
      {children}
    </dl>
  );
}

export function DetailRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 flex-1" />
    </div>
  );
}
