"use client";
// Treatment plan detail building blocks: objective rows and version history.


import { useMemo } from "react";


import { Badge } from "@/components/ui/badge";



import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";


import { formatDate, formatDateTime, relativeTime } from "@/lib/format";


import type { PlanObjectiveDto, PlanVersionDto } from "./types";

export const PRIORITY_TONE: Record<string, string> = {
  HIGH: "bg-rose-50 text-rose-700 border-rose-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
};

export function ObjectiveRow({ objective }: { objective: PlanObjectiveDto }) {
  const hasMeasure = objective.baseline || objective.target;
  return (
    <div className="rounded-lg border bg-white/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{objective.description}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {objective.priority ? (
            <Badge variant="outline" className={`text-[10px] font-semibold uppercase ${PRIORITY_TONE[objective.priority] || ""}`}>
              {objective.priority}
            </Badge>
          ) : null}
          <StatusBadge status={objective.status} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {hasMeasure ? (
          <span className="inline-flex items-center gap-1">
            <span className="font-medium text-slate-500">{objective.baseline || "—"}</span>
            <AtomIcon name="ArrowRight" className="h-3 w-3" />
            <span className="font-semibold text-teal-700">{objective.target || "—"}</span>
            {objective.unit ? <span className="text-slate-400">{objective.unit}</span> : null}
          </span>
        ) : null}
        {objective.expectedDate ? (
          <span className="inline-flex items-center gap-1">
            <AtomIcon name="CalendarDays" className="h-3 w-3" /> due {formatDate(objective.expectedDate)}
          </span>
        ) : null}
      </div>
      {objective.notes ? <p className="mt-1.5 text-xs text-muted-foreground italic">{objective.notes}</p> : null}
    </div>
  );
}

export function VersionHistory({ versions, currentId, onOpen }: {
  versions: PlanVersionDto[];
  currentId: string;
  onOpen: (id: string) => void;
}) {
  const ordered = useMemo(() => [...versions].sort((a, b) => b.version - a.version), [versions]);
  const versionLabel = (id: string) => {
    const v = versions.find((x) => x.id === id);
    return v ? `v${v.version}` : "earlier version";
  };
  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-5">
      {ordered.map((v) => {
        const isCurrent = v.id === currentId;
        return (
          <li key={v.id} className="relative">
            <span
              className={`absolute -left-6.5 top-2 h-2.5 w-2.5 rounded-full border-2 ${
                isCurrent ? "border-teal-600 bg-teal-500" : "border-slate-300 bg-white"
              }`}
            />
            <button
              type="button"
              onClick={() => onOpen(v.id)}
              className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                isCurrent ? "border-teal-200 bg-teal-50/60" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span className="text-sm font-semibold text-foreground">v{v.version}</span>
              <StatusBadge status={v.status} />
              {isCurrent ? <Badge className="bg-teal-600 text-[10px] text-white">Viewing</Badge> : null}
              <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</span>
              {v.activatedAt ? (
                <span className="w-full text-xs text-muted-foreground">
                  <AtomIcon name="Zap" className="mr-1 inline h-3 w-3 text-amber-500" />
                  activated {relativeTime(v.activatedAt)}
                </span>
              ) : null}
              {v.revisedFromId ? (
                <span className="w-full text-xs text-slate-500">
                  <AtomIcon name="GitBranch" className="mr-1 inline h-3 w-3" />
                  revised from {versionLabel(v.revisedFromId)}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
