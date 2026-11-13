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
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            {icon ? <AtomIcon name={icon} className="h-4 w-4 text-teal-600" /> : null}
            {title}
          </CardTitle>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={cn(!noPadding && "pt-0", contentClassName)}>
        {loading ? <Skeleton className="h-32 w-full" /> : children}
      </CardContent>
    </Card>
  );
}
