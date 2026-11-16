"use client";
// MOLECULE: section card — consistent titled card used across all modules
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AtomIcon } from "@/components/atoms/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  icon?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  loading?: boolean;
  noPadding?: boolean;
}

export function SectionCard({ title, icon, description, actions, children, className, contentClassName, loading, noPadding }: SectionCardProps) {
  return (
    <Card className={cn("rounded-xl shadow-sm", noPadding ? "gap-0 overflow-hidden py-0" : "gap-3 py-4", className)}>
      <CardHeader className={cn("flex flex-row items-start justify-between gap-3 space-y-0 px-4", noPadding ? "border-b border-slate-200 py-3 pb-3!" : "pb-0")}>
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            {icon ? (
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-50 text-teal-600">
                <AtomIcon name={icon} className="h-3.5 w-3.5" />
              </span>
            ) : null}
            {title}
          </CardTitle>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={cn(!noPadding && "px-4 pt-0", contentClassName)}>
        {loading ? <Skeleton className="h-32 w-full" /> : children}
      </CardContent>
    </Card>
  );
}
