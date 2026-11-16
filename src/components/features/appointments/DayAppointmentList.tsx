"use client";
// Compact list of the selected day's appointments, with quick confirm / complete actions.

import { formatDate, minutesToTime } from "@/lib/format";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { AppointmentDto, useAppointmentAction } from "./appointments-shared";
import { anchorDateOf } from "./appointments-dates";

export function DayAppointmentList({ items, anchor, title, loading, canManage, action, onSelect, onNew }: {
  items: AppointmentDto[];
  anchor: string;
  title: string;
  loading: boolean;
  canManage: boolean;
  action: ReturnType<typeof useAppointmentAction>;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
  <SectionCard
    title={title}
    icon="ListChecks"
    description={loading ? undefined : `${items.length} appointment${items.length === 1 ? "" : "s"} · ${formatDate(anchorDateOf(anchor))}`}
    loading={loading}
  >
    {items.length === 0 ? (
      <EmptyState
        icon="CalendarOff"
        title="Nothing scheduled"
        description={canManage ? "Use “New appointment” or “Walk-in” to fill this day." : "No appointments for this day."}
        action={canManage ? <Button size="sm" onClick={() => onNew()}><AtomIcon name="Plus" className="h-4 w-4" /> New appointment</Button> : undefined}
      />
    ) : (
      <div className="space-y-2">
        {items.map((a) => (
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(a.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onSelect(a.id); }}
            className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-white p-3 transition-colors hover:bg-muted/40"
          >
            <div className="w-20 shrink-0 text-center">
              <p className="text-sm font-semibold">{minutesToTime(a.startMin)}</p>
              <p className="text-[10px] text-muted-foreground">to {minutesToTime(a.endMin)}</p>
            </div>
            <span className="h-9 w-1 shrink-0 rounded-full bg-border" />
            <div className="min-w-40 flex-1">
              <p className="truncate text-sm font-medium">
                {a.patient.firstName} {a.patient.lastName}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{a.patient.patientCode}{a.walkIn ? " · walk-in" : ""}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {a.purpose || "—"} · {a.therapist ? `${a.therapist.firstName} ${a.therapist.lastName}` : "—"}
                {a.sessions?.length ? " · session created" : ""}
              </p>
            </div>
            <StatusBadge status={a.status} className="ml-auto hidden sm:inline-flex" />
            {canManage ? (
              <div className="flex shrink-0 items-center gap-1.5 max-xl:order-last max-xl:w-full max-xl:justify-end">
                {a.status === "SCHEDULED" ? (
                  <Button variant="outline" size="sm" className="h-8" disabled={action.isPending}
                    onClick={(e) => { e.stopPropagation(); action.mutate({ id: a.id, body: { action: "confirm" }, successMsg: "Appointment confirmed" }); }}>
                    Confirm
                  </Button>
                ) : null}
                {["SCHEDULED", "CONFIRMED"].includes(a.status) ? (
                  <Button variant="outline" size="sm" className="h-8" disabled={action.isPending}
                    onClick={(e) => { e.stopPropagation(); action.mutate({ id: a.id, body: { action: "complete" }, successMsg: "Marked completed" }); }}>
                    Complete
                  </Button>
                ) : null}
              </div>
            ) : null}
            <AtomIcon name="ChevronRight" className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        ))}
      </div>
    )}
  </SectionCard>
  );
}
