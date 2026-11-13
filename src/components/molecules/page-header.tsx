"use client";
// MOLECULE: page header with title, description, breadcrumbs and action buttons
import { AtomIcon } from "@/components/atoms/icon";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}

export function PageHeader({ title, description, icon, actions, filters }: PageHeaderProps) {
  return (
    <div className="mb-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary">
              <AtomIcon name={icon} className="h-5 w-5" />
            </div>
          ) : null}
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{title}</h1>
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
    </div>
  );
}
