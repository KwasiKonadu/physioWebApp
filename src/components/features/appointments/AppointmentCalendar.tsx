"use client";
// ============ Appointments calendar: custom day / week / month grids (no calendar lib) ============
import { CalendarProps } from "./calendar-shared";
import { DayGrid, DayListMobile } from "./CalendarDayViews";
import { WeekGrid } from "./CalendarWeekGrid";
import { MonthGrid } from "./CalendarMonthGrid";

// ---------- export ----------
export function AppointmentCalendar(props: CalendarProps) {
  const { view } = props;
  if (view === "week") return <WeekGrid {...props} />;
  if (view === "month") return <MonthGrid {...props} />;
  return (
    <div className="space-y-4">
      <DayGrid {...props} />
      <DayListMobile {...props} />
    </div>
  );
}
