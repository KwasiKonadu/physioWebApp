"use client";
// Small dashboard helpers: compact empty note and activity row.

import { relativeTime } from "@/lib/format";
import { AtomIcon } from "@/components/atoms/icon";

export function EmptyStateCompact({ title }: { title: string }) {
  return <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{title}</div>;
}

export function ActivityRow({ icon, title, subtitle, date }: { icon: string; title: string; subtitle?: string; date: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700">
        <AtomIcon name={icon} className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{title}</p>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(date)}</span>
    </div>
  );
}
