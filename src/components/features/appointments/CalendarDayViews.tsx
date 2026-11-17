"use client";
// Calendar day views: hourly grid (desktop) and agenda list (mobile).
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { AtomIcon } from "@/components/atoms/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { minutesToTime, ymd } from "@/lib/format";
import { EmptyState } from "@/components/molecules/empty-state";
import { GRID_START_MIN, GRID_END_MIN, HOUR_HEIGHT, statusTone } from "./appointments-shared";
import { PX_PER_MIN, CalendarProps, layoutDay, patientName, nowMin, TimeBlock } from "./calendar-shared";

// ---------- day view ----------
export function DayGrid({ anchorDate, items, loading, onSelect }: Omit<CalendarProps, "view" | "onDayClick">) {
  const anchorKey = ymd(anchorDate);
  const dayItems = useMemo(() => items.filter((a) => ymd(new Date(a.date)) === anchorKey), [items, anchorKey]);
  const laidOut = useMemo(() => layoutDay(dayItems), [dayItems]);
  const gridHeight = ((GRID_END_MIN - GRID_START_MIN) / 60) * HOUR_HEIGHT;
  const isToday = anchorKey === ymd(new Date());
  const showNowLine = isToday && nowMin() >= GRID_START_MIN && nowMin() <= GRID_END_MIN;

  if (loading) return <Skeleton className="h-120 w-full" />;
  if (dayItems.length === 0) {
    return <EmptyState icon="CalendarOff" title="No appointments scheduled" description="This day is clear — use “New appointment” to book a slot." />;
  }

  return (
    <div className="hidden md:block">
      <div className="flex">
        {/* time labels */}
        <div className="w-14 shrink-0 pt-6">
          {Array.from({ length: (GRID_END_MIN - GRID_START_MIN) / 60 + 1 }, (_, i) => (
            <div key={i} className="relative" style={{ height: HOUR_HEIGHT }}>
              <span className="absolute -top-2 right-2 text-[10px] font-medium text-muted-foreground">
                {minutesToTime(GRID_START_MIN + i * 60)}
              </span>
            </div>
          ))}
        </div>
        <div className="relative flex-1 border-l border-border" style={{ height: gridHeight }}>
          {/* hour lines */}
          {Array.from({ length: (GRID_END_MIN - GRID_START_MIN) / 60 + 1 }, (_, i) => (
            <div key={i} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_HEIGHT }} />
          ))}
          {/* now indicator */}
          {showNowLine ? (
            <div className="absolute inset-x-0 z-10 flex items-center" style={{ top: (nowMin() - GRID_START_MIN) * PX_PER_MIN }}>
              <div className="h-2 w-2 rounded-full bg-rose-500" />
              <div className="h-px flex-1 bg-rose-400" />
            </div>
          ) : null}
          {/* appointment blocks */}
          {laidOut.map(({ item, lane, lanes }) => (
            <TimeBlock key={item.id} appt={item} lane={lane} lanes={lanes} onClick={() => onSelect(item)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DayListMobile({ anchorDate, items, loading, onSelect }: Omit<CalendarProps, "view" | "onDayClick">) {
  const anchorKey = ymd(anchorDate);
  const dayItems = useMemo(() => items.filter((a) => ymd(new Date(a.date)) === anchorKey), [items, anchorKey]);
  if (loading) return <div className="md:hidden"><Skeleton className="h-40 w-full" /></div>;
  if (dayItems.length === 0) return null; // empty state already rendered by DayGrid
  return (
    <div className="space-y-2 md:hidden">
      {dayItems.map((a) => {
        const tone = statusTone(a.status);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className={cn("flex w-full items-center gap-3 rounded-lg border bg-white p-3 text-left shadow-sm", tone.block)}
          >
            <div className="shrink-0 text-center">
              <p className="text-sm font-semibold">{minutesToTime(a.startMin)}</p>
              <p className="text-[10px] text-muted-foreground">{minutesToTime(a.endMin)}</p>
            </div>
            <span className={cn("h-8 w-1 rounded-full", tone.dot)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{patientName(a)}</p>
              <p className="truncate text-xs text-muted-foreground">{a.purpose || "—"} · {a.therapist ? `${a.therapist.firstName} ${a.therapist.lastName}` : "—"}</p>
            </div>
            <AtomIcon name="ChevronRight" className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}
