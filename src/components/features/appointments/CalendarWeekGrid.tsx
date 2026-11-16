"use client";
// Calendar week view: seven day columns with positioned time blocks.
import { useMemo } from "react";
import { cn } from "@/lib/utils";

import { Skeleton } from "@/components/ui/skeleton";
import { minutesToTime, ymd } from "@/lib/format";

import { GRID_START_MIN, GRID_END_MIN, HOUR_HEIGHT } from "./appointments-shared";

import { WEEKDAY_HEADERS, CalendarProps, layoutDay, groupByDate, TimeBlock } from "./calendar-shared";

// ---------- week view ----------
export function WeekGrid({ anchorDate, items, loading, onSelect }: Omit<CalendarProps, "view" | "onDayClick">) {
  const grouped = useMemo(() => groupByDate(items), [items]);
  const days = useMemo(() => {
    const d = new Date(anchorDate);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(d);
      x.setDate(x.getDate() + i);
      return x;
    });
  }, [anchorDate]);
  const gridHeight = ((GRID_END_MIN - GRID_START_MIN) / 60) * HOUR_HEIGHT;
  const todayKey = ymd(new Date());

  if (loading) return <Skeleton className="h-120 w-full" />;

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <div className="min-w-215">
        {/* header */}
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-border">
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className={cn("px-1 py-2 text-center", ymd(d) === todayKey && "bg-teal-50/60")}>
              <p className="text-[10px] font-medium uppercase text-muted-foreground">{WEEKDAY_HEADERS[(d.getDay() + 6) % 7]}</p>
              <p className={cn("text-sm font-semibold", ymd(d) === todayKey ? "text-teal-700" : "text-foreground")}>{d.getDate()}</p>
            </div>
          ))}
        </div>
        {/* body */}
        <div className="grid grid-cols-[52px_repeat(7,1fr)]">
          <div className="pt-6">
            {Array.from({ length: (GRID_END_MIN - GRID_START_MIN) / 60 + 1 }, (_, i) => (
              <div key={i} className="relative" style={{ height: HOUR_HEIGHT }}>
                <span className="absolute -top-2 right-1.5 text-[10px] font-medium text-muted-foreground">
                  {minutesToTime(GRID_START_MIN + i * 60)}
                </span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayItems = grouped.get(ymd(d)) || [];
            const laidOut = layoutDay(dayItems);
            return (
              <div key={d.toISOString()} className={cn("relative border-l border-border", ymd(d) === todayKey && "bg-teal-50/40")} style={{ height: gridHeight }}>
                {Array.from({ length: (GRID_END_MIN - GRID_START_MIN) / 60 + 1 }, (_, i) => (
                  <div key={i} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_HEIGHT }} />
                ))}
                {laidOut.map(({ item, lane, lanes }) => (
                  <TimeBlock key={item.id} appt={item} lane={lane} lanes={lanes} compact onClick={() => onSelect(item)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
