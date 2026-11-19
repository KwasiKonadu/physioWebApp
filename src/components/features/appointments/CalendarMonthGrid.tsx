"use client";
// Calendar month view: day cells with appointment counts and previews.
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { minutesToTime, ymd } from "@/lib/format";
import { statusTone } from "./appointments-shared";
import { WEEKDAY_HEADERS, CalendarProps, groupByDate } from "./calendar-shared";

// ---------- month view ----------
export function MonthGrid({ anchorDate, items, loading, onSelect, onDayClick }: Omit<CalendarProps, "view">) {
  const grouped = useMemo(() => groupByDate(items), [items]);
  const cells = useMemo(() => {
    const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const start = new Date(first);
    const dow = first.getDay(); // 0 Sun
    start.setDate(first.getDate() + (dow === 0 ? -6 : 1 - dow));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchorDate]);
  const todayKey = ymd(new Date());
  const anchorMonth = anchorDate.getMonth();

  if (loading) return <Skeleton className="h-105 w-full" />;

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} className="px-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const key = ymd(d);
          const dayItems = grouped.get(key) || [];
          const inMonth = d.getMonth() === anchorMonth;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onDayClick(key)}
              className={cn(
                "min-h-23 border-b border-r border-border/70 p-1.5 text-left align-top transition-colors hover:bg-muted/50 nth-[7n]:border-r-0",
                !inMonth && "bg-muted/30 text-muted-foreground",
                key === todayKey && "bg-navy-50/50",
              )}
            >
              <span className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                key === todayKey ? "bg-navy-800 text-white" : inMonth ? "text-foreground" : "text-muted-foreground",
              )}>
                {d.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayItems.slice(0, 3).map((a) => {
                  const tone = statusTone(a.status);
                  return (
                    <span
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onSelect(a); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onSelect(a); } }}
                      className={cn("flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-none", tone.block, tone.chip)}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
                      <span className="truncate">{minutesToTime(a.startMin).replace(" ", "").toLowerCase()} {a.patient.lastName}</span>
                    </span>
                  );
                })}
                {dayItems.length > 3 ? (
                  <span className="block px-1 text-[10px] font-medium text-muted-foreground">+{dayItems.length - 3} more</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
